#!/usr/bin/env bash
# Rapikan spreadsheet ke folder Google Drive per client.
# Usage: ./scripts/organize-drive.sh [demo|client1|...]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/scripts/provision/.venv"

if [ ! -f "$ROOT/provision/token.json" ]; then
  echo "OAuth belum setup. Jalankan: ./scripts/provision/setup-auth.sh" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

if [ "$#" -gt 0 ]; then
  python3 "$ROOT/scripts/provision/organize_drive.py" "$@"
else
  python3 "$ROOT/scripts/provision/organize_drive.py"
fi
