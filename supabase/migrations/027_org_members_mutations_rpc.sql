-- Mutasi anggota org via RPC (tanpa service role di Vercel)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.add_org_member(
  p_org_id uuid,
  p_email text,
  p_role text,
  p_full_name text DEFAULT ''
)
RETURNS TABLE (user_id uuid, created boolean, temp_password text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_user_id uuid;
  v_identity_id uuid;
  v_pwd text;
  v_created boolean := false;
  v_name text;
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Hanya owner yang boleh menambah anggota';
  END IF;

  v_email := lower(trim(p_email));
  IF v_email = '' THEN
    RAISE EXCEPTION 'Email wajib diisi';
  END IF;

  IF p_role NOT IN ('staff', 'akuntan') THEN
    RAISE EXCEPTION 'Peran harus staff atau akuntan';
  END IF;

  v_name := trim(coalesce(p_full_name, ''));

  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    v_identity_id := gen_random_uuid();
    v_pwd := 'Premium' || substr(encode(gen_random_bytes(6), 'hex'), 1, 10) || '!';
    v_created := true;

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id, 'authenticated', 'authenticated', v_email,
      crypt(v_pwd, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      CASE WHEN v_name <> '' THEN jsonb_build_object('full_name', v_name) ELSE '{}'::jsonb END,
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at, id
    ) VALUES (
      v_user_id::text, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now(), v_identity_id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = p_org_id AND m.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Email sudah terdaftar di organisasi ini';
  END IF;

  INSERT INTO memberships (organization_id, user_id, role)
  VALUES (p_org_id, v_user_id, p_role);

  RETURN QUERY SELECT v_user_id, v_created, CASE WHEN v_created THEN v_pwd ELSE NULL END;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_org_member_role(
  p_org_id uuid,
  p_membership_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership memberships%ROWTYPE;
  v_owner_count int;
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Hanya owner yang boleh mengubah peran';
  END IF;

  IF p_role NOT IN ('owner', 'staff', 'akuntan', 'cashier') THEN
    RAISE EXCEPTION 'Peran tidak valid';
  END IF;

  SELECT * INTO v_membership
  FROM memberships
  WHERE id = p_membership_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anggota tidak ditemukan';
  END IF;

  IF v_membership.role = 'owner' AND p_role <> 'owner' THEN
    SELECT count(*)::int INTO v_owner_count
    FROM memberships
    WHERE organization_id = p_org_id AND role = 'owner';

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'Tidak bisa mengubah peran owner terakhir';
    END IF;

    IF v_membership.user_id = auth.uid() THEN
      RAISE EXCEPTION 'Anda tidak bisa menurunkan peran owner sendiri';
    END IF;
  END IF;

  UPDATE memberships SET role = p_role
  WHERE id = p_membership_id AND organization_id = p_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_org_member(
  p_org_id uuid,
  p_membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership memberships%ROWTYPE;
  v_owner_count int;
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Hanya owner yang boleh menghapus anggota';
  END IF;

  SELECT * INTO v_membership
  FROM memberships
  WHERE id = p_membership_id AND organization_id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anggota tidak ditemukan';
  END IF;

  IF v_membership.user_id = auth.uid() THEN
    RAISE EXCEPTION 'Anda tidak bisa menghapus keanggotaan sendiri';
  END IF;

  IF v_membership.role = 'owner' THEN
    SELECT count(*)::int INTO v_owner_count
    FROM memberships
    WHERE organization_id = p_org_id AND role = 'owner';

    IF v_owner_count <= 1 THEN
      RAISE EXCEPTION 'Tidak bisa menghapus owner terakhir';
    END IF;
  END IF;

  DELETE FROM memberships
  WHERE id = p_membership_id AND organization_id = p_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_org_member(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_org_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_org_member(uuid, uuid) TO authenticated;
