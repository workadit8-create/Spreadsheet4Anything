-- Add-on Titip Jual (consignment) — terpisah dari PO pembelian

INSERT INTO tenant_addons (organization_id, addon_key, enabled)
SELECT o.id, 'titip_jual', false
FROM organizations o
ON CONFLICT (organization_id, addon_key) DO NOTHING;

UPDATE tenant_addons ta
SET enabled = true, updated_at = now()
FROM organizations o
WHERE ta.organization_id = o.id
  AND o.slug = 'hybrid-lab'
  AND ta.addon_key = 'titip_jual';

-- COA Utang Titip Jual (org yang belum punya)
INSERT INTO coa_accounts (organization_id, code, name, account_type, active, metadata)
SELECT o.id, '2-10003', 'Utang Titip Jual', 'Kewajiban', true,
  jsonb_build_object(
    'default_seed', true,
    'sub_category', 'Kewajiban Lancar',
    'saldo_normal', 'Kredit'
  )
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM coa_accounts c
  WHERE c.organization_id = o.id AND c.name = 'Utang Titip Jual'
);

CREATE TABLE IF NOT EXISTS consignment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  receipt_no TEXT NOT NULL,
  receipt_date DATE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  outlet_code TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOIDED')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  UNIQUE (organization_id, receipt_no)
);

CREATE TABLE IF NOT EXISTS consignment_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES consignment_receipts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty NUMERIC(18, 4) NOT NULL CHECK (qty > 0),
  unit_settlement NUMERIC(18, 2) NOT NULL DEFAULT 0 CHECK (unit_settlement >= 0),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS consignment_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  settlement_no TEXT NOT NULL,
  settlement_date DATE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  total NUMERIC(18, 2) NOT NULL CHECK (total > 0),
  rekening TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOIDED')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, settlement_no)
);

CREATE TABLE IF NOT EXISTS consignment_liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  qty NUMERIC(18, 4) NOT NULL CHECK (qty > 0),
  unit_settlement NUMERIC(18, 2) NOT NULL CHECK (unit_settlement >= 0),
  total_amount NUMERIC(18, 2) NOT NULL CHECK (total_amount >= 0),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SETTLED')),
  settlement_id UUID REFERENCES consignment_settlements(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consignment_receipts_org_date_idx
  ON consignment_receipts (organization_id, receipt_date DESC);

CREATE INDEX IF NOT EXISTS consignment_liabilities_org_supplier_status_idx
  ON consignment_liabilities (organization_id, supplier_id, status);

CREATE INDEX IF NOT EXISTS consignment_settlements_org_date_idx
  ON consignment_settlements (organization_id, settlement_date DESC);

ALTER TABLE consignment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_liabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON consignment_receipts FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_insert ON consignment_receipts FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_update ON consignment_receipts FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_delete ON consignment_receipts FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY tenant_select ON consignment_settlements FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_insert ON consignment_settlements FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_update ON consignment_settlements FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_delete ON consignment_settlements FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY tenant_select ON consignment_liabilities FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_insert ON consignment_liabilities FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_update ON consignment_liabilities FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_delete ON consignment_liabilities FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY crl_select ON consignment_receipt_lines FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM consignment_receipts r
    WHERE r.id = receipt_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY crl_insert ON consignment_receipt_lines FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM consignment_receipts r
    WHERE r.id = receipt_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY crl_update ON consignment_receipt_lines FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM consignment_receipts r
    WHERE r.id = receipt_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY crl_delete ON consignment_receipt_lines FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM consignment_receipts r
    WHERE r.id = receipt_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_modul_check;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_modul_check
  CHECK (modul IN (
    'PEMASUKAN', 'PELUNASAN_PIUTANG', 'PEMBELIAN', 'PELUNASAN_UTANG',
    'MANUAL', 'MUTASI_DANA', 'CICILAN_UTANG_BANK',
    'ASSET_DEPRECIATION', 'ASSET_DISPOSAL', 'HPP_PENJUALAN',
    'TITIP_JUAL_PENJUALAN', 'TITIP_JUAL_SETTLEMENT'
  ));

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

  INSERT INTO warehouses (organization_id, code, name, is_default)
  SELECT p_org_id, 'MAIN', 'Gudang Utama', true
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
