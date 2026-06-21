#!/usr/bin/env bash
# Sync docs/client-registry.json dari drive-layout + client.env (tanpa API key).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 "$ROOT/scripts/sync-client-registry.py"
