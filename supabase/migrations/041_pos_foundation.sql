-- POS add-on: antrean sync offline (idempotent per local_id) + indeks penjualan POS

CREATE TABLE IF NOT EXISTS pos_local_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  local_id TEXT NOT NULL,
  device_label TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  sales_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
  sync_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (sync_status IN ('PENDING', 'SYNCED', 'FAILED')),
  sync_error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  UNIQUE (organization_id, local_id)
);

CREATE INDEX IF NOT EXISTS pos_local_sales_org_status_idx
  ON pos_local_sales (organization_id, sync_status, created_at DESC);

COMMENT ON TABLE pos_local_sales IS
  'Antrean transaksi POS dari device offline — local_id unik per org untuk sync idempotent.';

ALTER TABLE pos_local_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY pos_local_sales_select ON pos_local_sales FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY pos_local_sales_insert ON pos_local_sales FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY pos_local_sales_update ON pos_local_sales FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));

-- Aktifkan add-on POS untuk hybrid-lab (pengujian)
UPDATE tenant_addons ta
SET enabled = true, updated_at = now()
FROM organizations o
WHERE ta.organization_id = o.id
  AND o.slug = 'hybrid-lab'
  AND ta.addon_key = 'pos';
