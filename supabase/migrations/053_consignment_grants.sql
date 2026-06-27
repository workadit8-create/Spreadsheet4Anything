-- GRANT untuk tabel titip jual (052 buat RLS tapi belum grant ke authenticated)

GRANT SELECT, INSERT, UPDATE, DELETE ON consignment_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON consignment_receipt_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON consignment_settlements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON consignment_liabilities TO authenticated;
