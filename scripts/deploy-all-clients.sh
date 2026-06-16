#!/usr/bin/env bash
# Deploy semua client aktif: root (client 1) + setiap folder clients/*/ dengan client.env
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESC="${1:-update}"

echo "==> Deploy Client 1 (root)"
"$ROOT/scripts/deploy.sh" "$DESC"

for dir in "$ROOT"/clients/*/; do
  [ -d "$dir" ] || continue
  name="$(basename "$dir")"
  if [ "$name" = "_template" ]; then continue
  if [ ! -f "$dir/client.env" ]; then
    echo "==> Skip $name (belum ada client.env)"
    continue
  fi
  if [ ! -x "$dir/deploy.sh" ]; then continue
  echo ""
  echo "==> Deploy $name"
  "$dir/deploy.sh" "$DESC"
done

echo ""
echo "==> Deploy semua client selesai"
