# Akun demo — Premium Web

Organisasi terpisah untuk orang yang ingin mencoba aplikasi **tanpa** mengakses data client produksi (hybrid-lab / TIRTA CATERING).

## Login

| | |
|---|---|
| **URL** | https://premium-web-ruby.vercel.app/login |
| **Email** | `demo@premium-web.app` |
| **Password** | `PremiumDemo2026!` |

User demo **hanya** terhubung ke org `demo` — tidak melihat data organisasi lain.

## Isi tenant demo

- Nama: **Demo Premium Akuntansi**
- COA default (auto)
- Gudang MAIN, satuan PCS/KG/GR
- Contoh: KAS KECIL, Customer Demo, Supplier Demo, Produk Demo

## Setup ulang / perbarui

```bash
./scripts/run-supabase-migration-file.sh onboard-premium-demo.sql
```

Script idempotent (`ON CONFLICT` / `WHERE NOT EXISTS`).

## Reset password demo

Jika perlu ganti password, jalankan di SQL Editor (ganti password baru):

```sql
UPDATE auth.users
SET encrypted_password = crypt('PasswordBaruAnda', gen_salt('bf')),
    updated_at = now()
WHERE email = 'demo@premium-web.app';
```

## Catatan keamanan

- Ini akun **publik demo** — jangan simpan data rahasia di tenant ini.
- Untuk client produksi, gunakan `scripts/onboard-premium-client.sql` dengan user Auth terpisah per client.
