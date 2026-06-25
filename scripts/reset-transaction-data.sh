#!/usr/bin/env bash
# Reset data transaksi org hybrid-lab (master data tetap).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/reset-transaction-data.mjs "$@"
