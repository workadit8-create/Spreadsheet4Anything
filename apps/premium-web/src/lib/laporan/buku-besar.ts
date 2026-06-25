import {
  isDebitNormal,
  mergeCoaWithJournalAccounts,
  netFromLines,
  saldoNormalForCoa
} from "./coa";
import { linesBefore, linesInPeriod } from "./journal";
import type { BukuBesarAccount, CoaAccount, JournalLineRow, ReportPeriod } from "./types";

function saldoFromLines(lines: JournalLineRow[], accountName: string, debitNormal: boolean): number {
  return netFromLines(lines, accountName, debitNormal);
}

function buildAccountBlock(
  coa: CoaAccount,
  allLines: JournalLineRow[],
  period: ReportPeriod
): BukuBesarAccount | null {
  const saldoNormal = saldoNormalForCoa(coa);
  const debitNormal = isDebitNormal(saldoNormal);
  const before = linesBefore(allLines, period.start);
  const inPeriod = linesInPeriod(allLines, period.start, period.end).filter(
    (l) => l.account_name === coa.name
  );

  const saldoAwal = saldoFromLines(before, coa.name, debitNormal);
  if (saldoAwal === 0 && inPeriod.length === 0) return null;

  inPeriod.sort((a, b) => {
    if (a.line_date !== b.line_date) return a.line_date.localeCompare(b.line_date);
    if (a.doc_no !== b.doc_no) return a.doc_no.localeCompare(b.doc_no);
    return a.sort_order - b.sort_order;
  });

  let running = saldoAwal;
  const lines = inPeriod.map((l) => {
    if (debitNormal) running += l.debit - l.credit;
    else running += l.credit - l.debit;
    return {
      lineDate: l.line_date,
      docNo: l.doc_no,
      keterangan: l.keterangan || l.modul || "",
      debit: l.debit,
      credit: l.credit,
      saldo: running
    };
  });

  return {
    code: coa.code,
    name: coa.name,
    accountType: coa.account_type,
    saldoNormal,
    saldoAwal,
    lines,
    saldoAkhir: running
  };
}

export function buildBukuBesar(
  coaList: CoaAccount[],
  journalLines: JournalLineRow[],
  period: ReportPeriod,
  accountFilter?: string
): BukuBesarAccount[] {
  const merged = mergeCoaWithJournalAccounts(coaList, journalLines);
  const accounts: BukuBesarAccount[] = [];

  for (const coa of merged) {
    if (accountFilter && coa.name !== accountFilter) continue;
    const block = buildAccountBlock(coa, journalLines, period);
    if (block) accounts.push(block);
  }

  return accounts;
}
