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


Vercel (nanti) — project terpisah, root directory `apps/premium-web`.
