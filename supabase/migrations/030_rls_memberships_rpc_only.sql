-- Security Fase B (1/2): memberships — baca sendiri, mutasi hanya lewat RPC owner

-- Hapus semua kebijakan tulis (staff bisa UPDATE role sendiri → owner lewat membership_own_update)
DROP POLICY IF EXISTS membership_insert ON memberships;
DROP POLICY IF EXISTS membership_update ON memberships;
DROP POLICY IF EXISTS membership_delete ON memberships;
DROP POLICY IF EXISTS membership_own_insert ON memberships;
DROP POLICY IF EXISTS membership_own_update ON memberships;
DROP POLICY IF EXISTS membership_own_delete ON memberships;
DROP POLICY IF EXISTS tenant_insert ON memberships;
DROP POLICY IF EXISTS tenant_update ON memberships;
DROP POLICY IF EXISTS tenant_delete ON memberships;

-- SELECT: user hanya lihat baris keanggotaan sendiri (daftar tim → get_org_members RPC)
DROP POLICY IF EXISTS membership_select ON memberships;
DROP POLICY IF EXISTS tenant_select ON memberships;
DROP POLICY IF EXISTS membership_own_select ON memberships;

CREATE POLICY membership_own_select ON memberships
  FOR SELECT
  USING (user_id = auth.uid());

-- Cabut hak tulis langsung — mutasi via SECURITY DEFINER:
-- add_org_member, update_org_member_role, remove_org_member
REVOKE INSERT, UPDATE, DELETE ON memberships FROM authenticated;
GRANT SELECT ON memberships TO authenticated;

COMMENT ON TABLE memberships IS
  'Keanggotaan org. INSERT/UPDATE/DELETE hanya via RPC owner (add_org_member, update_org_member_role, remove_org_member).';
