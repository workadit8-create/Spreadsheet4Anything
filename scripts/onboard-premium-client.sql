-- Onboarding client baru — Premium Web (Supabase)
--
-- Jalankan di Supabase SQL Editor (service role / postgres).
-- Ganti nilai di blok CONFIG sebelum RUN.
--
-- Setelah selesai: user login → Dashboard → checklist setup.

-- ============ CONFIG — edit di sini ============
-- slug: huruf kecil, strip (contoh: acme-corp)
-- name: nama tampilan perusahaan
-- email: user yang sudah ada di Supabase Auth

DO $$
DECLARE
  v_slug TEXT := 'acme-corp';
  v_name TEXT := 'PT Acme Corp';
  v_email TEXT := 'owner@acme.com';
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = lower(trim(v_email)) LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User Auth tidak ditemukan: %. Buat dulu di Authentication → Users.', v_email;
  END IF;

  INSERT INTO organizations (slug, name, business_sectors)
  VALUES (v_slug, v_name, ARRAY['retail']::TEXT[])
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        business_sectors = EXCLUDED.business_sectors,
        updated_at = now()
  RETURNING id INTO v_org_id;

  PERFORM public.seed_organization_defaults(v_org_id);

  INSERT INTO memberships (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  RAISE NOTICE 'OK — org_id=%, slug=%, user=%', v_org_id, v_slug, v_email;
END $$;

-- Verifikasi cepat:
-- SELECT o.slug, o.name, m.role, u.email
-- FROM organizations o
-- JOIN memberships m ON m.organization_id = o.id
-- JOIN auth.users u ON u.id = m.user_id
-- WHERE o.slug = 'acme-corp';
