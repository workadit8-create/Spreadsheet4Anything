# Role & akses — Premium Web

Peran disimpan di `memberships.role` per organisasi.

## Peran

| Role | Label | Ringkasan |
|------|-------|-----------|
| `owner` | Owner | Semua menu operasional client; **bukan** admin add-on |
| `staff` | Staff | Operasional penjualan/pembelian, piutang/hutang, kas |
| `akuntan` | Akuntan | Jurnal, posting, laporan, master COA/kategori |
| `cashier` | Kasir | (cadangan POS) |

Menu sidebar difilter sesuai matriks di `src/lib/org/roles.ts` (port dari GAS hybrid).

## Add-on — hanya admin platform

**Owner client tidak bisa mengaktifkan add-on.**

Hanya email di `PLATFORM_ADMIN_EMAILS` (Vercel env) yang:
- Melihat panel **Admin · Add-on** di sidebar
- Bisa `PATCH /api/org/addons`

Client produksi: add-on tetap via SQL admin (`scripts/enable-project-addon-hybrid-lab.sql` atau setara).

```bash
# Vercel → Environment Variables
PLATFORM_ADMIN_EMAILS=workadit8@gmail.com
```

## Role play hybrid-lab

```bash
./scripts/run-supabase-migration-file.sh onboard-premium-hybrid-lab-roles.sql
```

| Email | Password | Role |
|-------|----------|------|
| workadit8@gmail.com | (akun Anda) | owner |
| staff.hybrid@premium-web.app | HybridStaff2026! | staff |
| akuntan.hybrid@premium-web.app | HybridAkuntan2026! | akuntan |

## Guard API (fase A)

| Aksi | Role |
|------|------|
| Posting jurnal / void | owner, akuntan |
| Jurnal manual | owner, akuntan |
| Master kas & bank | owner |
| Master COA / kategori pembelian | owner, akuntan |
| Profil usaha & logo | owner |
| Toggle add-on | admin platform saja |

## Migrasi

`025_membership_role_in_rpc.sql` — RPC `get_my_organizations()` mengembalikan kolom `role`.
