import type { CoaAccount, JournalLineRow, SaldoNormal } from "./types";

export function saldoNormalFromType(accountType: string): SaldoNormal {
  const t = accountType.trim().toLowerCase();
  if (t === "aset" || t === "beban") return "Debit";
  if (t === "kewajiban" || t === "ekuitas" || t === "pendapatan") return "Kredit";
  return "Debit";
}

export function saldoNormalForCoa(coa: CoaAccount): SaldoNormal {
  const meta = coa.metadata || {};
  const fromMeta = String(meta.saldo_normal || meta.saldoNormal || "").trim();
  if (fromMeta.toLowerCase() === "kredit") return "Kredit";
  if (fromMeta.toLowerCase() === "debit") return "Debit";
  return saldoNormalFromType(coa.account_type);
}

export function subCategoryForCoa(coa: CoaAccount): string {
  const meta = coa.metadata || {};
  const sub = String(meta.sub_category || meta.subCategory || meta.sub_kelompok || "").trim();
  if (sub) return sub;

  const t = coa.account_type;
  const name = coa.name.toLowerCase();
  if (t === "Aset") {
    if (/peralatan|mesin|kendaraan|gedung|tanah|aset tetap/i.test(name)) return "Aset Tetap";
    return "Aset Lancar";
  }
  if (t === "Kewajiban") {
    if (/jangka panjang|jkp|hipotek/i.test(name)) return "Kewajiban Jangka Panjang";
    return "Kewajiban Lancar";
  }
  if (t === "Ekuitas") return "Ekuitas";
  if (t === "Pendapatan") return "Pendapatan Usaha";
  if (t === "Beban") {
    if (/hpp|harga pokok|pokok penjualan/i.test(name)) return "HPP";
    return "Beban Operasional";
  }
  return "";
}

export function isDebitNormal(saldoNormal: SaldoNormal): boolean {
  return saldoNormal === "Debit";
}

export function netFromLines(
  lines: JournalLineRow[],
  accountName: string,
  debitNormal: boolean
): number {
  let total = 0;
  for (const line of lines) {
    if (line.account_name !== accountName) continue;
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    total += debitNormal ? debit - credit : credit - debit;
  }
  return total;
}

export function periodDebitSum(lines: JournalLineRow[], accountNames: string[], start: string, end: string): number {
  const set = new Set(accountNames);
  let sum = 0;
  for (const line of lines) {
    if (!set.has(line.account_name)) continue;
    if (line.line_date < start || line.line_date > end) continue;
    sum += Number(line.debit) || 0;
  }
  return sum;
}

export function periodCreditSum(lines: JournalLineRow[], accountNames: string[], start: string, end: string): number {
  const set = new Set(accountNames);
  let sum = 0;
  for (const line of lines) {
    if (!set.has(line.account_name)) continue;
    if (line.line_date < start || line.line_date > end) continue;
    sum += Number(line.credit) || 0;
  }
  return sum;
}

export function coaByName(coaList: CoaAccount[]): Map<string, CoaAccount> {
  const map = new Map<string, CoaAccount>();
  for (const c of coaList) map.set(c.name, c);
  return map;
}

export function mergeCoaWithJournalAccounts(coaList: CoaAccount[], journalLines: JournalLineRow[]): CoaAccount[] {
  const byName = coaByName(coaList);
  const extras = new Set<string>();
  for (const line of journalLines) {
    if (!byName.has(line.account_name)) extras.add(line.account_name);
  }
  const merged = [...coaList];
  for (const name of [...extras].sort()) {
    merged.push({
      id: `extra:${name}`,
      code: "",
      name,
      account_type: "",
      metadata: {},
      active: true
    });
  }
  return merged;
}

export function arusKasPenerimaanAccounts(coaList: CoaAccount[]): string[] {
  const lancar = coaList.filter(
    (c) => c.account_type === "Aset" && subCategoryForCoa(c) === "Aset Lancar"
  );
  const kasLike = lancar
    .filter((c) => /kas|bank|piutang|tunai|giro|tabungan/i.test(c.name))
    .map((c) => c.name);
  if (kasLike.length) return kasLike;
  return lancar.map((c) => c.name);
}

export function accountNamesByTypeAndSub(
  coaList: CoaAccount[],
  accountType: string,
  subCategory: string
): string[] {
  return coaList
    .filter((c) => c.account_type === accountType && subCategoryForCoa(c) === subCategory)
    .map((c) => c.name);
}
