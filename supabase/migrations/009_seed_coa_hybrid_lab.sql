-- Seed COA dasar hybrid-lab (mirror akun yang dipakai di bridge invoice + kas)
INSERT INTO coa_accounts (organization_id, code, name, account_type, active)
SELECT o.id, v.code, v.name, v.account_type, true
FROM organizations o
CROSS JOIN (
  VALUES
    ('1-10001', 'Kas', 'Aset'),
    ('1-20001', 'Bank', 'Aset'),
    ('4-10001', 'Pendapatan', 'Pendapatan'),
    ('5-10001', 'Beban Operasional', 'Beban')
) AS v(code, name, account_type)
WHERE o.slug = 'hybrid-lab'
  AND NOT EXISTS (
    SELECT 1 FROM coa_accounts c
    WHERE c.organization_id = o.id AND c.code = v.code
  );
