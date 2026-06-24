# Premium Web (Next.js + Supabase)

UI tier **Premium** — terpisah dari GAS Standard (`clients/dev`, `clients/demo`, client1 di repo root).

## Arsitektur (Tahap D)

| Aspek | Premium | Standard (GAS) |
|-------|---------|----------------|
| UI | Next.js (`apps/premium-web`) | GAS web app (`clients/*`) |
| Database transaksi | Supabase | Google Spreadsheet |
| Jurnal | `journal_entries` + `journal_lines` | BACKENDengine spreadsheet |
| Bridge ke sheet / GAS | **Tidak** | Native |

Alur posting Premium:

1. Invoice / pelunasan piutang → `sales_orders` / `payments` di Supabase
2. `posting_jobs` (queue)
3. Worker TypeScript → aturan jurnal (port dari `api.js`) → Supabase
4. Lihat di **Dashboard → Jurnal** atau **Laporan**

Env `HYBRID_BACKEND_URL` / `HYBRID_DATABASE_SHEET_ID` **tidak diperlukan** untuk posting (legacy bridge).

## Setup cepat

### 1. Jalankan migration SQL

Supabase Dashboard → **SQL Editor** → jalankan semua file di urutan:

`../../supabase/migrations/001_mvp_v1.sql` … `011_journal_entries.sql`

Minimal untuk Tahap D: migration **011** (`journal_entries`, `journal_lines`).

### 2. Buat user Auth

Supabase → **Authentication → Users → Add user** (email + password).

### 3. Hubungkan user ke tenant HYBRID LAB

SQL Editor (ganti email):

```sql
INSERT INTO memberships (organization_id, user_id, role)
SELECT o.id, u.id, 'owner'
FROM organizations o
CROSS JOIN auth.users u
WHERE o.slug = 'hybrid-lab'
  AND u.email = 'email-kamu@example.com'
ON CONFLICT (organization_id, user_id) DO NOTHING;
```

### 4. Env lokal

```bash
cp .env.example .env.local
```

Wajib:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Opsional (tidak dipakai Tahap D):

- `HYBRID_*` — bridge GAS/sheet (deprecated untuk Premium)

### 5. Dev server

```bash
npm install
npm run dev
```

Buka http://localhost:3000

## Uji alur transaksi

1. **Master Data** — customer, produk, kas/bank, COA
2. **Invoice** — simpan → status `CONFIRMED` (belum jurnal)
3. **Post jurnal** — dari daftar invoice → `POSTED` + `journal_entries`
4. **Batal (void)** — invoice `POSTED` → jurnal pembalik + status `VOIDED`
5. **Hapus** — hanya invoice `CONFIRMED` (belum posting)
6. **Piutang** — pelunasan hanya untuk invoice `POSTED`
7. **Jurnal** — `/dashboard/jurnal` (read-only)

Verifikasi di Supabase Table Editor: `journal_entries`, `journal_lines`.

## Deploy Vercel

**Production:** https://premium-web-ruby.vercel.app

### Deploy ulang (dari root repo)

```bash
./scripts/deploy-premium-vercel.sh
```

Atau cepat:

```bash
cd apps/premium-web && npx vercel deploy --prod --yes
```

### Env di Vercel (wajib sekali)

Setelah deploy pertama, isi env dari `.env.local`:

```bash
./scripts/setup-premium-vercel-env.sh
cd apps/premium-web && npx vercel deploy --prod --yes
```

Atau manual: Vercel → **premium-web** → Settings → Environment Variables (lihat `.env.example`).

### Supabase Auth (wajib untuk login di Vercel)

Supabase → Authentication → URL Configuration:

| Field | Value |
|-------|-------|
| Site URL | `https://premium-web-ruby.vercel.app` |
| Redirect URLs | `https://premium-web-ruby.vercel.app/auth/callback` |

## Legacy (tidak dipakai Tahap D)

- Sync ke sheet `PEMASUKAN` / `PELUNASAN_PIUTANG` via `clients/hybrid/backend/PremiumSync.js`
- Endpoint `/api/posting/sync-sheet` (deprecated, return 400)
- Deploy `backend-hybrid` hanya relevan jika masih menguji bridge manual

Untuk produk Standard (spreadsheet + GAS), gunakan `clients/README.md`.
