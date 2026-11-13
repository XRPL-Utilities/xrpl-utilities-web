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
node --check assets/a11y.js
node --check assets/poll.js
for f in assets/pages/*.js; do node --check "$f"; done

node tests/trust_xss_test.mjs
node tests/worker_proxy_test.mjs
node tests/qr_render_test.mjs
node tests/payment_pin_test.mjs
node tests/resilience_test.mjs
node tests/visitor_pass_test.mjs
node tests/a11y_test.mjs
node tests/buyer_path_test.mjs
node tests/seo_test.mjs
node tests/terms_coverage_test.mjs
node tests/images_test.mjs
node tests/telemetry_null_test.mjs
node tests/telemetry_supply_fallback_test.mjs
node tests/pulse_copy_test.mjs
node tests/trust_copy_test.mjs
node tests/pricing_copy_test.mjs
node tests/api_details_copy_test.mjs
node tests/telemetry_copy_test.mjs
node tests/flows_copy_test.mjs
node tests/lineage_copy_test.mjs
node tests/sentinel_copy_test.mjs
node tests/start_copy_test.mjs
node tests/home_copy_test.mjs
node tests/docs_freshness_test.mjs
node tests/more_products_test.mjs
python3 tests/python_sample_test.py
node tests/inline_script_syntax_test.mjs
node tests/content_rules_test.mjs
node tests/csp_headers_test.mjs
node tests/cache_headers_test.mjs
node tests/html_escape_lint_test.mjs
node tests/polling_test.mjs
node tests/vault_headline_test.mjs
node tests/status_model_test.mjs
node tests/public_copy_test.mjs
node tests/chart_palette_test.mjs
node tests/vault_layout_test.mjs
node tests/product_layout_test.mjs
node tests/midnight_gap_test.mjs
node tests/lineage_exits_test.mjs
node tests/review_round2_test.mjs
node tests/whales_test.mjs
node tests/build_render_test.mjs
node tests/mobile_nav_test.mjs
node tests/learn_test.mjs
node tests/cases_test.mjs
node --check assets/pages/cases.js
python3 tests/build_page_test.py
node --check assets/sha3-512.js
node --check assets/pages/verify.js
node --test tests/verify_sha3_test.mjs
node --test tests/verify_page_test.mjs
node --check assets/chart-palette.js
node --check assets/status-model.js
python3 tests/qr_matrix_crosscheck.py

echo "all checks passed"
