#!/usr/bin/env bash
# Cursor hook: snapshot git saat sesi agent selesai (jika ada perubahan file).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../" && pwd)"
"$ROOT/scripts/git-snapshot.sh" "auto: sesi agent $(date '+%Y-%m-%d %H:%M')"
