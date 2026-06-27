-- Add-on Multi Warehouse: beberapa gudang per outlet (display vs gudang/backroom, DC)

INSERT INTO tenant_addons (organization_id, addon_key, enabled)
SELECT o.id, 'multi_warehouse', false
FROM organizations o
ON CONFLICT (organization_id, addon_key) DO NOTHING;

-- Aktifkan untuk hybrid-lab (pengujian)
UPDATE tenant_addons ta
SET enabled = true, updated_at = now()
FROM organizations o
WHERE ta.organization_id = o.id
  AND o.slug = 'hybrid-lab'
  AND ta.addon_key = 'multi_warehouse';

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS is_display BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warehouse_role TEXT NOT NULL DEFAULT 'outlet'
    CHECK (warehouse_role IN ('distribution', 'outlet'));

COMMENT ON COLUMN warehouses.is_display IS
  'Stok gudang ini boleh dipakai penjualan (POS/invoice). Wajib minimal satu per outlet saat multi warehouse aktif.';
COMMENT ON COLUMN warehouses.warehouse_role IS
  'distribution = pusat distribusi (terima PO, transfer ke gudang outlet). outlet = gudang cabang/toko.';

-- Satu gudang hanya boleh terhubung ke satu outlet (unique per org+warehouse)
CREATE TABLE IF NOT EXISTS outlet_warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (outlet_id, warehouse_id),
  UNIQUE (organization_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS outlet_warehouses_outlet_idx
  ON outlet_warehouses (outlet_id);

-- Backfill relasi dari outlets.warehouse_id
INSERT INTO outlet_warehouses (organization_id, outlet_id, warehouse_id, is_primary)
SELECT o.organization_id, o.id, o.warehouse_id, true
FROM outlets o
WHERE o.warehouse_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Gudang default & gudang terhubung outlet = display (perilaku lama tetap jual)
UPDATE warehouses w
SET is_display = true
WHERE w.is_default = true AND w.is_display = false;

UPDATE warehouses w
SET is_display = true
FROM outlets o
WHERE o.warehouse_id = w.id AND w.is_display = false;

-- Gudang outlet hybrid-lab (MART, CAFE, FASHION) = role outlet
UPDATE warehouses w
SET warehouse_role = 'outlet'
WHERE w.code IN ('MART', 'CAFE', 'FASHION');

CREATE OR REPLACE FUNCTION public.seed_organization_defaults(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id wajib diisi';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'Organisasi tidak ditemukan: %', p_org_id;
  END IF;

  INSERT INTO warehouses (organization_id, code, name, is_default, is_display, warehouse_role)
  SELECT p_org_id, 'MAIN', 'Gudang Utama', true, true, 'outlet'
  WHERE NOT EXISTS (
    SELECT 1 FROM warehouses w WHERE w.organization_id = p_org_id AND w.code = 'MAIN'
  );

  INSERT INTO units (organization_id, code, name)
  SELECT p_org_id, v.code, v.name
  FROM (VALUES ('PCS', 'Pieces'), ('KG', 'Kilogram'), ('GR', 'Gram')) AS v(code, name)
  WHERE NOT EXISTS (
    SELECT 1 FROM units u WHERE u.organization_id = p_org_id AND u.code = v.code
  );

  INSERT INTO tenant_addons (organization_id, addon_key, enabled)
  SELECT p_org_id, k.addon_key, false
  FROM (
    VALUES
      ('project'),
      ('pos'),
      ('outlet'),
      ('inventory'),
      ('pembelian'),
      ('titip_jual'),
      ('multi_warehouse'),
      ('pos_gramasi'),
      ('crm')
  ) AS k(addon_key)
  ON CONFLICT (organization_id, addon_key) DO NOTHING;

  INSERT INTO coa_accounts (organization_id, code, name, account_type, active, metadata)
  SELECT p_org_id, '2-10003', 'Utang Titip Jual', 'Kewajiban', true,
    jsonb_build_object(
      'default_seed', true,
      'sub_category', 'Kewajiban Lancar',
      'saldo_normal', 'Kredit'
    )
  WHERE NOT EXISTS (
    SELECT 1 FROM coa_accounts c
    WHERE c.organization_id = p_org_id AND c.name = 'Utang Titip Jual'
  );

  INSERT INTO app_settings (organization_id, settings)
  VALUES (
    p_org_id,
    jsonb_build_object(
      'business',
      jsonb_build_object(
        'sectors', ARRAY['retail']::TEXT[],
        'inventory_mode', 'mixed'
      ),
      'onboarding',
      jsonb_build_object('started_at', now())
    )
  )
  ON CONFLICT (organization_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_organization_defaults(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_organization_defaults(UUID) TO service_role;
