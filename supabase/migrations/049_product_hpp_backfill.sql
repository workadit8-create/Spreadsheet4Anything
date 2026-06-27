-- Backfill HPP dummy untuk produk yang kelola stok (org dengan add-on inventory).
-- Nilai: ~70% sell_price, min 100 — placeholder sampai modul pembelian (average cost).

WITH targets AS (
  SELECT
    p.id,
    GREATEST(100, FLOOR(COALESCE(p.sell_price, 0) * 0.7)::bigint) AS dummy_hpp
  FROM products p
  JOIN organizations o ON o.id = p.organization_id
  JOIN tenant_addons ta
    ON ta.organization_id = o.id
    AND ta.addon_key = 'inventory'
    AND ta.enabled = true
  LEFT JOIN product_categories pc ON pc.id = p.category_id
  WHERE COALESCE(
    CASE
      WHEN p.tracks_stock IS NOT NULL THEN p.tracks_stock
      WHEN pc.tracks_stock IS NOT NULL THEN pc.tracks_stock
      ELSE true
    END,
    true
  ) = true
    AND COALESCE(p.product_kind, pc.product_kind, 'goods') NOT IN ('service', 'menu_item')
    AND COALESCE(
      NULLIF(TRIM(p.metadata->>'hpp'), ''),
      NULLIF(TRIM(p.metadata->>'cost'), ''),
      NULLIF(TRIM(p.metadata->>'hargaPokok'), '')
    ) IS NULL
)
UPDATE products p
SET
  metadata = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object('hpp', t.dummy_hpp),
  updated_at = now()
FROM targets t
WHERE p.id = t.id;
