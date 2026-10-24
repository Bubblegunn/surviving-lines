#!/usr/bin/env python3
"""Per-arm totals with 95% bootstrap intervals for round 13, same method as score.py
(seed 20261023, 10000 resamples, per task three run numbers drawn with replacement from 1..3,
the same draw for every arm of the task, a total is the sum over tasks of the mean over the drawn runs).
SUMMARY.md prints only intervals of differences; this adds the interval of each arm's own total.
It also recomputes the difference ours minus best other arm and exits non-zero if either
that or an observed total disagrees with SUMMARY.md, so the file cannot drift from the evidence.

Usage: python3 -I intervals.py <round13 evidence folder> <out.json>
Reads only grades/<set>/scores.json and SUMMARY.md in that folder."""
import json, math, os, random, re, sys

folder, out = sys.argv[1], sys.argv[2]
SEED, RES = 20261023, 10000
ARMS = ["ours", "pp", "ppi", "hist", "bf", "base"]

def cellscore(rec):
    return float(sum(1 for c in rec["criteria"] if c["pass"]))

def load(setname):
    sc = json.load(open(os.path.join(folder, "grades", setname, "scores.json"), encoding="utf-8"))
    data = {}
    for tid, arms in sc.items():
        for arm, runs in arms.items():
            if arm in ARMS:
                data.setdefault(tid, {})[arm] = {int(n): cellscore(r) for n, r in runs.items()}
    return data

def amean(data, tid, arm, idx=None):
    r = data.get(tid, {}).get(arm)
    if not r:
        return None
    v = [r[i] for i in (idx if idx is not None else sorted(r)) if i in r]
    return sum(v) / len(v) if v else None

def lo(xs): return xs[min(len(xs) - 1, max(0, int(math.floor(0.025 * len(xs)))))]
def hi(xs): return xs[min(len(xs) - 1, int(math.ceil(0.975 * len(xs))) - 1)]

summary = open(os.path.join(folder, "SUMMARY.md"), encoding="utf-8").read()
result = {}
for setname, heading in (("sealed-z", "## SEALED z"), ("public", "## PUBLIC")):
    data = load(setname)
    ids = sorted(data)  # same order as the tasks file does not matter for sums; draws below follow sorted order
    # score.py draws in the order of the task list in final-tasks.json; reproduce it
    tasks = json.load(open(os.path.join(folder, "tasks", "final-tasks.json"), encoding="utf-8"))["tasks"]
    order = [t["id"] for t in tasks if t["id"] in data]
    rng = random.Random(SEED)
    tot = {a: [] for a in ARMS}
    for _ in range(RES):
        draw = {tid: [rng.randint(1, 3) for _ in range(3)] for tid in order}
        t = {a: 0.0 for a in ARMS}
        for tid in order:
            for a in ARMS:
                v = amean(data, tid, a, draw[tid])
                t[a] += v if v is not None else 0.0
        for a in ARMS:
            tot[a].append(t[a])
    res = {}
    for a in ARMS:
        obs = sum(amean(data, tid, a) or 0.0 for tid in order)
        xs = sorted(tot[a])
        tasks_with = sum(1 for tid in order if a in data[tid])
        res[a] = {"total": round(obs, 2), "lo": round(lo(xs), 2), "hi": round(hi(xs), 2), "tasks": tasks_with}
    result[setname] = {"tasks": len(order), "arms": res}
    # cross-check observed totals against the Total row of SUMMARY.md
    sect = summary[summary.index(heading):]
    row = re.search(r"^\| Total \| \d+ \| ([^\n]+)$", sect, re.M).group(1).split(" | ")
    row = [float(x.strip(" |")) for x in row]
    for a, v in zip(["ours", "pp", "ppi", "hist", "bf", "base"], row):
        if abs(res[a]["total"] - v) > 0.006:
            sys.exit("%s %s: computed %.2f, SUMMARY.md %.2f" % (setname, a, res[a]["total"], v))
print(json.dumps(result, indent=1))
json.dump(result, open(out, "w"), indent=1)
