#!/usr/bin/env bash
# Isi UPLOAD_FOLDER_ID di sheet SETTING dari provision/drive-layout.json
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
  python3 "$ROOT/scripts/provision/patch_upload_folders.py" "$@"
else
  python3 "$ROOT/scripts/provision/patch_upload_folders.py"
fi
