#!/usr/bin/env bash
# Cek UPLOAD_FOLDER_ID + isi folder Uploads per client.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/scripts/provision/.venv"

# shellcheck disable=SC1091
source "$VENV/bin/activate"

python3 "$ROOT/scripts/provision/verify_upload_folder.py" "$@"
