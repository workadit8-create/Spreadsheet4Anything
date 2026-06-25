-- Akun role-play hybrid-lab: staff + akuntan (owner tetap workadit8@gmail.com)
-- Jalankan: ./scripts/run-supabase-migration-file.sh onboard-premium-hybrid-lab-roles.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_org_slug TEXT := 'hybrid-lab';
  v_org_id UUID;
  v_user_id UUID;
  v_identity_id UUID;
  rec RECORD;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE slug = v_org_slug LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Org hybrid-lab tidak ditemukan';
  END IF;

  FOR rec IN
    SELECT *
    FROM (
      VALUES
        ('staff.hybrid@premium-web.app', 'HybridStaff2026!', 'staff', 'Staff Hybrid Lab'),
        ('akuntan.hybrid@premium-web.app', 'HybridAkuntan2026!', 'akuntan', 'Akuntan Hybrid Lab')
    ) AS t(email, pwd, role, full_name)
  LOOP
    SELECT id INTO v_user_id FROM auth.users WHERE email = lower(rec.email) LIMIT 1;

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();
      v_identity_id := gen_random_uuid();

      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, recovery_sent_at, last_sign_in_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id, 'authenticated', 'authenticated', lower(rec.email),
        crypt(rec.pwd, gen_salt('bf')),
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', rec.full_name),
        now(), now(), '', '', '', ''
      );

      INSERT INTO auth.identities (
        provider_id, user_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at, id
      ) VALUES (
        v_user_id::text, v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', lower(rec.email), 'email_verified', true),
        'email', now(), now(), now(), v_identity_id
      );
    END IF;

    INSERT INTO memberships (organization_id, user_id, role)
    VALUES (v_org_id, v_user_id, rec.role)
    ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  END LOOP;

  RAISE NOTICE 'Hybrid-lab role accounts OK';
END $$;

SELECT o.slug, m.role, u.email
FROM memberships m
JOIN organizations o ON o.id = m.organization_id
JOIN auth.users u ON u.id = m.user_id
WHERE o.slug = 'hybrid-lab'
ORDER BY m.role, u.email;
