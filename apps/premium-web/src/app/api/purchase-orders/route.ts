import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { generatePoNo, generateTransactionId } from "@/lib/posting/ids";
import {
  allocatePaymentAcrossPurchaseLines,
  buildPembelianKeterangan,
  computePurchaseLineTotal,
  deriveOrderPembelianMetode
} from "@/lib/posting/purchase-lines";
import type { PurchaseLineMetadata } from "@/lib/posting/types";

import { summarizeHutangFromLines, lineBayar } from "@/lib/posting/hutang";
import type { PurchaseLineRow } from "@/lib/posting/types";
import {
  insertLinkedKeluarMutasi,
  linkedMutasiTransactionId,
  resolveKasBankAccount
} from "@/lib/posting/linked-mutasi";
import { assertPurchaseRequestConvertible, markPurchaseRequestConverted } from "@/lib/pre-docs/convert";
import { resolveProjectCodeForSave } from "@/lib/proyek/helpers";
import { resolveOutletCodeForSave } from "@/lib/outlets/helpers";
import { wibDateIsoFromInput } from "@/lib/date/wib";
import { fetchOrgTaxSettings, getPurchaseTaxConfig } from "@/lib/org/tax-settings";
import { supplierPkpFromMetadata } from "@/lib/suppliers/pkp";
import { computeLineTax, summarizeLineTax } from "@/lib/tax/compute";
import {
  isFixedAssetCoaName,
  resolvePurchaseAssetCoa
} from "@/lib/assets/coa-defaults";

type LineInput = {
  description: string;
  purchase_category_id: string;
  qty?: number;
  unit_cost?: number;
  diskon?: number;
  unit_code?: string;
  capitalize_as_asset?: boolean;
  useful_life_months?: number;
};

type CreateBody = {
  supplier_id: string;
  order_date?: string;
  bayar?: number;
  rekening?: string;
  purchase_request_id?: string;
  project_code?: string;
  outlet_code?: string;
  lines: LineInput[];
};

export async function GET(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const supplierId = url.searchParams.get("supplier_id");
  const mode = String(url.searchParams.get("mode") || "").trim().toLowerCase();

  let query = supabase
    .from("purchase_orders")
    .select("id, po_no, order_date, total, status, supplier_id, metadata, created_at")
    .eq("organization_id", org.id)
    .neq("status", "DRAFT")
    .order("order_date", { ascending: false })
    .limit(100);

  if (start) query = query.gte("order_date", start);
  if (end) query = query.lte("order_date", end);
  if (supplierId) query = query.eq("supplier_id", supplierId);

  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filteredOrders = (orders || []).filter((o) => {
    const meta = (o.metadata || {}) as Record<string, unknown>;
    const isInventory = meta.pembelianMode === "inventory";
    if (mode === "inventory") return isInventory;
    if (mode === "expense") return !isInventory;
    return true;
  });

  const orderIds = filteredOrders.map((o) => o.id);
  const { data: lineRows } = orderIds.length
    ? await supabase.from("purchase_lines").select("*").in("purchase_order_id", orderIds)
    : { data: [] };

  const linesByOrder = new Map<string, PurchaseLineRow[]>();
  for (const line of lineRows || []) {
    const bucket = linesByOrder.get(line.purchase_order_id) || [];
    bucket.push(line as PurchaseLineRow);
    linesByOrder.set(line.purchase_order_id, bucket);
  }

  let grandTotalSum = 0;
  const rows = filteredOrders.map((o) => {
    const meta = (o.metadata || {}) as Record<string, unknown>;
    const lines = linesByOrder.get(o.id) || [];
    const hutang = summarizeHutangFromLines(
      o as {
        id: string;
        po_no: string;
        order_date: string;
        supplier_id: string | null;
        total: number;
        metadata: Record<string, unknown>;
      },
      lines
    );
    const grandTotal = lines.reduce((s, l) => s + Number(l.line_total) || 0, 0) || Number(o.total) || 0;
    const isVoided = o.status === "VOIDED";
    const sisaTagihan = isVoided ? 0 : (hutang?.sisaTagihan ?? 0);
    const bayar = lines.reduce((s, l) => s + lineBayar(l), 0) || Number(meta.bayar) || 0;
    if (!isVoided) {
      grandTotalSum += grandTotal;
    }

    return {
      id: o.id,
      poNo: o.po_no,
      orderDate: o.order_date,
      supplierName: String(meta.supplierName || ""),
      status: o.status,
      grandTotal,
      bayar,
      sisaTagihan
    };
  });

  return NextResponse.json({ rows, grandTotalSum });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const body = (await request.json()) as CreateBody;

  try {
    const supplierId = String(body.supplier_id || "").trim();
    if (!supplierId) {
      return NextResponse.json({ error: "Supplier wajib" }, { status: 400 });
    }
    if (!Array.isArray(body.lines) || !body.lines.length) {
      return NextResponse.json({ error: "Minimal satu baris expense" }, { status: 400 });
    }

    const purchaseRequestId = String(body.purchase_request_id || "").trim() || null;
    let prProjectCode: string | null = null;
    let prOutletCode: string | null = null;
    if (purchaseRequestId) {
      try {
        await assertPurchaseRequestConvertible(supabase, purchaseRequestId, org.id);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "PRE tidak valid" },
          { status: 400 }
        );
      }
      const { data: pr } = await supabase
        .from("purchase_requests")
        .select("project_code, outlet_code")
        .eq("id", purchaseRequestId)
        .eq("organization_id", org.id)
        .maybeSingle();
      prProjectCode = pr?.project_code || null;
      prOutletCode = pr?.outlet_code || null;
    }

    let projectCode: string | null;
    try {
      projectCode = await resolveProjectCodeForSave(
        supabase,
        org.id,
        body.project_code,
        prProjectCode
      );
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Proyek tidak valid" },
        { status: 400 }
      );
    }

    let outletCode: string | null;
    try {
      const rawOutlet = body.outlet_code || prOutletCode;
      outletCode = await resolveOutletCodeForSave(supabase, org.id, rawOutlet);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Outlet tidak valid" },
        { status: 400 }
      );
    }

    const { data: supplier, error: supErr } = await supabase
      .from("suppliers")
      .select("id, name, metadata")
      .eq("id", supplierId)
      .eq("organization_id", org.id)
      .single();

    if (supErr || !supplier) {
      return NextResponse.json({ error: "Supplier tidak ditemukan" }, { status: 400 });
    }

    const supplierPkp = supplierPkpFromMetadata(
      (supplier.metadata || {}) as Record<string, unknown>
    );

    const categoryIds = body.lines.map((l) => l.purchase_category_id);
    const { data: categories, error: catErr } = await supabase
      .from("purchase_categories")
      .select("id, category, sub_category, coa_account")
      .eq("organization_id", org.id)
      .in("id", categoryIds);

    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });

    const catMap = new Map((categories || []).map((c) => [c.id, c]));
    const taxSettings = await fetchOrgTaxSettings(supabase, org.id);
    const purchaseTaxConfig = getPurchaseTaxConfig(taxSettings, supplierPkp);

    const { data: coaRows } = await supabase
      .from("coa_accounts")
      .select("name, metadata")
      .eq("organization_id", org.id)
      .eq("active", true);

    const coaSubByName = new Map<string, string>();
    const fixedAssetCoaAccounts: string[] = [];
    for (const row of coaRows || []) {
      const name = String(row.name || "");
      const sub = String((row.metadata as Record<string, unknown> | null)?.sub_category || "");
      coaSubByName.set(name, sub);
      if (isFixedAssetCoaName(name, coaSubByName)) fixedAssetCoaAccounts.push(name);
    }

    const resolvedLines: Array<{
      description: string;
      purchase_category_id: string;
      qty: number;
      unit_cost: number;
      line_total: number;
      sort_order: number;
      unitCode: string;
      akunPembelian: string;
      diskon: number;
      dpp: number;
      taxAmount: number;
      taxRate: number;
      taxType: string | null;
      taxable: boolean;
      capitalizeAsAsset: boolean;
      usefulLifeMonths: number;
    }> = [];

    const lineTaxResults: ReturnType<typeof computeLineTax>[] = [];

    for (let index = 0; index < body.lines.length; index++) {
      const line = body.lines[index];
      const description = String(line.description || "").trim();
      if (!description) {
        return NextResponse.json({ error: "Nama barang wajib di setiap baris" }, { status: 400 });
      }

      const cat = catMap.get(line.purchase_category_id);
      if (!cat) {
        return NextResponse.json({ error: "Kategori expense tidak ditemukan" }, { status: 400 });
      }

      const qty = Number(line.qty) || 1;
      const unitCost = Number(line.unit_cost) || 0;
      const diskon = Number(line.diskon) || 0;
      const netBeforeTax = computePurchaseLineTotal(qty, unitCost, diskon);
      const lineTax = computeLineTax(
        netBeforeTax,
        Boolean(purchaseTaxConfig),
        purchaseTaxConfig?.ratePercent ?? 0,
        purchaseTaxConfig?.priceIncludesTax ?? false,
        purchaseTaxConfig?.taxType ?? null
      );
      lineTaxResults.push(lineTax);

      const capitalizeAsAsset =
        line.capitalize_as_asset === true ||
        isFixedAssetCoaName(cat.coa_account, coaSubByName);
      const akunPembelian = capitalizeAsAsset
        ? resolvePurchaseAssetCoa(cat.coa_account, coaSubByName, fixedAssetCoaAccounts)
        : cat.coa_account;
      const usefulLifeMonths = Math.max(1, Number(line.useful_life_months) || 48);

      resolvedLines.push({
        description,
        purchase_category_id: cat.id,
        qty,
        unit_cost: unitCost,
        line_total: lineTax.gross,
        sort_order: index,
        unitCode: String(line.unit_code || "PCS"),
        akunPembelian,
        diskon,
        dpp: lineTax.dpp,
        taxAmount: lineTax.taxAmount,
        taxRate: lineTax.taxRate,
        taxType: lineTax.taxType,
        taxable: lineTax.taxable,
        capitalizeAsAsset,
        usefulLifeMonths
      });
    }

    const taxSummary = summarizeLineTax(lineTaxResults);
    const subtotal = taxSummary.subtotalDpp;
    const grandTotal = taxSummary.grandTotal;
    if (grandTotal <= 0) {
      return NextResponse.json({ error: "Total expense harus > 0" }, { status: 400 });
    }

    const totalBayar = Math.min(grandTotal, Math.max(0, Number(body.bayar ?? grandTotal)));
    const paymentSlices = allocatePaymentAcrossPurchaseLines(
      resolvedLines.map((l) => l.line_total),
      totalBayar
    );
    const paymentStatus = deriveOrderPembelianMetode(paymentSlices);
    const rekening = String(body.rekening || (totalBayar > 0 ? "Kas" : "")).trim();
    const orderDate = wibDateIsoFromInput(body.order_date);
    const keterangan = buildPembelianKeterangan(
      supplier.name,
      resolvedLines.map((l) => l.description)
    );

    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("id")
      .eq("organization_id", org.id)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();

    const poNo = generatePoNo();
    const headerTransactionId = generateTransactionId();

    const metadata = {
      transactionId: headerTransactionId,
      bayar: totalBayar,
      rekening,
      akunPembelian: resolvedLines[0].akunPembelian,
      paymentStatus,
      tanggalBayar: orderDate,
      keterangan,
      supplierId: supplier.id,
      supplierName: supplier.name,
      pembelianMode: "proper",
      purchaseRequestId: purchaseRequestId || undefined,
      subtotalDpp: subtotal,
      taxTotal: taxSummary.taxTotal,
      taxType: purchaseTaxConfig?.taxType,
      supplierPkp
    };

    const { data: order, error: orderErr } = await supabase
      .from("purchase_orders")
      .insert({
        organization_id: org.id,
        warehouse_id: warehouse?.id ?? null,
        supplier_id: supplier.id,
        po_no: poNo,
        status: "CONFIRMED",
        order_date: orderDate,
        total: grandTotal,
        project_code: projectCode,
        outlet_code: outletCode,
        metadata
      })
      .select("id, po_no, total, status")
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: orderErr?.message || "Gagal buat PO" }, { status: 500 });
    }

    const lineRows = resolvedLines.map((line, index) => {
      const slice = paymentSlices[index];
      const lineMeta: PurchaseLineMetadata = {
        transactionId: generateTransactionId(),
        akunPembelian: line.akunPembelian,
        diskon: line.diskon,
        unitCode: line.unitCode,
        bayar: slice.bayar,
        kurangBayar: slice.kurangBayar,
        metode: slice.metode,
        tanggalBayar: slice.bayar > 0 ? orderDate : undefined,
        purchaseCategoryId: line.purchase_category_id,
        dpp: line.dpp,
        taxAmount: line.taxAmount,
        taxRate: line.taxRate,
        taxType: line.taxType || undefined,
        taxable: line.taxable,
        fixedAsset: line.capitalizeAsAsset
          ? {
              enabled: true,
              usefulLifeMonths: line.usefulLifeMonths
            }
          : undefined
      };
      return {
        purchase_order_id: order.id,
        description: line.description,
        qty: line.qty,
        unit_cost: line.unit_cost,
        line_total: line.line_total,
        sort_order: line.sort_order,
        metadata: lineMeta
      };
    });

    const { error: lineErr } = await supabase.from("purchase_lines").insert(lineRows);
    if (lineErr) {
      await supabase.from("purchase_orders").delete().eq("id", order.id);
      return NextResponse.json({ error: lineErr.message }, { status: 500 });
    }

    if (totalBayar > 0 && rekening) {
      const { data: kasAccounts } = await supabase
        .from("cash_bank_accounts")
        .select("id, name, coa_account_name")
        .eq("organization_id", org.id)
        .eq("active", true);
      const kasAccount = resolveKasBankAccount(rekening, kasAccounts || []);
      if (kasAccount) {
        for (let i = 0; i < lineRows.length; i++) {
          const slice = paymentSlices[i];
          const lineMeta = lineRows[i].metadata as PurchaseLineMetadata;
          if (slice.bayar <= 0) continue;
          await insertLinkedKeluarMutasi(supabase, {
            organizationId: org.id,
            transferDate: orderDate,
            account: kasAccount,
            counterpartyLabel: supplier.name,
            amount: slice.bayar,
            keterangan: `Pembelian ${lineRows[i].description}`,
            transactionId: linkedMutasiTransactionId("PB", lineMeta.transactionId || `${order.id}-${i}`),
            sourceType: "PURCHASE_ORDER",
            sourceId: order.id,
            journalHandledBy: "PEMBELIAN"
          });
        }
      }
    }

    if (purchaseRequestId) {
      try {
        await markPurchaseRequestConverted(
          supabase,
          purchaseRequestId,
          org.id,
          order.id,
          order.po_no
        );
      } catch (err) {
        await supabase.from("purchase_lines").delete().eq("purchase_order_id", order.id);
        await supabase.from("purchase_orders").delete().eq("id", order.id);
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Gagal konversi PR" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({
      order,
      transactionId: headerTransactionId,
      message: "Expense disimpan (CONFIRMED). Posting ke jurnal dari riwayat Expense."
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal buat expense" },
      { status: 400 }
    );
  }
}
