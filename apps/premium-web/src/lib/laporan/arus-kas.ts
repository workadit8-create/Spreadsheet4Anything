import {
  accountNamesByTypeAndSub,
  arusKasPenerimaanAccounts,
  isDebitNormal,
  netFromLines,
  saldoNormalForCoa,
  subCategoryForCoa
} from "./coa";
import { linesBefore, linesInPeriod } from "./journal";
import type { ArusKasReport, CoaAccount, JournalLineRow, ReportPeriod } from "./types";

function kasSaldoAt(
  coaList: CoaAccount[],
  journalLines: JournalLineRow[],
  cashCoaNames: string[],
  asOfDate: string,
  before: boolean
): number {
  let total = 0;
  const names = cashCoaNames.length
    ? cashCoaNames
    : coaList.filter((c) => c.name === "Kas" || c.name === "Bank").map((c) => c.name);

  for (const name of names) {
    const coa = coaList.find((c) => c.name === name) || {
      id: "",
      code: "",
      name,
      account_type: "Aset",
      metadata: {},
      active: true
    };
    const debitNormal = isDebitNormal(saldoNormalForCoa(coa));
    const relevant = before
      ? linesBefore(journalLines, asOfDate)
      : journalLines.filter((l) => l.line_date <= asOfDate);
    total += netFromLines(relevant, name, debitNormal);
  }
  return total;
}

export function buildArusKas(
  coaList: CoaAccount[],
  journalLines: JournalLineRow[],
  period: ReportPeriod,
  cashCoaNames: string[]
): ArusKasReport {
  const { start, end } = period;
  const periodLines = linesInPeriod(journalLines, start, end);

  const penerimaanAkun = arusKasPenerimaanAccounts(coaList);
  const utangAkun = accountNamesByTypeAndSub(coaList, "Kewajiban", "Kewajiban Lancar");
  const bebanAkun = coaList
    .filter((c) => c.account_type === "Beban" && subCategoryForCoa(c) !== "HPP")
    .map((c) => c.name);
  const asetTetapAkun = accountNamesByTypeAndSub(coaList, "Aset", "Aset Tetap");
  const ekuitasCoa = coaList.filter((c) => c.account_type === "Ekuitas");
  const modalAkun = ekuitasCoa
    .filter((c) => !isDebitNormal(saldoNormalForCoa(c)))
    .map((c) => c.name);
  const priveAkun = ekuitasCoa
    .filter((c) => isDebitNormal(saldoNormalForCoa(c)))
    .map((c) => c.name);

  const penerimaan = penerimaanAkun.reduce((s, name) => {
    return s + periodLines.filter((l) => l.account_name === name).reduce((x, l) => x + l.debit, 0);
  }, 0);

  const pembayaranUtang = utangAkun.reduce((s, name) => {
    return s + periodLines.filter((l) => l.account_name === name).reduce((x, l) => x + l.debit, 0);
  }, 0);

  const pembayaranBeban = bebanAkun.reduce((s, name) => {
    return s + periodLines.filter((l) => l.account_name === name).reduce((x, l) => x + l.credit, 0);
  }, 0);

  const pembelianAset = asetTetapAkun.reduce((s, name) => {
    return s + periodLines.filter((l) => l.account_name === name).reduce((x, l) => x + l.debit, 0);
  }, 0);

  const setoranModal = modalAkun.reduce((s, name) => {
    return s + periodLines.filter((l) => l.account_name === name).reduce((x, l) => x + l.credit, 0);
  }, 0);

  const penarikanPrive = priveAkun.reduce((s, name) => {
    return s + periodLines.filter((l) => l.account_name === name).reduce((x, l) => x + l.debit, 0);
  }, 0);

  const arusOperasi = penerimaan - pembayaranUtang - pembayaranBeban;
  const arusInvestasi = -pembelianAset;
  const arusPendanaan = setoranModal - penarikanPrive;
  const kenaikanKas = arusOperasi + arusInvestasi + arusPendanaan;
  const kasAwal = kasSaldoAt(coaList, journalLines, cashCoaNames, start, true);
  const kasAkhir = kasAwal + kenaikanKas;

  return {
    period,
    operasi: [
      {
        label: "Penerimaan dari pelanggan (Kas/Bank/Piutang debit operasi)",
        hint: penerimaanAkun.join(", ") || "—",
        amount: penerimaan
      },
      {
        label: "Pembayaran kepada pemasok (Utang debit)",
        hint: utangAkun.join(", ") || "—",
        amount: -pembayaranUtang
      },
      {
        label: "Pembayaran beban operasional",
        hint: bebanAkun.join(", ") || "—",
        amount: -pembayaranBeban
      }
    ],
    arusOperasi,
    investasi: [
      {
        label: "Pembelian aset tetap",
        hint: asetTetapAkun.join(", ") || "—",
        amount: -pembelianAset
      }
    ],
    arusInvestasi,
    pendanaan: [
      {
        label: "Setoran modal",
        hint: modalAkun.join(", ") || "—",
        amount: setoranModal
      },
      {
        label: "Penarikan prive",
        hint: priveAkun.join(", ") || "—",
        amount: -penarikanPrive
      }
    ],
    arusPendanaan,
    kenaikanKas,
    kasAwal,
    kasAkhir
  };
}
