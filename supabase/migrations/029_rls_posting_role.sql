-- Security Fase A: RLS berbasis role untuk posting/jurnal + update organisasi (owner saja)

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_posting_role(p_org_id uuid)
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
      AND m.role IN ('owner', 'akuntan')
  );
$$;

CREATE OR REPLACE FUNCTION public.tenant_may_write_posted_doc(p_org_id uuid, p_status text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_org_posting_role(p_org_id)
    OR coalesce(p_status, '') NOT IN ('POSTED', 'VOIDED');
$$;

GRANT EXECUTE ON FUNCTION public.is_org_posting_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_may_write_posted_doc(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- organizations — update hanya owner
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS org_update ON organizations;
CREATE POLICY org_update ON organizations FOR UPDATE
  USING (public.is_org_owner(id))
  WITH CHECK (public.is_org_owner(id));

-- ---------------------------------------------------------------------------
-- journal_entries & journal_lines — tulis hanya owner/akuntan
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_insert ON journal_entries;
DROP POLICY IF EXISTS tenant_update ON journal_entries;
DROP POLICY IF EXISTS tenant_delete ON journal_entries;

CREATE POLICY journal_posting_insert ON journal_entries FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  );

CREATE POLICY journal_posting_update ON journal_entries FOR UPDATE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  );

CREATE POLICY journal_posting_delete ON journal_entries FOR DELETE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  );

DROP POLICY IF EXISTS tenant_insert ON journal_lines;
DROP POLICY IF EXISTS tenant_update ON journal_lines;
DROP POLICY IF EXISTS tenant_delete ON journal_lines;

CREATE POLICY journal_lines_posting_insert ON journal_lines FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  );

CREATE POLICY journal_lines_posting_update ON journal_lines FOR UPDATE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  );

CREATE POLICY journal_lines_posting_delete ON journal_lines FOR DELETE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  );

-- ---------------------------------------------------------------------------
-- posting_jobs — enqueue & worker hanya owner/akuntan
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_insert ON posting_jobs;
DROP POLICY IF EXISTS tenant_update ON posting_jobs;
DROP POLICY IF EXISTS tenant_delete ON posting_jobs;

CREATE POLICY posting_jobs_role_insert ON posting_jobs FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  );

CREATE POLICY posting_jobs_role_update ON posting_jobs FOR UPDATE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  )
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  );

CREATE POLICY posting_jobs_role_delete ON posting_jobs FOR DELETE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.is_org_posting_role(organization_id)
  );

-- posting_job_logs — ikut posting role (worker menulis log)
DROP POLICY IF EXISTS pjl_insert ON posting_job_logs;
DROP POLICY IF EXISTS pjl_update ON posting_job_logs;
DROP POLICY IF EXISTS pjl_delete ON posting_job_logs;

CREATE POLICY pjl_posting_insert ON posting_job_logs FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM posting_jobs j
    WHERE j.id = job_id
      AND j.organization_id IN (SELECT public.user_organization_ids())
      AND public.is_org_posting_role(j.organization_id)
  )
);

CREATE POLICY pjl_posting_update ON posting_job_logs FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM posting_jobs j
    WHERE j.id = job_id
      AND j.organization_id IN (SELECT public.user_organization_ids())
      AND public.is_org_posting_role(j.organization_id)
  )
);

CREATE POLICY pjl_posting_delete ON posting_job_logs FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM posting_jobs j
    WHERE j.id = job_id
      AND j.organization_id IN (SELECT public.user_organization_ids())
      AND public.is_org_posting_role(j.organization_id)
  )
);

-- ---------------------------------------------------------------------------
-- Dokumen operasional — staff boleh CONFIRMED; POSTED/VOIDED hanya posting role
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_update ON sales_orders;
DROP POLICY IF EXISTS tenant_delete ON sales_orders;

CREATE POLICY sales_orders_tenant_update ON sales_orders FOR UPDATE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  )
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  );

CREATE POLICY sales_orders_tenant_delete ON sales_orders FOR DELETE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  );

DROP POLICY IF EXISTS tenant_update ON purchase_orders;
DROP POLICY IF EXISTS tenant_delete ON purchase_orders;

CREATE POLICY purchase_orders_tenant_update ON purchase_orders FOR UPDATE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  )
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  );

CREATE POLICY purchase_orders_tenant_delete ON purchase_orders FOR DELETE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  );

DROP POLICY IF EXISTS tenant_update ON payments;
DROP POLICY IF EXISTS tenant_delete ON payments;

CREATE POLICY payments_tenant_update ON payments FOR UPDATE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  )
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  );

CREATE POLICY payments_tenant_delete ON payments FOR DELETE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  );

DROP POLICY IF EXISTS ct_update ON cash_transfers;
DROP POLICY IF EXISTS ct_delete ON cash_transfers;

CREATE POLICY cash_transfers_tenant_update ON cash_transfers FOR UPDATE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  )
  WITH CHECK (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  );

CREATE POLICY cash_transfers_tenant_delete ON cash_transfers FOR DELETE
  USING (
    organization_id IN (SELECT public.user_organization_ids())
    AND public.tenant_may_write_posted_doc(organization_id, status)
  );

-- Baris invoice/PO — ikut status header (void pelunasan mengubah metadata baris posted)
DROP POLICY IF EXISTS sl_update ON sales_lines;
DROP POLICY IF EXISTS sl_delete ON sales_lines;

CREATE POLICY sl_tenant_update ON sales_lines FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM sales_orders o
    WHERE o.id = sales_order_id
      AND o.organization_id IN (SELECT public.user_organization_ids())
      AND public.tenant_may_write_posted_doc(o.organization_id, o.status)
  )
);

CREATE POLICY sl_tenant_delete ON sales_lines FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM sales_orders o
    WHERE o.id = sales_order_id
      AND o.organization_id IN (SELECT public.user_organization_ids())
      AND public.tenant_may_write_posted_doc(o.organization_id, o.status)
  )
);

DROP POLICY IF EXISTS pl_update ON purchase_lines;
DROP POLICY IF EXISTS pl_delete ON purchase_lines;

CREATE POLICY pl_tenant_update ON purchase_lines FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM purchase_orders o
    WHERE o.id = purchase_order_id
      AND o.organization_id IN (SELECT public.user_organization_ids())
      AND public.tenant_may_write_posted_doc(o.organization_id, o.status)
  )
);

CREATE POLICY pl_tenant_delete ON purchase_lines FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM purchase_orders o
    WHERE o.id = purchase_order_id
      AND o.organization_id IN (SELECT public.user_organization_ids())
      AND public.tenant_may_write_posted_doc(o.organization_id, o.status)
  )
);
