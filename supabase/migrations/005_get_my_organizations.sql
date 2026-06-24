-- RPC: organisasi user saat ini (bypass RLS embed issues, tetap pakai auth.uid())
CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE (id uuid, slug text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.slug, o.name
  FROM memberships m
  JOIN organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated;
