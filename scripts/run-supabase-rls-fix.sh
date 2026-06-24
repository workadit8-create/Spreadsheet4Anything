#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATE_DIR="$ROOT/scripts/supabase-migrate"
SQL="$ROOT/supabase/migrations/003_fix_rls_membership.sql"

if [ ! -f "$ROOT/clients/hybrid/supabase.db.env" ]; then
  echo "supabase.db.env tidak ada" >&2
  exit 1
fi

if [ ! -d "$MIGRATE_DIR/node_modules/pg" ]; then
  npm install --prefix "$MIGRATE_DIR" --silent
fi

node --input-type=module -e "
import fs from 'fs';
import pg from 'pg';
import path from 'path';
const root = '$ROOT';
const env = fs.readFileSync(path.join(root, 'clients/hybrid/supabase.db.env'), 'utf8');
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = fs.readFileSync('$SQL', 'utf8');
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query(sql);
console.log('OK RLS fix applied');
await c.end();
"
