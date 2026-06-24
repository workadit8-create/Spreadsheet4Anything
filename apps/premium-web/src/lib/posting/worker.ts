import type { SupabaseClient } from "@supabase/supabase-js";
import { getHybridBackendConfig } from "@/lib/hybrid/config";
import { buildPemasukanPayload, callHybridBackend } from "./pemasukan";
import type { SalesOrderMetadata, SalesOrderRow } from "./types";

export type ProcessJobResult = {
  jobId: string;
  ok: boolean;
  error?: string;
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
      results.push({ jobId: job.id, ok: true });
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
