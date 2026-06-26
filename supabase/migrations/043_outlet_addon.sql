-- Add-on multi-outlet terpisah dari POS (Tirta catering dll. tidak wajib pakai)

INSERT INTO tenant_addons (organization_id, addon_key, enabled)
SELECT o.id, 'outlet', false
FROM organizations o
ON CONFLICT (organization_id, addon_key) DO NOTHING;

-- Aktifkan untuk hybrid-lab (pengujian multi-outlet pesantren)
UPDATE tenant_addons ta
SET enabled = true, updated_at = now()
FROM organizations o
WHERE ta.organization_id = o.id
  AND o.slug = 'hybrid-lab'
  AND ta.addon_key = 'outlet';

CREATE OR REPLACE FUNCTION public.seed_organization_defaults(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id wajib diisi';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_org_id) THEN
    RAISE EXCEPTION 'Organisasi tidak ditemukan: %', p_org_id;
  END IF;

  INSERT INTO warehouses (organization_id, code, name, is_default)
  SELECT p_org_id, 'MAIN', 'Gudang Utama', true
  WHERE NOT EXISTS (
    SELECT 1 FROM warehouses w WHERE w.organization_id = p_org_id AND w.code = 'MAIN'
  );

  INSERT INTO units (organization_id, code, name)
  SELECT p_org_id, v.code, v.name
  FROM (VALUES ('PCS', 'Pieces'), ('KG', 'Kilogram'), ('GR', 'Gram')) AS v(code, name)
  WHERE NOT EXISTS (
    SELECT 1 FROM units u WHERE u.organization_id = p_org_id AND u.code = v.code
  );

  INSERT INTO tenant_addons (organization_id, addon_key, enabled)
  SELECT p_org_id, k.addon_key, false
  FROM (VALUES ('project'), ('pos'), ('outlet'), ('pos_gramasi'), ('crm')) AS k(addon_key)
  ON CONFLICT (organization_id, addon_key) DO NOTHING;

  INSERT INTO app_settings (organization_id, settings)
  VALUES (
    p_org_id,
    jsonb_build_object(
      'business',
      jsonb_build_object(
        'sectors', ARRAY['retail']::TEXT[],
        'inventory_mode', 'mixed'
      ),
      'onboarding',
      jsonb_build_object('started_at', now())
    )
  )
  ON CONFLICT (organization_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_organization_defaults(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_organization_defaults(UUID) TO service_role;
