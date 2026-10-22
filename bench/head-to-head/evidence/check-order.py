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
first = None
n = 0
for p in glob.glob(os.path.join(HERE, "runs", "*", "*", "*", "trace.jsonl.gz")):
    with gzip.open(p, "rt", encoding="utf-8", errors="replace") as fh:
        stamps = re.findall(r'"timestamp": "([^"]+)"', fh.read())
    n += 1
    if stamps:
        t = datetime.fromisoformat(min(stamps).replace("Z", "+00:00"))
        first = t if first is None or t < first else first
print("traces: %d; earliest timestamp: %s; protocol commit time: %s" % (n, first, frozen))
sys.exit(0 if first and first >= frozen else 1)
