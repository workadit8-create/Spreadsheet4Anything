#!/usr/bin/env bash
# Cek schema + link user Auth ke hybrid-lab (setelah migration).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATE_DIR="$ROOT/scripts/supabase-migrate"

if [ ! -f "$ROOT/clients/hybrid/supabase.db.env" ]; then
  echo "Buat clients/hybrid/supabase.db.env dulu (lihat supabase.db.env.example)" >&2
  exit 1
fi

if [ ! -d "$MIGRATE_DIR/node_modules/pg" ]; then
  npm install --prefix "$MIGRATE_DIR" --silent
fi

node "$MIGRATE_DIR/post-setup.mjs"
