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

### Tab Master Data per peran

| Tab | Owner | Staff | Akuntan |
|-----|-------|-------|---------|
| Customer, Produk, Kategori Produk, Satuan, Supplier | ✓ | ✓ | ✓ |
| COA, Kategori Pembelian | ✓ | — | ✓ |
| Kas & Bank (master rekening) | ✓ | — | — |
| Profil usaha | ✓ | — | — |

Tab yang tidak boleh diedit disembunyikan di UI (bukan hanya error saat simpan).

### Halaman operasional — posting jurnal

Tombol **Post jurnal** dan **Batal** disembunyikan untuk **staff** (banner penjelasan ditampilkan). Staff tetap bisa: buat invoice/PO, hapus CONFIRMED, catat pelunasan, mutasi kas.

| Halaman | Staff | Akuntan / Owner |
|---------|-------|-----------------|
| Riwayat invoice / PO | Lihat, hapus | + Post / Batal |
| Piutang / Hutang (invoice/PO + pelunasan) | Bayar, simpan pelunasan | + Post / Batal |
| Kas & Bank (mutasi manual) | Simpan mutasi | + Post / Batal manual |

## Kelola tim (fase B)

Menu **Tim & Akses** (`/dashboard/tim`) — **owner saja**.

- `GET /api/org/members` — daftar anggota + email
- `POST /api/org/members` — tambah staff/akuntan (buat akun Auth baru jika email belum ada)
- `PATCH /api/org/members/[id]` — ubah peran
- `DELETE /api/org/members/[id]` — hapus dari organisasi

Password sementara ditampilkan sekali saat akun baru dibuat; bagikan ke anggota tim.

Mutasi anggota lewat RPC Postgres (`add_org_member`, `update_org_member_role`, `remove_org_member`) — **tidak butuh** `SUPABASE_SERVICE_ROLE_KEY` di Vercel.

```bash
./scripts/run-supabase-migration-file.sh 026_org_members_rpc.sql
./scripts/run-supabase-migration-file.sh 027_org_members_mutations_rpc.sql
```

## Migrasi

`025_membership_role_in_rpc.sql` — RPC `get_my_organizations()` mengembalikan kolom `role`.

`026_org_members_rpc.sql` — RPC `get_org_members()` untuk owner melihat daftar tim.

`027_org_members_mutations_rpc.sql` — RPC tambah / ubah / hapus anggota (tanpa service role).

`028_fix_add_org_member_password.sql` — perbaikan generator password di `add_org_member`.

## Ganti password (semua peran)

Menu **Akun** (`/dashboard/akun`) — setiap user bisa ubah password sendiri lewat `POST /api/auth/change-password`.
