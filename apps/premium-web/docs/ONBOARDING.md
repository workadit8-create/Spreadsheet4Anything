# Onboarding client baru — Premium Web

Panduan menambah **client kedua (dan seterusnya)** ke satu instance Premium Web + Supabase.

## Ringkasan alur

```
Admin (SQL)          User (app)
───────────          ──────────
1. Buat user Auth    4. Login
2. Buat org +        5. Dashboard → checklist setup
   membership        6. Master → profil, COA, kas
3. seed defaults     7. Jurnal saldo awal
                     8. Smoke test invoice
```

Estimasi waktu: **20–30 menit** per client (setelah Auth user sudah ada).

---

## 1. Buat user di Supabase Auth

Supabase Dashboard → **Authentication → Users → Add user**

Catat email yang dipakai login.

---

## 2. Jalankan script onboarding SQL

File: [`scripts/onboard-premium-client.sql`](../../scripts/onboard-premium-client.sql)

Edit blok CONFIG di dalam file:

| Variabel | Contoh |
|----------|--------|
| `v_slug` | `acme-corp` |
| `v_name` | `PT Acme Corp` |
| `v_email` | `owner@acme.com` |

Jalankan di **SQL Editor** (butuh akses postgres / service role).

Script akan:

- Insert/update `organizations`
- Panggil `seed_organization_defaults()` → gudang, satuan, add-on stub, `app_settings`
- Insert `memberships` role `owner`

**Migrasi terkait:** `021_seed_organization_defaults.sql`

### Verifikasi

```sql
SELECT o.slug, o.name, m.role, u.email
FROM organizations o
JOIN memberships m ON m.organization_id = o.id
JOIN auth.users u ON u.id = m.user_id
WHERE o.slug = 'acme-corp';
```

---

## 3. User login & checklist di app

Production: https://premium-web-ruby.vercel.app

Setelah login, **Dashboard** menampilkan **Checklist onboarding** (sembunyi otomatis kalau semua langkah selesai).

| Langkah | Di app | Catatan |
|---------|--------|---------|
| Profil usaha | Master Data → Profil usaha | Nama, alamat, logo |
| COA | Master → tab COA (buka sekali) | Auto-seed ≥10 akun |
| Kas & bank | Master → Kas & Bank | Min. 1 rekening + akun COA |
| Gudang | Otomatis dari SQL | `MAIN` — Gudang Utama |
| Saldo awal | Jurnal Manual → Kas & Bank alokasi | Jurnal dulu, mutasi alokasi |
| Customer | Master → Customer | Untuk invoice proper |
| Smoke test | Penjualan → posting jurnal | 1 invoice POSTED |

---

## 4. Saldo awal (detail)

1. **Jurnal Manual** — debit/kredit saldo awal (mis. Kas, Bank, Modal)
2. **Kas & Bank** → alokasi saldo per rekening (kartu saldo, tanpa jurnal duplikat)

Lihat hint di halaman Kas & Bank di app.

---

## 5. Smoke test minimal

1. Master: customer + produk + rekening kas
2. **Penjualan** → buat invoice → **Riwayat** → Post jurnal
3. Cek **Jurnal** dan **Laporan**
4. (Opsional) **Pembelian** → PO → post jurnal

---

## Troubleshooting

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| Login OK tapi "Tidak ada organisasi" | Belum ada `memberships` | Jalankan ulang script SQL |
| Posting invoice gagal | COA / gudang kosong | Buka Master COA; cek gudang MAIN |
| Permission denied | Migrasi belum jalan | `./scripts/run-supabase-migration-file.sh …` |
| Sidebar masih nama lama | Cache | Hard refresh; simpan Profil usaha |

---

## File terkait

- `scripts/onboard-premium-client.sql` — entry point admin
- `supabase/migrations/021_seed_organization_defaults.sql` — fungsi seed
- `src/lib/org/require-user-org.ts` — isolasi org di API
- `src/lib/org/onboarding-status.ts` — logika checklist

---

## Client ketiga, keempat, …

Ulangi langkah 1–2 dengan `slug` dan `email` berbeda. Satu Supabase, banyak baris `organizations` — data terisolasi RLS + `requireUserOrg()`.

Add-on (POS, proyek, CRM) diaktifkan per org lewat tabel `tenant_addons` — menyusul setelah multi-client stabil.

## Tenant demo (publik)

Akun khusus untuk orang yang ingin coba aplikasi: [`docs/DEMO-ACCOUNTS.md`](docs/DEMO-ACCOUNTS.md)

Setup:

```bash
./scripts/run-supabase-migration-file.sh onboard-premium-demo.sql
```
