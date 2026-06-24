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

  const { count: journalEntries } = await supabase
    .from("journal_entries")
    .select("*", { count: "exact", head: true });

  const { count: journalLines } = await supabase
    .from("journal_lines")
    .select("*", { count: "exact", head: true });

  const { count: totalOrders } = await supabase
    .from("sales_orders")
    .select("*", { count: "exact", head: true });

  const { data: rawEntries } = await supabase
    .from("journal_entries")
    .select(
      "id, modul, transaction_id, doc_no, entry_date, created_at, journal_lines(id, line_date, account_name, debit, credit, keterangan, sort_order)"
    )
    .order("created_at", { ascending: false })
    .limit(10);

  const entries = (rawEntries || []).map((e) => {
    const lines = ((e.journal_lines as Array<{
      id: string;
      line_date: string;
      account_name: string;
      debit: number;
      credit: number;
      keterangan: string | null;
      sort_order: number;
    }>) || []).sort((a, b) => a.sort_order - b.sort_order);
    return {
      id: e.id,
      modul: e.modul,
      transaction_id: e.transaction_id,
      doc_no: e.doc_no,
      entry_date: e.entry_date,
      created_at: e.created_at,
      lines
    };
  });

  return (
    <LaporanPageClient
      stats={{
        postedJobs,
        failedJobs,
        pendingJobs,
        journalEntries: journalEntries ?? 0,
        journalLines: journalLines ?? 0,
        totalOrders: totalOrders ?? 0
      }}
      entries={entries}
    />
  );
}
