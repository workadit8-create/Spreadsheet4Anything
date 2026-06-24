import type { SupabaseClient } from "@supabase/supabase-js";
import { getHybridBackendConfig } from "@/lib/hybrid/config";
import { buildPemasukanPayload, callHybridBackend } from "./pemasukan";
import { buildPelunasanPiutangPayload, syncPelunasanToSheet } from "./pelunasan-piutang";
import { syncOrderToPemasukanSheet } from "./sync-sheet";
import type {
  SalesLineMetadata,
  SalesOrderMetadata,
  SalesOrderRow,
  SalesLineRow
} from "./types";

export type ProcessJobResult = {
  jobId: string;
  ok: boolean;
  error?: string;
  sheetSynced?: boolean;
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
    paymentStatus: m.paymentStatus as SalesLineMetadata["paymentStatus"]
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

async function recordSyncEvent(
  supabase: SupabaseClient,
  organizationId: string,
  payload: Record<string, unknown>,
  status: string,
  error?: string
) {
  await supabase.from("sync_events").insert({
    organization_id: organizationId,
    direction: "PUSH",
    source: "premium-web→pemasukan-sheet",
    payload,
    status,
    error: error || null
  });
}

async function postOrderToJurnal(
  order: SalesOrderRow,
  meta: SalesOrderMetadata,
  lines: SalesLineRow[],
  config: ReturnType<typeof getHybridBackendConfig>
) {
  const isProperMulti =
    meta.invoiceMode === "proper" && lines.length > 0 && lines.some((l) => l.product_id);

  if (!isProperMulti) {
    const payload = buildPemasukanPayload(order as SalesOrderRow, meta, config);
    await callHybridBackend(payload, config.url);
    return;
  }

  for (const line of lines) {
    const lm = asLineMeta(line.metadata);
    const txId = lm.transactionId || meta.transactionId;
    if (!txId) throw new Error("transactionId kosong pada baris invoice");

    const bayar = lm.bayar != null ? lm.bayar : Number(line.line_total);
    const paymentStatus = lm.paymentStatus || meta.paymentStatus;

    const payload = buildPemasukanPayload(order as SalesOrderRow, meta, config, {
      total: Number(line.line_total),
      bayar,
      paymentStatus,
      keterangan: line.description,
      transactionId: txId,
      akunPendapatan: lm.akunPendapatan || meta.akunPendapatan,
      tanggalBayar: meta.tanggalBayar || order.order_date
    });
    await callHybridBackend(payload, config.url);
  }
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
  sheetSynced?: boolean;
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
    tanggalBayar: String(m.tanggalBayar || new Date().toISOString().slice(0, 10)),
    sheetSynced: m.sheetSynced === true
  };
}

async function processPiutangPaymentJob(
  supabase: SupabaseClient,
  job: { id: string; organization_id: string; doc_id: string },
  config: ReturnType<typeof getHybridBackendConfig>
): Promise<{ sheetSynced: boolean }> {
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("*")
    .eq("id", job.doc_id)
    .single();

  if (payErr || !payment) {
    throw new Error(payErr?.message || "Payment tidak ditemukan");
  }

  const meta = asPiutangPaymentMeta(payment.metadata);
  if (!meta.transactionId || !meta.invoiceNo) {
    throw new Error("Metadata pelunasan tidak lengkap");
  }

  const payload = buildPelunasanPiutangPayload(
    {
      ...meta,
      rekening: meta.coaAccountName || meta.rekening
    },
    Number(payment.amount),
    config
  );
  await callHybridBackend(payload, config.url);

  let sheetSynced = false;
  try {
    await recordSyncEvent(
      supabase,
      job.organization_id,
      { paymentId: payment.id, invoiceNo: meta.invoiceNo },
      "RUNNING"
    );
    await syncPelunasanToSheet(meta, Number(payment.amount), config);
    const merged = { ...(payment.metadata as Record<string, unknown>), sheetSynced: true, sheetSyncedAt: new Date().toISOString() };
    await supabase.from("payments").update({ metadata: merged }).eq("id", payment.id);
    await recordSyncEvent(
      supabase,
      job.organization_id,
      { paymentId: payment.id, invoiceNo: meta.invoiceNo, ok: true },
      "DONE"
    );
    sheetSynced = true;
    await logJob(supabase, job.id, "INFO", "Sync PELUNASAN_PIUTANG sheet OK");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncEvent(
      supabase,
      job.organization_id,
      { paymentId: payment.id, invoiceNo: meta.invoiceNo },
      "FAILED",
      message
    );
    await logJob(supabase, job.id, "WARN", "Sync pelunasan sheet gagal: " + message);
  }

  return { sheetSynced };
}

async function syncToSheet(
  supabase: SupabaseClient,
  job: { id: string; organization_id: string },
  order: SalesOrderRow,
  meta: SalesOrderMetadata,
  lines: SalesLineRow[],
  config: ReturnType<typeof getHybridBackendConfig>
): Promise<boolean> {
  const syncPayload = {
    orderId: order.id,
    orderNo: order.order_no,
    transactionId: meta.transactionId,
    lineCount: lines.length
  };

  try {
    await recordSyncEvent(supabase, job.organization_id, syncPayload, "RUNNING");
    await syncOrderToPemasukanSheet(order, meta, config, lines);

    const mergedMeta = {
      ...(order.metadata as Record<string, unknown>),
      sheetSynced: true,
      sheetSyncedAt: new Date().toISOString()
    };

    await supabase
      .from("sales_orders")
      .update({ metadata: mergedMeta, updated_at: new Date().toISOString() })
      .eq("id", order.id);

    await recordSyncEvent(supabase, job.organization_id, { ...syncPayload, ok: true }, "DONE");
    await logJob(supabase, job.id, "INFO", "Sync ke sheet PEMASUKAN OK");
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncEvent(supabase, job.organization_id, syncPayload, "FAILED", message);
    await logJob(supabase, job.id, "WARN", "Sync sheet gagal: " + message);
    return false;
  }
}

export async function processPendingPostingJobs(
  supabase: SupabaseClient,
  limit = 5
): Promise<ProcessJobResult[]> {
  const config = getHybridBackendConfig();

  const { data: jobs, error: listErr } = await supabase
    .from("posting_jobs")
    .select("*")
    .eq("status", "PENDING")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (listErr) {
    throw new Error(listErr.message);
  }

  const results: ProcessJobResult[] = [];

  for (const job of jobs || []) {
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

        const meta = asMetadata(order.metadata);
        if (!meta.transactionId) {
          throw new Error("transactionId kosong di metadata sales_order");
        }

        await postOrderToJurnal(order as SalesOrderRow, meta, (lines || []) as SalesLineRow[], config);

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

        await logJob(supabase, job.id, "INFO", "Posted ke BACKENDengine HYBRID LAB");

        const sheetSynced = await syncToSheet(
          supabase,
          job as { id: string; organization_id: string },
          order as SalesOrderRow,
          meta,
          (lines || []) as SalesLineRow[],
          config
        );

        results.push({ jobId: job.id, ok: true, sheetSynced });
        continue;
      }

      if (job.doc_type === "PIUTANG_PAYMENT") {
        const { sheetSynced } = await processPiutangPaymentJob(
          supabase,
          job as { id: string; organization_id: string; doc_id: string },
          config
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

        await logJob(supabase, job.id, "INFO", "Pelunasan piutang posted");
        results.push({ jobId: job.id, ok: true, sheetSynced });
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

/** Retry sync sheet untuk order yang sudah POSTED tapi belum sheetSynced. */
export async function processSheetSyncRetries(
  supabase: SupabaseClient,
  limit = 10
): Promise<{ orderId: string; ok: boolean; error?: string }[]> {
  const config = getHybridBackendConfig();

  const { data: orders, error } = await supabase
    .from("sales_orders")
    .select("*")
    .eq("status", "POSTED")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const results: { orderId: string; ok: boolean; error?: string }[] = [];

  for (const order of orders || []) {
    const metaRaw = (order.metadata || {}) as Record<string, unknown>;
    if (metaRaw.sheetSynced === true) continue;

    const meta = asMetadata(order.metadata);
    if (!meta.transactionId) continue;

    const { data: lines } = await supabase
      .from("sales_lines")
      .select("*")
      .eq("sales_order_id", order.id)
      .order("sort_order");

    try {
      await syncOrderToPemasukanSheet(
        order as SalesOrderRow,
        meta,
        config,
        (lines || []) as SalesLineRow[]
      );
      const mergedMeta = { ...metaRaw, sheetSynced: true, sheetSyncedAt: new Date().toISOString() };
      await supabase
        .from("sales_orders")
        .update({ metadata: mergedMeta, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      await recordSyncEvent(
        supabase,
        order.organization_id,
        { orderId: order.id, orderNo: order.order_no, retry: true },
        "DONE"
      );
      results.push({ orderId: order.id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordSyncEvent(
        supabase,
        order.organization_id,
        { orderId: order.id, orderNo: order.order_no },
        "FAILED",
        message
      );
      results.push({ orderId: order.id, ok: false, error: message });
    }
  }

  return results;
}

/** Retry sync PELUNASAN_PIUTANG untuk payment yang sudah posted tapi belum sheetSynced. */
export async function processPelunasanSheetSyncRetries(
  supabase: SupabaseClient,
  limit = 20,
  options?: { includeSynced?: boolean }
): Promise<{ paymentId: string; ok: boolean; error?: string; skipped?: boolean }[]> {
  const config = getHybridBackendConfig();

  const { data: payments, error } = await supabase
    .from("payments")
    .select("*")
    .eq("doc_type", "PIUTANG_PAYMENT")
    .order("paid_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const results: { paymentId: string; ok: boolean; error?: string; skipped?: boolean }[] = [];

  for (const payment of payments || []) {
    const metaRaw = (payment.metadata || {}) as Record<string, unknown>;
    if (!options?.includeSynced && metaRaw.sheetSynced === true) continue;

    const meta = asPiutangPaymentMeta(payment.metadata);
    if (!meta.transactionId || !meta.invoiceNo) continue;

    try {
      await recordSyncEvent(
        supabase,
        payment.organization_id,
        { paymentId: payment.id, invoiceNo: meta.invoiceNo, retry: true, force: !!options?.includeSynced },
        "RUNNING"
      );
      const syncResult = await syncPelunasanToSheet(meta, Number(payment.amount), config) as {
        skipped?: boolean;
        message?: string;
      };
      if (syncResult?.skipped) {
        results.push({ paymentId: payment.id, ok: true, skipped: true });
        continue;
      }
      const merged = {
        ...metaRaw,
        sheetSynced: true,
        sheetSyncedAt: new Date().toISOString()
      };
      await supabase.from("payments").update({ metadata: merged }).eq("id", payment.id);
      await recordSyncEvent(
        supabase,
        payment.organization_id,
        { paymentId: payment.id, invoiceNo: meta.invoiceNo, ok: true, retry: true },
        "DONE"
      );
      results.push({ paymentId: payment.id, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordSyncEvent(
        supabase,
        payment.organization_id,
        { paymentId: payment.id, invoiceNo: meta.invoiceNo, retry: true },
        "FAILED",
        message
      );
      results.push({ paymentId: payment.id, ok: false, error: message });
    }
  }

  return results;
}
