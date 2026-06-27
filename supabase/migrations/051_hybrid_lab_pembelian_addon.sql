-- Aktifkan add-on pembelian (PO inventory) untuk hybrid-lab

UPDATE tenant_addons ta
SET enabled = true, updated_at = now()
FROM organizations o
WHERE ta.organization_id = o.id
  AND o.slug = 'hybrid-lab'
  AND ta.addon_key = 'pembelian';
