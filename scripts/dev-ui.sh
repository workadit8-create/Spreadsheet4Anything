#!/usr/bin/env bash
# Preview UI lokal port 5173 — untuk Cursor Browser Agent & Design Mode.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
echo "==> UI preview: http://localhost:5173/index.html"
echo "    (google.script.run dimock — deploy ke GAS untuk test data nyata)"
npm run dev
