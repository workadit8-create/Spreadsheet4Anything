#!/usr/bin/env bash
# Isi Environment Variables di Vercel dari .env.local (jalankan sekali setelah deploy pertama).
# Usage: ./scripts/setup-premium-vercel-env.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/premium-web"
ENV_FILE="$APP/.env.local"
# shellcheck source=scripts/premium-vercel-lib.sh
source "$ROOT/scripts/premium-vercel-lib.sh"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Buat $ENV_FILE dulu (lihat apps/premium-web/.env.example)" >&2
  exit 1
fi

VERCEL_BIN="$(premium_vercel_bin "$APP" "$ROOT")"

echo "Upload env ke Vercel production dari .env.local ..."
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  key=$(echo "$key" | xargs)
  val=$(echo "$val" | xargs)
  [[ -z "$key" || -z "$val" ]] && continue
  echo "  → $key"
  printf '%s' "$val" | "$VERCEL_BIN" env add "$key" production --force --yes
done < "$ENV_FILE"

echo ""
echo "Redeploy agar env aktif:"
echo "  cd apps/premium-web && npm run vercel:deploy"
