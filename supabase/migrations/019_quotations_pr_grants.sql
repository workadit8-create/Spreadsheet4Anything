-- Fix: tabel baru perlu GRANT eksplisit (004 hanya berlaku untuk tabel yang sudah ada saat itu)

GRANT SELECT, INSERT, UPDATE, DELETE ON quotations, quotation_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON purchase_requests, purchase_request_lines TO authenticated;
