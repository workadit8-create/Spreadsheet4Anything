#!/usr/bin/env bash
# Level 3 — provision instance client baru (demo / production).
# Usage: ./scripts/provision-client.sh <slug> "<Nama Tampilan>"
# Contoh: ./scripts/provision-client.sh demo "Akun Demo"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROVISION="$ROOT/provision"
VENV="$ROOT/scripts/provision/.venv"
MASTER_ENV="$PROVISION/master.env"

SLUG="${1:-}"
DISPLAY_NAME="${2:-}"

if [ -z "$SLUG" ] || [ -z "$DISPLAY_NAME" ]; then
  echo "Usage: $0 <slug> \"<Nama Tampilan>\"" >&2
  echo "Contoh: $0 demo \"Akun Demo\"" >&2
  exit 1
fi

if [ ! -f "$MASTER_ENV" ]; then
  echo "Buat dulu: cp provision/master.env.example provision/master.env" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$MASTER_ENV"

CLIENT_DIR="$ROOT/clients/$SLUG"
BACKEND_REPO="${BACKEND_REPO:-../BACKENDengine}"
BACKEND_DIR="$(cd "$ROOT/$BACKEND_REPO" 2>/dev/null && pwd || cd "$BACKEND_REPO" 2>/dev/null && pwd || true)"

if [ -z "${BACKEND_DIR:-}" ] || [ ! -d "$BACKEND_DIR" ]; then
  echo "BACKENDengine tidak ditemukan di: $BACKEND_REPO" >&2
  exit 1
fi

if [ -d "$CLIENT_DIR" ]; then
  echo "Folder sudah ada: $CLIENT_DIR" >&2
  exit 1
fi

command -v clasp >/dev/null || { echo "clasp belum terinstall (npm i -g @google/clasp)" >&2; exit 1; }

if [ ! -f "$PROVISION/token.json" ]; then
  echo "OAuth belum setup. Jalankan: ./scripts/provision/setup-auth.sh" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

API_KEY="AKUNTANSI_$(echo "$SLUG" | tr '[:lower:]' '[:upper:]')_$(openssl rand -hex 4 2>/dev/null || echo "$RANDOM")"

echo ""
echo "=========================================="
echo " Provision: $DISPLAY_NAME ($SLUG)"
echo "=========================================="
echo ""

echo "==> [1/7] Salin spreadsheet database + backend..."
COPY_JSON="$(python3 "$ROOT/scripts/provision/copy_sheets.py" \
  --database-id "$MASTER_DATABASE_ID" \
  --backend-id "$MASTER_BACKEND_ENGINE_ID" \
  --name "$DISPLAY_NAME")"

DATABASE_ID="$(echo "$COPY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['databaseId'])")"
BACKEND_ENGINE_ID="$(echo "$COPY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['backendEngineId'])")"
echo "    Database: $DATABASE_ID"
echo "    Backend sheet: $BACKEND_ENGINE_ID"

echo "==> [2/7] Siapkan folder backend GAS..."
BE_CLIENT_DIR="$(python3 "$ROOT/scripts/provision/prepare_backend.py" \
  --slug "$SLUG" \
  --database-id "$DATABASE_ID" \
  --backend-engine-id "$BACKEND_ENGINE_ID" \
  --api-key "$API_KEY" \
  --master-env "$MASTER_ENV" \
  --backend-repo "$BACKEND_DIR")"

echo "    $BE_CLIENT_DIR"

echo "==> [3/7] Buat Apps Script backend + push..."
(
  cd "$BE_CLIENT_DIR"
  clasp create --type standalone --title "Backend Engine — $DISPLAY_NAME" --rootDir .
  clasp push --force
)

echo "    Deploy backend web app (pertama kali)..."
BE_DEPLOY_OUT="$(cd "$BE_CLIENT_DIR" && clasp deploy --description "provision $SLUG")"
BE_DEPLOY_ID="$(echo "$BE_DEPLOY_OUT" | grep -oE 'AKfycb[^ @]+' | head -1 || true)"
BACKEND_SCRIPT_ID="$(python3 -c "import json; print(json.load(open('$BE_CLIENT_DIR/.clasp.json'))['scriptId'])")"

if [ -z "$BE_DEPLOY_ID" ]; then
  echo "    Catat deployment ID backend manual dari output clasp deploy"
  read -r -p "    BACKEND deployment ID (AKfycb...): " BE_DEPLOY_ID
fi

BACKEND_WEBAPP_URL="https://script.google.com/macros/s/${BE_DEPLOY_ID}/exec"
echo "    Backend URL: $BACKEND_WEBAPP_URL"

echo "==> [4/7] Update sheet SETTING (database client)..."
python3 "$ROOT/scripts/provision/patch_setting.py" \
  --database-id "$DATABASE_ID" \
  --backend-engine-id "$BACKEND_ENGINE_ID" \
  --backend-url "$BACKEND_WEBAPP_URL" \
  --api-key "$API_KEY"

echo "==> [5/7] Siapkan folder web app clients/$SLUG ..."
mkdir -p "$CLIENT_DIR"
cp "$ROOT/clients/_template/Config.js" "$CLIENT_DIR/Config.js"
cp "$ROOT/clients/_template/deploy.sh" "$CLIENT_DIR/deploy.sh"
cp "$ROOT/clients/_template/client.env.example" "$CLIENT_DIR/client.env.example"
cp "$ROOT/appsscript.json" "$CLIENT_DIR/appsscript.json"
cp "$ROOT/.claspignore" "$CLIENT_DIR/.claspignore"
chmod +x "$CLIENT_DIR/deploy.sh"

sed -i '' "s/GANTI_DENGAN_ID_SPREADSHEET_DATABASE_CLIENT/$DATABASE_ID/" "$CLIENT_DIR/Config.js"

# Library backend → script backend client baru
python3 - <<PY
import json
p = "$CLIENT_DIR/appsscript.json"
d = json.load(open(p))
for lib in d.get("dependencies", {}).get("libraries", []):
    if lib.get("userSymbol") == "BackendEngine":
        lib["libraryId"] = "$BACKEND_SCRIPT_ID"
json.dump(d, open(p, "w"), indent=2)
PY

echo "==> [6/7] Buat Apps Script web app + push..."
(
  cd "$CLIENT_DIR"
  clasp create --type standalone --title "Akuntansi App — $DISPLAY_NAME" --rootDir .
  "$ROOT/scripts/sync-client-code.sh" "clients/$SLUG"
  # Restore library id setelah sync (sync menimpa appsscript.json dari root)
  python3 - <<PY
import json
p = "appsscript.json"
d = json.load(open(p))
for lib in d.get("dependencies", {}).get("libraries", []):
    if lib.get("userSymbol") == "BackendEngine":
        lib["libraryId"] = "$BACKEND_SCRIPT_ID"
json.dump(d, open(p, "w"), indent=2)
PY
  clasp push --force
)

WEB_DEPLOY_OUT="$(cd "$CLIENT_DIR" && clasp deploy --description "provision $SLUG")"
WEB_DEPLOY_ID="$(echo "$WEB_DEPLOY_OUT" | grep -oE 'AKfycb[^ @]+' | head -1 || true)"
WEB_SCRIPT_ID="$(python3 -c "import json; print(json.load(open('$CLIENT_DIR/.clasp.json'))['scriptId'])")"

if [ -z "$WEB_DEPLOY_ID" ]; then
  read -r -p "    WEB deployment ID (AKfycb...): " WEB_DEPLOY_ID
fi

WEBAPP_URL="https://script.google.com/macros/s/${WEB_DEPLOY_ID}/exec"

cat > "$CLIENT_DIR/client.env" <<EOF
CLIENT_NAME="$DISPLAY_NAME"
DATABASE_ID="$DATABASE_ID"
CLASP_DEPLOY_ID="$WEB_DEPLOY_ID"
BACKEND_ENGINE_ID="$BACKEND_ENGINE_ID"
BACKEND_WEBAPP_URL="$BACKEND_WEBAPP_URL"
BACKEND_API_KEY="$API_KEY"
WEBAPP_URL="$WEBAPP_URL"
WEB_SCRIPT_ID="$WEB_SCRIPT_ID"
BACKEND_SCRIPT_ID="$BACKEND_SCRIPT_ID"
BACKEND_DEPLOY_ID="$BE_DEPLOY_ID"
EOF

mkdir -p "$PROVISION/instances"
cat > "$PROVISION/instances/${SLUG}.env" <<EOF
# Generated $(date -Iseconds)
SLUG=$SLUG
DISPLAY_NAME=$DISPLAY_NAME
DATABASE_ID=$DATABASE_ID
BACKEND_ENGINE_ID=$BACKEND_ENGINE_ID
WEBAPP_URL=$WEBAPP_URL
BACKEND_WEBAPP_URL=$BACKEND_WEBAPP_URL
API_KEY=$API_KEY
WEB_SCRIPT_ID=$WEB_SCRIPT_ID
BACKEND_SCRIPT_ID=$BACKEND_SCRIPT_ID
WEB_DEPLOY_ID=$WEB_DEPLOY_ID
BACKEND_DEPLOY_ID=$BE_DEPLOY_ID
EOF

echo ""
echo "==> [7/7] SELESAI"
echo ""
echo "  Nama       : $DISPLAY_NAME"
echo "  URL app    : $WEBAPP_URL"
echo "  Database   : https://docs.google.com/spreadsheets/d/$DATABASE_ID/edit"
echo "  Backend    : $BACKEND_WEBAPP_URL"
echo "  Config     : clients/$SLUG/client.env"
echo "  Ringkasan  : provision/instances/${SLUG}.env"
echo ""
echo "  Langkah berikut:"
echo "  1. Buka URL app → login Google → setup owner"
echo "  2. Menu Setting → QA Otomatis (opsional)"
echo "  3. Deploy ulang rutin: cd clients/$SLUG && ./deploy.sh \"update\""
echo ""
