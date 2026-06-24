-- Void invoice + jurnal pembalik (alur CONFIRMED → POST → VOID)

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS entry_kind TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS reverses_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_entry_kind_check;

ALTER TABLE journal_entries
  ADD CONSTRAINT journal_entries_entry_kind_check
  CHECK (entry_kind IN ('NORMAL', 'VOID_REVERSAL'));

CREATE INDEX IF NOT EXISTS journal_entries_reverses_idx
  ON journal_entries (reverses_entry_id)
  WHERE reverses_entry_id IS NOT NULL;
