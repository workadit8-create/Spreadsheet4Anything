-- Reset tenant demo ke kondisi awal (transaksi + master contoh).
-- Hanya org slug = 'demo' dan user harus punya membership.

CREATE OR REPLACE FUNCTION public.seed_demo_master_data(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO cash_bank_accounts (organization_id, code, name, coa_account_name, active)
  SELECT p_org_id, 'KAS', 'KAS KECIL', 'Kas', true
  WHERE NOT EXISTS (
    SELECT 1 FROM cash_bank_accounts c
    WHERE c.organization_id = p_org_id AND c.name = 'KAS KECIL'
  );

  INSERT INTO customers (organization_id, code, name, phone, email, active, metadata)
  SELECT p_org_id, 'C001', 'Customer Demo', '08123456789', 'customer@demo.app', true,
    '{"alamat":"Jl. Pelanggan Demo"}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.organization_id = p_org_id AND c.code = 'C001'
  );

  INSERT INTO suppliers (organization_id, code, name, phone, active)
  SELECT p_org_id, 'S001', 'Supplier Demo', '08198765432', true
  WHERE NOT EXISTS (
    SELECT 1 FROM suppliers s WHERE s.organization_id = p_org_id AND s.code = 'S001'
  );

  INSERT INTO products (organization_id, sku, name, sell_price, active, metadata)
  SELECT p_org_id, 'P001', 'Produk Demo', 100000, true, '{"akunPendapatan":"Pendapatan"}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM products p WHERE p.organization_id = p_org_id AND p.sku = 'P001'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_demo_organization(p_org_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_org_id NOT IN (SELECT public.user_organization_ids()) THEN
    RAISE EXCEPTION 'Organisasi tidak diizinkan';
  END IF;

  SELECT slug INTO v_slug FROM organizations WHERE id = p_org_id;
  IF v_slug IS DISTINCT FROM 'demo' THEN
    RAISE EXCEPTION 'Reset hanya untuk tenant demo';
  END IF;

  DELETE FROM posting_job_logs
  WHERE job_id IN (SELECT id FROM posting_jobs WHERE organization_id = p_org_id);

  DELETE FROM posting_jobs WHERE organization_id = p_org_id;
  DELETE FROM journal_lines WHERE organization_id = p_org_id;
  DELETE FROM journal_entries WHERE organization_id = p_org_id;

  DELETE FROM stock_movement_lines
  WHERE movement_id IN (SELECT id FROM stock_movements WHERE organization_id = p_org_id);
  DELETE FROM stock_movements WHERE organization_id = p_org_id;
  DELETE FROM stock_levels WHERE organization_id = p_org_id;

  DELETE FROM payments WHERE organization_id = p_org_id;
  DELETE FROM cash_transfers WHERE organization_id = p_org_id;

  DELETE FROM sales_lines
  WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE organization_id = p_org_id);
  DELETE FROM sales_orders WHERE organization_id = p_org_id;

  DELETE FROM purchase_lines
  WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE organization_id = p_org_id);
  DELETE FROM purchase_orders WHERE organization_id = p_org_id;

  DELETE FROM quotation_lines
  WHERE quotation_id IN (SELECT id FROM quotations WHERE organization_id = p_org_id);
  DELETE FROM quotations WHERE organization_id = p_org_id;

  DELETE FROM purchase_request_lines
  WHERE purchase_request_id IN (SELECT id FROM purchase_requests WHERE organization_id = p_org_id);
  DELETE FROM purchase_requests WHERE organization_id = p_org_id;

  DELETE FROM recipe_lines
  WHERE recipe_id IN (SELECT id FROM product_recipes WHERE organization_id = p_org_id);
  DELETE FROM product_recipes WHERE organization_id = p_org_id;
  DELETE FROM product_cost_snapshots WHERE organization_id = p_org_id;
  DELETE FROM crm_activities WHERE organization_id = p_org_id;

  DELETE FROM sync_events WHERE organization_id = p_org_id;
  DELETE FROM idempotency_keys WHERE organization_id = p_org_id;

  DELETE FROM products WHERE organization_id = p_org_id;
  DELETE FROM customers WHERE organization_id = p_org_id;
  DELETE FROM suppliers WHERE organization_id = p_org_id;
  DELETE FROM cash_bank_accounts WHERE organization_id = p_org_id;
  DELETE FROM purchase_categories WHERE organization_id = p_org_id;
  DELETE FROM product_categories WHERE organization_id = p_org_id;

  PERFORM public.seed_demo_master_data(p_org_id);

  UPDATE app_settings
  SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object(
        'onboarding',
        COALESCE(settings->'onboarding', '{}'::jsonb) || jsonb_build_object('last_reset_at', now())
      ),
      updated_at = now()
  WHERE organization_id = p_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_demo_master_data(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_demo_organization(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_demo_master_data(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_demo_organization(UUID) TO authenticated;
