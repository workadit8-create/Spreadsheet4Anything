#!/usr/bin/env bash
# Setup sekali: venv Python + OAuth Google (Drive + Sheets + Apps Script).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROVISION="$ROOT/provision"
VENV="$ROOT/scripts/provision/.venv"

echo "==> Provision Level 3 — setup auth Google"
echo ""

if [ ! -f "$PROVISION/oauth-client.json" ]; then
  cat <<'EOF'

Langkah di browser (sekali saja, ~10 menit):

1. Buka https://console.cloud.google.com/
2. Buat project baru, mis. "Akuntansi Provision"
3. APIs & Services → Enable APIs:
   - Google Drive API
   - Google Sheets API
   - Google Apps Script API
4. APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: Desktop app
   - Download JSON
5. Simpan file JSON sebagai:
   provision/oauth-client.json

Lalu jalankan lagi:
  ./scripts/provision/setup-auth.sh

EOF
  exit 1
fi

echo "==> Python venv"
python3 -m venv "$VENV"
# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install -q -r "$ROOT/scripts/provision/requirements.txt"

echo "==> Login Google (browser akan terbuka)"
cd "$ROOT/scripts/provision"
python3 - <<'PY'
from google_client import get_credentials
get_credentials()
print("OK — token tersimpan di provision/token.json")
PY

echo ""
echo "Setup selesai. Lanjut:"
echo "  cp provision/master.env.example provision/master.env"
echo "  ./scripts/provision-client.sh demo \"Akun Demo\""
