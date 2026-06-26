-- /ringkasan bot: lookup chat_id → org owner (SECURITY DEFINER, sama pola pairing)

GRANT SELECT ON user_telegram_settings TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_telegram_ringkasan_targets(p_chat_id bigint)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  user_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT uts.organization_id, o.name::text, uts.user_id
  FROM user_telegram_settings uts
  INNER JOIN memberships m
    ON m.user_id = uts.user_id AND m.organization_id = uts.organization_id
  INNER JOIN organizations o ON o.id = uts.organization_id
  WHERE uts.telegram_chat_id = p_chat_id
    AND m.role = 'owner';
$$;

REVOKE ALL ON FUNCTION public.resolve_telegram_ringkasan_targets(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_telegram_ringkasan_targets(bigint) TO service_role;

COMMENT ON FUNCTION public.resolve_telegram_ringkasan_targets(bigint) IS
  'Webhook bot /ringkasan: resolve telegram chat_id ke org owner (service_role only).';
