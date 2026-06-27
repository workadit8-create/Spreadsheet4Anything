-- RLS + grant untuk outlet_warehouses (insert gagal tanpa ini)

ALTER TABLE outlet_warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlet_warehouses_tenant ON outlet_warehouses;
CREATE POLICY outlet_warehouses_tenant ON outlet_warehouses FOR ALL
  USING (organization_id IN (SELECT public.user_organization_ids()))
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON outlet_warehouses TO authenticated;

-- Backfill ulang link outlet ↔ gudang yang mungkin terlewat
INSERT INTO outlet_warehouses (organization_id, outlet_id, warehouse_id, is_primary)
SELECT o.organization_id, o.id, o.warehouse_id, true
FROM outlets o
WHERE o.warehouse_id IS NOT NULL
ON CONFLICT (organization_id, warehouse_id) DO NOTHING;
