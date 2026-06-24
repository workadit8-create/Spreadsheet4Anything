# Premium Web (Next.js + Supabase)

UI tier **Premium** — terpisah dari GAS Standard (dev/demo/client1).

## Setup cepat

### 1. Jalankan migration SQL

Supabase Dashboard → **SQL Editor** → paste isi:

`../../supabase/migrations/001_mvp_v1.sql`

→ **Run**

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
cp ../../clients/hybrid/supabase.env.example .env.local
# isi NEXT_PUBLIC_SUPABASE_URL, keys, dll.
```

### 5. Dev server

```bash
npm install
npm run dev
```

Buka http://localhost:3000

## Step 3 — Invoice bridge (Premium → BACKENDengine)

1. Tambahkan env bridge di `.env.local` (lihat `clients/hybrid/supabase.env.example`):
   - `HYBRID_BACKEND_URL` — dari `clients/hybrid/client.env` → `BACKEND_WEBAPP_URL`
   - `HYBRID_BACKEND_API_KEY` — `BACKEND_API_KEY`
   - `HYBRID_DATABASE_SHEET_ID` — `DATABASE_ID`

2. Buka http://localhost:3000/dashboard/invoices

3. **Buat invoice + post ke jurnal** — alur:
   - `sales_orders` + `sales_lines` di Supabase
   - `posting_jobs` status `PENDING`
   - Worker POST ke BACKENDengine (`modul: PEMASUKAN`)
   - Status → `POSTED` atau `FAILED` (+ `posting_job_logs`)

4. Verifikasi jurnal di spreadsheet **Backend Engine** HYBRID LAB.

## Step 4 — Sync balik ke sheet PEMASUKAN

Setelah jurnal POSTED, worker menulis baris ke sheet **PEMASUKAN** (client DB).

1. Deploy backend hybrid (wajib setelah update code):
   ```bash
   ./scripts/deploy-to.sh backend-hybrid "Step 4 PremiumSync"
   ```

2. Buka http://localhost:3000/dashboard/laporan

3. Invoice POSTED tanpa sheet sync → **Retry sync sheet PEMASUKAN**

4. Cek client DB spreadsheet → sheet **PEMASUKAN** (kolom Posted = TRUE)

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

## Deploy (legacy note)
