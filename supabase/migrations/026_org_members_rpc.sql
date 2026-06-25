-- RPC daftar anggota org — hanya owner yang boleh memanggil (Fase B kelola tim)

CREATE OR REPLACE FUNCTION public.is_org_owner(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships m
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_org_members(p_org_id uuid)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz
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
    m.created_at
  FROM memberships m
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.organization_id = p_org_id
    AND public.is_org_owner(p_org_id)
  ORDER BY m.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_members(uuid) TO authenticated;
