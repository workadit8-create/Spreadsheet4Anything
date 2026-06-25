-- Quotation & Purchase Request (pre-documents, no journal until convert to Invoice/PO)

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quotation_no TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  quotation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'AKTIF',
  keterangan TEXT,
  project_code TEXT,
  total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  sales_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
  converted_order_no TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, quotation_no)
);

CREATE TABLE IF NOT EXISTS quotation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  qty NUMERIC(18, 4) NOT NULL DEFAULT 1,
  unit_code TEXT,
  unit_price NUMERIC(18, 2) NOT NULL DEFAULT 0,
  diskon NUMERIC(18, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pr_no TEXT NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'AKTIF',
  keterangan TEXT,
  project_code TEXT,
  total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  converted_po_no TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, pr_no)
);

CREATE TABLE IF NOT EXISTS purchase_request_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  purchase_category_id UUID REFERENCES purchase_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  qty NUMERIC(18, 4) NOT NULL DEFAULT 1,
  unit_code TEXT,
  unit_cost NUMERIC(18, 2) NOT NULL DEFAULT 0,
  diskon NUMERIC(18, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotations_org_date ON quotations(organization_id, quotation_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_org_date ON purchase_requests(organization_id, request_date DESC);

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_request_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON quotations FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_insert ON quotations FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_update ON quotations FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_delete ON quotations FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY ql_select ON quotation_lines FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM quotations q
    WHERE q.id = quotation_id
      AND q.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY ql_insert ON quotation_lines FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM quotations q
    WHERE q.id = quotation_id
      AND q.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY ql_update ON quotation_lines FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM quotations q
    WHERE q.id = quotation_id
      AND q.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY ql_delete ON quotation_lines FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM quotations q
    WHERE q.id = quotation_id
      AND q.organization_id IN (SELECT public.user_organization_ids())
  )
);

CREATE POLICY tenant_select ON purchase_requests FOR SELECT
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_insert ON purchase_requests FOR INSERT
  WITH CHECK (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_update ON purchase_requests FOR UPDATE
  USING (organization_id IN (SELECT public.user_organization_ids()));
CREATE POLICY tenant_delete ON purchase_requests FOR DELETE
  USING (organization_id IN (SELECT public.user_organization_ids()));

CREATE POLICY prl_select ON purchase_request_lines FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM purchase_requests pr
    WHERE pr.id = purchase_request_id
      AND pr.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY prl_insert ON purchase_request_lines FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM purchase_requests pr
    WHERE pr.id = purchase_request_id
      AND pr.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY prl_update ON purchase_request_lines FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM purchase_requests pr
    WHERE pr.id = purchase_request_id
      AND pr.organization_id IN (SELECT public.user_organization_ids())
  )
);
CREATE POLICY prl_delete ON purchase_request_lines FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM purchase_requests pr
    WHERE pr.id = purchase_request_id
      AND pr.organization_id IN (SELECT public.user_organization_ids())
  )
);
