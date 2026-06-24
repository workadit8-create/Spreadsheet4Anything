-- Fix RLS: user bisa baca membership sendiri + organisasi terkait
-- Jalankan sekali di SQL Editor ATAU via ./scripts/run-supabase-rls-fix.sh

DROP POLICY IF EXISTS membership_select ON memberships;
DROP POLICY IF EXISTS membership_insert ON memberships;
DROP POLICY IF EXISTS membership_update ON memberships;
DROP POLICY IF EXISTS membership_delete ON memberships;
DROP POLICY IF EXISTS membership_own_select ON memberships;

CREATE POLICY membership_own_select ON memberships
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY membership_own_insert ON memberships
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY membership_own_update ON memberships
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY membership_own_delete ON memberships
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS org_select ON organizations;
DROP POLICY IF EXISTS org_member_select ON organizations;

CREATE POLICY org_member_select ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = organizations.id
        AND m.user_id = auth.uid()
    )
  );
