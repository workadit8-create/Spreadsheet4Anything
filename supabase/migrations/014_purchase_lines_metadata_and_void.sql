-- Pembelian: metadata baris + void PO (mirror sales)

ALTER TABLE purchase_lines
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN purchase_lines.metadata IS
  'transactionId, akunPembelian, metode (Tunai|Kredit), bayar, kurangBayar, unitCode, purchaseCategoryId';

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
