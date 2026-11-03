#!/usr/bin/env python3
"""Check an XRPL-Utilities Verified Record day against the XRP Ledger.

Standard library only (Python 3.8+). It does not trust our servers for the
final answer: it recomputes the day's root from the published fingerprints,
then reads the anchor account's history straight from an XRP Ledger node and
compares the root written there.

  python3 check_record.py 2026-11-03 --node https://<any public XRPL node>
  add --file whales.json --name pulse-whales   to check a record you hold
  add --download                               to check every record (after release)

--node is any XRP Ledger JSON-RPC server over https that you choose to trust.

Hashing:
  leaf = SHA3-512(0x00 || exact record bytes)
  node = SHA3-512(0x01 || left || right)
  an odd node is carried up unchanged; leaves are in record-name order.

License: MIT.
"""
import argparse
import hashlib
import json
import re
import sys
import urllib.request

PROOF_BASE = "https://sentinel.xrpl-utilities.io/proof"
ANCHOR_ACCOUNT = "rwty5XRq5zrqTZ7XMLgk3EqQ76V3SY8Gwy"
MEMO_TYPE = "xrpl-utilities/verified-record"
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
MAX_BYTES = 16 * 1024 * 1024


def leaf_hash(data):
    return hashlib.sha3_512(b"\x00" + data).digest()


def node_hash(left, right):
    return hashlib.sha3_512(b"\x01" + left + right).digest()


def merkle_root(leaves):
    level = list(leaves)
    if not level:
        return None
    while len(level) > 1:
        nxt = [node_hash(level[i], level[i + 1]) for i in range(0, len(level) - 1, 2)]
        if len(level) % 2:
            nxt.append(level[-1])
        level = nxt
    return level[0]


def _get(url, data=None):
    req = urllib.request.Request(url, data=data, headers={
        "User-Agent": "xrpl-utilities-record-check/1",
        "Content-Type": "application/json"} if data else {
        "User-Agent": "xrpl-utilities-record-check/1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("response too large")
    return body


def _hex64(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{128}", value) is not None


def find_ledger_memos(node, date):
    """Every successful, validated AccountSet sent BY the anchor account that
    carries our memo for `date`. Read straight from the ledger."""
    found, marker = [], None
    for _ in range(50):
        params = {"account": ANCHOR_ACCOUNT, "limit": 200, "forward": False, "api_version": 1}
        if marker is not None:
            params["marker"] = marker
        res = json.loads(_get(node, json.dumps({"method": "account_tx", "params": [params]}).encode()))
        res = res.get("result") or {}
        if res.get("status") != "success":
            raise RuntimeError("node did not answer account_tx")
        for t in res.get("transactions") or []:
            tx, meta = t.get("tx") or {}, t.get("meta") or {}
            if not (t.get("validated") and meta.get("TransactionResult") == "tesSUCCESS"):
                continue
            if tx.get("Account") != ANCHOR_ACCOUNT or tx.get("TransactionType") != "AccountSet":
                continue
            for m in tx.get("Memos") or []:
                mm = (m or {}).get("Memo") or {}
                try:
                    if bytes.fromhex(mm.get("MemoType", "")).decode() != MEMO_TYPE:
                        continue
                    memo = json.loads(bytes.fromhex(mm.get("MemoData", "")).decode())
                except (ValueError, UnicodeDecodeError):
                    continue
                if isinstance(memo, dict) and memo.get("date") == date:
                    found.append({"hash": tx.get("hash"), "ledger_index": tx.get("ledger_index"),
                                  "memo": memo})
        marker = res.get("marker")
        if marker is None:
            break
    return found


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("date", help="YYYY-MM-DD")
    ap.add_argument("--file", help="a record file you hold, checked byte for byte")
    ap.add_argument("--name", help="the record name for --file, as listed for the day")
    ap.add_argument("--download", action="store_true",
                    help="download and check every released record")
    ap.add_argument("--node", required=True,
                    help="XRP Ledger JSON-RPC server (https) you trust, to read the anchor from")
    a = ap.parse_args(argv)
    if not DATE_RE.match(a.date):
        ap.error("date must be YYYY-MM-DD")
    if not a.node.startswith("https://"):
        ap.error("--node must be https")
    if bool(a.file) != bool(a.name):
        ap.error("--file and --name go together")
    if a.name and not NAME_RE.match(a.name):
        ap.error("bad record name")

    ok = True

    def report(passed, text):
        nonlocal ok
        ok = ok and passed
        print(("PASS  " if passed else "FAIL  ") + text)

    day = json.loads(_get(f"{PROOF_BASE}/{a.date}"))
    records = day.get("records") or []
    leaves_hex = [e.get("leaf_sha3_512") for e in records]
    if not all(_hex64(h) for h in leaves_hex) or [e.get("name") for e in records] != \
            sorted(e.get("name") for e in records):
        report(False, "published fingerprints are malformed or out of order")
        return 1
    root = merkle_root([bytes.fromhex(h) for h in leaves_hex])
    root_hex = root.hex() if root else None
    report(root_hex == day.get("root"),
           f"{len(records)} fingerprints rebuild the published root {str(root_hex)[:16]}...")

    by_name = {e["name"]: e for e in records}
    if a.file:
        entry = by_name.get(a.name)
        if entry is None:
            report(False, f"no record named {a.name} on {a.date}")
        else:
            with open(a.file, "rb") as f:
                data = f.read()
            report(leaf_hash(data).hex() == entry["leaf_sha3_512"],
                   f"{a.file} matches record {a.name} byte for byte")
    if a.download:
        if not day.get("records_released"):
            print(f"INFO  records are released on {day.get('release_date')}")
        else:
            for name, entry in by_name.items():
                data = _get(f"{PROOF_BASE}/{a.date}/records/{name}")
                report(leaf_hash(data).hex() == entry["leaf_sha3_512"], f"record {name}")

    memos = find_ledger_memos(a.node, a.date)
    if not memos:
        report(False, f"no anchor for {a.date} found in {ANCHOR_ACCOUNT}'s ledger history")
    else:
        roots = {m["memo"].get("root") for m in memos}
        report(roots == {root_hex},
               f"the XRP Ledger holds the same root (tx {memos[0]['hash']}, "
               f"ledger {memos[0]['ledger_index']})")
        if len(memos) > 1:
            print(f"INFO  {len(memos)} anchors carry this date")
    print("RESULT " + ("VERIFIED" if ok else "NOT VERIFIED"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
