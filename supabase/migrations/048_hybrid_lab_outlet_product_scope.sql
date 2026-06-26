-- Pastikan hybrid-lab punya 3 gudang + 3 outlet, dan produk dummy terikat outlet.
-- Idempotent.

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

UPDATE outlets ou
SET warehouse_id = w.id,
    updated_at = now()
FROM organizations o
JOIN warehouses w ON w.organization_id = o.id
WHERE ou.organization_id = o.id
  AND o.slug = 'hybrid-lab'
  AND w.code = ou.outlet_code
  AND ou.warehouse_id IS DISTINCT FROM w.id;

-- metadata.outlet dari prefix SKU jika belum ada
UPDATE products p
SET
  metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object(
    'outlet',
    CASE
      WHEN p.sku ILIKE 'MART-%' THEN 'MART'
      WHEN p.sku ILIKE 'CAFE-%' THEN 'CAFE'
      WHEN p.sku ILIKE 'FSH-%' THEN 'FASHION'
    END
  ),
  updated_at = now()
FROM organizations o
WHERE p.organization_id = o.id
  AND o.slug = 'hybrid-lab'
  AND COALESCE(p.metadata->>'outlet', '') = ''
  AND (
    p.sku ILIKE 'MART-%'
    OR p.sku ILIKE 'CAFE-%'
    OR p.sku ILIKE 'FSH-%'
  );
