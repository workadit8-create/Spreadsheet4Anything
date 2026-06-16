#!/usr/bin/env bash
# Commit semua perubahan lokal jika ada. Dipanggil otomatis oleh hook Cursor / deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "[git-snapshot] repo git belum diinisialisasi — skip."
  exit 0
fi

if [ -z "$(git status --porcelain)" ]; then
  echo "[git-snapshot] tidak ada perubahan — skip."
  exit 0
fi

MSG="${1:-auto: snapshot $(date '+%Y-%m-%d %H:%M:%S')}"

git add -A

# Hindari commit file sensitif jika sempat masuk staging
git reset HEAD -- .env .env.* credentials.json 2>/dev/null || true

if [ -z "$(git diff --cached --name-only)" ]; then
  echo "[git-snapshot] tidak ada file untuk commit — skip."
  exit 0
fi

git commit -m "$MSG"
echo "[git-snapshot] commit: $MSG"

if git remote get-url origin >/dev/null 2>&1; then
  if git push origin HEAD 2>/dev/null; then
    echo "[git-snapshot] push ke origin berhasil."
  else
    echo "[git-snapshot] push ke origin gagal (cek kredensial / remote) — commit lokal tetap aman."
  fi
fi
