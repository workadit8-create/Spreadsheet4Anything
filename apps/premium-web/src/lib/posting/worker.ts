import type { SupabaseClient } from "@supabase/supabase-js";
import { wibDateIsoFromInput } from "@/lib/date/wib";
import {
  deductSaleStockForOrderIfEnabled,
  resolveWarehouseIdForSale
} from "@/lib/inventory/sale-stock";
import { buildPemasukanPayload } from "./pemasukan";
import { buildPelunasanPiutangPayload } from "./pelunasan-piutang";
import {
  buildPemasukanJournalLines,
  buildPelunasanPiutangJournalLines,
  buildPembelianJournalLines,
  buildPelunasanUtangJournalLines
} from "./journal-rules";
import { TAX_INPUT_ACCOUNT, TAX_OUTPUT_ACCOUNT } from "@/lib/tax/compute";
import { postCashTransferJournal, type CashTransferRow } from "./mutasi";
import { postJournalEntry } from "./journal-supabase";
import { createFixedAssetsFromPostedPurchaseOrder } from "@/lib/assets/from-purchase-order";
import type {
  SalesLineMetadata,
  SalesOrderMetadata,
  SalesOrderRow,
  SalesLineRow,
  PurchaseLineMetadata,
  PurchaseOrderMetadata,
  PurchaseOrderRow,
  PurchaseLineRow
} from "./types";

export type ProcessJobResult = {
  jobId: string;
  ok: boolean;
  error?: string;
  journalSkipped?: boolean;
};

function asMetadata(raw: unknown): SalesOrderMetadata {
  const m = (raw || {}) as Record<string, unknown>;
  return {
    transactionId: String(m.transactionId || ""),
    bayar: Number(m.bayar) || 0,
    rekening: String(m.rekening || ""),
    akunPendapatan: String(m.akunPendapatan || "Pendapatan"),
    paymentStatus: (m.paymentStatus as SalesOrderMetadata["paymentStatus"]) || "PENJUALAN TUNAI",
    tanggalBayar: m.tanggalBayar ? String(m.tanggalBayar) : undefined,
    keterangan: m.keterangan ? String(m.keterangan) : undefined,
    customerId: m.customerId ? String(m.customerId) : undefined,
    customerName: m.customerName ? String(m.customerName) : undefined,
    invoiceMode: m.invoiceMode === "proper" ? "proper" : "lab"
  };
}

function asLineMeta(raw: unknown): SalesLineMetadata {
  const m = (raw || {}) as Record<string, unknown>;
  return {
    transactionId: String(m.transactionId || ""),
    akunPendapatan: m.akunPendapatan ? String(m.akunPendapatan) : undefined,
    diskon: Number(m.diskon) || 0,
    unitCode: m.unitCode ? String(m.unitCode) : undefined,
    bayar: m.bayar != null ? Number(m.bayar) : undefined,
    kurangBayar: m.kurangBayar != null ? Number(m.kurangBayar) : undefined,
    paymentStatus: m.paymentStatus as SalesLineMetadata["paymentStatus"],
    dpp: m.dpp != null ? Number(m.dpp) : undefined,
    taxAmount: m.taxAmount != null ? Number(m.taxAmount) : undefined,
    taxRate: m.taxRate != null ? Number(m.taxRate) : undefined,
    taxType: m.taxType ? String(m.taxType) : undefined,
    taxable: m.taxable === true
  };
}

async function logJob(
  supabase: SupabaseClient,
  jobId: string,
  level: string,
  message: string
) {
  await supabase.from("posting_job_logs").insert({ job_id: jobId, level, message });
}

type PiutangPaymentMetadata = {
  transactionId: string;
  invoiceNo: string;
  customerName: string;
  salesOrderId: string;
  rekening: string;
  coaAccountName?: string;
  keterangan?: string;
  tanggalBayar: string;
};

function asPiutangPaymentMeta(raw: unknown): PiutangPaymentMetadata {
  const m = (raw || {}) as Record<string, unknown>;
  return {
    transactionId: String(m.transactionId || ""),
    invoiceNo: String(m.invoiceNo || ""),
    customerName: String(m.customerName || ""),
    salesOrderId: String(m.salesOrderId || ""),
    rekening: String(m.rekening || ""),
    coaAccountName: m.coaAccountName ? String(m.coaAccountName) : undefined,
    keterangan: m.keterangan ? String(m.keterangan) : undefined,
    tanggalBayar: wibDateIsoFromInput(String(m.tanggalBayar || ""))
  };
}

function asPurchaseMetadata(raw: unknown): PurchaseOrderMetadata {
  const m = (raw || {}) as Record<string, unknown>;
  return {
    transactionId: String(m.transactionId || ""),
    bayar: Number(m.bayar) || 0,
    rekening: String(m.rekening || ""),
    akunPembelian: String(m.akunPembelian || "Beban"),
    paymentStatus: (m.paymentStatus as PurchaseOrderMetadata["paymentStatus"]) || "Tunai",
    tanggalBayar: m.tanggalBayar ? String(m.tanggalBayar) : undefined,
    keterangan: m.keterangan ? String(m.keterangan) : undefined,
    supplierId: m.supplierId ? String(m.supplierId) : undefined,
    supplierName: m.supplierName ? String(m.supplierName) : undefined,
    pembelianMode: "proper"
  };
}

function asPurchaseLineMeta(raw: unknown): PurchaseLineMetadata {
  const m = (raw || {}) as Record<string, unknown>;
  return {
    transactionId: String(m.transactionId || ""),
    akunPembelian: m.akunPembelian ? String(m.akunPembelian) : undefined,
    diskon: Number(m.diskon) || 0,
    unitCode: m.unitCode ? String(m.unitCode) : undefined,
    bayar: m.bayar != null ? Number(m.bayar) : undefined,
    kurangBayar: m.kurangBayar != null ? Number(m.kurangBayar) : undefined,
    metode: m.metode as PurchaseLineMetadata["metode"],
    tanggalBayar: m.tanggalBayar ? String(m.tanggalBayar) : undefined,
    purchaseCategoryId: m.purchaseCategoryId ? String(m.purchaseCategoryId) : undefined,
    dpp: m.dpp != null ? Number(m.dpp) : undefined,
    taxAmount: m.taxAmount != null ? Number(m.taxAmount) : undefined,
    taxRate: m.taxRate != null ? Number(m.taxRate) : undefined,
    taxType: m.taxType ? String(m.taxType) : undefined,
    taxable: m.taxable === true,
    fixedAsset:
      (m.fixedAsset as Record<string, unknown> | undefined)?.enabled === true
        ? {
            enabled: true,
            usefulLifeMonths:
              (m.fixedAsset as Record<string, unknown>).usefulLifeMonths != null
                ? Number((m.fixedAsset as Record<string, unknown>).usefulLifeMonths)
                : undefined,
            salvageValue:
              (m.fixedAsset as Record<string, unknown>).salvageValue != null
                ? Number((m.fixedAsset as Record<string, unknown>).salvageValue)
                : undefined,
            category: (m.fixedAsset as Record<string, unknown>).category
              ? String((m.fixedAsset as Record<string, unknown>).category)
              : undefined
          }
        : undefined
  };
}

type UtangPaymentMetadata = {
  transactionId: string;
  poNo: string;
  supplierName: string;
  purchaseOrderId: string;
  rekening: string;
  coaAccountName?: string;
  keterangan?: string;
  tanggalBayar: string;
};

function asUtangPaymentMeta(raw: unknown): UtangPaymentMetadata {
  const m = (raw || {}) as Record<string, unknown>;
  return {
    transactionId: String(m.transactionId || ""),
    poNo: String(m.poNo || ""),
    supplierName: String(m.supplierName || ""),
    purchaseOrderId: String(m.purchaseOrderId || ""),
    rekening: String(m.rekening || ""),
    coaAccountName: m.coaAccountName ? String(m.coaAccountName) : undefined,
    keterangan: m.keterangan ? String(m.keterangan) : undefined,
    tanggalBayar: wibDateIsoFromInput(String(m.tanggalBayar || ""))
  };
}

/** Stub config untuk buildPemasukanPayload — Premium tidak memanggil GAS. */
const LOCAL_POSTING_CONFIG = {
  apiKey: "",
  spreadsheetId: "",
  url: ""
};

async function postOrderToSupabaseJournal(
  supabase: SupabaseClient,
  organizationId: string,
  order: SalesOrderRow,
  meta: SalesOrderMetadata,
  lines: SalesLineRow[]
): Promise<{ skippedCount: number; postedCount: number }> {
  const isProperMulti =
    meta.invoiceMode === "proper" && lines.length > 0 && lines.some((l) => l.product_id);

  let skippedCount = 0;
  let postedCount = 0;

  if (!isProperMulti) {
    const payload = buildPemasukanPayload(order, meta, LOCAL_POSTING_CONFIG);
    const journalLines = buildPemasukanJournalLines({
      tanggalPesan: payload.tanggalPesan,
      invoice: payload.invoice,
      keterangan: payload.keterangan,
      total: payload.total,
      bayar: payload.bayar,
      status: payload.status,
      tanggalBayar: payload.tanggalBayar,
      akunPendapatan: payload.akunPendapatan,
      rekening: payload.rekening
    });

    const result = await postJournalEntry(
      supabase,
      {
        organizationId,
        modul: "PEMASUKAN",
        transactionId: payload.transactionId,
        docNo: payload.invoice,
        entryDate: payload.tanggalPesan,
        sourceDocType: "SALES_ORDER",
        sourceDocId: order.id
      },
      journalLines
    );

    if (result.skipped) skippedCount += 1;
    else postedCount += 1;
    return { skippedCount, postedCount };
  }

  for (const line of lines) {
    const lm = asLineMeta(line.metadata);
    const txId = lm.transactionId || meta.transactionId;
    if (!txId) throw new Error("transactionId kosong pada baris invoice");

    const bayar = lm.bayar != null ? lm.bayar : Number(line.line_total);
    const paymentStatus = lm.paymentStatus || meta.paymentStatus;

    const payload = buildPemasukanPayload(order, meta, LOCAL_POSTING_CONFIG, {
      total: Number(line.line_total),
      bayar,
      paymentStatus,
      keterangan: line.description,
      transactionId: txId,
      akunPendapatan: lm.akunPendapatan || meta.akunPendapatan,
      tanggalBayar: meta.tanggalBayar || order.order_date
    });

    const journalLines = buildPemasukanJournalLines({
      tanggalPesan: payload.tanggalPesan,
      invoice: payload.invoice,
      keterangan: payload.keterangan,
      total: payload.total,
      bayar: payload.bayar,
      status: payload.status,
      tanggalBayar: payload.tanggalBayar,
      akunPendapatan: payload.akunPendapatan,
      rekening: payload.rekening,
      dpp: lm.dpp,
      taxAmount: lm.taxAmount,
      taxAccountName: TAX_OUTPUT_ACCOUNT
    });

    const result = await postJournalEntry(
      supabase,
      {
        organizationId,
        modul: "PEMASUKAN",
        transactionId: payload.transactionId,
        docNo: payload.invoice,
        entryDate: payload.tanggalPesan,
        sourceDocType: "SALES_ORDER",
        sourceDocId: order.id,
        metadata: { salesLineId: line.id }
      },
      journalLines
    );

    if (result.skipped) skippedCount += 1;
    else postedCount += 1;
  }

  return { skippedCount, postedCount };
}

async function postPurchaseOrderToSupabaseJournal(
  supabase: SupabaseClient,
  organizationId: string,
  order: PurchaseOrderRow,
  meta: PurchaseOrderMetadata,
  lines: PurchaseLineRow[]
): Promise<{ skippedCount: number; postedCount: number }> {
  let skippedCount = 0;
  let postedCount = 0;

  for (const line of lines) {
    const lm = asPurchaseLineMeta(line.metadata);
    const txId = lm.transactionId || meta.transactionId;
    if (!txId) throw new Error("transactionId kosong pada baris pembelian");

    const bayar = lm.bayar != null ? lm.bayar : Number(line.line_total);
    const metode = lm.metode || meta.paymentStatus;

    const journalLines = buildPembelianJournalLines({
      tanggal: order.order_date,
      noDok: order.po_no,
      supplier: meta.supplierName || "",
      keterangan: line.description,
      total: Number(line.line_total),
      bayar,
      metode,
      tanggalBayar: meta.tanggalBayar || order.order_date,
      akunPembelian: lm.akunPembelian || meta.akunPembelian,
      rekening: meta.rekening,
      dpp: lm.dpp,
      taxAmount: lm.taxAmount,
      taxAccountName: TAX_INPUT_ACCOUNT
    });

    const result = await postJournalEntry(
      supabase,
      {
        organizationId,
        modul: "PEMBELIAN",
        transactionId: txId,
        docNo: order.po_no,
        entryDate: order.order_date,
        sourceDocType: "PURCHASE_ORDER",
        sourceDocId: order.id,
        metadata: { purchaseLineId: line.id }
      },
      journalLines
    );

    if (result.skipped) skippedCount += 1;
    else postedCount += 1;
  }

  return { skippedCount, postedCount };
}

async function processUtangPaymentJob(
  supabase: SupabaseClient,
  job: { id: string; organization_id: string; doc_id: string }
): Promise<{ journalSkipped: boolean }> {
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("*")
    .eq("id", job.doc_id)
    .single();

  if (payErr || !payment) {
    throw new Error(payErr?.message || "Payment tidak ditemukan");
  }

  if (payment.status !== "CONFIRMED") {
    throw new Error("Pelunasan tidak dalam status CONFIRMED");
  }

  const meta = asUtangPaymentMeta(payment.metadata);
  if (!meta.transactionId || !meta.poNo) {
    throw new Error("Metadata pelunasan utang tidak lengkap");
  }

  const rekening = meta.coaAccountName || meta.rekening;
  const journalLines = buildPelunasanUtangJournalLines({
    tanggal: meta.tanggalBayar,
    noDok: meta.poNo,
    supplier: meta.supplierName,
    nominal: Number(payment.amount),
    rekening,
    keterangan: meta.keterangan || `Pelunasan ${meta.poNo}`
  });

  const result = await postJournalEntry(
    supabase,
    {
      organizationId: job.organization_id,
      modul: "PELUNASAN_UTANG",
      transactionId: meta.transactionId,
      docNo: meta.poNo,
      entryDate: meta.tanggalBayar,
      sourceDocType: "UTANG_PAYMENT",
      sourceDocId: payment.id
    },
    journalLines
  );

  await logJob(
    supabase,
    job.id,
    "INFO",
    result.skipped
      ? "Jurnal pelunasan utang sudah ada (idempotent skip)"
      : `Jurnal pelunasan utang OK (${result.lineCount} baris)`
  );

  return { journalSkipped: result.skipped };
}

async function processPiutangPaymentJob(
  supabase: SupabaseClient,
  job: { id: string; organization_id: string; doc_id: string }
): Promise<{ journalSkipped: boolean }> {
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("*")
    .eq("id", job.doc_id)
    .single();

  if (payErr || !payment) {
    throw new Error(payErr?.message || "Payment tidak ditemukan");
  }

  if (payment.status !== "CONFIRMED") {
    throw new Error("Pelunasan tidak dalam status CONFIRMED");
  }

  const meta = asPiutangPaymentMeta(payment.metadata);
  if (!meta.transactionId || !meta.invoiceNo) {
    throw new Error("Metadata pelunasan tidak lengkap");
  }

  const rekening = meta.coaAccountName || meta.rekening;
  const payload = buildPelunasanPiutangPayload(
    { ...meta, rekening },
    Number(payment.amount),
    LOCAL_POSTING_CONFIG
  );

  const journalLines = buildPelunasanPiutangJournalLines({
    tanggalBayar: payload.tanggalBayar,
    invoice: payload.invoice,
    customer: payload.customer,
    nominal: payload.nominal,
    rekening: payload.rekening,
    keterangan: payload.keterangan
  });

  const result = await postJournalEntry(
    supabase,
    {
      organizationId: job.organization_id,
      modul: "PELUNASAN_PIUTANG",
      transactionId: payload.transactionId,
      docNo: payload.invoice,
      entryDate: payload.tanggalBayar,
      sourceDocType: "PIUTANG_PAYMENT",
      sourceDocId: payment.id
    },
    journalLines
  );

  await logJob(
    supabase,
    job.id,
    "INFO",
    result.skipped
      ? "Jurnal pelunasan sudah ada (idempotent skip)"
      : `Jurnal pelunasan OK (${result.lineCount} baris)`
  );

  return { journalSkipped: result.skipped };
}

export async function processPendingPostingJobs(
  supabase: SupabaseClient,
  limit = 5,
  jobIds?: string[],
  organizationId?: string
): Promise<ProcessJobResult[]> {
  let jobsQuery = supabase.from("posting_jobs").select("*");

  if (jobIds?.length) {
    jobsQuery = jobsQuery.in("id", jobIds);
  } else {
    jobsQuery = jobsQuery.eq("status", "PENDING");
  }

  if (organizationId) {
    jobsQuery = jobsQuery.eq("organization_id", organizationId);
  }

  const { data: jobs, error: listErr } = await jobsQuery
    .order("created_at", { ascending: true })
    .limit(jobIds?.length ? Math.max(limit, jobIds.length) : limit);

  if (listErr) {
    throw new Error(listErr.message);
  }

  const results: ProcessJobResult[] = [];

  for (const job of jobs || []) {
    if (job.status === "POSTED") {
      results.push({ jobId: job.id, ok: true });
      continue;
    }

    const attempts = (job.attempts as number) || 0;

    await supabase
      .from("posting_jobs")
      .update({
        status: "RUNNING",
        attempts: attempts + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id);

    try {
      if (job.doc_type === "SALES_ORDER") {
        const { data: order, error: orderErr } = await supabase
          .from("sales_orders")
          .select("*")
          .eq("id", job.doc_id)
          .single();

        if (orderErr || !order) {
          throw new Error(orderErr?.message || "Sales order tidak ditemukan");
        }

        const { data: lines, error: linesErr } = await supabase
          .from("sales_lines")
          .select("*")
          .eq("sales_order_id", order.id)
          .order("sort_order");

        if (linesErr) {
          throw new Error(linesErr.message);
        }

        if (order.status !== "CONFIRMED") {
          throw new Error("Invoice tidak dalam status CONFIRMED");
        }

        const meta = asMetadata(order.metadata);
        if (!meta.transactionId) {
          throw new Error("transactionId kosong di metadata sales_order");
        }

        const { skippedCount, postedCount } = await postOrderToSupabaseJournal(
          supabase,
          job.organization_id,
          order as SalesOrderRow,
          meta,
          (lines || []) as SalesLineRow[]
        );

        let warehouseId = order.warehouse_id ? String(order.warehouse_id) : null;
        if (!warehouseId) {
          warehouseId = await resolveWarehouseIdForSale(supabase, job.organization_id, {
            outletCode: order.outlet_code
          });
        }

        const stockLines = (lines || [])
          .filter((l) => l.product_id)
          .map((l) => ({
            product_id: String(l.product_id),
            qty: Number(l.qty) || 0
          }));

        const stockNotes =
          order.source_system === "POS" ? "Penjualan POS" : "Penjualan invoice";

        await deductSaleStockForOrderIfEnabled(supabase, {
          organizationId: job.organization_id,
          warehouseId,
          salesOrderId: order.id,
          orderNo: order.order_no,
          lines: stockLines,
          notes: stockNotes,
          skipIfExists: true
        });

        await supabase
          .from("posting_jobs")
          .update({
            status: "POSTED",
            engine_ref: meta.transactionId,
            last_error: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);

        await supabase
          .from("sales_orders")
          .update({ status: "POSTED", updated_at: new Date().toISOString() })
          .eq("id", order.id);

        await logJob(
          supabase,
          job.id,
          "INFO",
          skippedCount > 0 && postedCount === 0
            ? "Jurnal sudah ada di Supabase (idempotent skip)"
            : `Jurnal Supabase OK (${postedCount} entri, ${skippedCount} skip)`
        );

        results.push({
          jobId: job.id,
          ok: true,
          journalSkipped: skippedCount > 0 && postedCount === 0
        });
        continue;
      }

      if (job.doc_type === "PIUTANG_PAYMENT") {
        const { journalSkipped } = await processPiutangPaymentJob(
          supabase,
          job as { id: string; organization_id: string; doc_id: string }
        );

        const { data: payment } = await supabase
          .from("payments")
          .select("metadata")
          .eq("id", job.doc_id)
          .single();
        const payMeta = asPiutangPaymentMeta(payment?.metadata);

        await supabase
          .from("posting_jobs")
          .update({
            status: "POSTED",
            engine_ref: payMeta.transactionId,
            last_error: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);

        await supabase
          .from("payments")
          .update({ status: "POSTED" })
          .eq("id", job.doc_id);

        results.push({ jobId: job.id, ok: true, journalSkipped });
        continue;
      }

      if (job.doc_type === "PURCHASE_ORDER") {
        const { data: order, error: orderErr } = await supabase
          .from("purchase_orders")
          .select("*")
          .eq("id", job.doc_id)
          .single();

        if (orderErr || !order) {
          throw new Error(orderErr?.message || "PO tidak ditemukan");
        }

        const { data: lines, error: linesErr } = await supabase
          .from("purchase_lines")
          .select("*")
          .eq("purchase_order_id", order.id)
          .order("sort_order");

        if (linesErr) {
          throw new Error(linesErr.message);
        }

        if (order.status !== "CONFIRMED") {
          throw new Error("PO tidak dalam status CONFIRMED");
        }

        const meta = asPurchaseMetadata(order.metadata);
        if (!meta.transactionId) {
          throw new Error("transactionId kosong di metadata purchase_order");
        }

        const { skippedCount, postedCount } = await postPurchaseOrderToSupabaseJournal(
          supabase,
          job.organization_id,
          order as PurchaseOrderRow,
          meta,
          (lines || []) as PurchaseLineRow[]
        );

        let assetCreated = 0;
        try {
          const assetResult = await createFixedAssetsFromPostedPurchaseOrder(
            supabase,
            job.organization_id,
            order as PurchaseOrderRow,
            (lines || []) as PurchaseLineRow[]
          );
          assetCreated = assetResult.created;
        } catch (assetErr) {
          throw new Error(
            assetErr instanceof Error ? assetErr.message : "Gagal buat aset dari PO"
          );
        }

        await supabase
          .from("posting_jobs")
          .update({
            status: "POSTED",
            engine_ref: meta.transactionId,
            last_error: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);

        await supabase
          .from("purchase_orders")
          .update({ status: "POSTED", updated_at: new Date().toISOString() })
          .eq("id", order.id);

        await logJob(
          supabase,
          job.id,
          "INFO",
          skippedCount > 0 && postedCount === 0
            ? assetCreated > 0
              ? `Jurnal sudah ada (skip); ${assetCreated} aset dibuat`
              : "Jurnal sudah ada di Supabase (idempotent skip)"
            : assetCreated > 0
              ? `Jurnal Supabase OK (${postedCount} entri); ${assetCreated} aset dibuat`
              : `Jurnal Supabase OK (${postedCount} entri, ${skippedCount} skip)`
        );

        results.push({
          jobId: job.id,
          ok: true,
          journalSkipped: skippedCount > 0 && postedCount === 0
        });
        continue;
      }

      if (job.doc_type === "UTANG_PAYMENT") {
        const { journalSkipped } = await processUtangPaymentJob(
          supabase,
          job as { id: string; organization_id: string; doc_id: string }
        );

        const { data: payment } = await supabase
          .from("payments")
          .select("metadata")
          .eq("id", job.doc_id)
          .single();
        const payMeta = asUtangPaymentMeta(payment?.metadata);

        await supabase
          .from("posting_jobs")
          .update({
            status: "POSTED",
            engine_ref: payMeta.transactionId,
            last_error: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);

        await supabase
          .from("payments")
          .update({ status: "POSTED" })
          .eq("id", job.doc_id);

        results.push({ jobId: job.id, ok: true, journalSkipped });
        continue;
      }

      if (job.doc_type === "CASH_TRANSFER") {
        const { data: transfer, error: transferErr } = await supabase
          .from("cash_transfers")
          .select("*")
          .eq("id", job.doc_id)
          .single();

        if (transferErr || !transfer) {
          throw new Error(transferErr?.message || "Mutasi tidak ditemukan");
        }

        if (transfer.status !== "CONFIRMED") {
          throw new Error("Mutasi tidak dalam status CONFIRMED");
        }

        const { skipped } = await postCashTransferJournal(
          supabase,
          transfer as CashTransferRow
        );

        await supabase
          .from("posting_jobs")
          .update({
            status: "POSTED",
            engine_ref: transfer.transaction_id,
            last_error: null,
            updated_at: new Date().toISOString()
          })
          .eq("id", job.id);

        await supabase
          .from("cash_transfers")
          .update({ status: "POSTED", updated_at: new Date().toISOString() })
          .eq("id", transfer.id);

        await logJob(
          supabase,
          job.id,
          "INFO",
          skipped ? "Jurnal mutasi sudah ada (idempotent skip)" : "Jurnal mutasi OK"
        );

        results.push({ jobId: job.id, ok: true, journalSkipped: skipped });
        continue;
      }

      throw new Error(`doc_type tidak didukung: ${job.doc_type}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("posting_jobs")
        .update({
          status: "FAILED",
          last_error: message,
          updated_at: new Date().toISOString()
        })
        .eq("id", job.id);
      await logJob(supabase, job.id, "ERROR", message);
      results.push({ jobId: job.id, ok: false, error: message });
    }
  }

  return results;
}
