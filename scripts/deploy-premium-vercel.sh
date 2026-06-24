#!/usr/bin/env bash
# Deploy apps/premium-web ke Vercel (production).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/premium-web"
# shellcheck source=scripts/premium-vercel-lib.sh
source "$ROOT/scripts/premium-vercel-lib.sh"

if [[ ! -f "$APP/package.json" ]]; then
  echo "Tidak ada apps/premium-web" >&2
  exit 1
fi

VERCEL_BIN="$(premium_vercel_prepare "$APP" "$ROOT")"

echo "==> Build lokal (cek error sebelum deploy)..."
(cd "$APP" && npm run build)

echo "==> Deploy ke Vercel..."
if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  (cd "$APP" && "$VERCEL_BIN" deploy --prod --yes --token "$VERCEL_TOKEN")
else
  (cd "$APP" && "$VERCEL_BIN" deploy --prod --yes)
fi

echo ""
echo "Production: https://premium-web-ruby.vercel.app"
echo "Supabase Auth → Site URL + Redirect /auth/callback (lihat README)"
