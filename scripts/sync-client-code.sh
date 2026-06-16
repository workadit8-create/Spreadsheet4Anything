#!/usr/bin/env bash
# Salin kode app dari repo root ke folder client (Config.js tetap milik client).
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <clients/client-name>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT_DIR="$(cd "$ROOT/$1" && pwd)"

if [ ! -f "$CLIENT_DIR/Config.js" ]; then
  echo "Config.js tidak ditemukan di $CLIENT_DIR" >&2
  exit 1
fi

echo "==> Sync kode ke $CLIENT_DIR"

for f in "$ROOT"/*.js; do
  base="$(basename "$f")"
  if [ "$base" = "Config.js" ]; then
    continue
  fi
  cp "$f" "$CLIENT_DIR/$base"
done

cp "$ROOT/index.html" "$CLIENT_DIR/index.html"
cp "$ROOT/appsscript.json" "$CLIENT_DIR/appsscript.json"
cp "$ROOT/.claspignore" "$CLIENT_DIR/.claspignore"

echo "==> Sync selesai ($(ls -1 "$CLIENT_DIR"/*.js 2>/dev/null | wc -l | tr -d ' ') file .js)"
