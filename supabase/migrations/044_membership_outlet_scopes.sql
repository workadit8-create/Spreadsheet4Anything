-- Scope outlet per anggota (kasir terikat outlet) — langkah 1: POS per outlet

CREATE TABLE IF NOT EXISTS membership_outlet_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outlet_code TEXT NOT NULL,
  can_pos BOOLEAN NOT NULL DEFAULT true,
  can_inventory BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (membership_id, outlet_code)
);

CREATE INDEX IF NOT EXISTS membership_outlet_scopes_membership_idx
  ON membership_outlet_scopes (membership_id);

CREATE INDEX IF NOT EXISTS membership_outlet_scopes_org_outlet_idx
  ON membership_outlet_scopes (organization_id, outlet_code);

COMMENT ON TABLE membership_outlet_scopes IS
  'Akses outlet per membership — kasir wajib punya scope; owner/staff/akuntan tanpa baris = semua outlet.';

ALTER TABLE membership_outlet_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_outlet_scopes_select ON membership_outlet_scopes FOR SELECT
  USING (
    organization_id IN (SELECT public.user_organization_ids())
  );

REVOKE INSERT, UPDATE, DELETE ON membership_outlet_scopes FROM authenticated;
GRANT SELECT ON membership_outlet_scopes TO authenticated;

DROP FUNCTION IF EXISTS public.get_org_members(uuid);
DROP FUNCTION IF EXISTS public.add_org_member(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.add_org_member(uuid, text, text, text, text[]);

-- Scope POS outlet untuk user login saat ini (kasir)
CREATE OR REPLACE FUNCTION public.get_my_outlet_pos_scopes(p_org_id uuid)
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
    AND s.can_pos = true
  ORDER BY s.outlet_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_outlet_pos_scopes(uuid) TO authenticated;

-- Set scope outlet (owner) — ganti seluruh daftar
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

  IF v_role <> 'cashier' THEN
    DELETE FROM membership_outlet_scopes WHERE membership_id = p_membership_id;
    RETURN;
  END IF;

  IF p_outlet_codes IS NULL OR array_length(p_outlet_codes, 1) IS NULL THEN
    RAISE EXCEPTION 'Kasir wajib punya minimal satu outlet';
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
    true,
    false
  FROM unnest(p_outlet_codes) AS code
  WHERE trim(code) <> ''
  ON CONFLICT (membership_id, outlet_code) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_membership_outlet_scopes(uuid, uuid, text[]) TO authenticated;

-- Daftar anggota + scope outlet
CREATE OR REPLACE FUNCTION public.get_org_members(p_org_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz,
  outlet_scopes jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    m.id,
    m.user_id,
    u.email::text,
    coalesce(u.raw_user_meta_data ->> 'full_name', '')::text AS full_name,
    m.role,
    m.created_at,
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'outletCode', s.outlet_code,
            'canPos', s.can_pos,
            'canInventory', s.can_inventory
          )
          ORDER BY s.outlet_code
        )
        FROM membership_outlet_scopes s
        WHERE s.membership_id = m.id
      ),
      '[]'::jsonb
    ) AS outlet_scopes
  FROM memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.organization_id = p_org_id
    AND public.is_org_owner(p_org_id)
  ORDER BY m.created_at ASC;
$$;

-- Tambah anggota — dukung role cashier + scope outlet
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
BEGIN
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Hanya owner yang boleh menambah anggota';
  END IF;

  v_email := lower(trim(p_email));
  IF v_email = '' THEN
    RAISE EXCEPTION 'Email wajib diisi';
  END IF;

  IF p_role NOT IN ('staff', 'akuntan', 'cashier') THEN
    RAISE EXCEPTION 'Peran harus staff, akuntan, atau cashier';
  END IF;

  IF p_role = 'cashier' THEN
    IF p_outlet_codes IS NULL OR array_length(p_outlet_codes, 1) IS NULL THEN
      RAISE EXCEPTION 'Kasir wajib ditetapkan ke minimal satu outlet';
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

  IF p_role = 'cashier' AND p_outlet_codes IS NOT NULL THEN
    INSERT INTO membership_outlet_scopes (
      membership_id, organization_id, outlet_code, can_pos, can_inventory
    )
    SELECT
      v_membership_id,
      p_org_id,
      upper(trim(code)),
      true,
      false
    FROM unnest(p_outlet_codes) AS code
    WHERE trim(code) <> '';
  END IF;

  RETURN QUERY SELECT v_user_id, v_created, CASE WHEN v_created THEN v_pwd ELSE NULL END, v_membership_id;
END;
$$;

-- Ubah peran — bersihkan scope jika bukan kasir
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

  IF p_role NOT IN ('owner', 'staff', 'akuntan', 'cashier') THEN
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

  IF p_role <> 'cashier' THEN
    DELETE FROM membership_outlet_scopes WHERE membership_id = p_membership_id;
  END IF;
END;
$$;
