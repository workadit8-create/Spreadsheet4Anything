import type { SupabaseClient } from "@supabase/supabase-js";

export type JournalLineView = {
  lineDate: string;
  accountName: string;
  debit: number;
  credit: number;
  keterangan: string;
  sortOrder: number;
};

export type JournalEntryView = {
  id: string;
  modul: string;
  transactionId: string;
  docNo: string;
  entryDate: string;
  entryKind: string;
  sourceDocType: string | null;
  keterangan: string;
  lines: JournalLineView[];
};

export type FetchJournalsResult = {
  entries: JournalEntryView[];
  hint: string | null;
};

function voidSourceType(sourceType: string): string {
  return `${sourceType}_VOID`;
}

function mapEntry(raw: {
  id: string;
  modul: string;
  transaction_id: string;
  doc_no: string;
  entry_date: string;
  entry_kind?: string;
  source_doc_type: string | null;
  metadata?: Record<string, unknown> | null;
  journal_lines?: Array<{
    line_date: string;
    account_name: string;
    debit: number;
    credit: number;
    keterangan: string | null;
    sort_order: number;
  }>;
}): JournalEntryView {
  const meta = raw.metadata || {};
  const lines = [...(raw.journal_lines || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => ({
      lineDate: l.line_date,
      accountName: l.account_name,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      keterangan: l.keterangan || "",
      sortOrder: l.sort_order
    }));

  return {
    id: raw.id,
    modul: raw.modul,
    transactionId: raw.transaction_id,
    docNo: raw.doc_no,
    entryDate: raw.entry_date,
    entryKind: raw.entry_kind || "NORMAL",
    sourceDocType: raw.source_doc_type,
    keterangan: String(meta.keterangan || meta.voidReason || ""),
    lines
  };
}

async function resolveCashTransferSource(
  supabase: SupabaseClient,
  organizationId: string,
  transferId: string
): Promise<{ docIds: string[]; allowedTypes: Set<string>; hint: string | null }> {
  const { data: transfer } = await supabase
    .from("cash_transfers")
    .select("metadata")
    .eq("id", transferId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  const meta = (transfer?.metadata || {}) as Record<string, unknown>;
  const allowedTypes = new Set(["CASH_TRANSFER", voidSourceType("CASH_TRANSFER")]);
  const docIds = [transferId];
  let hint: string | null = null;

  if (meta.opening_balance === true) {
    hint =
      "Mutasi saldo awal rekening — jurnal dicatat di Jurnal Manual. Baris ini hanya alokasi kartu saldo rekening.";
    return { docIds, allowedTypes, hint };
  }

  if (meta.linked === true && meta.sourceType && meta.sourceId) {
    const linkedType = String(meta.sourceType);
    const linkedId = String(meta.sourceId);
    docIds.push(linkedId);
    allowedTypes.add(linkedType);
    allowedTypes.add(voidSourceType(linkedType));
    hint = `Mutasi terhubung ke ${linkedType.replace(/_/g, " ")}. Jurnal dicatat pada transaksi sumber.`;
  }

  return { docIds, allowedTypes, hint };
}

export async function fetchJournalsBySource(
  supabase: SupabaseClient,
  organizationId: string,
  sourceType: string,
  sourceId: string
): Promise<FetchJournalsResult> {
  let docIds = [sourceId];
  let allowedTypes = new Set([sourceType, voidSourceType(sourceType)]);
  let hint: string | null = null;

  if (sourceType === "CASH_TRANSFER") {
    const resolved = await resolveCashTransferSource(supabase, organizationId, sourceId);
    docIds = resolved.docIds;
    allowedTypes = resolved.allowedTypes;
    hint = resolved.hint;
  }

  const uniqueIds = [...new Set(docIds)];

  const { data, error } = await supabase
    .from("journal_entries")
    .select(
      "id, modul, transaction_id, doc_no, entry_date, entry_kind, source_doc_type, metadata, journal_lines(line_date, account_name, debit, credit, keterangan, sort_order)"
    )
    .eq("organization_id", organizationId)
    .in("source_doc_id", uniqueIds)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const entries = (data || [])
    .filter((row) => row.source_doc_type && allowedTypes.has(row.source_doc_type))
    .map((row) => mapEntry(row as never));

  if (!entries.length && !hint) {
    hint = "Belum ada jurnal untuk transaksi ini. Post jurnal terlebih dahulu.";
  }

  return { entries, hint };
}
