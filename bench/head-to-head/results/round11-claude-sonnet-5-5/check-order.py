#!/usr/bin/env python3
"""Prints the earliest trace timestamp of the folder and fails if it is before the protocol commit time in summary-meta.json.
No network, no model calls. Proves (with the commit order in git) that no scored run started before the protocol was frozen."""
import glob
import gzip
import json
import os
import re
import sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
meta = json.load(open(os.path.join(HERE, "summary-meta.json")))
frozen = datetime.fromisoformat(meta["protocol_commit_time"])
reused = set(json.load(open(os.path.join(HERE, "reused.json")))["cells"])


def reused_traces():
    """Round 8 rival cells were run on 2026-10-22, before this protocol; they are listed in reused.json and excluded here."""
    out = set()
    for cell in reused:
        task, arm, n = cell.rsplit("-", 2)
        out.add(os.path.join(HERE, "runs", "public", task, arm, n, "trace.jsonl.gz"))
    return out

first = None
n = 0
for p in sorted(set(glob.glob(os.path.join(HERE, "runs", "*", "*", "*", "*", "trace.jsonl.gz")) + glob.glob(os.path.join(HERE, "f6", "*", "trace.jsonl.gz")) + glob.glob(os.path.join(HERE, "f9", "*", "*", "runs", "*", "*", "*", "trace.jsonl.gz"))) - reused_traces()):
    with gzip.open(p, "rt", encoding="utf-8", errors="replace") as fh:
        stamps = re.findall(r'"timestamp": "([^"]+)"', fh.read())
    n += 1
    if stamps:
        t = datetime.fromisoformat(min(stamps).replace("Z", "+00:00"))
        first = t if first is None or t < first else first
print("traces: %d; earliest timestamp: %s; protocol commit time: %s" % (n, first, frozen))
sys.exit(0 if first and first >= frozen else 1)
