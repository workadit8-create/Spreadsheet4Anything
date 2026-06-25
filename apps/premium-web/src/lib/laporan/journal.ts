import type { SupabaseClient } from "@supabase/supabase-js";
import type { CoaAccount, JournalLineRow, ReportData } from "./types";

type JournalEntryRow = {
  id: string;
  doc_no: string;
  modul: string;
  entry_date: string;
  entry_kind: string;
};

type RawJournalLine = {
  id: string;
  journal_entry_id: string;
  line_date: string;
  account_name: string;
  debit: number;
  credit: number;
  keterangan: string | null;
  sort_order: number;
};

export async function fetchReportData(
  supabase: SupabaseClient,
  organizationId: string,
  endDate: string
): Promise<ReportData> {
  const [coaRes, entriesRes, linesRes, cashRes] = await Promise.all([
    supabase
      .from("coa_accounts")
      .select("id, code, name, account_type, metadata, active")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .order("code"),
    supabase
      .from("journal_entries")
      .select("id, doc_no, modul, entry_date, entry_kind")
      .eq("organization_id", organizationId),
    supabase
      .from("journal_lines")
      .select(
        "id, journal_entry_id, line_date, account_name, debit, credit, keterangan, sort_order"
      )
      .eq("organization_id", organizationId)
      .lte("line_date", endDate)
      .order("line_date", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("cash_bank_accounts")
      .select("coa_account_name")
      .eq("organization_id", organizationId)
      .eq("active", true)
  ]);

  if (coaRes.error) throw new Error(coaRes.error.message);
  if (entriesRes.error) throw new Error(entriesRes.error.message);
  if (linesRes.error) throw new Error(linesRes.error.message);
  if (cashRes.error) throw new Error(cashRes.error.message);

  const entryMap = new Map<string, JournalEntryRow>();
  for (const e of (entriesRes.data || []) as JournalEntryRow[]) {
    entryMap.set(e.id, e);
  }

  const journalLines: JournalLineRow[] = [];
  for (const raw of (linesRes.data || []) as RawJournalLine[]) {
    const entry = entryMap.get(raw.journal_entry_id);
    if (!entry) continue;
    journalLines.push({
      ...raw,
      debit: Number(raw.debit) || 0,
      credit: Number(raw.credit) || 0,
      line_date: String(raw.line_date).slice(0, 10),
      doc_no: entry.doc_no,
      modul: entry.modul,
      entry_kind: entry.entry_kind || "NORMAL"
    });
  }

  const coa = ((coaRes.data || []) as CoaAccount[]).map((c) => ({
    ...c,
    metadata: (c.metadata || {}) as Record<string, unknown>
  }));

  const cashCoaNames = [
    ...new Set(
      (cashRes.data || [])
        .map((r: { coa_account_name: string }) => r.coa_account_name)
        .filter(Boolean)
    )
  ];

  for (const name of ["Kas", "Bank"]) {
    if (coa.some((c) => c.name === name) && !cashCoaNames.includes(name)) {
      cashCoaNames.push(name);
    }
  }

  return { coa, journalLines, cashCoaNames };
}

export function linesBefore(lines: JournalLineRow[], beforeDate: string): JournalLineRow[] {
  return lines.filter((l) => l.line_date < beforeDate);
}

export function linesInPeriod(lines: JournalLineRow[], start: string, end: string): JournalLineRow[] {
  return lines.filter((l) => l.line_date >= start && l.line_date <= end);
}
