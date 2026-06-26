-- Akun PPN Masukan untuk jurnal pembelian (pajak masukan)
INSERT INTO coa_accounts (organization_id, code, name, account_type, active, metadata)
SELECT o.id, '1-11003', 'PPN Masukan', 'Aset', true, '{"default_seed":true,"sub_category":"Aset Lancar","saldo_normal":"Debit"}'::jsonb
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM coa_accounts c
  WHERE c.organization_id = o.id AND c.name = 'PPN Masukan'
);
