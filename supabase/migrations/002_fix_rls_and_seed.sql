-- Fix RLS jika 001_mvp_v1.sql gagal di blok policy organizations
-- Jalankan sekali di SQL Editor (project sudah punya tabel dari run sebelumnya).

CREATE OR REPLACE FUNCTION public.user_organization_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM memberships WHERE user_id = auth.uid();
$$;

DO $$
DECLARE
  t TEXT;
  tables_with_org TEXT[] := ARRAY[
    'tenant_addons', 'warehouses', 'app_settings',
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

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON organizations;
DROP POLICY IF EXISTS tenant_insert ON organizations;
DROP POLICY IF EXISTS tenant_update ON organizations;
DROP POLICY IF EXISTS tenant_delete ON organizations;
DROP POLICY IF EXISTS org_select ON organizations;
CREATE POLICY org_select ON organizations FOR SELECT
  USING (id IN (SELECT public.user_organization_ids()));

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select ON memberships;
DROP POLICY IF EXISTS tenant_insert ON memberships;
DROP POLICY IF EXISTS tenant_update ON memberships;
DROP POLICY IF EXISTS tenant_delete ON memberships;
DROP POLICY IF EXISTS membership_select ON memberships;
CREATE POLICY membership_select ON memberships FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY membership_insert ON memberships FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY membership_update ON memberships FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY membership_delete ON memberships FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

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
