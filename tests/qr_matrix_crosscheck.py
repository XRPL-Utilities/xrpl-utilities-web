"""Cross-check the locally-rendered QR against an independent encoder.

tests/qr_render_test.mjs proves the canvas is *a* QR code; this proves it is
the QR code for the payment URI, by regenerating the same version with the
python `qrcode` package and matching the modules bit for bit. Mask choice is a
per-encoder heuristic, so try all eight - every one of them is a valid,
decodable rendering of the same data.

Optional: skipped when `qrcode` is not installed. Run after the node test:
    python3 tests/qr_matrix_crosscheck.py
"""

import json
import os
import sys

try:
    import qrcode
except ImportError:
    print("SKIP qr matrix cross-check (pip install qrcode)")
    sys.exit(0)

here = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(here, "qr_rendered.json")
if not os.path.exists(path):
    print("SKIP qr matrix cross-check (run tests/qr_render_test.mjs first)")
    sys.exit(0)

rendered = json.load(open(path))
version = (rendered["count"] - 17) // 4

for mask in range(8):
    q = qrcode.QRCode(
        version=version,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        border=0,
        mask_pattern=mask,
    )
    q.add_data(rendered["text"], optimize=0)
    q.make(fit=False)
    rows = ["".join("1" if c else "0" for c in row) for row in q.get_matrix()]
    if rows == rendered["rows"]:
        print(f"PASS rendered QR encodes the payment URI (version {version}, mask {mask})")
        sys.exit(0)

print("FAIL rendered QR does not match any standard encoding of the payment URI")
sys.exit(1)
