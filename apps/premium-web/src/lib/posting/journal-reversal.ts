import type { JournalLineDraft } from "./journal-rules";

export function buildReversalJournalLines(
  originalLines: JournalLineDraft[],
  voidDate: string,
  docNo: string
): JournalLineDraft[] {
  return originalLines.map((line) => ({
    lineDate: voidDate,
    accountName: line.accountName,
    debit: Number(line.credit) || 0,
    credit: Number(line.debit) || 0,
    keterangan: `Pembatalan ${docNo} — ${line.keterangan || ""}`.trim()
  }));
}

export function voidTransactionId(originalTransactionId: string): string {
  const base = String(originalTransactionId || "").trim();
  if (!base) throw new Error("transactionId asli kosong");
  return `VOID-${base}`;
}
