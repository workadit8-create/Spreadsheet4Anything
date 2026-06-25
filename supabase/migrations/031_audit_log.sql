-- Security Fase B (2/2): audit log aksi sensitif

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_org_created_idx
  ON audit_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_log_org_action_idx
  ON audit_log (organization_id, action);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log FOR SELECT
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  );

DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND user_id = auth.uid()
  );

REVOKE ALL ON audit_log FROM anon;
GRANT SELECT, INSERT ON audit_log TO authenticated;

COMMENT ON TABLE audit_log IS
  'Jejak audit aksi sensitif (posting, void, tim, profil usaha). Baca: owner/akuntan. Tulis: API dengan session user.';
