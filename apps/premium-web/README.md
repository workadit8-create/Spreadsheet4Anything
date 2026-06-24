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

## Deploy

Vercel (nanti) — project terpisah, root directory `apps/premium-web`.
