-- Flag PKP supplier untuk PPN masukan di pembelian
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
