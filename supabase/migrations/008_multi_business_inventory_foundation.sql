-- Multi-business foundation: retail, F&B, manufaktur, jasa
-- Kategori produk menentukan apakah item kelola stok; produk bisa override.
-- POS/stok UI menyusul — schema siap untuk semua pola usaha.

-- ---------------------------------------------------------------------------
-- Profil usaha per tenant (bisa campuran, mis. retail + jasa)
-- ---------------------------------------------------------------------------
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS business_sectors TEXT[] NOT NULL
  DEFAULT ARRAY['retail']::TEXT[];

ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_business_sectors_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_business_sectors_check
  CHECK (
    business_sectors <@ ARRAY['retail', 'fnb', 'manufacturing', 'services']::TEXT[]
    AND cardinality(business_sectors) > 0
  );

COMMENT ON COLUMN organizations.business_sectors IS
  'Sektor usaha tenant: retail, fnb, manufacturing, services — boleh lebih dari satu.';

-- ---------------------------------------------------------------------------
-- Kategori produk: pola stok & jenis item
-- ---------------------------------------------------------------------------
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS tracks_stock BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS product_kind TEXT NOT NULL DEFAULT 'goods',
  ADD COLUMN IF NOT EXISTS uses_recipe BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE product_categories
  DROP CONSTRAINT IF EXISTS product_categories_product_kind_check;

ALTER TABLE product_categories
  ADD CONSTRAINT product_categories_product_kind_check
  CHECK (
    product_kind IN ('goods', 'raw_material', 'finished_good', 'menu_item', 'service')
  );

COMMENT ON COLUMN product_categories.tracks_stock IS
  'true = item di kategori ini kelola stok (gudang/POS kurangi stok). false = jasa/menu tanpa stok sendiri.';
COMMENT ON COLUMN product_categories.product_kind IS
  'goods=barang dagang, raw_material=bahan baku, finished_good=barang jadi, menu_item=menu F&B, service=jasa.';
COMMENT ON COLUMN product_categories.uses_recipe IS
  'true = penjualan konsumsi BOM/resep (FNB/manufaktur) — stok bahan, bukan header menu.';

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_org_code_idx
  ON product_categories (organization_id, code)
  WHERE code IS NOT NULL AND code <> '';

-- ---------------------------------------------------------------------------
-- Produk: override stok opsional (NULL = ikuti kategori)
-- ---------------------------------------------------------------------------
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tracks_stock BOOLEAN,
  ADD COLUMN IF NOT EXISTS product_kind TEXT;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_product_kind_check;

ALTER TABLE products
  ADD CONSTRAINT products_product_kind_check
  CHECK (
    product_kind IS NULL
    OR product_kind IN ('goods', 'raw_material', 'finished_good', 'menu_item', 'service')
  );

COMMENT ON COLUMN products.tracks_stock IS
  'Override kelola stok. NULL = ikuti product_categories.tracks_stock.';

-- ---------------------------------------------------------------------------
-- Helper untuk lapisan POS/stok (gunakan saat deduct inventory)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_effective_tracks_stock(
  p_tracks_stock BOOLEAN,
  p_category_tracks_stock BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_tracks_stock, p_category_tracks_stock, true);
$$;

CREATE OR REPLACE FUNCTION public.product_effective_kind(
  p_product_kind TEXT,
  p_category_kind TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_product_kind, p_category_kind, 'goods');
$$;

-- View ringkas untuk query master + POS
CREATE OR REPLACE VIEW public.products_with_inventory_policy AS
SELECT
  p.*,
  c.name AS category_name,
  c.tracks_stock AS category_tracks_stock,
  c.product_kind AS category_product_kind,
  c.uses_recipe AS category_uses_recipe,
  public.product_effective_tracks_stock(p.tracks_stock, c.tracks_stock) AS effective_tracks_stock,
  public.product_effective_kind(p.product_kind, c.product_kind) AS effective_product_kind
FROM products p
LEFT JOIN product_categories c ON c.id = p.category_id;

COMMENT ON VIEW public.products_with_inventory_policy IS
  'Produk + kebijakan stok efektif (override produk atau kategori).';

GRANT SELECT ON public.products_with_inventory_policy TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed hybrid-lab: contoh kategori multi-usaha
-- ---------------------------------------------------------------------------
INSERT INTO product_categories (
  organization_id, code, name, sort_order, tracks_stock, product_kind, uses_recipe, active
)
SELECT o.id, v.code, v.name, v.sort_order, v.tracks_stock, v.product_kind, v.uses_recipe, true
FROM organizations o
CROSS JOIN (
  VALUES
    ('GOODS', 'Barang Dagang', 10, true, 'goods', false),
    ('RAW', 'Bahan Baku', 20, true, 'raw_material', false),
    ('FINISHED', 'Barang Jadi', 30, true, 'finished_good', false),
    ('MENU', 'Menu / Hidangan', 40, false, 'menu_item', true),
    ('SERVICE', 'Jasa', 50, false, 'service', false)
) AS v(code, name, sort_order, tracks_stock, product_kind, uses_recipe)
WHERE o.slug = 'hybrid-lab'
  AND NOT EXISTS (
    SELECT 1 FROM product_categories pc
    WHERE pc.organization_id = o.id AND pc.code = v.code
  );

UPDATE organizations
SET business_sectors = ARRAY['retail', 'fnb', 'manufacturing', 'services']::TEXT[]
WHERE slug = 'hybrid-lab'
  AND business_sectors = ARRAY['retail']::TEXT[];

-- Owner/staff boleh update profil organisasi (sektor usaha)
DROP POLICY IF EXISTS org_update ON organizations;
CREATE POLICY org_update ON organizations FOR UPDATE
  USING (id IN (SELECT public.user_organization_ids()))
  WITH CHECK (id IN (SELECT public.user_organization_ids()));

INSERT INTO app_settings (organization_id, settings)
SELECT o.id, jsonb_build_object(
  'business', jsonb_build_object(
    'sectors', ARRAY['retail', 'fnb', 'manufacturing', 'services']::TEXT[],
    'inventory_mode', 'mixed',
    'notes', 'Tenant lab — semua pola usaha aktif untuk pengujian.'
  )
)
FROM organizations o
WHERE o.slug = 'hybrid-lab'
ON CONFLICT (organization_id) DO UPDATE
SET settings = app_settings.settings || EXCLUDED.settings,
    updated_at = now();
