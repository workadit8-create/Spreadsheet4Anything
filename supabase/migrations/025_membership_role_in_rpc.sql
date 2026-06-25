-- Kembalikan role membership di RPC organisasi user (untuk RBAC Premium Web)

DROP FUNCTION IF EXISTS public.get_my_organizations();

CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE (id uuid, slug text, name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.slug, o.name, m.role
  FROM memberships m
  JOIN organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid()
  ORDER BY o.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated;
