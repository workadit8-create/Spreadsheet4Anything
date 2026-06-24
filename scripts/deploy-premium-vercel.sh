#!/usr/bin/env bash
# Deploy apps/premium-web ke Vercel (production).
# Butuh: npx vercel login (sekali) ATAU env VERCEL_TOKEN
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/premium-web"

if [[ ! -f "$APP/package.json" ]]; then
  echo "Tidak ada apps/premium-web" >&2
  exit 1
fi

cd "$APP"

echo "==> Build lokal (cek error sebelum deploy)..."
npm run build

echo "==> Deploy ke Vercel..."
if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  npx vercel deploy --prod --yes --token "$VERCEL_TOKEN"
else
  npx vercel deploy --prod
fi

echo ""
echo "Setelah deploy pertama:"
echo "  1. Supabase → Auth → URL Configuration"
echo "     Site URL: https://<domain-vercel>"
echo "     Redirect: https://<domain-vercel>/auth/callback"
echo "  2. Vercel → Settings → Environment Variables (lihat apps/premium-web/.env.example)"
