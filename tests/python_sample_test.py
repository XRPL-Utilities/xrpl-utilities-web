"""Every published x402 Python sample must actually pay.

2026-10-26: the sample on five pages passed payment_requirements_selector="XRP".
x402-xrpl calls the selector as a function, the TypeError is swallowed
("fail open"), and the caller silently gets the unpaid 402 back. Nobody who
copied it could ever have paid. This test extracts every sample from every
page and runs its selector the way the library does.

    python3 tests/python_sample_test.py
"""
import ast
import glob
import html
import os
import re
import sys

repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The three options a live 402 offers, in live order. RLUSD comes first, so
# the library's default selector would pick it and fail for an XRP-only wallet.
LIVE_ACCEPTS = [
    {"scheme": "exact", "network": "xrpl:0", "asset": "524C555344000000000000000000000000000000", "amount": "0.10"},
    {"scheme": "exact", "network": "eip155:8453", "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "amount": "100000"},
    {"scheme": "exact", "network": "xrpl:0", "asset": "XRP", "amount": "77137"},
]

fails = 0
samples = 0
for path in sorted(glob.glob(os.path.join(repo, "**", "*.html"), recursive=True)):
    if "/node_modules/" in path:
        continue
    page = open(path, encoding="utf-8").read()
    for block in re.findall(r"<pre[^>]*>(.*?)</pre>", page, re.S):
        if "X402RequestsSession" not in block:
            continue
        samples += 1
        code = html.unescape(re.sub(r"<[^>]+>", "", block))
        code = "\n".join(l for l in code.splitlines() if not l.startswith("pip install"))
        rel = os.path.relpath(path, repo)

        def fail(msg):
            global fails
            fails += 1
            print(f"FAIL {rel}: {msg}")

        if re.search(r"payment_requirements_selector\s*=\s*[\"']", code):
            fail("payment_requirements_selector is a string; the library calls it as a function")
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            fail(f"sample is not valid Python: {e}")
            continue
        if "raise_for_status()" not in code:
            fail("sample never checks the status, so an unpaid 402 passes silently")
        selector = re.search(r"payment_requirements_selector\s*=\s*(\w+)", code)
        if not selector:
            fail("no payment_requirements_selector; the default picks RLUSD first")
            continue
        defs = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == selector.group(1)]
        if not defs:
            fail(f"selector {selector.group(1)} is not defined in the sample")
            continue
        ns = {}
        exec(compile(ast.Module(body=defs, type_ignores=[]), rel, "exec"), ns)
        # Same positional call as x402_xrpl.clients.requests (accepts, network, scheme, max_value).
        picked = ns[selector.group(1)](LIVE_ACCEPTS, None, "exact", None)
        if picked.get("asset") != "XRP" or picked.get("network") != "xrpl:0":
            fail(f"selector picked {picked} instead of the XRP option")

if samples == 0:
    fails += 1
    print("FAIL no x402 Python samples found; the extractor is broken")
print(f"python samples checked: {samples}")
sys.exit(1 if fails else 0)
