import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReversalJournalLines, voidTransactionId } from "./journal-reversal";
import { postJournalEntry } from "./journal-supabase";
import type { JournalLineDraft } from "./journal-rules";

type JournalLineRow = {
  line_date: string;
  account_name: string;
  debit: number;
  credit: number;
  keterangan: string | null;
  sort_order: number;
};

type JournalEntryRow = {
  id: string;
  modul: string;
  transaction_id: string;
  doc_no: string;
  entry_date: string;
  journal_lines: JournalLineRow[];
};

export async function voidCashTransfer(
  supabase: SupabaseClient,
  transferId: string,
  userId: string,
  reason?: string
): Promise<{ reversedEntries: number }> {
  const { data: transfer, error: transferErr } = await supabase
    .from("cash_transfers")
    .select("id, organization_id, transfer_no, status, transfer_date, transaction_id")
    .eq("id", transferId)
    .single();

  if (transferErr || !transfer) {
    throw new Error(transferErr?.message || "Mutasi tidak ditemukan");
  }

  if (transfer.status === "VOIDED") {
    throw new Error("Mutasi sudah dibatalkan");
  }
  if (transfer.status !== "POSTED") {
    throw new Error("Hanya mutasi POSTED yang bisa dibatalkan (void)");
  }

  const { data: entries, error: entriesErr } = await supabase
    .from("journal_entries")
    .select(
      "id, modul, transaction_id, doc_no, entry_date, journal_lines(line_date, account_name, debit, credit, keterangan, sort_order)"
    )
    .eq("organization_id", transfer.organization_id)
    .eq("source_doc_type", "CASH_TRANSFER")
    .eq("source_doc_id", transfer.id)
    .eq("entry_kind", "NORMAL");

  if (entriesErr) {
    throw new Error(entriesErr.message);
  }

  const voidDate = new Date().toISOString().slice(0, 10);
  let reversedEntries = 0;

  for (const raw of (entries || []) as JournalEntryRow[]) {
    const lines = ((raw.journal_lines || []) as JournalLineRow[]).sort(
      (a, b) => a.sort_order - b.sort_order
    );
    if (!lines.length) continue;

    const drafts: JournalLineDraft[] = lines.map((l) => ({
      lineDate: l.line_date,
      accountName: l.account_name,
      debit: Number(l.debit),
      credit: Number(l.credit),
      keterangan: l.keterangan || ""
    }));

    const reversalLines = buildReversalJournalLines(drafts, voidDate, transfer.transfer_no);
    const reversalTxId = voidTransactionId(raw.transaction_id);

    const result = await postJournalEntry(supabase, {
      organizationId: transfer.organization_id,
      modul: "MUTASI_DANA",
      transactionId: reversalTxId,
      docNo: transfer.transfer_no,
      entryDate: voidDate,
      sourceDocType: "CASH_TRANSFER_VOID",
      sourceDocId: transfer.id,
      metadata: {
        reversesEntryId: raw.id,
        reversesTransactionId: raw.transaction_id,
        voidReason: reason || null
      }
    }, reversalLines);

    if (!result.skipped) {
      reversedEntries += 1;
      await supabase
        .from("journal_entries")
        .update({
          entry_kind: "VOID_REVERSAL",
          reverses_entry_id: raw.id
        })
        .eq("id", result.entryId);
    }
  }

  const { error: updErr } = await supabase
    .from("cash_transfers")
    .update({
      status: "VOIDED",
      voided_at: new Date().toISOString(),
      void_reason: reason?.trim() || null,
      voided_by: userId,
      updated_at: new Date().toISOString()
    })
    .eq("id", transfer.id);

  if (updErr) {
    throw new Error(updErr.message);
  }

  return { reversedEntries };
}

export async function deleteConfirmedCashTransfer(
  supabase: SupabaseClient,
  transferId: string
): Promise<void> {
  const { data: transfer, error: transferErr } = await supabase
    .from("cash_transfers")
    .select("id, status")
    .eq("id", transferId)
    .single();

  if (transferErr || !transfer) {
    throw new Error(transferErr?.message || "Mutasi tidak ditemukan");
  }

  if (transfer.status !== "CONFIRMED") {
    throw new Error("Hanya mutasi CONFIRMED (belum posting) yang bisa dihapus");
  }

  await supabase.from("posting_jobs").delete().eq("doc_type", "CASH_TRANSFER").eq("doc_id", transfer.id);

  const { error: delErr } = await supabase.from("cash_transfers").delete().eq("id", transfer.id);
  if (delErr) {
    throw new Error(delErr.message);
  }
}
