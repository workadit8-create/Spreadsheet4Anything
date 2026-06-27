import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deductSaleStockForOrderIfEnabled,
  isInventoryStockEnabled,
  resolveWarehouseIdForSale
} from "@/lib/inventory/sale-stock";
import { wibDateIsoFromInput, wibTodayIso } from "@/lib/date/wib";
import { fetchOrgTaxSettings } from "@/lib/org/tax-settings";
import { productTaxableFromMetadata } from "@/lib/products/ppn";
import { effectiveTracksStock } from "@/lib/products/inventory-policy";
import { generateOrderNo, generateTransactionId } from "@/lib/posting/ids";
import {
  allocatePaymentAcrossLines,
  buildKeteranganSummary,
  computeLineTotal,
  deriveOrderPaymentStatus
} from "@/lib/posting/invoice-lines";
import {
  insertLinkedMasukMutasi,
  linkedMutasiTransactionId,
  resolveKasBankAccount
} from "@/lib/posting/linked-mutasi";
import { enqueueSalesOrderPostingJob } from "@/lib/posting/enqueue";
import { processPendingPostingJobs } from "@/lib/posting/worker";
import type { SalesLineMetadata } from "@/lib/posting/types";
import {
  computeLineTax,
  getActiveTaxConfig,
  summarizeLineTax
} from "@/lib/tax/compute";
import { ensureWalkInCustomer } from "@/lib/pos/walk-in-customer";
import { resolveOutletCodeForSave } from "@/lib/outlets/helpers";
import { assertPosOutletAllowed } from "@/lib/outlets/membership-scope";

export type PosCheckoutLineInput = {
  product_id: string;
  qty?: number;
  unit_price?: number;
  diskon?: number;
  note?: string;
};

export type PosCheckoutInput = {
  lines: PosCheckoutLineInput[];
  bayar?: number;
  rekening?: string;
  payment_method?: "cash" | "transfer";
  order_date?: string;
  local_id?: string;
  device_label?: string;
  outlet_code?: string;
  warehouse_id?: string;
  customer_id?: string;
};

export type PosCheckoutResult = {
  orderId: string;
  orderNo: string;
  total: number;
  change: number;
  receiptNo: string;
  posted: boolean;
  negativeStock: Array<{ productId: string; productName: string; qtyAfter: number }>;
  idempotentReplay?: boolean;
};

type ResolvedLine = {
  product_id: string;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
  unitCode: string;
  akunPendapatan: string;
  diskon: number;
  dpp: number;
  taxAmount: number;
  taxRate: number;
  taxType: string | null;
  taxable: boolean;
  tracksStock: boolean;
  note?: string;
};

export async function processPosCheckout(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string | null,
  body: PosCheckoutInput,
  options?: { allowedPosOutlets?: string[] | null }
): Promise<PosCheckoutResult> {
  const localId = String(body.local_id || "").trim();
  if (localId) {
    const existing = await findExistingLocalSale(supabase, organizationId, localId);
    if (existing) return existing;
  }

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    throw new Error("Keranjang kosong");
  }

  let outletCode: string | null = null;
  try {
    assertPosOutletAllowed(options?.allowedPosOutlets ?? null, body.outlet_code);
    outletCode = await resolveOutletCodeForSave(supabase, organizationId, body.outlet_code);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Outlet tidak valid");
  }

  const customerId = body.customer_id
    ? String(body.customer_id).trim()
    : await ensureWalkInCustomer(supabase, organizationId);

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .single();

  if (custErr || !customer) {
    throw new Error("Customer tidak ditemukan");
  }

  const inventoryEnabled = await isInventoryStockEnabled(supabase, organizationId);

  const warehouseId =
    (await resolveWarehouseIdForSale(supabase, organizationId, {
      outletCode,
      explicitWarehouseId: body.warehouse_id
    })) || "";
  if (!warehouseId && inventoryEnabled) {
    throw new Error("Gudang default belum dikonfigurasi");
  }

  const productIds = body.lines.map((l) => l.product_id);
  const { data: products, error: prodErr } = await supabase
    .from("products_with_inventory_policy")
    .select(
      "id, name, sell_price, metadata, tracks_stock, category_tracks_stock, units(code, name)"
    )
    .eq("organization_id", organizationId)
    .in("id", productIds);

  if (prodErr) {
    throw new Error(prodErr.message);
  }

  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const taxSettings = await fetchOrgTaxSettings(supabase, organizationId);
  const taxConfig = getActiveTaxConfig(taxSettings);

  const resolvedLines: ResolvedLine[] = [];
  const lineTaxResults: ReturnType<typeof computeLineTax>[] = [];

  for (let index = 0; index < body.lines.length; index++) {
    const line = body.lines[index];
    const product = productMap.get(line.product_id);
    if (!product) {
      throw new Error("Produk tidak ditemukan");
    }
    const qty = Number(line.qty) || 1;
    if (qty <= 0) {
      throw new Error("Qty harus > 0");
    }
    const unitPrice =
      line.unit_price != null ? Number(line.unit_price) : Number(product.sell_price);
    const diskon = Number(line.diskon) || 0;
    const netBeforeTax = computeLineTotal(qty, unitPrice, diskon);
    const rawUnit = product.units as
      | { code: string; name: string }
      | { code: string; name: string }[]
      | null;
    const unit = Array.isArray(rawUnit) ? rawUnit[0] : rawUnit;
    const meta = (product.metadata || {}) as Record<string, unknown>;
    const productTaxable = productTaxableFromMetadata(meta);
    const lineTax = computeLineTax(
      netBeforeTax,
      taxConfig ? productTaxable : false,
      taxConfig?.ratePercent ?? 0,
      taxConfig?.priceIncludesTax ?? false,
      taxConfig?.taxType ?? null
    );
    lineTaxResults.push(lineTax);
    resolvedLines.push({
      product_id: product.id,
      description: product.name,
      qty,
      unit_price: unitPrice,
      line_total: lineTax.gross,
      sort_order: index,
      unitCode: unit?.code || "PCS",
      akunPendapatan: String(meta.akunPendapatan || "Pendapatan"),
      diskon,
      dpp: lineTax.dpp,
      taxAmount: lineTax.taxAmount,
      taxRate: lineTax.taxRate,
      taxType: lineTax.taxType,
      taxable: lineTax.taxable,
      tracksStock: effectiveTracksStock(product.tracks_stock, product.category_tracks_stock),
      note: line.note ? String(line.note).trim() : undefined
    });
  }

  const taxSummary = summarizeLineTax(lineTaxResults);
  const subtotal = taxSummary.subtotalDpp;
  const grandTotal = taxSummary.grandTotal;
  if (grandTotal <= 0) {
    throw new Error("Total harus > 0");
  }

  const paymentMethod = body.payment_method === "transfer" ? "transfer" : "cash";
  const totalBayar =
    paymentMethod === "cash"
      ? Math.min(grandTotal, Math.max(0, Number(body.bayar ?? grandTotal)))
      : grandTotal;

  const paymentSlices = allocatePaymentAcrossLines(
    resolvedLines.map((l) => l.line_total),
    totalBayar
  );
  const paymentStatus = deriveOrderPaymentStatus(paymentSlices);

  const rekening = String(body.rekening || "").trim();
  if (totalBayar > 0 && !rekening) {
    throw new Error("Pilih rekening kas/bank");
  }

  const orderDate = body.order_date ? wibDateIsoFromInput(body.order_date) : wibTodayIso();
  const keterangan = buildKeteranganSummary(
    customer.name,
    resolvedLines.map((l) => l.description)
  );
  const orderNo = generateOrderNo();
  const headerTransactionId = generateTransactionId();
  const receiptNo = orderNo;

  const metadata = {
    transactionId: headerTransactionId,
    bayar: totalBayar,
    rekening,
    akunPendapatan: resolvedLines[0].akunPendapatan,
    paymentStatus,
    tanggalBayar: orderDate,
    keterangan,
    customerId: customer.id,
    customerName: customer.name,
    invoiceMode: "pos",
    posLocalId: localId || undefined,
    posDeviceLabel: body.device_label || undefined,
    posPaymentMethod: paymentMethod,
    outletCode: outletCode || undefined,
    subtotalDpp: subtotal,
    taxTotal: taxSummary.taxTotal,
    taxType: taxConfig?.taxType
  };

  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .insert({
      organization_id: organizationId,
      warehouse_id: warehouseId || null,
      customer_id: customer.id,
      order_no: orderNo,
      source_system: "POS",
      status: "CONFIRMED",
      order_date: orderDate,
      subtotal,
      total: grandTotal,
      outlet_code: outletCode,
      metadata
    })
    .select("id, order_no, total")
    .single();

  if (orderErr || !order) {
    throw new Error(orderErr?.message || "Gagal buat transaksi POS");
  }

  const lineRows = resolvedLines.map((line, index) => {
    const slice = paymentSlices[index];
    const lineMeta: SalesLineMetadata & { posNote?: string } = {
      transactionId: generateTransactionId(),
      akunPendapatan: line.akunPendapatan,
      diskon: line.diskon,
      unitCode: line.unitCode,
      bayar: slice.bayar,
      kurangBayar: slice.kurangBayar,
      paymentStatus: slice.paymentStatus,
      dpp: line.dpp,
      taxAmount: line.taxAmount,
      taxRate: line.taxRate,
      taxType: line.taxType || undefined,
      taxable: line.taxable
    };
    if (line.note) lineMeta.posNote = line.note;
    return {
      sales_order_id: order.id,
      product_id: line.product_id,
      description: line.description,
      qty: line.qty,
      unit_price: line.unit_price,
      line_total: line.line_total,
      sort_order: line.sort_order,
      metadata: lineMeta
    };
  });

  const { error: lineErr } = await supabase.from("sales_lines").insert(lineRows);
  if (lineErr) {
    await supabase.from("sales_orders").delete().eq("id", order.id);
    throw new Error(lineErr.message);
  }

  if (totalBayar > 0 && rekening) {
    const { data: kasAccounts } = await supabase
      .from("cash_bank_accounts")
      .select("id, name, coa_account_name")
      .eq("organization_id", organizationId)
      .eq("active", true);
    const kasAccount = resolveKasBankAccount(rekening, kasAccounts || []);
    if (kasAccount) {
      await insertLinkedMasukMutasi(supabase, {
        organizationId,
        transferDate: orderDate,
        account: kasAccount,
        counterpartyLabel: `POS: ${customer.name}`,
        amount: totalBayar,
        keterangan: `POS ${orderNo}`,
        transactionId: linkedMutasiTransactionId("SO", headerTransactionId),
        sourceType: "SALES_ORDER",
        sourceId: order.id,
        journalHandledBy: "PEMASUKAN"
      });
    }
  }

  const stockResult = await deductSaleStockForOrderIfEnabled(supabase, {
    organizationId,
    warehouseId,
    salesOrderId: order.id,
    orderNo: order.order_no,
    lines: resolvedLines.map((l) => ({
      product_id: l.product_id,
      qty: l.qty
    })),
    createdBy: userId,
    notes: "Penjualan POS",
    skipIfExists: false
  });

  let posted = false;
  try {
    const jobId = await enqueueSalesOrderPostingJob(supabase, organizationId, order.id);
    const results = await processPendingPostingJobs(supabase, 1, [jobId], organizationId);
    posted = results.some((r) => r.jobId === jobId && r.ok);
  } catch {
    posted = false;
  }

  if (localId) {
    await supabase.from("pos_local_sales").upsert(
      {
        organization_id: organizationId,
        local_id: localId,
        device_label: body.device_label || null,
        payload: body as unknown as Record<string, unknown>,
        sales_order_id: order.id,
        sync_status: posted ? "SYNCED" : "FAILED",
        sync_error: posted ? null : "Jurnal belum terposting — coba sync ulang",
        created_by: userId,
        synced_at: new Date().toISOString()
      },
      { onConflict: "organization_id,local_id" }
    );
  }

  const negMap = new Map(
    (stockResult?.negativeProducts || []).map((n) => [n.productId, n.qtyAfter])
  );
  const negativeStock = resolvedLines
    .filter((l) => negMap.has(l.product_id))
    .map((l) => ({
      productId: l.product_id,
      productName: l.description,
      qtyAfter: negMap.get(l.product_id)!
    }));

  return {
    orderId: order.id,
    orderNo: order.order_no,
    total: Number(order.total),
    change: Math.max(0, totalBayar - grandTotal),
    receiptNo,
    posted,
    negativeStock
  };
}

async function findExistingLocalSale(
  supabase: SupabaseClient,
  organizationId: string,
  localId: string
): Promise<PosCheckoutResult | null> {
  const { data: row } = await supabase
    .from("pos_local_sales")
    .select("sales_order_id, sync_status, sales_orders(order_no, total, status)")
    .eq("organization_id", organizationId)
    .eq("local_id", localId)
    .maybeSingle();

  if (!row?.sales_order_id) return null;

  const so = row.sales_orders as
    | { order_no: string; total: number; status: string }
    | { order_no: string; total: number; status: string }[]
    | null;
  const order = Array.isArray(so) ? so[0] : so;
  if (!order) return null;

  return {
    orderId: row.sales_order_id,
    orderNo: order.order_no,
    total: Number(order.total),
    change: 0,
    receiptNo: order.order_no,
    posted: order.status === "POSTED",
    negativeStock: [],
    idempotentReplay: true
  };
}
