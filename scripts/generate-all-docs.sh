#!/usr/bin/env bash
# Generate semua dokumen Word operasional.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Mitigasi bugs"
python3 scripts/generate-bug-mitigation-doc.py

echo "==> Onboarding client"
python3 scripts/generate-onboarding-doc.py

echo "==> Smoke test 5 menit"
python3 scripts/generate-smoke-test-doc.py

echo "==> Template form lapor bug"
python3 scripts/generate-bug-report-form-doc.py

echo "==> Early Partner Management"
python3 scripts/generate-early-partner-doc.py

echo ""
echo "Semua dokumen di: $ROOT/docs/"
ls -1 "$ROOT/docs/"*.docx
