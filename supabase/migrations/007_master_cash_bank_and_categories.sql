-- Master data tambahan (paritas GAS) — POS/stok schema tetap di 001, tidak diubah di sini

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS cash_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  coa_account_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS purchase_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  coa_account TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, category, sub_category)
);

-- Stub COA lokal (mirror backend — sync penuh nanti)
CREATE TABLE IF NOT EXISTS coa_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (
    account_type IN ('Aset', 'Kewajiban', 'Ekuitas', 'Pendapatan', 'Beban')
  ),
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

-- RLS tenant pattern
DO $$
DECLARE
  t TEXT;
  tables_with_org TEXT[] := ARRAY[
    'cash_bank_accounts', 'purchase_categories', 'coa_accounts'
  ];
BEGIN
  FOREACH t IN ARRAY tables_with_org LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_select ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_select ON %I FOR SELECT USING (organization_id IN (SELECT public.user_organization_ids()))',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_insert ON %I FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_organization_ids()))',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_update ON %I FOR UPDATE USING (organization_id IN (SELECT public.user_organization_ids()))',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS tenant_delete ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_delete ON %I FOR DELETE USING (organization_id IN (SELECT public.user_organization_ids()))',
      t
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON cash_bank_accounts, purchase_categories, coa_accounts TO authenticated;
