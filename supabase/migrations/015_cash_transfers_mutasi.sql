-- Mutasi Kas & Bank + jurnal MUTASI_DANA

CREATE TABLE IF NOT EXISTS cash_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transfer_no TEXT NOT NULL,
  transfer_date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('Transfer', 'Masuk', 'Keluar')),
  source_account_id UUID REFERENCES cash_bank_accounts(id) ON DELETE SET NULL,
  source_account_name TEXT,
  source_coa_name TEXT,
  dest_account_id UUID REFERENCES cash_bank_accounts(id) ON DELETE SET NULL,
  dest_account_name TEXT,
  dest_coa_name TEXT,
  contra_coa_name TEXT,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  keterangan TEXT,
  transaction_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'POSTED', 'VOIDED')),
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, transfer_no),
  UNIQUE (organization_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS cash_transfers_org_date_idx
  ON cash_transfers (organization_id, transfer_date DESC);

ALTER TABLE cash_transfers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ct_select ON cash_transfers;
DROP POLICY IF EXISTS ct_insert ON cash_transfers;
DROP POLICY IF EXISTS ct_update ON cash_transfers;
DROP POLICY IF EXISTS ct_delete ON cash_transfers;

CREATE POLICY ct_select ON cash_transfers FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY ct_insert ON cash_transfers FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY ct_update ON cash_transfers FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY ct_delete ON cash_transfers FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON cash_transfers TO authenticated;

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_modul_check;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_modul_check
  CHECK (modul IN (
    'PEMASUKAN', 'PELUNASAN_PIUTANG', 'PEMBELIAN', 'PELUNASAN_UTANG', 'MANUAL', 'MUTASI_DANA'
  ));

COMMENT ON TABLE cash_transfers IS
  'Mutasi dana kas/bank — CONFIRMED → post jurnal MUTASI_DANA → POSTED';
