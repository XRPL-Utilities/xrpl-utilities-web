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
node --check assets/pay-pin.js
node --check assets/stale-banner.js
node --check assets/api-resilient.js
for f in assets/pages/*.js; do node --check "$f"; done

node tests/trust_xss_test.mjs
node tests/worker_proxy_test.mjs
node tests/qr_render_test.mjs
node tests/payment_pin_test.mjs
node tests/resilience_test.mjs
node tests/telemetry_null_test.mjs
python3 tests/python_sample_test.py
node tests/inline_script_syntax_test.mjs
node tests/content_rules_test.mjs
node tests/csp_headers_test.mjs
node tests/status_model_test.mjs
node --check assets/status-model.js
python3 tests/qr_matrix_crosscheck.py

echo "all checks passed"
