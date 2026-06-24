#!/usr/bin/env bash
# Jalankan 001_mvp_v1.sql langsung ke Supabase Postgres.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATE_DIR="$ROOT/scripts/supabase-migrate"

if [ ! -f "$ROOT/clients/hybrid/supabase.db.env" ]; then
  echo "Buat dulu: clients/hybrid/supabase.db.env" >&2
  echo "  cp clients/hybrid/supabase.db.env.example clients/hybrid/supabase.db.env" >&2
  echo "  # isi DATABASE_URL dari Supabase → Settings → Database → Connection string" >&2
  exit 1
fi

if [ ! -d "$MIGRATE_DIR/node_modules/pg" ]; then
  echo "==> npm install (pg)..."
  npm install --prefix "$MIGRATE_DIR" --silent
fi

node "$MIGRATE_DIR/run.mjs"
