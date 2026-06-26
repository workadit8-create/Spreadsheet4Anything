import type { JournalLineDraft } from "./journal-rules";

export type ManualJournalLineInput = {
  accountName: string;
  debit: number;
  credit: number;
  keterangan?: string;
  outletCode?: string | null;
};

export function validateManualJournalLines(lines: ManualJournalLineInput[]): {
  ok: boolean;
  error?: string;
  totalDebit: number;
  totalCredit: number;
} {
  if (!lines.length) {
    return { ok: false, error: "Minimal satu baris jurnal", totalDebit: 0, totalCredit: 0 };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const accountName = String(line.accountName || "").trim();
    if (!accountName) {
      return { ok: false, error: "Semua baris wajib punya akun", totalDebit, totalCredit };
    }

    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    if (debit < 0 || credit < 0) {
      return { ok: false, error: "Debit/kredit tidak boleh negatif", totalDebit, totalCredit };
    }
    if (debit > 0 && credit > 0) {
      return { ok: false, error: `Akun "${accountName}": isi debit ATAU kredit, bukan keduanya`, totalDebit, totalCredit };
    }
    if (debit === 0 && credit === 0) {
      return { ok: false, error: `Akun "${accountName}": nominal wajib diisi`, totalDebit, totalCredit };
    }

    totalDebit += debit;
    totalCredit += credit;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.0001) {
    return {
      ok: false,
      error: `Jurnal tidak balance (debit ${totalDebit} ≠ kredit ${totalCredit})`,
      totalDebit,
      totalCredit
    };
  }

  return { ok: true, totalDebit, totalCredit };
}

export function buildManualJournalLines(
  entryDate: string,
  lines: ManualJournalLineInput[],
  defaultKeterangan: string
): JournalLineDraft[] {
  return lines.map((line) => ({
    lineDate: entryDate,
    accountName: String(line.accountName).trim(),
    debit: Number(line.debit) || 0,
    credit: Number(line.credit) || 0,
    keterangan: String(line.keterangan || defaultKeterangan || "").trim(),
    outletCode: line.outletCode ? String(line.outletCode).trim().toUpperCase() : null
  }));
}
