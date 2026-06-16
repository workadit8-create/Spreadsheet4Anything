#!/usr/bin/env bash
# Deploy web app untuk satu client: sync kode + clasp push + redeploy.
set -euo pipefail

CLIENT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$CLIENT_DIR/../../" && pwd)"
DESC="${1:-update}"

if [ -f "$CLIENT_DIR/client.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$CLIENT_DIR/client.env"
  set +a
fi

if [ -z "${CLASP_DEPLOY_ID:-}" ]; then
  echo "CLASP_DEPLOY_ID kosong. Isi di client.env" >&2
  exit 1
fi

"$ROOT/scripts/sync-client-code.sh" "$(basename "$(dirname "$CLIENT_DIR")")/$(basename "$CLIENT_DIR")"

cd "$CLIENT_DIR"
echo "==> clasp push ($CLIENT_NAME)"
clasp push --force

echo "==> clasp redeploy ($CLASP_DEPLOY_ID)"
clasp redeploy "$CLASP_DEPLOY_ID" --description "$DESC"

echo "==> Deploy selesai untuk: ${CLIENT_NAME:-client}"
