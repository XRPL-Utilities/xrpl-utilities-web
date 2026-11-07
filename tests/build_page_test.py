"""/build/ page: the code on the page must work against the real answers.

Each use-case tab shows Python that reads fields from a bundle's key_numbers,
next to a stored answer from that bundle. A renamed or misspelled field would
look fine on the page and fail for every developer who copied it. This test
parses every snippet, checks each k["field"] it reads exists in the stored
answer for that tab's bundle, and checks the snippet calls that bundle.

    python3 tests/build_page_test.py
"""
import ast
import html
import json
import os
import re
import sys

repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
page = open(os.path.join(repo, "build", "index.html"), encoding="utf-8").read()
js = open(os.path.join(repo, "assets", "pages", "build-samples.js"), encoding="utf-8").read()
samples = json.loads(js.split("window.XRU_BUILD_SAMPLES = ", 1)[1].rstrip().rstrip(";"))["bundles"]

fails = 0


def check(name, cond):
    global fails
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        fails += 1


panels = re.findall(r'<div role="tabpanel" id="panel-([a-z-]+)"[^>]*data-bundle="([a-z-]+)"(.*?)(?=<div role="tabpanel"|<p class="text-xs text-muted mt-6">)', page, re.S)
check("six use-case panels", len(panels) == 6)
code_panels = 0
for slug, bundle, body in panels:
    check(f"{slug}: stored answer exists for {bundle}", bundle in samples)
    sample = samples.get(bundle, {})
    check(f"{slug}: stored answer has a summary and key_numbers",
          isinstance(sample.get("summary"), str) and isinstance(sample.get("key_numbers"), dict))
    m = re.search(r'<pre class="[^"]*case-code[^"]*">(.*?)</pre>', body, re.S)
    if not m:
        continue
    code_panels += 1
    code = html.unescape(m.group(1))
    try:
        ast.parse(code)
        ok = True
    except SyntaxError as e:
        ok = False
        print(f"     {e}")
    check(f"{slug}: snippet is valid Python", ok)
    check(f"{slug}: snippet calls /bundles/{bundle}", f'get("/bundles/{bundle}"' in code)
    fields = re.findall(r'k\["([a-z0-9_]+)"\]', code)
    check(f"{slug}: snippet reads at least one field", bool(fields))
    for f in fields:
        check(f"{slug}: k[\"{f}\"] is in the real {bundle} answer", f in sample.get("key_numbers", {}))
check("five panels carry Python", code_panels == 5)

# The setup block the snippets rely on defines get().
check("setup defines get(path, **params)", "def get(path, **params):" in html.unescape(page))

# Stored answers are shortened on purpose: nothing below a section label, and
# no names of the lookups behind them (methodology stays off public pages).
leak = re.compile(r"xrpscan|quicknode|xrplcluster|\bclio\b|rippled|account_tx|account_lines|account_info|"
                  r"account_objects|book_offers|gateway_balances|coingecko|yahoo|santiment|bithomp|/admin/", re.I)
check("stored answers name no lookup method or vendor", not leak.search(js))
check("stored answers keep only section labels",
      all(set(sec) <= {"source", "status", "as_of"} for b in samples.values() for sec in b.get("sections", {}).values()))
body = js.split("window.XRU_BUILD_SAMPLES = ", 1)[1]
check("stored answers carry no raw < > & (script-safe)", not re.search(r"[<>&]", body))

# The Table view labels every field a person sees. A field with no label
# still shows under its raw name, so a new field fails here first.
page_js = open(os.path.join(repo, "assets", "pages", "build.js"), encoding="utf-8").read()
labelled = set(re.findall(r"^    ([a-z0-9_]+): \[", page_js, re.M))
for b, d in samples.items():
    for f in d.get("key_numbers", {}):
        check(f"table view has a label for {b}.{f}", f in labelled)

# Builder demo look (2026-11-06): the tab header and every answer card carry
# the accent styling, so a new tab can't ship plain by mistake.
page_html = open(os.path.join(repo, "build", "index.html"), encoding="utf-8").read()
panels = re.findall(r'role="tabpanel"[\s\S]*?(?=role="tabpanel"|</section>)', page_html)
check("the tab header sits in the accent box", 'class="case-head"' in page_html and page_html.index('class="case-head"') < page_html.index('id="case-tabs"'))
check("every tab's answer sits in an accent card", len(panels) == 6 and all("answer-col" in p for p in panels))

# Hero graphic (2026-11-06): decorative only, so screen readers skip it and
# it never pulls an outside file.
art = re.search(r'<svg class="build-art"[\s\S]*?</svg>', page_html)
check("hero graphic is present and hidden from screen readers", bool(art) and 'aria-hidden="true"' in art.group(0))
check("hero graphic loads nothing from outside", bool(art) and not re.search(r'(href|src)="(https?:)?//', art.group(0)))

sys.exit(1 if fails else 0)
