#!/usr/bin/env python3
"""List failing grader votes with their reasons, per iteration, task and run.

usage: python3 -I vote-reasons.py <grades-dir> <task,task> [iter,iter]
Reads <grades-dir>/<iter>/D/<task>-<run>.call<k>.out (stream-json or json) and prints, for each
criterion, how many votes passed and the reason of every failing vote. No network, no model calls.
"""
import collections
import json
import re
import sys

grades = sys.argv[1]
tasks = sys.argv[2].split(",")
iters = sys.argv[3].split(",") if len(sys.argv) > 3 else ["iter1", "iter2", "iter3"]


def verdicts(path):
    try:
        text = open(path).read()
    except OSError:
        return None
    result = None
    for line in text.splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("type") == "result":
            result = d.get("result")
    if result is None:
        try:
            result = json.loads(text).get("result")
        except ValueError:
            return None
    try:
        body = json.loads(re.search(r"\{.*\}", result, re.S).group(0))
        return list(body.values())[0]
    except (AttributeError, ValueError, TypeError, IndexError):
        return None


for it in iters:
    for task in tasks:
        for run in (1, 2, 3):
            votes = collections.defaultdict(list)
            unparsed = 0
            for call in (1, 2, 3):
                arr = verdicts(f"{grades}/{it}/{task[0]}/{task}-{run}.call{call}.out")
                if arr is None:
                    unparsed += 1
                    continue
                for a in arr:
                    votes[a["n"]].append((a["pass"], a["reason"]))
            print(f"## {it} {task} run{run}" + (f"  unparsed calls: {unparsed}" if unparsed else ""))
            for n, v in sorted(votes.items()):
                passed = sum(1 for p, _ in v if p)
                print(f" c{n}: {passed}/{len(v)}")
                if passed < len(v):
                    for p, reason in v:
                        if not p:
                            print("    FAIL-VOTE:", reason[:230])
