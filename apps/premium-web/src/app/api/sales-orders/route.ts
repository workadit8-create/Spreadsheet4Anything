import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserOrg, resolveUserOrgId, toOrgAuthResponse } from "@/lib/org/require-user-org";
import { generateOrderNo, generateTransactionId } from "@/lib/posting/ids";
import {
  allocatePaymentAcrossLines,
  buildKeteranganSummary,
  computeLineTotal,
  deriveOrderPaymentStatus
} from "@/lib/posting/invoice-lines";
import type { PaymentStatus, SalesLineMetadata } from "@/lib/posting/types";
import {
  insertLinkedMasukMutasi,
  linkedMutasiTransactionId,
  resolveKasBankAccount
} from "@/lib/posting/linked-mutasi";
import {
  invoiceNeedsPrintRekening,
  resolveInvoiceBankInfo
} from "@/lib/penjualan/invoice-rekening";
import { assertQuotationConvertible, markQuotationConverted } from "@/lib/pre-docs/convert";

type LineInput = {
  product_id: string;
  qty?: number;
  unit_price?: number;
  diskon?: number;
};

type CreateBody = {
  keterangan?: string;
  total?: number;
  bayar?: number;
  paymentStatus?: PaymentStatus;
  rekening?: string;
  akunPendapatan?: string;
  organizationId?: string;
  customer_id?: string;
  order_date?: string;
  quotation_id?: string;
  lines?: LineInput[];
  invoice_rekening_id?: string;
};

export async function GET() {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }
  const { org } = auth;

  const { data: orders, error } = await supabase
    .from("sales_orders")
    .select("id, order_no, order_date, total, status, customer_id, metadata, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (orders || []).map((o) => o.id);
  const { data: jobs } = ids.length
    ? await supabase
        .from("posting_jobs")
        .select("id, doc_id, status, last_error, engine_ref, attempts, updated_at")
        .eq("organization_id", org.id)
        .eq("doc_type", "SALES_ORDER")
        .in("doc_id", ids)
    : { data: [] };

  const jobsByDoc = new Map((jobs || []).map((j) => [j.doc_id, j]));

  return NextResponse.json({
    orders: (orders || []).map((o) => {
      const meta = (o.metadata || {}) as Record<string, unknown>;
      return {
        ...o,
        customerName: meta.customerName || "",
        invoiceMode: meta.invoiceMode || "lab",
        postingJob: jobsByDoc.get(o.id) || null
      };
    })
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  let auth;
  try {
    auth = await requireUserOrg(supabase);
  } catch (e) {
    return toOrgAuthResponse(e);
  }

  const body = (await request.json()) as CreateBody;
  const isProper = Array.isArray(body.lines) && body.lines.length > 0 && body.customer_id;

  if (isProper) {
    try {
      return await createProperInvoice(supabase, body);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Gagal buat invoice" },
        { status: 400 }
      );
    }
  }

  return createLabInvoice(supabase, body);
}

async function createLabInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  body: CreateBody
) {
  const total = Number(body.total);
  if (!total || total <= 0) {
    return NextResponse.json({ error: "total harus > 0" }, { status: 400 });
  }

  const paymentStatus: PaymentStatus =
    body.paymentStatus === "PENJUALAN KREDIT" ? "PENJUALAN KREDIT" : "PENJUALAN TUNAI";
  const bayar =
    paymentStatus === "PENJUALAN TUNAI" ? Number(body.bayar ?? total) : Number(body.bayar ?? 0);
  const rekening = String(body.rekening || (paymentStatus === "PENJUALAN TUNAI" ? "Kas" : "")).trim();
  const keterangan = String(body.keterangan || "Penjualan Premium Web").trim();

  const organizationId = await resolveUserOrgId(supabase, body.organizationId);

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orderNo = generateOrderNo();
  const transactionId = generateTransactionId();
  const orderDate = new Date().toISOString().slice(0, 10);

  const metadata = {
    transactionId,
    bayar,
    rekening,
    akunPendapatan: String(body.akunPendapatan || "Pendapatan"),
    paymentStatus,
    tanggalBayar: orderDate,
    keterangan,
    invoiceMode: "lab"
  };

  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .insert({
      organization_id: organizationId,
      warehouse_id: warehouse?.id ?? null,
      order_no: orderNo,
      source_system: "PREMIUM_WEB",
      status: "CONFIRMED",
      order_date: orderDate,
      subtotal: total,
      total,
      metadata
    })
    .select("id, order_no, total, status")
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: orderErr?.message || "Gagal buat order" }, { status: 500 });
  }

  const { error: lineErr } = await supabase.from("sales_lines").insert({
    sales_order_id: order.id,
    description: keterangan,
    qty: 1,
    unit_price: total,
    line_total: total,
    sort_order: 0,
    metadata: {
      transactionId,
      akunPendapatan: metadata.akunPendapatan,
      bayar,
      kurangBayar: Math.max(0, total - bayar),
      paymentStatus
    }
  });

  if (lineErr) {
    await supabase.from("sales_orders").delete().eq("id", order.id);
    return NextResponse.json({ error: lineErr.message }, { status: 500 });
  }

  return NextResponse.json({
    order,
    transactionId,
    message: "Invoice lab disimpan (CONFIRMED). Posting ke jurnal dari daftar invoice."
  });
}

async function createProperInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  body: CreateBody
) {
  const organizationId = await resolveUserOrgId(supabase, body.organizationId);
  const customerId = String(body.customer_id || "").trim();
  if (!customerId) {
    return NextResponse.json({ error: "Customer wajib" }, { status: 400 });
  }

  const quotationId = String(body.quotation_id || "").trim() || null;
  if (quotationId) {
    try {
      await assertQuotationConvertible(supabase, quotationId, organizationId);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Quotation tidak valid" },
        { status: 400 }
      );
    }
  }

  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .single();

  if (custErr || !customer) {
    return NextResponse.json({ error: "Customer tidak ditemukan" }, { status: 400 });
  }

  const productIds = body.lines!.map((l) => l.product_id);
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, name, sell_price, metadata, units(code, name)")
    .eq("organization_id", organizationId)
    .in("id", productIds);

  if (prodErr) {
    return NextResponse.json({ error: prodErr.message }, { status: 500 });
  }

  const productMap = new Map((products || []).map((p) => [p.id, p]));
  const resolvedLines: Array<{
    product_id: string;
    description: string;
    qty: number;
    unit_price: number;
    line_total: number;
    sort_order: number;
    unitCode: string;
    akunPendapatan: string;
    diskon: number;
  }> = [];

  for (let index = 0; index < body.lines!.length; index++) {
    const line = body.lines![index];
    const product = productMap.get(line.product_id);
    if (!product) {
      return NextResponse.json({ error: `Produk tidak ditemukan` }, { status: 400 });
    }
    const qty = Number(line.qty) || 1;
    const unitPrice = line.unit_price != null ? Number(line.unit_price) : Number(product.sell_price);
    const diskon = Number(line.diskon) || 0;
    const lineTotal = computeLineTotal(qty, unitPrice, diskon);
    const rawUnit = product.units as { code: string; name: string } | { code: string; name: string }[] | null;
    const unit = Array.isArray(rawUnit) ? rawUnit[0] : rawUnit;
    const meta = (product.metadata || {}) as Record<string, unknown>;
    resolvedLines.push({
      product_id: product.id,
      description: product.name,
      qty,
      unit_price: unitPrice,
      line_total: lineTotal,
      sort_order: index,
      unitCode: unit?.code || "PCS",
      akunPendapatan: String(meta.akunPendapatan || "Pendapatan"),
      diskon
    });
  }

  if (!resolvedLines.length) {
    return NextResponse.json({ error: "Minimal satu baris produk" }, { status: 400 });
  }

  const subtotal = resolvedLines.reduce((sum, l) => sum + l.line_total, 0);
  if (subtotal <= 0) {
    return NextResponse.json({ error: "Total invoice harus > 0" }, { status: 400 });
  }

  const totalBayar = Math.min(subtotal, Math.max(0, Number(body.bayar ?? subtotal)));
  const paymentSlices = allocatePaymentAcrossLines(
    resolvedLines.map((l) => l.line_total),
    totalBayar
  );
  const paymentStatus = deriveOrderPaymentStatus(paymentSlices);
  const sisaTagihan = Math.max(0, subtotal - totalBayar);

  let rekening = "";
  if (totalBayar > 0) {
    rekening = String(body.rekening || "").trim();
    if (!rekening) {
      return NextResponse.json(
        { error: "Pilih rekening penerimaan untuk pembayaran tunai/sebagian" },
        { status: 400 }
      );
    }
  }

  let invoiceRekeningId: string | undefined;
  let invoiceBankInfo: string | undefined;
  if (invoiceNeedsPrintRekening(subtotal, totalBayar)) {
    invoiceRekeningId = String(body.invoice_rekening_id || "").trim();
    if (!invoiceRekeningId) {
      return NextResponse.json(
        { error: "Pilih rekening tampil di invoice (wajib untuk kredit / kurang bayar)" },
        { status: 400 }
      );
    }
    try {
      invoiceBankInfo = await resolveInvoiceBankInfo(supabase, organizationId, invoiceRekeningId);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Rekening invoice tidak valid" },
        { status: 400 }
      );
    }
  }

  const orderDate = body.order_date || new Date().toISOString().slice(0, 10);
  const keterangan = buildKeteranganSummary(customer.name, resolvedLines.map((l) => l.description));

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  const orderNo = generateOrderNo();
  const headerTransactionId = generateTransactionId();

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
    invoiceMode: "proper",
    quotationId: quotationId || undefined,
    invoiceRekeningId,
    invoiceBankInfo
  };

  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .insert({
      organization_id: organizationId,
      warehouse_id: warehouse?.id ?? null,
      customer_id: customer.id,
      order_no: orderNo,
      source_system: "PREMIUM_WEB",
      status: "CONFIRMED",
      order_date: orderDate,
      subtotal,
      total: subtotal,
      metadata
    })
    .select("id, order_no, total, status")
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: orderErr?.message || "Gagal buat order" }, { status: 500 });
  }

  const lineRows = resolvedLines.map((line, index) => {
    const slice = paymentSlices[index];
    const lineMeta: SalesLineMetadata = {
      transactionId: generateTransactionId(),
      akunPendapatan: line.akunPendapatan,
      diskon: line.diskon,
      unitCode: line.unitCode,
      bayar: slice.bayar,
      kurangBayar: slice.kurangBayar,
      paymentStatus: slice.paymentStatus
    };
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
    return NextResponse.json({ error: lineErr.message }, { status: 500 });
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
        counterpartyLabel: `Customer: ${customer.name}`,
        amount: totalBayar,
        keterangan: `Pembayaran ${orderNo}`,
        transactionId: linkedMutasiTransactionId("SO", headerTransactionId),
        sourceType: "SALES_ORDER",
        sourceId: order.id,
        journalHandledBy: "PEMASUKAN"
      });
    }
  }

  if (quotationId) {
    try {
      await markQuotationConverted(supabase, quotationId, organizationId, order.id, order.order_no);
    } catch (err) {
      await supabase.from("sales_lines").delete().eq("sales_order_id", order.id);
      await supabase.from("sales_orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Gagal konversi quotation" },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({
    order,
    transactionId: headerTransactionId,
    message: "Invoice disimpan (CONFIRMED). Posting ke jurnal dari daftar invoice."
  });
}
