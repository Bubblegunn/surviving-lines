#!/usr/bin/env python3
"""Prints the earliest trace timestamp of the folder and fails if it is before the protocol commit time in summary-meta.json.
No network, no model calls. Proves (with the commit order in git) that no scored run started before the protocol was frozen.
Reads the traces of the scored runs, the F6 re-runs and the F9 runs; no cell of this round is reused."""
import glob
import gzip
import json
import os
import sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
meta = json.load(open(os.path.join(HERE, "summary-meta.json")))
frozen = datetime.fromisoformat(meta["protocol_commit_time"])


def stamps(path):
    out = []
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                ts = json.loads(line).get("timestamp")
            except (ValueError, AttributeError):
                continue
            if isinstance(ts, str):
                out.append(datetime.fromisoformat(ts.replace("Z", "+00:00")))
    return out


paths = sorted(set(glob.glob(os.path.join(HERE, "runs", "*", "*", "*", "*", "trace.jsonl.gz"))
                   + glob.glob(os.path.join(HERE, "f6", "runs", "*", "trace.jsonl.gz"))
                   + glob.glob(os.path.join(HERE, "f9", "*", "runs", "*", "trace.jsonl.gz"))))
first = last = None
for p in paths:
    s = stamps(p)
    if s:
        first = min(s) if first is None else min(first, min(s))
        last = max(s) if last is None else max(last, max(s))
print("traces: %d; earliest timestamp: %s; latest: %s; protocol commit time: %s" % (len(paths), first, last, frozen))
sys.exit(0 if paths and first and first >= frozen else 1)
