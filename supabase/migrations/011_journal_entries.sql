-- Tahap D: jurnal akuntansi di Supabase (Premium — tanpa GAS/sheet)

CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  modul TEXT NOT NULL CHECK (modul IN ('PEMASUKAN', 'PELUNASAN_PIUTANG', 'PEMBELIAN', 'PELUNASAN_UTANG', 'MANUAL')),
  transaction_id TEXT NOT NULL,
  doc_no TEXT NOT NULL,
  entry_date DATE NOT NULL,
  source_doc_type TEXT,
  source_doc_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, transaction_id)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  line_date DATE NOT NULL,
  account_name TEXT NOT NULL,
  coa_account_id UUID REFERENCES coa_accounts(id) ON DELETE SET NULL,
  debit NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  keterangan TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_entries_org_date_idx
  ON journal_entries (organization_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS journal_lines_entry_idx
  ON journal_lines (journal_entry_id, sort_order);

-- RLS tenant pattern
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON journal_entries;
DROP POLICY IF EXISTS tenant_insert ON journal_entries;
DROP POLICY IF EXISTS tenant_update ON journal_entries;
DROP POLICY IF EXISTS tenant_delete ON journal_entries;

CREATE POLICY tenant_select ON journal_entries FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_insert ON journal_entries FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_update ON journal_entries FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_delete ON journal_entries FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON journal_lines;
DROP POLICY IF EXISTS tenant_insert ON journal_lines;
DROP POLICY IF EXISTS tenant_update ON journal_lines;
DROP POLICY IF EXISTS tenant_delete ON journal_lines;

CREATE POLICY tenant_select ON journal_lines FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_insert ON journal_lines FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_update ON journal_lines FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_delete ON journal_lines FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON journal_entries, journal_lines TO authenticated;

-- COA tambahan untuk jurnal penjualan/piutang
INSERT INTO coa_accounts (organization_id, code, name, account_type, active)
SELECT o.id, v.code, v.name, v.account_type, true
FROM organizations o
CROSS JOIN (
  VALUES
    ('1-11001', 'Piutang Usaha', 'Aset')
) AS v(code, name, account_type)
WHERE o.slug = 'hybrid-lab'
  AND NOT EXISTS (
    SELECT 1 FROM coa_accounts c
    WHERE c.organization_id = o.id AND c.name = v.name
  );
