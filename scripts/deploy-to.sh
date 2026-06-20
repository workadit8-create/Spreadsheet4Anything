#!/usr/bin/env bash
# Deploy ke satu target — push + redeploy sekaligus.
#
# Usage:
#   ./scripts/deploy-to.sh <target> "deskripsi perubahan"
#
# Target:
#   dev       — sandbox dev (clients/dev)
#   demo      — akun demo
#   client1   — client 1 production (repo root)
#   backend-demo | backend-dev — backend engine saja
#   all       — semua client yang punya client.env (+ client1)
#
# Contoh:
#   ./scripts/deploy-to.sh dev "fix: dashboard load"
#   ./scripts/deploy-to.sh demo "fix: dashboard load"
#   ./scripts/deploy-to.sh client1 "fix: dashboard load"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-}"
DESC="${2:-update}"

usage() {
  cat <<EOF
Usage: $0 <target> "deskripsi"

Target:
  dev            Sandbox dev (clients/dev)
  demo           Akun demo
  client1        Client 1 production
  backend-dev    Backend sandbox
  backend-demo   Backend demo
  all            Semua client aktif

Alur disarankan: dev → demo → client1 (jangan skip uji)

EOF
  exit 1
}

deploy_backend() {
  local dir="$1"
  local label="$2"
  local env_file="$dir/client.env"
  if [ ! -f "$env_file" ]; then
    echo "Skip backend $label — client.env tidak ada" >&2
    return 1
  fi
  # shellcheck disable=SC1090
  source "$env_file"
  if [ ! -d "$dir/backend" ] || [ ! -f "$dir/backend/.clasp.json" ]; then
    echo "Skip backend $label — folder backend belum siap" >&2
    return 1
  fi
  if [ -z "${BACKEND_DEPLOY_ID:-}" ]; then
    echo "BACKEND_DEPLOY_ID kosong di $env_file" >&2
    return 1
  fi
  echo "==> Backend $label (push + redeploy)"
  (cd "$dir/backend" && clasp push --force && clasp redeploy "$BACKEND_DEPLOY_ID" --description "$DESC")
}

[ -z "$TARGET" ] && usage

case "$TARGET" in
  dev|sandbox)
    if [ ! -x "$ROOT/clients/dev/deploy.sh" ]; then
      echo "Sandbox dev belum ada. Buat dulu:" >&2
      echo "  ./scripts/provision-client.sh dev \"Sandbox Dev\"" >&2
      exit 1
    fi
    echo "==> Deploy SANDBOX DEV"
    "$ROOT/clients/dev/deploy.sh" "$DESC"
    ;;
  demo)
    if [ ! -x "$ROOT/clients/demo/deploy.sh" ]; then
      echo "Akun demo belum ada." >&2
      exit 1
    fi
    echo "==> Deploy DEMO"
    "$ROOT/clients/demo/deploy.sh" "$DESC"
    ;;
  client1|client|production|prod)
    echo "==> Deploy CLIENT 1 (production)"
    "$ROOT/scripts/deploy.sh" "$DESC"
    ;;
  backend-dev)
    deploy_backend "$ROOT/clients/dev" "dev"
    ;;
  backend-demo)
    deploy_backend "$ROOT/clients/demo" "demo"
    ;;
  all)
    "$ROOT/scripts/deploy-all-clients.sh" "$DESC"
    ;;
  *)
    echo "Target tidak dikenal: $TARGET" >&2
    usage
    ;;
esac

echo ""
echo "✅ Selesai deploy ke: $TARGET"
echo "   Deskripsi: $DESC"
case "$TARGET" in
  dev|sandbox) echo "   Berikutnya (jika OK): ./scripts/deploy-to.sh demo \"$DESC\"" ;;
  demo) echo "   Berikutnya (jika OK): ./scripts/deploy-to.sh client1 \"$DESC\"" ;;
  client1|client|production|prod) echo "   Production updated. Kabari client hard refresh (Cmd+Shift+R)." ;;
esac
