-- Aset tetap + log penyusutan manual (core)

CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Peralatan',
  acquisition_date DATE NOT NULL,
  acquisition_cost NUMERIC(18, 2) NOT NULL CHECK (acquisition_cost >= 0),
  salvage_value NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  useful_life_months INT NOT NULL CHECK (useful_life_months > 0),
  asset_coa_account TEXT NOT NULL,
  accumulated_depreciation_coa TEXT NOT NULL,
  depreciation_expense_coa TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disposed', 'fully_depreciated')),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_depreciation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fixed_asset_id UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  amount NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fixed_assets_org_idx ON fixed_assets (organization_id, status, acquisition_date DESC);
CREATE INDEX IF NOT EXISTS asset_depreciation_asset_idx ON asset_depreciation_logs (fixed_asset_id, period_date DESC);

ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_depreciation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fixed_assets_tenant_select ON fixed_assets;
DROP POLICY IF EXISTS fixed_assets_tenant_insert ON fixed_assets;
DROP POLICY IF EXISTS fixed_assets_tenant_update ON fixed_assets;
DROP POLICY IF EXISTS fixed_assets_tenant_delete ON fixed_assets;

CREATE POLICY fixed_assets_tenant_select ON fixed_assets FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY fixed_assets_tenant_insert ON fixed_assets FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY fixed_assets_tenant_update ON fixed_assets FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY fixed_assets_tenant_delete ON fixed_assets FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

DROP POLICY IF EXISTS asset_depreciation_tenant_select ON asset_depreciation_logs;
DROP POLICY IF EXISTS asset_depreciation_tenant_insert ON asset_depreciation_logs;

CREATE POLICY asset_depreciation_tenant_select ON asset_depreciation_logs FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY asset_depreciation_tenant_insert ON asset_depreciation_logs FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON fixed_assets TO authenticated;
GRANT SELECT, INSERT ON asset_depreciation_logs TO authenticated;

-- Akun beban penyusutan (semua org yang belum punya)
INSERT INTO coa_accounts (organization_id, code, name, account_type, active, metadata)
SELECT o.id, '5-12001', 'Beban Penyusutan', 'Beban', true,
  '{"default_seed":true,"sub_category":"Beban Operasional","saldo_normal":"Debit"}'::jsonb
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM coa_accounts c
  WHERE c.organization_id = o.id AND c.name = 'Beban Penyusutan'
);
