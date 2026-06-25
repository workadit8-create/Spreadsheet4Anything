# TIRTA CATERING — Premium Web (produksi)

Tenant produksi terpisah dari **hybrid-lab** (akun lab `workadit8@gmail.com`).

| | Lab (testing) | Produksi |
|---|---|---|
| **Slug** | `hybrid-lab` | `tirta-catering` |
| **Nama di app** | HYBRID LAB (Testing) | TIRTA CATERING |
| **User** | workadit8@gmail.com | owner Tirta (email terpisah) |
| **URL login** | https://premium-web-ruby.vercel.app/login | sama |

## Setup (sekali)

1. Edit email owner di `scripts/onboard-premium-tirta-catering.sql` (blok CONFIG)
2. Jalankan:

```bash
./scripts/run-supabase-migration-file.sh onboard-premium-tirta-catering.sql
```

3. Kirim kredensial login ke owner (password sementara jika user baru dibuat script)
4. Owner login → Dashboard → ikuti **checklist onboarding**

## Isi tenant produksi

- COA default (auto)
- Gudang MAIN, satuan PCS/KG/GR
- Kategori produk catering (bahan baku, menu, jasa)
- Add-on **project** diaktifkan (pilot Tirta)
- Profil usaha: TIRTA CATERING, Tangerang

## Setelah onboarding

Owner mengisi sendiri di app:

- Logo & telepon (Master → Profil usaha)
- Kas/bank operasional
- Customer & menu/produk
- Saldo awal (Jurnal Manual)
- Smoke test 1 invoice

## Catatan

- Plan: Rp 2 jt/tahun (catatan internal di `app_settings.onboarding.plan`)
- Data lab **tidak** tercampur — RLS per `organization_id`
