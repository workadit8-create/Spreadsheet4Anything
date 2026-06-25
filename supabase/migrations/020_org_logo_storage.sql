-- Logo per organisasi (Supabase Storage)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-assets',
  'org-assets',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS org_assets_public_read ON storage.objects;
CREATE POLICY org_assets_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'org-assets');

DROP POLICY IF EXISTS org_assets_tenant_insert ON storage.objects;
CREATE POLICY org_assets_tenant_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.organizations
      WHERE id IN (SELECT public.user_organization_ids())
    )
  );

DROP POLICY IF EXISTS org_assets_tenant_update ON storage.objects;
CREATE POLICY org_assets_tenant_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.organizations
      WHERE id IN (SELECT public.user_organization_ids())
    )
  )
  WITH CHECK (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.organizations
      WHERE id IN (SELECT public.user_organization_ids())
    )
  );

DROP POLICY IF EXISTS org_assets_tenant_delete ON storage.objects;
CREATE POLICY org_assets_tenant_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.organizations
      WHERE id IN (SELECT public.user_organization_ids())
    )
  );
