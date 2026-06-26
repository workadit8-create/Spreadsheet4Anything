-- Outlet multi-toko per PT + fondasi e-wallet santri (fitur menyusul)

-- ---------------------------------------------------------------------------
-- Outlets (unit operasi: mart, cafe, fashion, dll.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outlet_code TEXT NOT NULL,
  name TEXT NOT NULL,
  business_sector TEXT NOT NULL DEFAULT 'retail'
    CHECK (business_sector IN ('retail', 'fnb', 'manufacturing', 'services')),
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, outlet_code)
);

CREATE INDEX IF NOT EXISTS outlets_org_active_idx
  ON outlets (organization_id, active, sort_order);

COMMENT ON TABLE outlets IS
  'Unit outlet/toko dalam satu PT — dipakai tag transaksi & L/R per outlet.';

-- Tag outlet di dokumen operasional
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS outlet_code TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS outlet_code TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS outlet_code TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS outlet_code TEXT;
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS outlet_code TEXT;

CREATE INDEX IF NOT EXISTS sales_orders_org_outlet_idx
  ON sales_orders (organization_id, outlet_code) WHERE outlet_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_orders_org_outlet_idx
  ON purchase_orders (organization_id, outlet_code) WHERE outlet_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS journal_lines_org_outlet_idx
  ON journal_lines (organization_id, outlet_code) WHERE outlet_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- E-wallet santri — schema siap, UI/API menyusul
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_code TEXT NOT NULL,
  name TEXT NOT NULL,
  class_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_code)
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_profile_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
  balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'frozen', 'closed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_profile_id)
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wallet_account_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  amount NUMERIC(18, 2) NOT NULL,
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('TOPUP', 'PAYMENT', 'REFUND', 'ADJUST', 'OFFLINE_HOLD')),
  reference_type TEXT,
  reference_id UUID,
  local_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_org_local_id_idx
  ON wallet_ledger (organization_id, local_id)
  WHERE local_id IS NOT NULL AND local_id <> '';

COMMENT ON TABLE student_profiles IS 'Santri / siswa — QR kartu = student_code (e-wallet menyusul).';
COMMENT ON TABLE wallet_accounts IS 'Saldo e-wallet per santri.';
COMMENT ON TABLE wallet_ledger IS 'Mutasi saldo — termasuk antrean offline (OFFLINE_HOLD).';

-- RLS
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY outlets_tenant ON outlets FOR ALL
  USING (organization_id IN (SELECT public.user_organization_ids()))
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY student_profiles_tenant ON student_profiles FOR ALL
  USING (organization_id IN (SELECT public.user_organization_ids()))
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY wallet_accounts_tenant ON wallet_accounts FOR ALL
  USING (organization_id IN (SELECT public.user_organization_ids()))
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY wallet_ledger_tenant ON wallet_ledger FOR ALL
  USING (organization_id IN (SELECT public.user_organization_ids()))
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON outlets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_profiles, wallet_accounts, wallet_ledger TO authenticated;

-- Seed hybrid-lab: 3 outlet contoh pesantren
INSERT INTO warehouses (organization_id, code, name, is_default, active)
SELECT o.id, v.code, v.name, false, true
FROM organizations o
CROSS JOIN (
  VALUES
    ('MART', 'Gudang Mart'),
    ('CAFE', 'Gudang Cafe'),
    ('FASHION', 'Gudang Fashion')
) AS v(code, name)
WHERE o.slug = 'hybrid-lab'
  AND NOT EXISTS (
    SELECT 1 FROM warehouses w WHERE w.organization_id = o.id AND w.code = v.code
  );

INSERT INTO outlets (
  organization_id, outlet_code, name, business_sector, warehouse_id, sort_order, active
)
SELECT
  o.id,
  v.outlet_code,
  v.name,
  v.sector,
  w.id,
  v.sort_order,
  true
FROM organizations o
CROSS JOIN (
  VALUES
    ('MART', 'Mart Pesantren', 'retail', 'MART', 10),
    ('CAFE', 'Cafe Pesantren', 'fnb', 'CAFE', 20),
    ('FASHION', 'Fashion & Perlengkapan', 'retail', 'FASHION', 30)
) AS v(outlet_code, name, sector, wh_code, sort_order)
LEFT JOIN warehouses w ON w.organization_id = o.id AND w.code = v.wh_code
WHERE o.slug = 'hybrid-lab'
  AND NOT EXISTS (
    SELECT 1 FROM outlets ou WHERE ou.organization_id = o.id AND ou.outlet_code = v.outlet_code
  );
