-- Client DEMO — akun terpisah untuk orang yang ingin coba aplikasi.
-- User demo HANYA punya membership org demo (bukan hybrid-lab).
--
-- Jalankan: ./scripts/run-supabase-migration-file.sh onboard-premium-demo.sql
-- (atau dari path penuh ke file ini)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_slug TEXT := 'demo';
  v_name TEXT := 'Demo Premium Akuntansi';
  v_email TEXT := 'demo@premium-web.app';
  v_password TEXT := 'PremiumDemo2026!';
  v_user_id UUID;
  v_org_id UUID;
  v_identity_id UUID;
BEGIN
  -- 1) Auth user demo (email + password login)
  SELECT id INTO v_user_id FROM auth.users WHERE email = lower(v_email) LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    v_identity_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      lower(v_email),
      crypt(v_password, gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Demo Premium"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    INSERT INTO auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at,
      id
    ) VALUES (
      v_user_id::text,
      v_user_id,
      jsonb_build_object(
        'sub', v_user_id::text,
        'email', lower(v_email),
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now(),
      v_identity_id
    );
  END IF;

  -- 2) Organisasi demo
  INSERT INTO organizations (slug, name, business_sectors)
  VALUES (v_slug, v_name, ARRAY['retail', 'fnb']::TEXT[])
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        business_sectors = EXCLUDED.business_sectors,
        updated_at = now()
  RETURNING id INTO v_org_id;

  PERFORM public.seed_organization_defaults(v_org_id);
  PERFORM public.seed_default_coa_for_org(v_org_id);

  -- 3) Profil usaha (sidebar + cetak)
  INSERT INTO app_settings (organization_id, settings)
  VALUES (
    v_org_id,
    jsonb_build_object(
      'business',
      jsonb_build_object(
        'company_name', v_name,
        'address', 'Jl. Demo No. 1, Jakarta Selatan',
        'phone', '021-555-0100',
        'sectors', ARRAY['retail', 'fnb']::TEXT[],
        'inventory_mode', 'mixed'
      ),
      'onboarding',
      jsonb_build_object('demo_tenant', true, 'created_at', now())
    )
  )
  ON CONFLICT (organization_id) DO UPDATE
    SET settings = app_settings.settings || EXCLUDED.settings,
        updated_at = now();

  -- 4) Membership — hanya org demo untuk user ini
  INSERT INTO memberships (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- 5) Data contoh (opsional, mempercepat demo)
  PERFORM public.seed_demo_master_data(v_org_id);

  RAISE NOTICE 'Demo OK — org=%, user=%, password=(lihat docs/DEMO-ACCOUNTS.md)', v_org_id, v_email;
END $$;
