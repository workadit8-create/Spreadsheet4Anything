#!/usr/bin/env bash
# Push ke Apps Script + redeploy + snapshot git (satu perintah untuk deploy rutin).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CLIENT1_ENV="$ROOT/clients/client1/client.env"
if [ -f "$CLIENT1_ENV" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$CLIENT1_ENV"
  set +a
fi

DESC="${1:-update}"
DEPLOY_ID="${CLASP_DEPLOY_ID:-AKfycbzgw08PULf6FhWjiA4FlIqrRhuikcpwNnvIt02sD9I8rLzL0WprwATGTsWsdk_-TsQt}"
REDEPLOY="${REDEPLOY:-1}"

echo "==> clasp push"
clasp push --force

if [ "$REDEPLOY" = "1" ]; then
  echo "==> clasp redeploy ($DEPLOY_ID)"
  clasp redeploy "$DEPLOY_ID" --description "$DESC"
fi

"$ROOT/scripts/git-snapshot.sh" "deploy: $DESC"
