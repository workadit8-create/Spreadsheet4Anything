import type { SupabaseClient } from "@supabase/supabase-js";

export async function enqueueSalesOrderPostingJob(
  supabase: SupabaseClient,
  organizationId: string,
  orderId: string
): Promise<string> {
  const { data: order, error: orderErr } = await supabase
    .from("sales_orders")
    .select("status")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    throw new Error(orderErr?.message || "Sales order tidak ditemukan");
  }
  if (order.status !== "CONFIRMED") {
    throw new Error("Hanya invoice CONFIRMED yang bisa diposting ke jurnal");
  }

  const { data: existingJob } = await supabase
    .from("posting_jobs")
    .select("id, status")
    .eq("doc_type", "SALES_ORDER")
    .eq("doc_id", orderId)
    .in("status", ["PENDING", "RUNNING", "POSTED"])
    .maybeSingle();

  if (existingJob?.id) {
    if (existingJob.status === "POSTED") {
      throw new Error("Invoice sudah diposting");
    }
    return existingJob.id;
  }

  const { data: job, error: jobErr } = await supabase
    .from("posting_jobs")
    .insert({
      organization_id: organizationId,
      doc_type: "SALES_ORDER",
      doc_id: orderId,
      status: "PENDING"
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    throw new Error(jobErr?.message || "Gagal enqueue posting job");
  }
  return job.id;
}

export async function enqueuePiutangPaymentJob(
  supabase: SupabaseClient,
  organizationId: string,
  paymentId: string
): Promise<string> {
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("status")
    .eq("id", paymentId)
    .eq("doc_type", "PIUTANG_PAYMENT")
    .single();

  if (payErr || !payment) {
    throw new Error(payErr?.message || "Pelunasan tidak ditemukan");
  }
  if (payment.status !== "CONFIRMED") {
    throw new Error("Hanya pelunasan CONFIRMED yang bisa diposting ke jurnal");
  }

  const { data: existingJob } = await supabase
    .from("posting_jobs")
    .select("id, status")
    .eq("doc_type", "PIUTANG_PAYMENT")
    .eq("doc_id", paymentId)
    .in("status", ["PENDING", "RUNNING", "POSTED"])
    .maybeSingle();

  if (existingJob?.id) {
    if (existingJob.status === "POSTED") {
      throw new Error("Pelunasan sudah diposting");
    }
    return existingJob.id;
  }

  const { data: job, error: jobErr } = await supabase
    .from("posting_jobs")
    .insert({
      organization_id: organizationId,
      doc_type: "PIUTANG_PAYMENT",
      doc_id: paymentId,
      status: "PENDING"
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    throw new Error(jobErr?.message || "Gagal enqueue posting job");
  }
  return job.id;
}
