-- Transfer stok antar gudang (multi warehouse) — tanpa jurnal

CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transfer_no TEXT NOT NULL,
  transfer_date DATE NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  outlet_code TEXT,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'VOIDED')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, transfer_no),
  CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty NUMERIC(18, 4) NOT NULL CHECK (qty > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS stock_transfers_org_date_idx
  ON stock_transfers (organization_id, transfer_date DESC);

ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_transfers_tenant ON stock_transfers FOR ALL
  USING (organization_id IN (SELECT public.user_organization_ids()))
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY stock_transfer_lines_tenant ON stock_transfer_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM stock_transfers t
      WHERE t.id = transfer_id
        AND t.organization_id IN (SELECT public.user_organization_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM stock_transfers t
      WHERE t.id = transfer_id
        AND t.organization_id IN (SELECT public.user_organization_ids())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON stock_transfers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_transfer_lines TO authenticated;
