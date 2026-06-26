import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalLineDraft } from "./journal-rules";

export type PostJournalEntryInput = {
  organizationId: string;
  modul:
    | "PEMASUKAN"
    | "PELUNASAN_PIUTANG"
    | "PEMBELIAN"
    | "PELUNASAN_UTANG"
    | "MANUAL"
    | "MUTASI_DANA"
    | "CICILAN_UTANG_BANK"
    | "ASSET_DEPRECIATION"
    | "ASSET_DISPOSAL";
  transactionId: string;
  docNo: string;
  entryDate: string;
  sourceDocType?: string;
  sourceDocId?: string;
  metadata?: Record<string, unknown>;
};

export type PostJournalResult = {
  entryId: string;
  skipped: boolean;
  lineCount: number;
};

async function resolveCoaMap(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("coa_accounts")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("active", true);

  if (error) {
    throw new Error("Gagal baca COA: " + error.message);
  }

  const map = new Map<string, string>();
  for (const row of data || []) {
    map.set(row.name, row.id);
  }
  return map;
}

export async function postJournalEntry(
  supabase: SupabaseClient,
  entry: PostJournalEntryInput,
  lines: JournalLineDraft[]
): Promise<PostJournalResult> {
  if (!entry.transactionId) {
    throw new Error("transactionId kosong");
  }
  if (!lines.length) {
    throw new Error("Jurnal tidak punya baris");
  }

  const { data: existing, error: existErr } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("organization_id", entry.organizationId)
    .eq("transaction_id", entry.transactionId)
    .maybeSingle();

  if (existErr) {
    throw new Error(existErr.message);
  }
  if (existing) {
    return { entryId: existing.id, skipped: true, lineCount: 0 };
  }

  const coaMap = await resolveCoaMap(supabase, entry.organizationId);

  const { data: inserted, error: insertErr } = await supabase
    .from("journal_entries")
    .insert({
      organization_id: entry.organizationId,
      modul: entry.modul,
      transaction_id: entry.transactionId,
      doc_no: entry.docNo,
      entry_date: entry.entryDate,
      source_doc_type: entry.sourceDocType || null,
      source_doc_id: entry.sourceDocId || null,
      metadata: entry.metadata || {}
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    throw new Error(insertErr?.message || "Gagal insert journal_entries");
  }

  const lineRows = lines.map((line, index) => ({
    journal_entry_id: inserted.id,
    organization_id: entry.organizationId,
    line_date: line.lineDate,
    account_name: line.accountName,
    coa_account_id: coaMap.get(line.accountName) || null,
    debit: line.debit,
    credit: line.credit,
    keterangan: line.keterangan,
    sort_order: index
  }));

  const { error: linesErr } = await supabase.from("journal_lines").insert(lineRows);
  if (linesErr) {
    throw new Error("Gagal insert journal_lines: " + linesErr.message);
  }

  return { entryId: inserted.id, skipped: false, lineCount: lineRows.length };
}
