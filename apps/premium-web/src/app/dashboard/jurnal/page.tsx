import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import JurnalPageClient from "./JurnalPageClient";

export default async function JurnalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rawEntries, error } = await supabase
    .from("journal_entries")
    .select(
      "id, modul, transaction_id, doc_no, entry_date, source_doc_type, created_at, journal_lines(id, line_date, account_name, debit, credit, keterangan, sort_order)"
    )
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("jurnal load error", error.message);
  }

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
      source_doc_type: e.source_doc_type,
      created_at: e.created_at,
      lines
    };
  });

  return <JurnalPageClient entries={entries} />;
}
