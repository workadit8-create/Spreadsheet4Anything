#!/usr/bin/env bash
# Isi Environment Variables di Vercel dari .env.local (jalankan sekali setelah deploy pertama).
# Usage: ./scripts/setup-premium-vercel-env.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/premium-web"
ENV_FILE="$APP/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Buat $ENV_FILE dulu (lihat apps/premium-web/.env.example)" >&2
  exit 1
fi

cd "$APP"

echo "Upload env ke Vercel production dari .env.local ..."
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  key=$(echo "$key" | xargs)
  val=$(echo "$val" | xargs)
  [[ -z "$key" || -z "$val" ]] && continue
  echo "  → $key"
  printf '%s' "$val" | npx vercel@latest env add "$key" production --force --yes
done < "$ENV_FILE"

echo ""
echo "Redeploy agar env aktif:"
echo "  cd apps/premium-web && npx vercel deploy --prod --yes"
