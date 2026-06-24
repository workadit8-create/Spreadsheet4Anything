import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LaporanPageClient from "./LaporanPageClient";

export default async function LaporanPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: jobs } = await supabase.from("posting_jobs").select("status");
  const postedJobs = (jobs || []).filter((j) => j.status === "POSTED").length;
  const failedJobs = (jobs || []).filter((j) => j.status === "FAILED").length;
  const pendingJobs = (jobs || []).filter((j) => j.status === "PENDING").length;

  const { data: orders } = await supabase
    .from("sales_orders")
    .select("id, metadata, status");

  const { data: payments } = await supabase
    .from("payments")
    .select("id, metadata, doc_type")
    .eq("doc_type", "PIUTANG_PAYMENT");

  const totalOrders = orders?.length ?? 0;
  let sheetSynced = 0;
  let sheetPending = 0;
  (orders || []).forEach((o) => {
    const meta = (o.metadata || {}) as Record<string, unknown>;
    if (meta.sheetSynced === true) sheetSynced += 1;
    else if (o.status === "POSTED") sheetPending += 1;
  });

  let pelunasanSheetSynced = 0;
  let pelunasanSheetPending = 0;

  const paymentIds = (payments || []).map((p) => p.id);
  const { data: pelunasanJobs } = paymentIds.length
    ? await supabase
        .from("posting_jobs")
        .select("doc_id, status")
        .eq("doc_type", "PIUTANG_PAYMENT")
        .in("doc_id", paymentIds)
    : { data: [] };

  const postedPaymentIds = new Set(
    (pelunasanJobs || []).filter((j) => j.status === "POSTED").map((j) => j.doc_id)
  );

  (payments || []).forEach((p) => {
    const meta = (p.metadata || {}) as Record<string, unknown>;
    if (meta.sheetSynced === true) {
      pelunasanSheetSynced += 1;
    } else if (postedPaymentIds.has(p.id)) {
      pelunasanSheetPending += 1;
    }
  });

  const { data: syncEvents } = await supabase
    .from("sync_events")
    .select("id, direction, source, status, error, created_at, payload")
    .order("created_at", { ascending: false })
    .limit(20);

  const gasWebappUrl = process.env.HYBRID_GAS_WEBAPP_URL;
  const databaseSheetId = process.env.HYBRID_DATABASE_SHEET_ID;

  return (
    <LaporanPageClient
      stats={{
        postedJobs,
        failedJobs,
        pendingJobs,
        sheetSynced,
        sheetPending,
        pelunasanSheetSynced,
        pelunasanSheetPending,
        totalOrders
      }}
      syncEvents={(syncEvents || []) as Parameters<typeof LaporanPageClient>[0]["syncEvents"]}
      gasWebappUrl={gasWebappUrl}
      databaseSheetId={databaseSheetId}
    />
  );
}
