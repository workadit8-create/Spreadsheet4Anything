-- Premium / Hybrid Lab — MVP schema v1 (POS-ready)
-- Jalankan di Supabase: SQL Editor → New query → Run
-- Project: akuntansi-hybrid-lab

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenants & access
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff', 'akuntan', 'cashier')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS tenant_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  addon_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, addon_key)
);

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS app_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Master data (shared web + POS + CRM)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  sell_price NUMERIC(18, 2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_org_sku_idx
  ON products (organization_id, sku) WHERE sku IS NOT NULL AND sku <> '';

CREATE TABLE IF NOT EXISTS unit_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  to_unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  factor NUMERIC(18, 6) NOT NULL,
  UNIQUE (organization_id, from_unit_id, to_unit_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Inventory core (ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_levels (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  qty NUMERIC(18, 4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'ADJUST', 'TRANSFER')),
  source_type TEXT NOT NULL,
  source_id UUID,
  reference_no TEXT,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS stock_movement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id UUID NOT NULL REFERENCES stock_movements(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty NUMERIC(18, 4) NOT NULL,
  unit_cost NUMERIC(18, 2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Operational documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_no TEXT NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'WEB',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  project_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, order_no)
);

CREATE TABLE IF NOT EXISTS sales_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  qty NUMERIC(18, 4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(18, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  po_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  project_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, po_no)
);

CREATE TABLE IF NOT EXISTS purchase_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  qty NUMERIC(18, 4) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  doc_id UUID NOT NULL,
  method TEXT NOT NULL DEFAULT 'CASH',
  amount NUMERIC(18, 2) NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Sync & accounting bridge
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_keys (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  scope TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, key)
);

CREATE TABLE IF NOT EXISTS sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('PUSH', 'PULL')),
  source TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posting_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  doc_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'POSTED', 'FAILED')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  engine_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS posting_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES posting_jobs(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'INFO',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Stubs — add-on POS / gramasi / CRM (schema ready, UI later)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES product_recipes(id) ON DELETE CASCADE,
  ingredient_product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty NUMERIC(18, 6) NOT NULL,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS product_cost_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  cost NUMERIC(18, 4) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pos_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  device_code TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (organization_id, device_code)
);

CREATE TABLE IF NOT EXISTS pos_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_id UUID REFERENCES pos_devices(id) ON DELETE SET NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  opened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- RLS helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_organization_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM memberships WHERE user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS + tenant policies (pattern: organization_id IN user orgs)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables_with_org TEXT[] := ARRAY[
    'organizations', 'memberships', 'tenant_addons', 'warehouses', 'app_settings',
    'product_categories', 'units', 'products', 'unit_conversions',
    'customers', 'suppliers', 'stock_levels', 'stock_movements',
    'sales_orders', 'purchase_orders', 'payments',
    'idempotency_keys', 'sync_events', 'posting_jobs',
    'product_recipes', 'product_cost_snapshots', 'crm_activities',
    'pos_devices', 'pos_sessions'
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

-- organizations: user sees orgs they belong to
DROP POLICY IF EXISTS org_select ON organizations;
CREATE POLICY org_select ON organizations FOR SELECT
  USING (id IN (SELECT public.user_organization_ids()));

-- memberships: same org scope
DROP POLICY IF EXISTS membership_select ON memberships;
CREATE POLICY membership_select ON memberships FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));

-- stock_movement_lines via parent movement
ALTER TABLE stock_movement_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sml_select ON stock_movement_lines;
CREATE POLICY sml_select ON stock_movement_lines FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM stock_movements m
    WHERE m.id = movement_id AND m.organization_id IN (SELECT public.user_organization_ids())
  )
);

ALTER TABLE sales_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sl_select ON sales_lines;
CREATE POLICY sl_select ON sales_lines FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM sales_orders o
    WHERE o.id = sales_order_id AND o.organization_id IN (SELECT public.user_organization_ids())
  )
);

ALTER TABLE purchase_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pl_select ON purchase_lines;
CREATE POLICY pl_select ON purchase_lines FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM purchase_orders o
    WHERE o.id = purchase_order_id AND o.organization_id IN (SELECT public.user_organization_ids())
  )
);

ALTER TABLE recipe_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rl_select ON recipe_lines;
CREATE POLICY rl_select ON recipe_lines FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM product_recipes r
    WHERE r.id = recipe_id AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);

ALTER TABLE posting_job_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pjl_select ON posting_job_logs;
CREATE POLICY pjl_select ON posting_job_logs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM posting_jobs j
    WHERE j.id = job_id AND j.organization_id IN (SELECT public.user_organization_ids())
  )
);

-- ---------------------------------------------------------------------------
-- Seed lab tenant (HYBRID LAB — links to GAS hybrid slug)
-- ---------------------------------------------------------------------------
INSERT INTO organizations (slug, name)
VALUES ('hybrid-lab', 'HYBRID LAB')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO tenant_addons (organization_id, addon_key, enabled)
SELECT o.id, k.addon_key, false
FROM organizations o
CROSS JOIN (VALUES ('project'), ('pos'), ('pos_gramasi'), ('crm')) AS k(addon_key)
WHERE o.slug = 'hybrid-lab'
ON CONFLICT (organization_id, addon_key) DO NOTHING;

INSERT INTO warehouses (organization_id, code, name, is_default)
SELECT o.id, 'MAIN', 'Gudang Utama', true
FROM organizations o
WHERE o.slug = 'hybrid-lab'
  AND NOT EXISTS (
    SELECT 1 FROM warehouses w WHERE w.organization_id = o.id AND w.code = 'MAIN'
  );

INSERT INTO units (organization_id, code, name)
SELECT o.id, v.code, v.name
FROM organizations o
CROSS JOIN (VALUES ('PCS', 'Pieces'), ('KG', 'Kilogram'), ('GR', 'Gram')) AS v(code, name)
WHERE o.slug = 'hybrid-lab'
ON CONFLICT DO NOTHING;
