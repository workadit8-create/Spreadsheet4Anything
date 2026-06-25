import {
  isDebitNormal,
  netFromLines,
  saldoNormalForCoa,
  subCategoryForCoa
} from "./coa";
import { linesInPeriod } from "./journal";
import type { CoaAccount, JournalLineRow, LabaRugiReport, ReportPeriod } from "./types";

function periodBalance(
  lines: JournalLineRow[],
  accountName: string,
  debitNormal: boolean,
  start: string,
  end: string
): number {
  const periodLines = linesInPeriod(lines, start, end).filter((l) => l.account_name === accountName);
  return netFromLines(periodLines, accountName, debitNormal);
}

function pendapatanAmount(lines: JournalLineRow[], accountName: string, start: string, end: string): number {
  return periodBalance(lines, accountName, false, start, end);
}

function bebanAmount(lines: JournalLineRow[], accountName: string, start: string, end: string): number {
  return periodBalance(lines, accountName, true, start, end);
}

export function buildLabaRugi(
  coaList: CoaAccount[],
  journalLines: JournalLineRow[],
  period: ReportPeriod
): LabaRugiReport {
  const pendapatanCoa = coaList.filter(
    (c) => c.account_type === "Pendapatan" || subCategoryForCoa(c) === "Pendapatan Usaha"
  );
  const hppCoa = coaList.filter((c) => c.account_type === "Beban" && subCategoryForCoa(c) === "HPP");
  const opCoa = coaList.filter(
    (c) => c.account_type === "Beban" && subCategoryForCoa(c) !== "HPP"
  );

  const pendapatanLines = pendapatanCoa.map((c) => ({
    label: c.name,
    accountName: c.name,
    amount: pendapatanAmount(journalLines, c.name, period.start, period.end)
  }));
  const jmlPendapatan = pendapatanLines.reduce((s, l) => s + l.amount, 0);

  const hppLines = hppCoa.map((c) => ({
    label: c.name,
    accountName: c.name,
    amount: bebanAmount(journalLines, c.name, period.start, period.end)
  }));
  const jmlHpp = hppLines.reduce((s, l) => s + l.amount, 0);

  const opLines = opCoa.map((c) => ({
    label: c.name,
    accountName: c.name,
    amount: bebanAmount(journalLines, c.name, period.start, period.end)
  }));
  const jmlOp = opLines.reduce((s, l) => s + l.amount, 0);

  const labaKotor = jmlPendapatan - jmlHpp;
  const labaBersih = labaKotor - jmlOp;

  return {
    period,
    pendapatan: { title: "Pendapatan Usaha", lines: pendapatanLines, subtotal: jmlPendapatan },
    hpp: { title: "Beban Pokok Penjualan (HPP)", lines: hppLines, subtotal: jmlHpp },
    labaKotor,
    bebanOperasional: { title: "Beban Operasional", lines: opLines, subtotal: jmlOp },
    labaBersih
  };
}

/** Saldo neraca/tampilan untuk satu akun pada akhir periode */
export function balanceAtEnd(
  coa: CoaAccount,
  journalLines: JournalLineRow[],
  endDate: string
): number {
  const saldoNormal = saldoNormalForCoa(coa);
  const debitNormal = isDebitNormal(saldoNormal);
  const lines = journalLines.filter((l) => l.line_date <= endDate);
  return netFromLines(lines, coa.name, debitNormal);
}
