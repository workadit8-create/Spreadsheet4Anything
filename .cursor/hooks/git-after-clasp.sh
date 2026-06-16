#!/usr/bin/env bash
# Cursor hook: snapshot git setelah clasp push / redeploy berhasil.
set -euo pipefail

INPUT="$(cat)"
ROOT="$(cd "$(dirname "$0")/../../" && pwd)"

# Parse command dari JSON stdin (tanpa jq — pakai node/python fallback)
COMMAND=""
if command -v node >/dev/null 2>&1; then
  COMMAND="$(node -e "const d=JSON.parse(process.argv[1]||'{}'); process.stdout.write(d.command||'')" "$INPUT" 2>/dev/null || true)"
elif command -v python3 >/dev/null 2>&1; then
  COMMAND="$(python3 -c "import sys,json; d=json.loads(sys.argv[1] if len(sys.argv)>1 else '{}'); print(d.get('command',''), end='')" "$INPUT" 2>/dev/null || true)"
fi

if [[ ! "$COMMAND" =~ clasp[[:space:]]+(push|redeploy) ]]; then
  exit 0
fi

MSG="deploy: clasp"
if [[ "$COMMAND" =~ redeploy ]]; then
  MSG="deploy: clasp redeploy $(date '+%Y-%m-%d %H:%M')"
else
  MSG="deploy: clasp push $(date '+%Y-%m-%d %H:%M')"
fi

"$ROOT/scripts/git-snapshot.sh" "$MSG"
