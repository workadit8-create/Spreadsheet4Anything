#!/usr/bin/env bash
# Preview lokal Ops Console di http://localhost:8765
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-8765}"
echo "Ops Console → http://localhost:$PORT"
echo "(Ctrl+C untuk stop)"
cd "$ROOT"
python3 -m http.server "$PORT"
