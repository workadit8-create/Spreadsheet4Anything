import { subCategoryForCoa } from "./coa";
import { balanceAtEnd, buildLabaRugi } from "./laba-rugi";
import type { CoaAccount, JournalLineRow, NeracaReport, ReportPeriod } from "./types";

function sectionFromCoa(
  coaList: CoaAccount[],
  journalLines: JournalLineRow[],
  endDate: string,
  accountType: string,
  subCategory: string
) {
  const items = coaList.filter(
    (c) => c.account_type === accountType && subCategoryForCoa(c) === subCategory
  );
  const lines = items.map((c) => ({
    label: c.name,
    accountName: c.name,
    amount: balanceAtEnd(c, journalLines, endDate)
  }));
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  return { title: subCategory, lines, subtotal };
}

export function buildNeraca(
  coaList: CoaAccount[],
  journalLines: JournalLineRow[],
  period: ReportPeriod
): NeracaReport {
  const asetLancar = sectionFromCoa(coaList, journalLines, period.end, "Aset", "Aset Lancar");
  const asetTetap = sectionFromCoa(coaList, journalLines, period.end, "Aset", "Aset Tetap");
  const totalAset = asetLancar.subtotal + asetTetap.subtotal;

  const kewajibanLancar = sectionFromCoa(
    coaList,
    journalLines,
    period.end,
    "Kewajiban",
    "Kewajiban Lancar"
  );
  const kewajibanJkp = sectionFromCoa(
    coaList,
    journalLines,
    period.end,
    "Kewajiban",
    "Kewajiban Jangka Panjang"
  );
  const totalKewajiban = kewajibanLancar.subtotal + kewajibanJkp.subtotal;

  const ekuitas = sectionFromCoa(coaList, journalLines, period.end, "Ekuitas", "Ekuitas");
  const labaBerjalan = buildLabaRugi(coaList, journalLines, period).labaBersih;
  const totalEkuitas = ekuitas.subtotal + labaBerjalan;
  const totalPassiva = totalKewajiban + totalEkuitas;

  return {
    period,
    asetLancar,
    asetTetap,
    totalAset,
    kewajibanLancar,
    kewajibanJangkaPanjang: kewajibanJkp,
    totalKewajiban,
    ekuitas,
    labaBerjalan,
    totalEkuitas,
    totalPassiva,
    selisih: totalAset - totalPassiva
  };
}
