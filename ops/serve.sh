#!/usr/bin/env bash
# Preview lokal Ops Console (port default 8765, auto-cari port kosong jika sibuk)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
REQUESTED_PORT="${PORT:-8765}"

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

find_free_port() {
  local port="$1"
  local max=$((port + 20))
  while [ "$port" -le "$max" ]; do
    if ! port_in_use "$port"; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
  done
  return 1
}

PORT="$REQUESTED_PORT"
if port_in_use "$PORT"; then
  if [ "$PORT" = "$REQUESTED_PORT" ]; then
    echo "Port $REQUESTED_PORT sudah dipakai."
    echo "  → Mungkin Ops Console sudah jalan: buka http://localhost:$REQUESTED_PORT"
    echo "  → Atau hentikan: kill \$(lsof -t -iTCP:$REQUESTED_PORT -sTCP:LISTEN)"
    FREE="$(find_free_port $((REQUESTED_PORT + 1)) || true)"
    if [ -n "${FREE:-}" ]; then
      echo "  → Mencoba port $FREE ..."
      PORT="$FREE"
    else
      echo "Tidak ada port kosong di range $REQUESTED_PORT–$((REQUESTED_PORT + 20))." >&2
      exit 1
    fi
  fi
fi

echo "Ops Console → http://localhost:$PORT"
echo "(Ctrl+C untuk stop)"
cd "$ROOT"
python3 -m http.server "$PORT"
