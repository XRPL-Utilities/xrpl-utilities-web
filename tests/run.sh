#!/usr/bin/env bash
# Whole suite. No framework and no dependencies: node for the browser-side and
# Worker-side checks, plus one optional python cross-check that skips itself if
# the `qrcode` package isn't installed.
#
#   ./tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."

node --check _worker.js
node --check assets/qr-code.js
node --check assets/scan-flow.js
node --check assets/telemetry-flow.js

node tests/trust_xss_test.mjs
node tests/worker_proxy_test.mjs
node tests/qr_render_test.mjs
python3 tests/qr_matrix_crosscheck.py

echo "all checks passed"
