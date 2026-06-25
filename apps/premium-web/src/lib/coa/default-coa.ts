export type DefaultCoaRow = {
  code: string;
  name: string;
  account_type: "Aset" | "Kewajiban" | "Ekuitas" | "Pendapatan" | "Beban";
  sub_category: string;
  saldo_normal: "Debit" | "Kredit";
};

/**
 * Master COA standar UMKM — mirror struktur GAS STANDARD_MASTER_COA_ (generik, bukan catering).
 * Terisi otomatis saat organisasi baru dibuat atau client pertama kali buka Master COA / Laporan.
 */
export const DEFAULT_COA_USAHA: DefaultCoaRow[] = [
  { code: "1-10001", name: "Kas", account_type: "Aset", sub_category: "Aset Lancar", saldo_normal: "Debit" },
  { code: "1-10002", name: "Bank", account_type: "Aset", sub_category: "Aset Lancar", saldo_normal: "Debit" },
  { code: "1-11001", name: "Piutang Usaha", account_type: "Aset", sub_category: "Aset Lancar", saldo_normal: "Debit" },
  {
    code: "1-11002",
    name: "Persediaan Barang",
    account_type: "Aset",
    sub_category: "Aset Lancar",
    saldo_normal: "Debit"
  },
  { code: "1-12001", name: "Peralatan", account_type: "Aset", sub_category: "Aset Tetap", saldo_normal: "Debit" },
  {
    code: "1-12002",
    name: "Akumulasi Penyusutan Peralatan",
    account_type: "Aset",
    sub_category: "Aset Tetap",
    saldo_normal: "Kredit"
  },
  {
    code: "2-10001",
    name: "Utang Usaha",
    account_type: "Kewajiban",
    sub_category: "Kewajiban Lancar",
    saldo_normal: "Kredit"
  },
  {
    code: "2-10002",
    name: "Utang Pajak",
    account_type: "Kewajiban",
    sub_category: "Kewajiban Lancar",
    saldo_normal: "Kredit"
  },
  {
    code: "2-20001",
    name: "Utang Bank Jangka Panjang",
    account_type: "Kewajiban",
    sub_category: "Kewajiban Jangka Panjang",
    saldo_normal: "Kredit"
  },
  {
    code: "3-10001",
    name: "Modal Pemilik",
    account_type: "Ekuitas",
    sub_category: "Ekuitas",
    saldo_normal: "Kredit"
  },
  {
    code: "3-10002",
    name: "Laba Ditahan",
    account_type: "Ekuitas",
    sub_category: "Ekuitas",
    saldo_normal: "Kredit"
  },
  { code: "3-10003", name: "PRIVE", account_type: "Ekuitas", sub_category: "Ekuitas", saldo_normal: "Debit" },
  {
    code: "4-10001",
    name: "Pendapatan",
    account_type: "Pendapatan",
    sub_category: "Pendapatan Usaha",
    saldo_normal: "Kredit"
  },
  {
    code: "4-10002",
    name: "Pendapatan Lain-lain",
    account_type: "Pendapatan",
    sub_category: "Pendapatan Usaha",
    saldo_normal: "Kredit"
  },
  { code: "5-10001", name: "Beban", account_type: "Beban", sub_category: "Beban Operasional", saldo_normal: "Debit" },
  { code: "5-10002", name: "Beban HPP", account_type: "Beban", sub_category: "HPP", saldo_normal: "Debit" },
  {
    code: "5-11001",
    name: "Beban Gaji",
    account_type: "Beban",
    sub_category: "Beban Operasional",
    saldo_normal: "Debit"
  },
  {
    code: "5-11002",
    name: "Beban Sewa",
    account_type: "Beban",
    sub_category: "Beban Operasional",
    saldo_normal: "Debit"
  },
  {
    code: "5-11003",
    name: "Beban Listrik",
    account_type: "Beban",
    sub_category: "Beban Operasional",
    saldo_normal: "Debit"
  },
  {
    code: "5-11004",
    name: "Beban Administrasi",
    account_type: "Beban",
    sub_category: "Beban Operasional",
    saldo_normal: "Debit"
  },
  {
    code: "5-11005",
    name: "Beban Lain-lain",
    account_type: "Beban",
    sub_category: "Beban Operasional",
    saldo_normal: "Debit"
  }
];

/** Akun beban operasional alternatif (legacy seed hybrid-lab) */
export const LEGACY_BEBAN_NAMES = ["Beban Operasional"];

export function shouldSkipDefaultBeban(existingNames: Set<string>): boolean {
  if (existingNames.has("Beban")) return true;
  return LEGACY_BEBAN_NAMES.some((n) => existingNames.has(n));
}

export function coaRowsToInsert(
  organizationId: string,
  existingNames: Set<string>,
  existingCodes: Set<string> = new Set()
): Array<{
  organization_id: string;
  code: string;
  name: string;
  account_type: string;
  active: boolean;
  metadata: Record<string, unknown>;
}> {
  const rows: Array<{
    organization_id: string;
    code: string;
    name: string;
    account_type: string;
    active: boolean;
    metadata: Record<string, unknown>;
  }> = [];

  for (const item of DEFAULT_COA_USAHA) {
    if (existingNames.has(item.name)) continue;
    if (existingCodes.has(item.code)) continue;
    if (item.name === "Beban" && shouldSkipDefaultBeban(existingNames)) continue;

    rows.push({
      organization_id: organizationId,
      code: item.code,
      name: item.name,
      account_type: item.account_type,
      active: true,
      metadata: {
        default_seed: true,
        sub_category: item.sub_category,
        saldo_normal: item.saldo_normal
      }
    });
  }

  return rows;
}
