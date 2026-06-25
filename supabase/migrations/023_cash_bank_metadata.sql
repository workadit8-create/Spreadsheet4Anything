-- Detail rekening bank per akun kas (untuk cetak invoice).
ALTER TABLE cash_bank_accounts
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
