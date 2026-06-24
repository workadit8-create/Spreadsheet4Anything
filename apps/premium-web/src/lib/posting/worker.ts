import type { SupabaseClient } from "@supabase/supabase-js";
import { getHybridBackendConfig } from "@/lib/hybrid/config";
import { buildPemasukanPayload, callHybridBackend } from "./pemasukan";
import { syncOrderToPemasukanSheet } from "./sync-sheet";
import type { SalesOrderMetadata, SalesOrderRow } from "./types";

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
    keterangan: m.keterangan ? String(m.keterangan) : undefined
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

async function syncToSheet(
  supabase: SupabaseClient,
  job: { id: string; organization_id: string },
  order: SalesOrderRow,
  meta: SalesOrderMetadata,
  config: ReturnType<typeof getHybridBackendConfig>
): Promise<boolean> {
  const syncPayload = {
    orderId: order.id,
    orderNo: order.order_no,
    transactionId: meta.transactionId
  };

  try {
    await recordSyncEvent(supabase, job.organization_id, syncPayload, "RUNNING");
    await syncOrderToPemasukanSheet(order, meta, config);

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
      if (job.doc_type !== "SALES_ORDER") {
        throw new Error(`doc_type tidak didukung: ${job.doc_type}`);
      }

      const { data: order, error: orderErr } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("id", job.doc_id)
        .single();

      if (orderErr || !order) {
        throw new Error(orderErr?.message || "Sales order tidak ditemukan");
      }

      const meta = asMetadata(order.metadata);
      if (!meta.transactionId) {
        throw new Error("transactionId kosong di metadata sales_order");
      }

      const payload = buildPemasukanPayload(order as SalesOrderRow, meta, config);
      await callHybridBackend(payload, config.url);

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
        config
      );

      results.push({ jobId: job.id, ok: true, sheetSynced });
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

    try {
      await syncOrderToPemasukanSheet(order as SalesOrderRow, meta, config);
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
