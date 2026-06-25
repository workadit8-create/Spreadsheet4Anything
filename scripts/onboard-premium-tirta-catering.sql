-- Onboarding TIRTA CATERING (produksi) — Premium Web
-- hybrid-lab = akun lab/testing (workadit8@gmail.com), terpisah dari tenant ini.
--
-- Edit CONFIG di bawah, lalu:
--   ./scripts/run-supabase-migration-file.sh onboard-premium-tirta-catering.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_slug TEXT := 'tirta-catering';
  v_name TEXT := 'TIRTA CATERING';
  v_email TEXT := 'owner@tirtacatering.com';
  v_password TEXT := 'TirtaPremium2026!';
  v_create_user BOOLEAN := true;
  v_user_id UUID;
  v_org_id UUID;
  v_identity_id UUID;
BEGIN
  IF v_email LIKE 'GANTI_%' THEN
    RAISE EXCEPTION 'Edit v_email di CONFIG script sebelum dijalankan';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = lower(trim(v_email)) LIMIT 1;

  IF v_user_id IS NULL THEN
    IF NOT v_create_user THEN
      RAISE EXCEPTION 'User Auth tidak ditemukan: %. Buat dulu di Supabase Auth atau set v_create_user := true.', v_email;
    END IF;

    v_user_id := gen_random_uuid();
    v_identity_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated', lower(trim(v_email)),
      crypt(v_password, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Owner Tirta Catering'),
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at, id
    ) VALUES (
      v_user_id::text, v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', lower(trim(v_email)),
        'email_verified', true,
        'phone_verified', false
      ),
      'email', now(), now(), now(), v_identity_id
    );
  END IF;

  INSERT INTO organizations (slug, name, business_sectors)
  VALUES (v_slug, v_name, ARRAY['retail', 'fnb', 'services']::TEXT[])
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        business_sectors = EXCLUDED.business_sectors,
        updated_at = now()
  RETURNING id INTO v_org_id;

  PERFORM public.seed_organization_defaults(v_org_id);
  PERFORM public.seed_default_coa_for_org(v_org_id);

  INSERT INTO product_categories (
    organization_id, code, name, sort_order, tracks_stock, product_kind, uses_recipe, active
  )
  SELECT v_org_id, v.code, v.name, v.sort_order, v.tracks_stock, v.product_kind, v.uses_recipe, true
  FROM (
    VALUES
      ('GOODS', 'Barang Dagang', 10, true, 'goods', false),
      ('RAW', 'Bahan Baku', 20, true, 'raw_material', false),
      ('FINISHED', 'Barang Jadi', 30, true, 'finished_good', false),
      ('MENU', 'Menu / Hidangan', 40, false, 'menu_item', true),
      ('SERVICE', 'Jasa Catering', 50, false, 'service', false)
  ) AS v(code, name, sort_order, tracks_stock, product_kind, uses_recipe)
  WHERE NOT EXISTS (
    SELECT 1 FROM product_categories pc
    WHERE pc.organization_id = v_org_id AND pc.code = v.code
  );

  INSERT INTO app_settings (organization_id, settings)
  VALUES (
    v_org_id,
    jsonb_build_object(
      'business',
      jsonb_build_object(
        'company_name', v_name,
        'address', 'Tangerang',
        'phone', '',
        'sectors', ARRAY['retail', 'fnb', 'services']::TEXT[],
        'inventory_mode', 'mixed'
      ),
      'onboarding',
      jsonb_build_object('client_tier', 'premium', 'plan', '2jt/tahun', 'started_at', now())
    )
  )
  ON CONFLICT (organization_id) DO UPDATE
    SET settings = app_settings.settings || EXCLUDED.settings,
        updated_at = now();

  INSERT INTO memberships (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE tenant_addons
  SET enabled = true, updated_at = now()
  WHERE organization_id = v_org_id AND addon_key = 'project';

  RAISE NOTICE 'TIRTA CATERING OK — org=%, user=%', v_org_id, v_email;
END $$;

-- Pisahkan akun lab dari nama produksi
UPDATE organizations
SET name = 'HYBRID LAB (Testing)',
    updated_at = now()
WHERE slug = 'hybrid-lab'
  AND name = 'TIRTA CATERING';

UPDATE app_settings s
SET settings = jsonb_set(
      jsonb_set(
        COALESCE(s.settings, '{}'::jsonb),
        '{business,company_name}',
        '"HYBRID LAB (Testing)"'::jsonb,
        true
      ),
      '{business,notes}',
      '"Akun lab — bukan tenant produksi Tirta Catering."'::jsonb,
      true
    ),
    updated_at = now()
FROM organizations o
WHERE s.organization_id = o.id AND o.slug = 'hybrid-lab';
