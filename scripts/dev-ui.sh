#!/usr/bin/env bash
# Preview UI lokal port 5173 — tanpa npm (Python http.server).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "==> UI preview: http://localhost:5173/index.html"
echo "    Ctrl+C untuk stop. Data dummy — deploy GAS untuk backend nyata."
exec python3 -m http.server 5173
