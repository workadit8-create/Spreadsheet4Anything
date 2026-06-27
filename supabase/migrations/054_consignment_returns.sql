-- Retur barang titip ke supplier (stok keluar, tanpa jurnal)

CREATE TABLE IF NOT EXISTS consignment_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  return_no TEXT NOT NULL,
  return_date DATE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  outlet_code TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOIDED')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, return_no)
);

CREATE TABLE IF NOT EXISTS consignment_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES consignment_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty NUMERIC(18, 4) NOT NULL CHECK (qty > 0),
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS consignment_returns_org_date_idx
  ON consignment_returns (organization_id, return_date DESC);

ALTER TABLE consignment_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_return_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON consignment_returns FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_insert ON consignment_returns FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_update ON consignment_returns FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_delete ON consignment_returns FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY crn_select ON consignment_return_lines FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM consignment_returns r
    WHERE r.id = return_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY crn_insert ON consignment_return_lines FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM consignment_returns r
    WHERE r.id = return_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY crn_update ON consignment_return_lines FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM consignment_returns r
    WHERE r.id = return_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY crn_delete ON consignment_return_lines FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM consignment_returns r
    WHERE r.id = return_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON consignment_returns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON consignment_return_lines TO authenticated;
