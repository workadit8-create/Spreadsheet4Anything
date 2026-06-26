ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS purchase_line_id UUID REFERENCES purchase_lines(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fixed_assets_org_po_line_uidx
  ON fixed_assets (organization_id, purchase_line_id)
  WHERE purchase_line_id IS NOT NULL;
