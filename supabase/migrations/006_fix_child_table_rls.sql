-- Child tables: tambah INSERT/UPDATE/DELETE (sebelumnya hanya SELECT)

-- sales_lines
DROP POLICY IF EXISTS sl_insert ON sales_lines;
DROP POLICY IF EXISTS sl_update ON sales_lines;
DROP POLICY IF EXISTS sl_delete ON sales_lines;

CREATE POLICY sl_insert ON sales_lines FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM sales_orders o
    WHERE o.id = sales_order_id
      AND o.organization_id IN (SELECT public.user_organization_ids())
  )
);

CREATE POLICY sl_update ON sales_lines FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM sales_orders o
    WHERE o.id = sales_order_id
      AND o.organization_id IN (SELECT public.user_organization_ids())
  )
);

CREATE POLICY sl_delete ON sales_lines FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM sales_orders o
    WHERE o.id = sales_order_id
      AND o.organization_id IN (SELECT public.user_organization_ids())
  )
);

-- purchase_lines
DROP POLICY IF EXISTS pl_insert ON purchase_lines;
DROP POLICY IF EXISTS pl_update ON purchase_lines;
DROP POLICY IF EXISTS pl_delete ON purchase_lines;

CREATE POLICY pl_insert ON purchase_lines FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM purchase_orders o
    WHERE o.id = purchase_order_id
      AND o.organization_id IN (SELECT public.user_organization_ids())
  )
);

CREATE POLICY pl_update ON purchase_lines FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM purchase_orders o
    WHERE o.id = purchase_order_id
      AND o.organization_id IN (SELECT public.user_organization_ids())
  )
);

CREATE POLICY pl_delete ON purchase_lines FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM purchase_orders o
    WHERE o.id = purchase_order_id
      AND o.organization_id IN (SELECT public.user_organization_ids())
  )
);

-- posting_job_logs (worker menulis log)
DROP POLICY IF EXISTS pjl_insert ON posting_job_logs;
DROP POLICY IF EXISTS pjl_update ON posting_job_logs;
DROP POLICY IF EXISTS pjl_delete ON posting_job_logs;

CREATE POLICY pjl_insert ON posting_job_logs FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM posting_jobs j
    WHERE j.id = job_id
      AND j.organization_id IN (SELECT public.user_organization_ids())
  )
);

CREATE POLICY pjl_update ON posting_job_logs FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM posting_jobs j
    WHERE j.id = job_id
      AND j.organization_id IN (SELECT public.user_organization_ids())
  )
);

CREATE POLICY pjl_delete ON posting_job_logs FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM posting_jobs j
    WHERE j.id = job_id
      AND j.organization_id IN (SELECT public.user_organization_ids())
  )
);

-- stock_movement_lines
DROP POLICY IF EXISTS sml_insert ON stock_movement_lines;
DROP POLICY IF EXISTS sml_update ON stock_movement_lines;
DROP POLICY IF EXISTS sml_delete ON stock_movement_lines;

CREATE POLICY sml_insert ON stock_movement_lines FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM stock_movements m
    WHERE m.id = movement_id
      AND m.organization_id IN (SELECT public.user_organization_ids())
  )
);

CREATE POLICY sml_update ON stock_movement_lines FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM stock_movements m
    WHERE m.id = movement_id
      AND m.organization_id IN (SELECT public.user_organization_ids())
  )
);

CREATE POLICY sml_delete ON stock_movement_lines FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM stock_movements m
    WHERE m.id = movement_id
      AND m.organization_id IN (SELECT public.user_organization_ids())
  )
);

-- recipe_lines
DROP POLICY IF EXISTS rl_insert ON recipe_lines;
DROP POLICY IF EXISTS rl_update ON recipe_lines;
DROP POLICY IF EXISTS rl_delete ON recipe_lines;

CREATE POLICY rl_insert ON recipe_lines FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM product_recipes r
    WHERE r.id = recipe_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);

CREATE POLICY rl_update ON recipe_lines FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM product_recipes r
    WHERE r.id = recipe_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);

CREATE POLICY rl_delete ON recipe_lines FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM product_recipes r
    WHERE r.id = recipe_id
      AND r.organization_id IN (SELECT public.user_organization_ids())
  )
);
