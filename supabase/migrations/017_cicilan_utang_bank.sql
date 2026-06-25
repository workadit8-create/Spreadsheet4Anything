-- Modul jurnal: bayar cicilan pinjaman bank (pokok + bunga)

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_modul_check;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_modul_check
  CHECK (modul IN (
    'PEMASUKAN', 'PELUNASAN_PIUTANG', 'PEMBELIAN', 'PELUNASAN_UTANG',
    'MANUAL', 'MUTASI_DANA', 'CICILAN_UTANG_BANK'
  ));
