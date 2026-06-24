-- Status pelunasan piutang + void (alur CONFIRMED → POST → VOID)

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('CONFIRMED', 'POSTED', 'VOIDED'));

-- Backfill: pelunasan yang sudah diposting via posting_jobs
UPDATE payments p
SET status = 'POSTED'
WHERE p.doc_type = 'PIUTANG_PAYMENT'
  AND p.status = 'CONFIRMED'
  AND EXISTS (
    SELECT 1 FROM posting_jobs j
    WHERE j.doc_type = 'PIUTANG_PAYMENT'
      AND j.doc_id = p.id
      AND j.status = 'POSTED'
  );
