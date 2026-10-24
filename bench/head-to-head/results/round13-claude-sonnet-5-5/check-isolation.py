#!/usr/bin/env python3
"""Fails if any trace shows a run directory below the home directory or an API key as the auth source.
Reads the `init` event of every trace (scored runs, F6 re-runs, F9 runs). No network, no model calls."""
import glob
import gzip
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
paths = sorted(set(glob.glob(os.path.join(HERE, "runs", "*", "*", "*", "*", "trace.jsonl.gz"))
                   + glob.glob(os.path.join(HERE, "f6", "runs", "*", "trace.jsonl.gz"))
                   + glob.glob(os.path.join(HERE, "f9", "*", "runs", "*", "trace.jsonl.gz"))))
bad, seen = [], 0
for p in paths:
    found = False
    with gzip.open(p, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            try:
                o = json.loads(line)
            except ValueError:
                continue
            if o.get("type") == "system" and o.get("subtype") == "init":
                found = True
                seen += 1
                for k in ("cwd", "original_cwd"):
                    v = o.get(k) or ""
                    if not v.startswith("/private/tmp/") or "<home>" in v or "/Users/" in v:
                        bad.append((os.path.relpath(p, HERE), k, v))
                if o.get("apiKeySource") not in ("none", None):
                    bad.append((os.path.relpath(p, HERE), "apiKeySource", o.get("apiKeySource")))
                break
    if not found:
        bad.append((os.path.relpath(p, HERE), "init", "no init event"))
for b in bad:
    print("isolation problem: %s %s=%s" % b)
print("traces: %d; init events checked: %d; problems: %d" % (len(paths), seen, len(bad)))
sys.exit(0 if paths and not bad else 1)
