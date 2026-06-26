/** Aturan jurnal — port logika dari clients/hybrid/backend/api.js */

export type JournalLineDraft = {
  lineDate: string;
  accountName: string;
  debit: number;
  credit: number;
  keterangan: string;
  outletCode?: string | null;
};

export type PemasukanJournalInput = {
  tanggalPesan: string;
  invoice: string;
  keterangan: string;
  total: number;
  bayar: number;
  status: string;
  tanggalBayar: string;
  akunPendapatan: string;
  rekening: string;
  dpp?: number;
  taxAmount?: number;
  taxAccountName?: string;
};

export type PelunasanPiutangJournalInput = {
  tanggalBayar: string;
  invoice: string;
  customer: string;
  nominal: number;
  rekening: string;
  keterangan: string;
};

export type PembelianJournalInput = {
  tanggal: string;
  noDok: string;
  supplier: string;
  keterangan: string;
  total: number;
  bayar: number;
  metode: string;
  tanggalBayar: string;
  akunPembelian: string;
  rekening: string;
  dpp?: number;
  taxAmount?: number;
  taxAccountName?: string;
};

export type PelunasanUtangJournalInput = {
  tanggal: string;
  noDok: string;
  supplier: string;
  nominal: number;
  rekening: string;
  keterangan: string;
};

export type MutasiDanaJournalInput = {
  tanggal: string;
  transactionId: string;
  jenis: "Transfer" | "Masuk" | "Keluar";
  sumberCoa: string;
  tujuanCoa: string;
  nominal: number;
  keterangan: string;
};

export function resolveKasBankAccount(rekening: string): string {
  const trimmed = String(rekening || "").trim();
  if (!trimmed) return "Kas";

  const upper = trimmed.toUpperCase();
  if (upper === "BANK") return "Bank";
  if (upper === "KAS" || upper === "TUNAI" || upper === "CASH") return "Kas";
  return trimmed;
}

export function buildPemasukanJournalLines(data: PemasukanJournalInput): JournalLineDraft[] {
  const bayar = Number(data.bayar) || 0;
  const total = Number(data.total) || 0;
  const taxAmount = Math.max(0, Number(data.taxAmount) || 0);
  const dpp = taxAmount > 0 ? Math.max(0, Number(data.dpp) || total - taxAmount) : total;
  const tanggalBayar = data.tanggalBayar || data.tanggalPesan;
  const akunKasBank = resolveKasBankAccount(data.rekening);
  const akunDebitPenjualan =
    data.status === "PENJUALAN TUNAI" ? akunKasBank : "Piutang Usaha";
  const ketBase = "Penjualan - " + data.keterangan;

  const lines: JournalLineDraft[] = [
    {
      lineDate: data.tanggalPesan,
      accountName: akunDebitPenjualan,
      debit: total,
      credit: 0,
      keterangan: ketBase
    },
    {
      lineDate: data.tanggalPesan,
      accountName: data.akunPendapatan || "Pendapatan",
      debit: 0,
      credit: dpp,
      keterangan: ketBase
    }
  ];

  if (taxAmount > 0) {
    lines.push({
      lineDate: data.tanggalPesan,
      accountName: data.taxAccountName || "Utang Pajak",
      debit: 0,
      credit: taxAmount,
      keterangan: ketBase + " (pajak)"
    });
  }

  if (data.status === "PENJUALAN KREDIT" && bayar > 0) {
    lines.push({
      lineDate: tanggalBayar,
      accountName: akunKasBank,
      debit: bayar,
      credit: 0,
      keterangan: "Terima Kas"
    });
    lines.push({
      lineDate: tanggalBayar,
      accountName: "Piutang Usaha",
      debit: 0,
      credit: bayar,
      keterangan: "Pelunasan Piutang"
    });
  }

  return lines;
}

export function buildPelunasanPiutangJournalLines(
  data: PelunasanPiutangJournalInput
): JournalLineDraft[] {
  const nominal = Number(data.nominal) || 0;
  const akunKasBank = resolveKasBankAccount(data.rekening);
  const ketPelunasan =
    "Pelunasan Piutang - " + (data.customer || "") + " " + (data.keterangan || "");

  return [
    {
      lineDate: data.tanggalBayar,
      accountName: akunKasBank,
      debit: nominal,
      credit: 0,
      keterangan: ketPelunasan
    },
    {
      lineDate: data.tanggalBayar,
      accountName: "Piutang Usaha",
      debit: 0,
      credit: nominal,
      keterangan: "Pelunasan Piutang"
    }
  ];
}

export function buildPembelianJournalLines(data: PembelianJournalInput): JournalLineDraft[] {
  const bayar = Number(data.bayar) || 0;
  const total = Number(data.total) || 0;
  const taxAmount = Math.max(0, Number(data.taxAmount) || 0);
  const dpp = taxAmount > 0 ? Math.max(0, Number(data.dpp) || total - taxAmount) : total;
  const tanggalBayar = data.tanggalBayar || data.tanggal;
  const akunKasBank = resolveKasBankAccount(data.rekening);
  const isKredit = data.metode === "Kredit";
  const akunKredit = isKredit ? "Utang Usaha" : akunKasBank;
  const ketBase =
    "Pembelian - " + (data.supplier || "") + " " + (data.keterangan || "");

  const lines: JournalLineDraft[] = [
    {
      lineDate: data.tanggal,
      accountName: data.akunPembelian || "Beban",
      debit: dpp,
      credit: 0,
      keterangan: ketBase
    },
    {
      lineDate: data.tanggal,
      accountName: akunKredit,
      debit: 0,
      credit: total,
      keterangan: "Pembelian"
    }
  ];

  if (taxAmount > 0) {
    lines.splice(1, 0, {
      lineDate: data.tanggal,
      accountName: data.taxAccountName || "PPN Masukan",
      debit: taxAmount,
      credit: 0,
      keterangan: ketBase + " (pajak)"
    });
  }

  if (isKredit && bayar > 0) {
    lines.push({
      lineDate: tanggalBayar,
      accountName: "Utang Usaha",
      debit: bayar,
      credit: 0,
      keterangan: "Bayar DP Pembelian"
    });
    lines.push({
      lineDate: tanggalBayar,
      accountName: akunKasBank,
      debit: 0,
      credit: bayar,
      keterangan: "Bayar DP Pembelian"
    });
  }

  return lines;
}

export function buildPelunasanUtangJournalLines(
  data: PelunasanUtangJournalInput
): JournalLineDraft[] {
  const nominal = Number(data.nominal) || 0;
  const akunKasBank = resolveKasBankAccount(data.rekening);
  const ket =
    "Pelunasan Utang - " + (data.supplier || "") + " " + (data.keterangan || "");

  return [
    {
      lineDate: data.tanggal,
      accountName: "Utang Usaha",
      debit: nominal,
      credit: 0,
      keterangan: ket
    },
    {
      lineDate: data.tanggal,
      accountName: akunKasBank,
      debit: 0,
      credit: nominal,
      keterangan: "Pelunasan Utang"
    }
  ];
}

export function buildMutasiDanaJournalLines(data: MutasiDanaJournalInput): JournalLineDraft[] {
  const nominal = Number(data.nominal) || 0;
  const ketBase = data.keterangan || `Mutasi ${data.jenis}`;

  if (data.jenis === "Transfer") {
    const ket =
      ketBase !== `Mutasi ${data.jenis}`
        ? ketBase
        : `Transfer ${data.sumberCoa} → ${data.tujuanCoa}`;
    return [
      {
        lineDate: data.tanggal,
        accountName: data.tujuanCoa,
        debit: nominal,
        credit: 0,
        keterangan: ket
      },
      {
        lineDate: data.tanggal,
        accountName: data.sumberCoa,
        debit: 0,
        credit: nominal,
        keterangan: ket
      }
    ];
  }

  if (data.jenis === "Masuk") {
    const contra = data.sumberCoa || "Mutasi Masuk";
    const ket = ketBase !== `Mutasi ${data.jenis}` ? ketBase : `Setoran ke ${data.tujuanCoa}`;
    return [
      {
        lineDate: data.tanggal,
        accountName: data.tujuanCoa,
        debit: nominal,
        credit: 0,
        keterangan: ket
      },
      {
        lineDate: data.tanggal,
        accountName: contra,
        debit: 0,
        credit: nominal,
        keterangan: ket
      }
    ];
  }

  const contra = data.tujuanCoa || "Mutasi Keluar";
  const ket = ketBase !== `Mutasi ${data.jenis}` ? ketBase : `Penarikan dari ${data.sumberCoa}`;
  return [
    {
      lineDate: data.tanggal,
      accountName: contra,
      debit: nominal,
      credit: 0,
      keterangan: ket
    },
    {
      lineDate: data.tanggal,
      accountName: data.sumberCoa,
      debit: 0,
      credit: nominal,
      keterangan: ket
    }
  ];
}
