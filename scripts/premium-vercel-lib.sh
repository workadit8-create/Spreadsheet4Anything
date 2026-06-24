#!/usr/bin/env bash
# Helper: Vercel CLI lokal (hindari npx + npm cache permission error di ~/.npm)
set -euo pipefail

premium_vercel_bin() {
  local app_dir="$1"
  local root_dir="$2"
  local bin="${app_dir}/node_modules/.bin/vercel"

  export NPM_CONFIG_CACHE="${root_dir}/.npm-cache"
  mkdir -p "$NPM_CONFIG_CACHE"

  if [[ ! -x "$bin" ]]; then
    echo "==> Install vercel CLI (lokal di apps/premium-web)..." >&2
    (cd "$app_dir" && npm install --no-fund --no-audit)
  fi

  printf '%s' "$bin"
}
