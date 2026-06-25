-- Notifikasi Telegram: owner digest harian + reminder proyek tim

CREATE TABLE IF NOT EXISTS user_telegram_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT,
  telegram_username TEXT,
  link_token TEXT,
  link_token_expires_at TIMESTAMPTZ,
  daily_digest_enabled BOOLEAN NOT NULL DEFAULT false,
  project_reminders_enabled BOOLEAN NOT NULL DEFAULT false,
  digest_hour_wib SMALLINT NOT NULL DEFAULT 20
    CHECK (digest_hour_wib >= 0 AND digest_hour_wib <= 23),
  project_reminder_hour_wib SMALLINT NOT NULL DEFAULT 8
    CHECK (project_reminder_hour_wib >= 0 AND project_reminder_hour_wib <= 23),
  last_digest_sent_on DATE,
  last_project_reminder_on DATE,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_telegram_link_token_idx
  ON user_telegram_settings (link_token)
  WHERE link_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_telegram_digest_cron_idx
  ON user_telegram_settings (digest_hour_wib, daily_digest_enabled)
  WHERE telegram_chat_id IS NOT NULL AND daily_digest_enabled = true;

CREATE INDEX IF NOT EXISTS user_telegram_project_cron_idx
  ON user_telegram_settings (project_reminder_hour_wib, project_reminders_enabled)
  WHERE telegram_chat_id IS NOT NULL AND project_reminders_enabled = true;

ALTER TABLE user_telegram_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uts_select ON user_telegram_settings;
CREATE POLICY uts_select ON user_telegram_settings FOR SELECT
  USING (
    user_id = auth.uid()
    AND organization_id IN (SELECT public.user_organization_ids())
  );

DROP POLICY IF EXISTS uts_insert ON user_telegram_settings;
CREATE POLICY uts_insert ON user_telegram_settings FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id IN (SELECT public.user_organization_ids())
  );

DROP POLICY IF EXISTS uts_update ON user_telegram_settings;
CREATE POLICY uts_update ON user_telegram_settings FOR UPDATE
  USING (
    user_id = auth.uid()
    AND organization_id IN (SELECT public.user_organization_ids())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id IN (SELECT public.user_organization_ids())
  );

DROP POLICY IF EXISTS uts_delete ON user_telegram_settings;
CREATE POLICY uts_delete ON user_telegram_settings FOR DELETE
  USING (
    user_id = auth.uid()
    AND organization_id IN (SELECT public.user_organization_ids())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON user_telegram_settings TO authenticated;

-- Webhook bot: selesaikan pairing via token (tanpa session user)
CREATE OR REPLACE FUNCTION public.complete_telegram_link(
  p_token text,
  p_chat_id bigint,
  p_username text DEFAULT NULL
)
RETURNS TABLE (
  ok boolean,
  message text,
  user_id uuid,
  organization_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row user_telegram_settings%ROWTYPE;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' OR p_chat_id IS NULL THEN
    RETURN QUERY SELECT false, 'Token atau chat tidak valid'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM user_telegram_settings
  WHERE link_token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Token tidak ditemukan atau sudah dipakai'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  IF v_row.link_token_expires_at IS NOT NULL AND v_row.link_token_expires_at < now() THEN
    RETURN QUERY SELECT false, 'Token kedaluwarsa — buat link baru dari halaman Akun'::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  UPDATE user_telegram_settings
  SET
    telegram_chat_id = p_chat_id,
    telegram_username = NULLIF(trim(p_username), ''),
    link_token = NULL,
    link_token_expires_at = NULL,
    connected_at = now(),
    updated_at = now()
  WHERE id = v_row.id;

  RETURN QUERY SELECT true, 'Telegram terhubung'::text, v_row.user_id, v_row.organization_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_telegram_link(text, bigint, text) TO service_role;

COMMENT ON TABLE user_telegram_settings IS
  'Preferensi notifikasi Telegram per user per org. Pairing lewat deep link bot + complete_telegram_link (service role).';
