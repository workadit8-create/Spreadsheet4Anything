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
if [[ "$BACKEND_REPO" != /* ]]; then
  BACKEND_DIR="$(cd "$ROOT" && cd "$BACKEND_REPO" 2>/dev/null && pwd || true)"
fi
if [ -z "${BACKEND_DIR:-}" ]; then
  BACKEND_DIR="$(cd "$BACKEND_REPO" 2>/dev/null && pwd || true)"
fi

if [ -z "${BACKEND_DIR:-}" ] || [ ! -d "$BACKEND_DIR" ]; then
  echo "BACKENDengine tidak ditemukan di: $BACKEND_REPO" >&2
  exit 1
fi

if [ -d "$CLIENT_DIR" ] && [ -f "$CLIENT_DIR/client.env" ]; then
  echo "Client sudah provision penuh: $CLIENT_DIR/client.env" >&2
  exit 1
fi

mkdir -p "$CLIENT_DIR"

command -v clasp >/dev/null || { echo "clasp belum terinstall (npm i -g @google/clasp)" >&2; exit 1; }

if [ ! -f "$PROVISION/token.json" ]; then
  echo "OAuth belum setup. Jalankan: ./scripts/provision/setup-auth.sh" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"
# shellcheck disable=SC1091
source "$ROOT/scripts/provision/clasp_isolated.sh"

resolve_deploy_id() {
  local script_id="$1"
  local desc="$2"
  local from_clasp="${3:-}"
  if [ -n "$from_clasp" ]; then
    echo "$from_clasp"
    return 0
  fi
  echo "    Buat Web App deployment via API..." >&2
  python3 "$ROOT/scripts/provision/deploy_webapp.py" \
    --script-id "$script_id" \
    --description "$desc" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['deploymentId'])"
}

API_KEY="AKUNTANSI_$(echo "$SLUG" | tr '[:lower:]' '[:upper:]')_$(openssl rand -hex 4 2>/dev/null || echo "$RANDOM")"

PARTIAL_ENV="$PROVISION/instances/${SLUG}.partial.env"
if [ -f "$PARTIAL_ENV" ]; then
  # shellcheck disable=SC1090
  source "$PARTIAL_ENV"
  echo "==> Lanjut dari partial env: $PARTIAL_ENV"
fi

echo ""
echo "=========================================="
echo " Provision: $DISPLAY_NAME ($SLUG)"
echo "=========================================="
echo ""

if [ -z "${DATABASE_ID:-}" ] || [ -z "${BACKEND_ENGINE_ID:-}" ]; then
  echo "==> [1/7] Salin spreadsheet database + backend..."
  COPY_JSON="$(python3 "$ROOT/scripts/provision/copy_sheets.py" \
    --database-id "$MASTER_DATABASE_ID" \
    --backend-id "$MASTER_BACKEND_ENGINE_ID" \
    --name "$DISPLAY_NAME")"
DATABASE_ID="$(echo "$COPY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['databaseId'])")"
BACKEND_ENGINE_ID="$(echo "$COPY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['backendEngineId'])")"
else
  echo "==> [1/7] Pakai spreadsheet yang sudah disalin (partial resume)"
fi
echo "    Database: $DATABASE_ID"
echo "    Backend sheet: $BACKEND_ENGINE_ID"

mkdir -p "$PROVISION/instances"
cat > "$PARTIAL_ENV" <<EOF
DATABASE_ID=$DATABASE_ID
BACKEND_ENGINE_ID=$BACKEND_ENGINE_ID
API_KEY=$API_KEY
DISPLAY_NAME=$DISPLAY_NAME
SLUG=$SLUG
EOF

BE_CLIENT_DIR="$CLIENT_DIR/backend"

if [ ! -d "$BE_CLIENT_DIR" ]; then
  echo "==> [2/7] Siapkan folder backend GAS..."
  mkdir -p "$CLIENT_DIR"
  BE_CLIENT_DIR="$(python3 "$ROOT/scripts/provision/prepare_backend.py" \
    --slug "$SLUG" \
    --dest-dir "$BE_CLIENT_DIR" \
    --database-id "$DATABASE_ID" \
    --backend-engine-id "$BACKEND_ENGINE_ID" \
    --api-key "$API_KEY" \
    --master-env "$MASTER_ENV" \
    --backend-repo "$BACKEND_DIR")"
  echo "    $BE_CLIENT_DIR"
else
  echo "==> [2/7] Folder backend sudah ada, lanjut..."
fi

if [ ! -f "$BE_CLIENT_DIR/.clasp.json" ]; then
  echo "==> [3/7] Buat Apps Script backend + push..."
  BE_RESULT="$(clasp_provision_isolated "$BE_CLIENT_DIR" "Backend Engine — $DISPLAY_NAME")"
  BACKEND_SCRIPT_ID="${BE_RESULT%%|*}"
  BE_DEPLOY_ID="${BE_RESULT##*|}"
else
  echo "==> [3/7] Backend GAS sudah ada, skip create..."
  BACKEND_SCRIPT_ID="$(python3 -c "import json; print(json.load(open('$BE_CLIENT_DIR/.clasp.json'))['scriptId'])")"
  BE_DEPLOY_ID=""
fi

if [ -z "$BE_DEPLOY_ID" ]; then
  echo "    Deploy backend web app..."
  BE_DEPLOY_OUT="$(cd "$BE_CLIENT_DIR" && clasp deploy --description "provision $SLUG")"
  BE_DEPLOY_ID="$(echo "$BE_DEPLOY_OUT" | grep -oE 'AKfycb[^ @]+' | head -1 || true)"
fi
BACKEND_SCRIPT_ID="${BACKEND_SCRIPT_ID:-$(python3 -c "import json; print(json.load(open('$BE_CLIENT_DIR/.clasp.json'))['scriptId'])")}"

BE_DEPLOY_ID="$(resolve_deploy_id "$BACKEND_SCRIPT_ID" "provision backend $SLUG" "$BE_DEPLOY_ID")"

BACKEND_WEBAPP_URL="https://script.google.com/macros/s/${BE_DEPLOY_ID}/exec"
echo "    Backend URL: $BACKEND_WEBAPP_URL"

echo "==> [4/7] Rapikan folder Drive + update SETTING..."
python3 "$ROOT/scripts/provision/organize_drive.py" --client "$SLUG"
UPLOADS_FOLDER_ID=""
if [ -f "$ROOT/provision/drive-layout.json" ]; then
  UPLOADS_FOLDER_ID="$(python3 -c "
import json
d = json.load(open('$ROOT/provision/drive-layout.json'))
print((d.get('clients') or {}).get('$SLUG', {}).get('uploadsFolderId', ''))
")"
fi

echo "==> [5/7] Update sheet SETTING (database client)..."
PATCH_ARGS=(
  --database-id "$DATABASE_ID"
  --backend-engine-id "$BACKEND_ENGINE_ID"
  --backend-url "$BACKEND_WEBAPP_URL"
  --api-key "$API_KEY"
)
if [ -n "$UPLOADS_FOLDER_ID" ]; then
  PATCH_ARGS+=(--upload-folder-id "$UPLOADS_FOLDER_ID")
fi
python3 "$ROOT/scripts/provision/patch_setting.py" "${PATCH_ARGS[@]}"

echo "==> [6/7] Siapkan folder web app clients/$SLUG ..."
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

echo "==> [7/8] Buat Apps Script web app + push..."
if [ ! -f "$CLIENT_DIR/.clasp.json" ]; then
  "$ROOT/scripts/sync-client-code.sh" "clients/$SLUG"
  python3 - <<PY
import json
p = "$CLIENT_DIR/appsscript.json"
d = json.load(open(p))
for lib in d.get("dependencies", {}).get("libraries", []):
    if lib.get("userSymbol") == "BackendEngine":
        lib["libraryId"] = "$BACKEND_SCRIPT_ID"
json.dump(d, open(p, "w"), indent=2)
PY
  WEB_RESULT="$(clasp_provision_isolated "$CLIENT_DIR" "Akuntansi App — $DISPLAY_NAME")"
  WEB_SCRIPT_ID="${WEB_RESULT%%|*}"
  WEB_DEPLOY_ID="${WEB_RESULT##*|}"
else
  WEB_SCRIPT_ID="$(python3 -c "import json; print(json.load(open('$CLIENT_DIR/.clasp.json'))['scriptId'])")"
  WEB_DEPLOY_ID=""
fi

if [ -z "${WEB_DEPLOY_ID:-}" ]; then
  WEB_DEPLOY_OUT="$(cd "$CLIENT_DIR" && clasp deploy --description "provision $SLUG")"
  WEB_DEPLOY_ID="$(echo "$WEB_DEPLOY_OUT" | grep -oE 'AKfycb[^ @]+' | head -1 || true)"
fi
WEB_SCRIPT_ID="${WEB_SCRIPT_ID:-$(python3 -c "import json; print(json.load(open('$CLIENT_DIR/.clasp.json'))['scriptId'])")}"

WEB_DEPLOY_ID="$(resolve_deploy_id "$WEB_SCRIPT_ID" "provision web $SLUG" "${WEB_DEPLOY_ID:-}")"

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
echo "==> [8/8] SELESAI"
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
