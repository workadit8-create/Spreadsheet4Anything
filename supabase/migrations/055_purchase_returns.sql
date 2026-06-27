-- Retur pembelian inventory (stok keluar + jurnal balik persediaan/utang/kas)

CREATE TABLE IF NOT EXISTS purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  return_no TEXT NOT NULL,
  return_date DATE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  outlet_code TEXT,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  refund_mode TEXT NOT NULL CHECK (refund_mode IN ('KREDIT', 'TUNAI')),
  rekening TEXT,
  total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  dpp NUMERIC(18, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOIDED')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, return_no)
);

CREATE TABLE IF NOT EXISTS purchase_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  purchase_line_id UUID REFERENCES purchase_lines(id) ON DELETE SET NULL,
  qty NUMERIC(18, 4) NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(18, 4) NOT NULL DEFAULT 0,
  line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  dpp NUMERIC(18, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS purchase_returns_org_date_idx
  ON purchase_returns (organization_id, return_date DESC);

CREATE INDEX IF NOT EXISTS purchase_return_lines_po_line_idx
  ON purchase_return_lines (purchase_line_id) WHERE purchase_line_id IS NOT NULL;

ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_return_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON purchase_returns FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_insert ON purchase_returns FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_update ON purchase_returns FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_delete ON purchase_returns FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY prl_select ON purchase_return_lines FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM purchase_returns r
    WHERE r.id = return_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY prl_insert ON purchase_return_lines FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM purchase_returns r
    WHERE r.id = return_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY prl_update ON purchase_return_lines FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM purchase_returns r
    WHERE r.id = return_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY prl_delete ON purchase_return_lines FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM purchase_returns r
    WHERE r.id = return_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_returns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_return_lines TO authenticated;
