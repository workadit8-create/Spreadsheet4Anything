-- Aktifkan add-on Manajemen Proyek hanya di hybrid-lab (testing).
-- Client produksi tetap off sampai diaktifkan manual.

UPDATE tenant_addons ta
SET enabled = true, updated_at = now()
FROM organizations o
WHERE ta.organization_id = o.id
  AND o.slug = 'hybrid-lab'
  AND ta.addon_key = 'project';

UPDATE tenant_addons ta
SET enabled = false, updated_at = now()
FROM organizations o
WHERE ta.organization_id = o.id
  AND o.slug IN ('tirta-catering', 'demo')
  AND ta.addon_key = 'project';

-- Verifikasi
SELECT o.slug, ta.addon_key, ta.enabled
FROM tenant_addons ta
JOIN organizations o ON o.id = ta.organization_id
WHERE ta.addon_key = 'project'
ORDER BY o.slug;
