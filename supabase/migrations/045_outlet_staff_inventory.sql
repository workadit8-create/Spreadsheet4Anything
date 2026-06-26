-- Role staf stok outlet + scope inventory per outlet

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check
  CHECK (role IN ('owner', 'staff', 'akuntan', 'cashier', 'outlet_staff'));

CREATE OR REPLACE FUNCTION public.get_my_outlet_inventory_scopes(p_org_id uuid)
RETURNS TABLE (outlet_code text, can_pos boolean, can_inventory boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.outlet_code, s.can_pos, s.can_inventory
  FROM membership_outlet_scopes s
  INNER JOIN memberships m ON m.id = s.membership_id
  WHERE m.organization_id = p_org_id
    AND m.user_id = auth.uid()
    AND s.can_inventory = true
  ORDER BY s.outlet_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_outlet_inventory_scopes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_membership_outlet_scopes(
  p_org_id uuid,
  p_membership_id uuid,
  p_outlet_codes text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_code text;
  v_can_pos boolean;
  v_can_inventory boolean;
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Hanya owner yang boleh mengubah scope outlet';
  END IF;

  SELECT m.role INTO v_role
  FROM memberships m
  WHERE m.id = p_membership_id AND m.organization_id = p_org_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Anggota tidak ditemukan';
  END IF;

  IF v_role NOT IN ('cashier', 'outlet_staff') THEN
    DELETE FROM membership_outlet_scopes WHERE membership_id = p_membership_id;
    RETURN;
  END IF;

  v_can_pos := v_role = 'cashier';
  v_can_inventory := v_role = 'outlet_staff';

  IF p_outlet_codes IS NULL OR array_length(p_outlet_codes, 1) IS NULL THEN
    RAISE EXCEPTION 'Wajib punya minimal satu outlet';
  END IF;

  FOREACH v_code IN ARRAY p_outlet_codes LOOP
    v_code := upper(trim(v_code));
    IF v_code = '' THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM outlets o
      WHERE o.organization_id = p_org_id
        AND o.outlet_code = v_code
        AND o.active = true
    ) THEN
      RAISE EXCEPTION 'Outlet % tidak ditemukan atau tidak aktif', v_code;
    END IF;
  END LOOP;

  DELETE FROM membership_outlet_scopes WHERE membership_id = p_membership_id;

  INSERT INTO membership_outlet_scopes (
    membership_id, organization_id, outlet_code, can_pos, can_inventory
  )
  SELECT
    p_membership_id,
    p_org_id,
    upper(trim(code)),
    v_can_pos,
    v_can_inventory
  FROM unnest(p_outlet_codes) AS code
  WHERE trim(code) <> ''
  ON CONFLICT (membership_id, outlet_code) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_org_member(
  p_org_id uuid,
  p_email text,
  p_role text,
  p_full_name text DEFAULT '',
  p_outlet_codes text[] DEFAULT NULL
)
RETURNS TABLE (user_id uuid, created boolean, temp_password text, membership_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_email text;
  v_user_id uuid;
  v_identity_id uuid;
  v_pwd text;
  v_created boolean := false;
  v_name text;
  v_membership_id uuid;
  v_code text;
  v_can_pos boolean;
  v_can_inventory boolean;
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Hanya owner yang boleh menambah anggota';
  END IF;

  v_email := lower(trim(p_email));
  IF v_email = '' THEN
    RAISE EXCEPTION 'Email wajib diisi';
  END IF;

  IF p_role NOT IN ('staff', 'akuntan', 'cashier', 'outlet_staff') THEN
    RAISE EXCEPTION 'Peran tidak valid';
  END IF;

  v_can_pos := p_role = 'cashier';
  v_can_inventory := p_role = 'outlet_staff';

  IF p_role IN ('cashier', 'outlet_staff') THEN
    IF p_outlet_codes IS NULL OR array_length(p_outlet_codes, 1) IS NULL THEN
      RAISE EXCEPTION 'Wajib ditetapkan ke minimal satu outlet';
    END IF;
    FOREACH v_code IN ARRAY p_outlet_codes LOOP
      v_code := upper(trim(v_code));
      IF v_code <> '' AND NOT EXISTS (
        SELECT 1 FROM outlets o
        WHERE o.organization_id = p_org_id
          AND o.outlet_code = v_code
          AND o.active = true
      ) THEN
        RAISE EXCEPTION 'Outlet % tidak ditemukan atau tidak aktif', v_code;
      END IF;
    END LOOP;
  END IF;

  v_name := trim(coalesce(p_full_name, ''));

  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    v_identity_id := gen_random_uuid();
    v_pwd := 'Premium' || substr(md5(random()::text || clock_timestamp()::text || v_user_id::text), 1, 10) || '!';
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
  VALUES (p_org_id, v_user_id, p_role)
  RETURNING id INTO v_membership_id;

  IF p_role IN ('cashier', 'outlet_staff') AND p_outlet_codes IS NOT NULL THEN
    INSERT INTO membership_outlet_scopes (
      membership_id, organization_id, outlet_code, can_pos, can_inventory
    )
    SELECT
      v_membership_id,
      p_org_id,
      upper(trim(code)),
      v_can_pos,
      v_can_inventory
    FROM unnest(p_outlet_codes) AS code
    WHERE trim(code) <> '';
  END IF;

  RETURN QUERY SELECT v_user_id, v_created, CASE WHEN v_created THEN v_pwd ELSE NULL END, v_membership_id;
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
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Hanya owner yang boleh mengubah peran';
  END IF;

  IF p_role NOT IN ('owner', 'staff', 'akuntan', 'cashier', 'outlet_staff') THEN
    RAISE EXCEPTION 'Peran tidak valid';
  END IF;

  SELECT * INTO v_membership
  FROM memberships
  WHERE id = p_membership_id AND organization_id = p_org_id;

  IF v_membership.id IS NULL THEN
    RAISE EXCEPTION 'Anggota tidak ditemukan';
  END IF;

  IF v_membership.role = 'owner' AND p_role <> 'owner' THEN
    IF (SELECT count(*) FROM memberships WHERE organization_id = p_org_id AND role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'Tidak bisa menghapus owner terakhir';
    END IF;
    IF v_membership.user_id = auth.uid() THEN
      RAISE EXCEPTION 'Owner tidak bisa menurunkan diri sendiri';
    END IF;
  END IF;

  UPDATE memberships SET role = p_role
  WHERE id = p_membership_id AND organization_id = p_org_id;

  IF p_role NOT IN ('cashier', 'outlet_staff') THEN
    DELETE FROM membership_outlet_scopes WHERE membership_id = p_membership_id;
  ELSIF p_role = 'cashier' THEN
    UPDATE membership_outlet_scopes
    SET can_pos = true, can_inventory = false
    WHERE membership_id = p_membership_id;
  ELSIF p_role = 'outlet_staff' THEN
    UPDATE membership_outlet_scopes
    SET can_pos = false, can_inventory = true
    WHERE membership_id = p_membership_id;
  END IF;
END;
$$;
