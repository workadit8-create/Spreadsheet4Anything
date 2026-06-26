-- Seed produk contoh hybrid-lab (pesantren multi-outlet) + saldo awal per gudang.
-- Idempotent: aman dijalankan ulang.

-- ---------------------------------------------------------------------------
-- Produk
-- ---------------------------------------------------------------------------
INSERT INTO products (
  organization_id,
  sku,
  name,
  category_id,
  unit_id,
  sell_price,
  active,
  tracks_stock,
  product_kind,
  metadata
)
SELECT
  o.id,
  v.sku,
  v.name,
  pc.id,
  u.id,
  v.sell_price,
  true,
  v.tracks_stock,
  v.product_kind,
  v.metadata::jsonb
FROM organizations o
CROSS JOIN (
  VALUES
    -- Mart retail (barang dagang, stok di gudang MART)
    ('MART-001', 'Indomie Goreng', 'GOODS', 'PCS', 3500, NULL::boolean, NULL::text, '{"outlet":"MART","akunPendapatan":"Pendapatan"}'),
    ('MART-002', 'Aqua 600 ml', 'GOODS', 'PCS', 4000, NULL, NULL, '{"outlet":"MART","akunPendapatan":"Pendapatan"}'),
    ('MART-003', 'Chitato Keju 68g', 'GOODS', 'PCS', 12000, NULL, NULL, '{"outlet":"MART","akunPendapatan":"Pendapatan"}'),
    ('MART-004', 'SilverQueen 30g', 'GOODS', 'PCS', 15000, NULL, NULL, '{"outlet":"MART","akunPendapatan":"Pendapatan"}'),
    ('MART-005', 'Roti Tawar', 'GOODS', 'PCS', 18000, NULL, NULL, '{"outlet":"MART","akunPendapatan":"Pendapatan"}'),
    ('MART-006', 'Teh Kotak 250ml', 'GOODS', 'PCS', 5000, NULL, NULL, '{"outlet":"MART","akunPendapatan":"Pendapatan"}'),
    -- Cafe menu (jual di POS, tanpa stok sendiri)
    ('CAFE-M01', 'Kopi Susu', 'MENU', 'PCS', 8000, false, 'menu_item', '{"outlet":"CAFE","akunPendapatan":"Pendapatan"}'),
    ('CAFE-M02', 'Teh Tarik', 'MENU', 'PCS', 7000, false, 'menu_item', '{"outlet":"CAFE","akunPendapatan":"Pendapatan"}'),
    ('CAFE-M03', 'Nasi Goreng', 'MENU', 'PCS', 15000, false, 'menu_item', '{"outlet":"CAFE","akunPendapatan":"Pendapatan"}'),
    ('CAFE-M04', 'Es Jeruk', 'MENU', 'PCS', 6000, false, 'menu_item', '{"outlet":"CAFE","akunPendapatan":"Pendapatan"}'),
    -- Cafe bahan baku (opname + stok gudang CAFE)
    ('CAFE-R01', 'Kopi Bubuk', 'RAW', 'KG', 95000, true, 'raw_material', '{"outlet":"CAFE"}'),
    ('CAFE-R02', 'Susu UHT 1L', 'RAW', 'PCS', 18000, true, 'raw_material', '{"outlet":"CAFE"}'),
    ('CAFE-R03', 'Beras Premium', 'RAW', 'KG', 14000, true, 'raw_material', '{"outlet":"CAFE"}'),
    ('CAFE-R04', 'Gula Pasir', 'RAW', 'KG', 16000, true, 'raw_material', '{"outlet":"CAFE"}'),
    -- Fashion retail
    ('FSH-001', 'Kaos Putih Ukuran M', 'GOODS', 'PCS', 75000, NULL, NULL, '{"outlet":"FASHION","akunPendapatan":"Pendapatan"}'),
    ('FSH-002', 'Topi Pesantren', 'GOODS', 'PCS', 45000, NULL, NULL, '{"outlet":"FASHION","akunPendapatan":"Pendapatan"}'),
    ('FSH-003', 'Sarung Songket', 'GOODS', 'PCS', 185000, NULL, NULL, '{"outlet":"FASHION","akunPendapatan":"Pendapatan"}'),
    ('FSH-004', 'Tas Selempang', 'GOODS', 'PCS', 65000, NULL, NULL, '{"outlet":"FASHION","akunPendapatan":"Pendapatan"}')
) AS v(sku, name, cat_code, unit_code, sell_price, tracks_stock, product_kind, metadata)
LEFT JOIN product_categories pc ON pc.organization_id = o.id AND pc.code = v.cat_code
LEFT JOIN units u ON u.organization_id = o.id AND u.code = v.unit_code
WHERE o.slug = 'hybrid-lab'
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.organization_id = o.id AND p.sku = v.sku
  );

-- ---------------------------------------------------------------------------
-- Saldo awal stok (stock_levels) per gudang outlet
-- ---------------------------------------------------------------------------
INSERT INTO stock_levels (organization_id, product_id, warehouse_id, qty)
SELECT o.id, p.id, w.id, v.qty
FROM organizations o
CROSS JOIN (
  VALUES
    ('MART', 'MART-001', 120),
    ('MART', 'MART-002', 96),
    ('MART', 'MART-003', 48),
    ('MART', 'MART-004', 36),
    ('MART', 'MART-005', 24),
    ('MART', 'MART-006', 60),
    ('CAFE', 'CAFE-R01', 8.5),
    ('CAFE', 'CAFE-R02', 30),
    ('CAFE', 'CAFE-R03', 25),
    ('CAFE', 'CAFE-R04', 12),
    ('FASHION', 'FSH-001', 20),
    ('FASHION', 'FSH-002', 15),
    ('FASHION', 'FSH-003', 8),
    ('FASHION', 'FSH-004', 12)
) AS v(wh_code, sku, qty)
JOIN products p ON p.organization_id = o.id AND p.sku = v.sku
JOIN warehouses w ON w.organization_id = o.id AND w.code = v.wh_code
WHERE o.slug = 'hybrid-lab'
ON CONFLICT (organization_id, product_id, warehouse_id)
DO UPDATE SET
  qty = EXCLUDED.qty,
  updated_at = now();
