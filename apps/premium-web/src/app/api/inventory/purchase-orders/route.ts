import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOrgAddons, isAddonEnabled } from "@/lib/org/addons";
import { requireUserOrg, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { resolveWarehouseIdForSale } from "@/lib/inventory/sale-stock";
import { productMatchesOutlet } from "@/lib/inventory/product-outlet-scope";
import { INVENTORY_ACCOUNT } from "@/lib/posting/journal-rules";
import { generatePoNo, generateTransactionId } from "@/lib/posting/ids";
import {
  allocatePaymentAcrossPurchaseLines,
  buildPembelianKeterangan,
  computePurchaseLineTotal,
  deriveOrderPembelianMetode
} from "@/lib/posting/purchase-lines";
import type { PurchaseLineMetadata } from "@/lib/posting/types";
import {
  insertLinkedKeluarMutasi,
  linkedMutasiTransactionId,
  resolveKasBankAccount
} from "@/lib/posting/linked-mutasi";
import { resolveOutletCodeForSave } from "@/lib/outlets/helpers";
import { wibDateIsoFromInput } from "@/lib/date/wib";
import { fetchOrgTaxSettings, getPurchaseTaxConfig } from "@/lib/org/tax-settings";
import { supplierPkpFromMetadata } from "@/lib/suppliers/pkp";
import { computeLineTax, summarizeLineTax } from "@/lib/tax/compute";
import { effectiveTracksStock } from "@/lib/products/inventory-policy";

type LineInput = {
  product_id: string;
  qty?: number;
  unit_cost?: number;
  diskon?: number;
};

type CreateBody = {
  supplier_id: string;
  order_date?: string;
  bayar?: number;
  rekening?: string;
  outlet_code?: string;
  lines: LineInput[];
};

export async function POST(request: Request) {
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

  const body = (await request.json()) as CreateBody;
  const supplierId = String(body.supplier_id || "").trim();
  if (!supplierId) {
    return NextResponse.json({ error: "Supplier wajib" }, { status: 400 });
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

  const warehouseId = await resolveWarehouseIdForSale(supabase, org.id, { outletCode });
  if (!warehouseId) {
    return NextResponse.json({ error: "Gudang outlet belum dikonfigurasi" }, { status: 400 });
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

  const productIds = body.lines.map((l) => l.product_id);
  const { data: products, error: prodErr } = await supabase
    .from("products_with_inventory_policy")
    .select("id, name, metadata, tracks_stock, category_tracks_stock, units(code, name)")
    .eq("organization_id", org.id)
    .in("id", productIds);

  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 });

  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const supplierPkp = supplierPkpFromMetadata((supplier.metadata || {}) as Record<string, unknown>);
  const taxSettings = await fetchOrgTaxSettings(supabase, org.id);
  const purchaseTaxConfig = getPurchaseTaxConfig(taxSettings, supplierPkp);

  const resolvedLines: Array<{
    product_id: string;
    description: string;
    qty: number;
    unit_cost: number;
    line_total: number;
    sort_order: number;
    unitCode: string;
    diskon: number;
    dpp: number;
    taxAmount: number;
    taxRate: number;
    taxType: string | null;
    taxable: boolean;
    tracksStock: boolean;
  }> = [];

  const lineTaxResults: ReturnType<typeof computeLineTax>[] = [];

  for (let index = 0; index < body.lines.length; index++) {
    const line = body.lines[index];
    const product = productMap.get(line.product_id);
    if (!product) {
      return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 400 });
    }

    const meta = (product.metadata || {}) as Record<string, unknown>;
    if (outletCode && !productMatchesOutlet(meta, outletCode)) {
      return NextResponse.json(
        { error: `Produk "${product.name}" bukan untuk outlet ${outletCode}` },
        { status: 400 }
      );
    }

    const tracks = effectiveTracksStock(product.tracks_stock, product.category_tracks_stock);
    if (!tracks) {
      return NextResponse.json(
        { error: `Produk "${product.name}" tidak kelola stok — tidak bisa PO inventory` },
        { status: 400 }
      );
    }

    const qty = Number(line.qty) || 1;
    const unitCost = Number(line.unit_cost) || 0;
    if (unitCost < 0) {
      return NextResponse.json({ error: "Harga beli tidak valid" }, { status: 400 });
    }
    const diskon = Number(line.diskon) || 0;
    const netBeforeTax = computePurchaseLineTotal(qty, unitCost, diskon);
    const rawUnit = product.units as { code: string; name: string } | { code: string; name: string }[] | null;
    const unit = Array.isArray(rawUnit) ? rawUnit[0] : rawUnit;
    const lineTax = computeLineTax(
      netBeforeTax,
      Boolean(purchaseTaxConfig),
      purchaseTaxConfig?.ratePercent ?? 0,
      purchaseTaxConfig?.priceIncludesTax ?? false,
      purchaseTaxConfig?.taxType ?? null
    );
    lineTaxResults.push(lineTax);

    resolvedLines.push({
      product_id: product.id,
      description: product.name,
      qty,
      unit_cost: unitCost,
      line_total: lineTax.gross,
      sort_order: index,
      unitCode: unit?.code || "PCS",
      diskon,
      dpp: lineTax.dpp,
      taxAmount: lineTax.taxAmount,
      taxRate: lineTax.taxRate,
      taxType: lineTax.taxType,
      taxable: lineTax.taxable,
      tracksStock: tracks
    });
  }

  const taxSummary = summarizeLineTax(lineTaxResults);
  const subtotal = taxSummary.subtotalDpp;
  const grandTotal = taxSummary.grandTotal;
  if (grandTotal <= 0) {
    return NextResponse.json({ error: "Total PO harus > 0" }, { status: 400 });
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

  const poNo = generatePoNo();
  const headerTransactionId = generateTransactionId();

  const metadata = {
    transactionId: headerTransactionId,
    bayar: totalBayar,
    rekening,
    akunPembelian: INVENTORY_ACCOUNT,
    paymentStatus,
    tanggalBayar: orderDate,
    keterangan,
    supplierId: supplier.id,
    supplierName: supplier.name,
    pembelianMode: "inventory",
    subtotalDpp: subtotal,
    taxTotal: taxSummary.taxTotal,
    taxType: purchaseTaxConfig?.taxType,
    supplierPkp
  };

  const { data: order, error: orderErr } = await supabase
    .from("purchase_orders")
    .insert({
      organization_id: org.id,
      warehouse_id: warehouseId,
      supplier_id: supplier.id,
      po_no: poNo,
      status: "CONFIRMED",
      order_date: orderDate,
      total: grandTotal,
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
      akunPembelian: INVENTORY_ACCOUNT,
      diskon: line.diskon,
      unitCode: line.unitCode,
      bayar: slice.bayar,
      kurangBayar: slice.kurangBayar,
      metode: slice.metode,
      tanggalBayar: slice.bayar > 0 ? orderDate : undefined,
      dpp: line.dpp,
      taxAmount: line.taxAmount,
      taxRate: line.taxRate,
      taxType: line.taxType || undefined,
      taxable: line.taxable
    };
    return {
      purchase_order_id: order.id,
      product_id: line.product_id,
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
      await insertLinkedKeluarMutasi(supabase, {
        organizationId: org.id,
        transferDate: orderDate,
        account: kasAccount,
        counterpartyLabel: `PO: ${supplier.name}`,
        amount: totalBayar,
        keterangan: `PO ${poNo}`,
        transactionId: linkedMutasiTransactionId("PO", headerTransactionId),
        sourceType: "PURCHASE_ORDER",
        sourceId: order.id,
        journalHandledBy: "PEMBELIAN"
      });
    }
  }

  return NextResponse.json({
    order,
    message: "PO inventory disimpan (CONFIRMED). Posting dari riwayat untuk jurnal + stok masuk."
  });
}
