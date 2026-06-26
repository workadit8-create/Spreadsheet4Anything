-- TIRTA CATERING: semua add-on aktif (gratis / beta tester)
-- Jalankan: ./scripts/run-supabase-migration-file.sh enable-addons-tirta-catering.sql

UPDATE tenant_addons ta
SET enabled = true, updated_at = now()
FROM organizations o
WHERE ta.organization_id = o.id
  AND o.slug = 'tirta-catering';

SELECT o.slug, ta.addon_key, ta.enabled
FROM tenant_addons ta
JOIN organizations o ON o.id = ta.organization_id
WHERE o.slug = 'tirta-catering'
ORDER BY ta.addon_key;
