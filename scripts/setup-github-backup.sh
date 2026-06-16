#!/usr/bin/env bash
# Setup backup cloud GitHub untuk Spreadsheet4Anything (sekali jalan).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GITHUB_USER="${GITHUB_USER:-workadit8-create}"
REPO_NAME="${REPO_NAME:-Spreadsheet4Anything}"
SSH_KEY="$HOME/.ssh/id_ed25519_${REPO_NAME}"
SSH_CONFIG="$HOME/.ssh/config"

echo "==> Spreadsheet4Anything — setup backup GitHub"
echo "    User: $GITHUB_USER"
echo "    Repo: $REPO_NAME"
echo ""

mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [ ! -f "$SSH_KEY" ]; then
  echo "==> Membuat SSH key: $SSH_KEY"
  ssh-keygen -t ed25519 -C "workadit8@gmail.com" -f "$SSH_KEY" -N ""
else
  echo "==> SSH key sudah ada: $SSH_KEY"
fi

if ! grep -q "Host github.com" "$SSH_CONFIG" 2>/dev/null; then
  echo "==> Menambah konfigurasi SSH untuk github.com"
  cat >> "$SSH_CONFIG" <<EOF

Host github.com
  HostName github.com
  User git
  IdentityFile $SSH_KEY
  IdentitiesOnly yes
EOF
  chmod 600 "$SSH_CONFIG"
else
  echo "==> SSH config github.com sudah ada (tidak diubah)"
fi

ssh-keyscan -t ed25519 github.com 2>/dev/null >> "$HOME/.ssh/known_hosts" || true

git remote remove origin 2>/dev/null || true
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "git@github.com:${GITHUB_USER}/${REPO_NAME}.git"
else
  git remote add origin "git@github.com:${GITHUB_USER}/${REPO_NAME}.git"
fi
echo "==> Remote origin: git@github.com:${GITHUB_USER}/${REPO_NAME}.git"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "LANGKAH 1 — Buat repo kosong di GitHub (jika belum ada):"
echo "  https://github.com/new?name=${REPO_NAME}"
echo "  • Public atau Private — bebas"
echo "  • JANGAN centang \"Add README\" (repo harus kosong)"
echo ""
echo "LANGKAH 2 — Tambahkan SSH key ke GitHub:"
echo "  https://github.com/settings/ssh/new"
echo "  Title: MacBook Spreadsheet4Anything"
echo "  Key (copy baris di bawah):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat "${SSH_KEY}.pub"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -r -p "Sudah buat repo + tambah SSH key? Tekan Enter untuk test push…" _

echo "==> Test koneksi GitHub SSH…"
ssh -T git@github.com || true

echo "==> Push ke origin/main…"
git push -u origin main

echo ""
echo "✅ Backup cloud aktif. Snapshot otomatis akan push ke GitHub jika remote ada."
