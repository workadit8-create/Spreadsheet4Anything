import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { resolveReceivingWarehouseId } from "@/lib/inventory/warehouse-resolve";
import { resolveOutletCodeForSave } from "@/lib/outlets/helpers";
import { wibDateIsoFromInput, wibTodayIso } from "@/lib/date/wib";
import { isInventoryPurchaseOrder } from "@/lib/inventory/purchase-inventory";
import {
  proportionalPoLineAmounts,
  purchaseStockLinesFromProducts,
  returnPurchaseStock,
  reverseHppForReturnLines,
  sumReturnedQtyByPurchaseLine,
  type ResolvedReturnLine
} from "@/lib/inventory/purchase-return";
import {
  buildPurchaseReturnJournalLines,
  INVENTORY_ACCOUNT
} from "@/lib/posting/journal-rules";
import { postJournalEntry } from "@/lib/posting/journal-supabase";
import {
  generatePurchaseReturnNo,
  generatePurchaseReturnTransactionId
} from "@/lib/posting/ids";
import { insertLinkedMasukMutasi, linkedMutasiTransactionId, resolveKasBankAccount } from "@/lib/posting/linked-mutasi";
import { fetchOrgTaxSettings, getPurchaseTaxConfig } from "@/lib/org/tax-settings";
import { supplierPkpFromMetadata } from "@/lib/suppliers/pkp";
import { computeLineTax } from "@/lib/tax/compute";
import { computePurchaseLineTotal } from "@/lib/posting/purchase-lines";
import { parseConsignmentHistoryQuery } from "@/lib/inventory/consignment-history-query";

type LineInput = {
  product_id: string;
  qty?: number;
  purchase_line_id?: string;
  unit_cost?: number;
};

type CreateBody = {
  supplier_id: string;
  return_date?: string;
  outlet_code?: string;
  warehouse_id?: string;
  purchase_order_id?: string;
  refund_mode?: "KREDIT" | "TUNAI";
  rekening?: string;
  notes?: string;
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
  const { org } = auth;

  const addons = await fetchOrgAddons(supabase, org.id);
  if (!isAddonEnabled(addons, "pembelian") || !isAddonEnabled(addons, "inventory")) {
    return NextResponse.json({ error: "Add-on pembelian inventory tidak aktif" }, { status: 403 });
  }

  const { start, end, supplierId, limit } = parseConsignmentHistoryQuery(request.url);

  let query = supabase
    .from("purchase_returns")
    .select(
      "id, return_no, return_date, total, refund_mode, status, outlet_code, suppliers(name), purchase_orders(po_no)"
    )
    .eq("organization_id", org.id)
    .gte("return_date", start)
    .lte("return_date", end)
    .order("return_date", { ascending: false })
    .limit(limit);

  if (supplierId) query = query.eq("supplier_id", supplierId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data || []).map((row) => {
    const sup = row.suppliers as { name: string } | { name: string }[] | null;
    const po = row.purchase_orders as { po_no: string } | { po_no: string }[] | null;
    return {
      id: row.id,
      returnNo: row.return_no,
      returnDate: row.return_date,
      supplierName: (Array.isArray(sup) ? sup[0]?.name : sup?.name) || "—",
      poNo: (Array.isArray(po) ? po[0]?.po_no : po?.po_no) || null,
      total: Number(row.total) || 0,
      refundMode: row.refund_mode,
      status: row.status,
      outletCode: row.outlet_code
    };
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { user, org } = auth;

  const addons = await fetchOrgAddons(supabase, org.id);
  if (!isAddonEnabled(addons, "pembelian") || !isAddonEnabled(addons, "inventory")) {
    return NextResponse.json({ error: "Add-on pembelian inventory tidak aktif" }, { status: 403 });
  }

  const body = (await request.json()) as CreateBody;
  const supplierId = String(body.supplier_id || "").trim();
  const refundMode = body.refund_mode === "TUNAI" ? "TUNAI" : "KREDIT";
  const rekening = String(body.rekening || "").trim();

  if (!supplierId) return NextResponse.json({ error: "Supplier wajib" }, { status: 400 });
  if (refundMode === "TUNAI" && !rekening) {
    return NextResponse.json({ error: "Rekening wajib untuk refund tunai" }, { status: 400 });
  }
  if (!Array.isArray(body.lines) || !body.lines.length) {
    return NextResponse.json({ error: "Minimal satu baris produk" }, { status: 400 });
  }

  let outletCode: string | null;
  try {
    outletCode = await resolveOutletCodeForSave(supabase, org.id, body.outlet_code);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Outlet tidak valid" },
      { status: 400 }
    );
  }

  let warehouseId: string | null;
  try {
    warehouseId = await resolveReceivingWarehouseId(supabase, org.id, {
      outletCode,
      explicitWarehouseId: body.warehouse_id
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gudang tidak valid" },
      { status: 400 }
    );
  }
  if (!warehouseId) {
    return NextResponse.json({ error: "Gudang penerima belum dikonfigurasi" }, { status: 400 });
  }

  const { data: supplier, error: supErr } = await supabase
    .from("suppliers")
    .select("id, name, metadata")
    .eq("id", supplierId)
    .eq("organization_id", org.id)
    .maybeSingle();

  if (supErr || !supplier) {
    return NextResponse.json({ error: "Supplier tidak ditemukan" }, { status: 400 });
  }

  const purchaseOrderId = String(body.purchase_order_id || "").trim() || null;
  let poHeader: { id: string; po_no: string; supplier_id: string } | null = null;
  const poLineMap = new Map<
    string,
    {
      id: string;
      product_id: string;
      qty: number;
      unit_cost: number;
      line_total: number;
      metadata: Record<string, unknown>;
    }
  >();

  if (purchaseOrderId) {
    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select("id, po_no, supplier_id, status, metadata")
      .eq("id", purchaseOrderId)
      .eq("organization_id", org.id)
      .maybeSingle();

    if (poErr || !po) return NextResponse.json({ error: "PO tidak ditemukan" }, { status: 400 });
    if (po.status !== "POSTED") {
      return NextResponse.json({ error: "Hanya PO POSTED yang bisa diretur" }, { status: 400 });
    }
    if (!isInventoryPurchaseOrder((po.metadata || {}) as Record<string, unknown>)) {
      return NextResponse.json({ error: "PO bukan pembelian inventory" }, { status: 400 });
    }
    if (po.supplier_id !== supplierId) {
      return NextResponse.json({ error: "PO tidak sesuai supplier" }, { status: 400 });
    }

    poHeader = { id: po.id, po_no: po.po_no, supplier_id: po.supplier_id };

    const { data: poLines, error: plErr } = await supabase
      .from("purchase_lines")
      .select("id, product_id, qty, unit_cost, line_total, metadata")
      .eq("purchase_order_id", po.id);

    if (plErr) return NextResponse.json({ error: plErr.message }, { status: 500 });
    for (const pl of poLines || []) {
      poLineMap.set(pl.id, {
        id: pl.id,
        product_id: String(pl.product_id),
        qty: Number(pl.qty) || 0,
        unit_cost: Number(pl.unit_cost) || 0,
        line_total: Number(pl.line_total) || 0,
        metadata: (pl.metadata || {}) as Record<string, unknown>
      });
    }
  }

  const supplierPkp = supplierPkpFromMetadata((supplier.metadata || {}) as Record<string, unknown>);
  const taxSettings = await fetchOrgTaxSettings(supabase, org.id);
  const purchaseTaxConfig = getPurchaseTaxConfig(taxSettings, supplierPkp);

  const poLineIds = body.lines
    .map((l) => String(l.purchase_line_id || "").trim())
    .filter(Boolean);
  const returnedMap = await sumReturnedQtyByPurchaseLine(supabase, org.id, poLineIds);

  const resolvedLines: ResolvedReturnLine[] = [];

  for (const [index, line] of body.lines.entries()) {
    const qty = Number(line.qty) || 0;
    if (!line.product_id || qty <= 0) continue;

    const purchaseLineId = String(line.purchase_line_id || "").trim() || null;

    if (purchaseLineId) {
      const poLine = poLineMap.get(purchaseLineId);
      if (!poLine) {
        return NextResponse.json({ error: "Baris PO tidak valid" }, { status: 400 });
      }
      if (poLine.product_id !== line.product_id) {
        return NextResponse.json({ error: "Produk tidak sesuai baris PO" }, { status: 400 });
      }
      const alreadyReturned = returnedMap.get(purchaseLineId) || 0;
      const returnable = poLine.qty - alreadyReturned;
      if (qty > returnable + 0.0001) {
        return NextResponse.json(
          { error: `Qty retur melebihi sisa PO (max ${returnable})` },
          { status: 400 }
        );
      }
      const amounts = proportionalPoLineAmounts(poLine, qty);
      resolvedLines.push({
        product_id: line.product_id,
        purchase_line_id: purchaseLineId,
        qty,
        unit_cost: poLine.unit_cost,
        line_total: amounts.lineTotal,
        dpp: amounts.dpp,
        tax_amount: amounts.taxAmount,
        metadata: { purchaseLineId, sortOrder: index }
      });
    } else {
      if (purchaseOrderId) {
        return NextResponse.json(
          { error: "Retur dari PO wajib pakai baris PO" },
          { status: 400 }
        );
      }
      const unitCost = Number(line.unit_cost) || 0;
      const netBeforeTax = computePurchaseLineTotal(qty, unitCost, 0);
      const lineTax = computeLineTax(
        netBeforeTax,
        Boolean(purchaseTaxConfig),
        purchaseTaxConfig?.ratePercent ?? 0,
        purchaseTaxConfig?.priceIncludesTax ?? false,
        purchaseTaxConfig?.taxType ?? null
      );
      resolvedLines.push({
        product_id: line.product_id,
        purchase_line_id: null,
        qty,
        unit_cost: unitCost,
        line_total: lineTax.gross,
        dpp: lineTax.dpp,
        tax_amount: lineTax.taxAmount,
        metadata: { sortOrder: index }
      });
    }
  }

  if (!resolvedLines.length) {
    return NextResponse.json({ error: "Tidak ada baris valid" }, { status: 400 });
  }

  const total = resolvedLines.reduce((s, l) => s + l.line_total, 0);
  const dpp = resolvedLines.reduce((s, l) => s + l.dpp, 0);
  const taxAmount = resolvedLines.reduce((s, l) => s + l.tax_amount, 0);
  if (total <= 0) return NextResponse.json({ error: "Total retur harus > 0" }, { status: 400 });

  const returnDate = body.return_date ? wibDateIsoFromInput(body.return_date) : wibTodayIso();
  const returnNo = generatePurchaseReturnNo();
  const transactionId = generatePurchaseReturnTransactionId();

  const { data: ret, error: retErr } = await supabase
    .from("purchase_returns")
    .insert({
      organization_id: org.id,
      return_no: returnNo,
      return_date: returnDate,
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      outlet_code: outletCode,
      purchase_order_id: poHeader?.id || null,
      refund_mode: refundMode,
      rekening: refundMode === "TUNAI" ? rekening : null,
      total,
      dpp,
      tax_amount: taxAmount,
      status: "POSTED",
      notes: String(body.notes || "").trim() || null,
      metadata: {
        transactionId,
        poNo: poHeader?.po_no || null
      },
      created_by: user.id
    })
    .select("id, return_no")
    .single();

  if (retErr || !ret) {
    return NextResponse.json({ error: retErr?.message || "Gagal buat retur" }, { status: 500 });
  }

  const lineRows = resolvedLines.map((l, i) => ({
    return_id: ret.id,
    product_id: l.product_id,
    purchase_line_id: l.purchase_line_id,
    qty: l.qty,
    unit_cost: l.unit_cost,
    line_total: l.line_total,
    dpp: l.dpp,
    tax_amount: l.tax_amount,
    metadata: l.metadata,
    sort_order: i
  }));

  const { error: lineErr } = await supabase.from("purchase_return_lines").insert(lineRows);
  if (lineErr) {
    await supabase.from("purchase_returns").delete().eq("id", ret.id);
    return NextResponse.json({ error: lineErr.message }, { status: 500 });
  }

  let stockLines;
  try {
    stockLines = await purchaseStockLinesFromProducts(
      supabase,
      org.id,
      resolvedLines.map((l) => ({ product_id: l.product_id, qty: l.qty }))
    );
  } catch (err) {
    await supabase.from("purchase_returns").delete().eq("id", ret.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Validasi produk gagal" },
      { status: 400 }
    );
  }

  try {
    await reverseHppForReturnLines(supabase, org.id, resolvedLines);
    await returnPurchaseStock(supabase, {
      organizationId: org.id,
      warehouseId,
      returnId: ret.id,
      returnNo: ret.return_no,
      lines: stockLines,
      createdBy: user.id,
      notes: `Retur pembelian ke ${supplier.name}`
    });

    const journalLines = buildPurchaseReturnJournalLines({
      tanggal: returnDate,
      noDok: ret.return_no,
      supplier: supplier.name,
      keterangan: poHeader ? `PO ${poHeader.po_no}` : "",
      total,
      dpp,
      taxAmount,
      refundMode,
      rekening: refundMode === "TUNAI" ? rekening : undefined,
      inventoryAccount: INVENTORY_ACCOUNT
    });

    await postJournalEntry(
      supabase,
      {
        organizationId: org.id,
        modul: "PEMBELIAN",
        transactionId,
        docNo: ret.return_no,
        entryDate: returnDate,
        sourceDocType: "PURCHASE_RETURN",
        sourceDocId: ret.id,
        metadata: {
          purchaseOrderId: poHeader?.id || null,
          refundMode
        }
      },
      journalLines
    );

    if (refundMode === "TUNAI" && rekening) {
      const { data: kasAccounts } = await supabase
        .from("cash_bank_accounts")
        .select("id, name, coa_account_name")
        .eq("organization_id", org.id)
        .eq("active", true);
      const kasAccount = resolveKasBankAccount(rekening, kasAccounts || []);
      if (kasAccount) {
        await insertLinkedMasukMutasi(supabase, {
          organizationId: org.id,
          transferDate: returnDate,
          account: kasAccount,
          counterpartyLabel: `Retur: ${supplier.name}`,
          amount: total,
          keterangan: `Retur pembelian ${ret.return_no}`,
          transactionId: linkedMutasiTransactionId("RP", transactionId),
          sourceType: "PURCHASE_RETURN",
          sourceId: ret.id,
          journalHandledBy: "PEMBELIAN"
        });
      }
    }
  } catch (err) {
    await supabase.from("purchase_returns").delete().eq("id", ret.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal proses retur" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    returnId: ret.id,
    returnNo: ret.return_no,
    total,
    message: `${ret.return_no} — retur pembelian berhasil (stok keluar + jurnal)`
  });
}
