#!/usr/bin/env bash
# Jalankan satu file migration SQL ke Supabase Postgres.
# Usage: ./scripts/run-supabase-migration-file.sh 011_journal_entries.sql
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATE_DIR="$ROOT/scripts/supabase-migrate"
FILE="${1:-}"

if [ -z "$FILE" ]; then
  echo "Usage: $0 <migration-file.sql>" >&2
  echo "Example: $0 011_journal_entries.sql" >&2
  exit 1
fi

if [[ "$FILE" != /* ]]; then
  SQL_FILE="$ROOT/supabase/migrations/$FILE"
else
  SQL_FILE="$FILE"
fi

if [ ! -f "$SQL_FILE" ]; then
  echo "File tidak ada: $SQL_FILE" >&2
  exit 1
fi

if [ ! -f "$ROOT/clients/hybrid/supabase.db.env" ]; then
  echo "Buat dulu: clients/hybrid/supabase.db.env" >&2
  exit 1
fi

if [ ! -d "$MIGRATE_DIR/node_modules/pg" ]; then
  npm install --prefix "$MIGRATE_DIR" --silent
fi

export MIGRATION_SQL_FILE="$SQL_FILE"
node "$MIGRATE_DIR/run-file.mjs"
