-- Invoice proper: baris sales_lines butuh metadata (transactionId, akun, diskon, bayar per baris)

ALTER TABLE sales_lines
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN sales_lines.metadata IS
  'Per-baris: transactionId, akunPendapatan, diskon, unitCode, bayar, kurangBayar, paymentStatus';

-- Refresh PostgREST schema cache (Supabase API)
NOTIFY pgrst, 'reload schema';
