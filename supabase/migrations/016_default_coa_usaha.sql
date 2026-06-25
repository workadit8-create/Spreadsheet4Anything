-- COA default UMKM: terisi otomatis untuk organisasi baru + backfill org yang sudah ada.
-- Metadata: sub_category + saldo_normal untuk laporan Neraca / Laba Rugi / Arus Kas.

CREATE OR REPLACE FUNCTION public.seed_default_coa_for_org(p_org_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INT := 0;
BEGIN
  INSERT INTO coa_accounts (organization_id, code, name, account_type, active, metadata)
  SELECT
    p_org_id,
    v.code,
    v.name,
    v.account_type,
    true,
    jsonb_build_object(
      'default_seed', true,
      'sub_category', v.sub_category,
      'saldo_normal', v.saldo_normal
    )
  FROM (
    VALUES
      ('1-10001', 'Kas', 'Aset', 'Aset Lancar', 'Debit'),
      ('1-10002', 'Bank', 'Aset', 'Aset Lancar', 'Debit'),
      ('1-11001', 'Piutang Usaha', 'Aset', 'Aset Lancar', 'Debit'),
      ('1-11002', 'Persediaan Barang', 'Aset', 'Aset Lancar', 'Debit'),
      ('1-12001', 'Peralatan', 'Aset', 'Aset Tetap', 'Debit'),
      ('1-12002', 'Akumulasi Penyusutan Peralatan', 'Aset', 'Aset Tetap', 'Kredit'),
      ('2-10001', 'Utang Usaha', 'Kewajiban', 'Kewajiban Lancar', 'Kredit'),
      ('2-10002', 'Utang Pajak', 'Kewajiban', 'Kewajiban Lancar', 'Kredit'),
      ('2-20001', 'Utang Bank Jangka Panjang', 'Kewajiban', 'Kewajiban Jangka Panjang', 'Kredit'),
      ('3-10001', 'Modal Pemilik', 'Ekuitas', 'Ekuitas', 'Kredit'),
      ('3-10002', 'Laba Ditahan', 'Ekuitas', 'Ekuitas', 'Kredit'),
      ('3-10003', 'PRIVE', 'Ekuitas', 'Ekuitas', 'Debit'),
      ('4-10001', 'Pendapatan', 'Pendapatan', 'Pendapatan Usaha', 'Kredit'),
      ('4-10002', 'Pendapatan Lain-lain', 'Pendapatan', 'Pendapatan Usaha', 'Kredit'),
      ('5-10001', 'Beban', 'Beban', 'Beban Operasional', 'Debit'),
      ('5-10002', 'Beban HPP', 'Beban', 'HPP', 'Debit'),
      ('5-11001', 'Beban Gaji', 'Beban', 'Beban Operasional', 'Debit'),
      ('5-11002', 'Beban Sewa', 'Beban', 'Beban Operasional', 'Debit'),
      ('5-11003', 'Beban Listrik', 'Beban', 'Beban Operasional', 'Debit'),
      ('5-11004', 'Beban Administrasi', 'Beban', 'Beban Operasional', 'Debit'),
      ('5-11005', 'Beban Lain-lain', 'Beban', 'Beban Operasional', 'Debit')
  ) AS v(code, name, account_type, sub_category, saldo_normal)
  WHERE NOT EXISTS (
    SELECT 1 FROM coa_accounts c
    WHERE c.organization_id = p_org_id AND c.name = v.name
  )
  AND NOT EXISTS (
    SELECT 1 FROM coa_accounts c
    WHERE c.organization_id = p_org_id AND c.code = v.code
  )
  AND NOT (
    v.name = 'Beban'
    AND EXISTS (
      SELECT 1 FROM coa_accounts c
      WHERE c.organization_id = p_org_id
        AND c.name IN ('Beban', 'Beban Operasional')
    )
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.seed_default_coa_for_org(UUID) IS
  'Seed COA default UMKM (idempotent per nama akun). Dipanggil trigger org baru + app Premium Web.';

GRANT EXECUTE ON FUNCTION public.seed_default_coa_for_org(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.trg_seed_default_coa_on_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_coa_for_org(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_default_coa_on_org ON organizations;
CREATE TRIGGER seed_default_coa_on_org
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_seed_default_coa_on_org();

-- Backfill semua organisasi yang belum punya struktur lengkap
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM organizations LOOP
    PERFORM public.seed_default_coa_for_org(r.id);
  END LOOP;
END $$;

-- Perkaya metadata akun seed lama (hybrid-lab) tanpa mengubah nama/kode
UPDATE coa_accounts c
SET metadata = c.metadata
  || jsonb_build_object('sub_category', v.sub_category, 'saldo_normal', v.saldo_normal)
FROM (
  VALUES
    ('Kas', 'Aset Lancar', 'Debit'),
    ('Bank', 'Aset Lancar', 'Debit'),
    ('Piutang Usaha', 'Aset Lancar', 'Debit'),
    ('Pendapatan', 'Pendapatan Usaha', 'Kredit'),
    ('Beban Operasional', 'Beban Operasional', 'Debit')
) AS v(name, sub_category, saldo_normal)
WHERE c.name = v.name
  AND NOT (c.metadata ? 'sub_category');
