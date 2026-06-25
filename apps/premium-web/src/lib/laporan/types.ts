export type SaldoNormal = "Debit" | "Kredit";

export type CoaAccount = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  metadata: Record<string, unknown>;
  active: boolean;
};

export type JournalLineRow = {
  id: string;
  journal_entry_id: string;
  line_date: string;
  account_name: string;
  debit: number;
  credit: number;
  keterangan: string | null;
  sort_order: number;
  doc_no: string;
  modul: string;
  entry_kind: string;
};

export type ReportPeriod = {
  start: string;
  end: string;
};

export type BukuBesarLine = {
  lineDate: string;
  docNo: string;
  keterangan: string;
  debit: number;
  credit: number;
  saldo: number;
};

export type BukuBesarAccount = {
  code: string;
  name: string;
  accountType: string;
  saldoNormal: SaldoNormal;
  saldoAwal: number;
  lines: BukuBesarLine[];
  saldoAkhir: number;
};

export type LabaRugiLine = {
  label: string;
  accountName: string;
  amount: number;
};

export type LabaRugiSection = {
  title: string;
  lines: LabaRugiLine[];
  subtotal: number;
};

export type LabaRugiReport = {
  period: ReportPeriod;
  pendapatan: LabaRugiSection;
  hpp: LabaRugiSection;
  labaKotor: number;
  bebanOperasional: LabaRugiSection;
  labaBersih: number;
};

export type NeracaLine = {
  label: string;
  accountName: string;
  amount: number;
};

export type NeracaSection = {
  title: string;
  lines: NeracaLine[];
  subtotal: number;
};

export type NeracaReport = {
  period: ReportPeriod;
  asetLancar: NeracaSection;
  asetTetap: NeracaSection;
  totalAset: number;
  kewajibanLancar: NeracaSection;
  kewajibanJangkaPanjang: NeracaSection;
  totalKewajiban: number;
  ekuitas: NeracaSection;
  labaBerjalan: number;
  totalEkuitas: number;
  totalPassiva: number;
  selisih: number;
};

export type ArusKasLine = {
  label: string;
  hint?: string;
  amount: number;
};

export type ArusKasReport = {
  period: ReportPeriod;
  operasi: ArusKasLine[];
  arusOperasi: number;
  investasi: ArusKasLine[];
  arusInvestasi: number;
  pendanaan: ArusKasLine[];
  arusPendanaan: number;
  kenaikanKas: number;
  kasAwal: number;
  kasAkhir: number;
};

export type ReportData = {
  coa: CoaAccount[];
  journalLines: JournalLineRow[];
  cashCoaNames: string[];
};
