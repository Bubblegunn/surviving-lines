#!/usr/bin/env python3
"""Recomputes every table of SUMMARY.md from grades/ and tasks/. No network, no model calls.

Usage (run inside a results folder):
  python3 -I score.py            print SUMMARY.md to stdout
  python3 -I score.py --check    exit 1 unless SUMMARY.md equals that output byte for byte

Inputs: summary-meta.json (title, scoped sentence, departures: text written by people),
tasks/<set>/tasks.json, grades/<set>/scores.json (every grader vote, per cell and criterion).
A criterion passes when a majority of its valid votes pass (3 valid votes: 2 of 3; 2 valid votes: both);
fewer than 2 valid votes means the criterion is left out of that cell and marked err.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ARMS = ["ours", "pp", "ppi", "hist", "bf", "base"]
RIVALS = ["pp/ppi", "hist", "bf", "base"]


def majority(votes):
    valid = [v for v in votes if v is not None]
    if len(valid) < 2:
        return None
    if len(valid) == 3:
        return sum(valid) * 2 > len(valid)
    return valid[0] if valid[0] == valid[1] else None


def load(path):
    with open(os.path.join(HERE, path), encoding="utf-8") as fh:
        return json.load(fh)


def cells(scores, task, arm):
    """{run: (passed, err)} for one task and arm, recomputed from the raw votes."""
    out = {}
    for run, rec in sorted(scores.get(task, {}).get(arm, {}).items(), key=lambda kv: int(kv[0])):
        res = [majority(c["votes"]) for c in rec["criteria"]]
        out[run] = (sum(1 for r in res if r), sum(1 for r in res if r is None))
    return out


def mean(c):
    return sum(p for p, _ in c.values()) / len(c) if c else None


def fmt_cell(c):
    if not c:
        return "-"
    err = sum(e for _, e in c.values())
    return "%.2f (%s)%s" % (mean(c), "/".join(str(p) for p, _ in c.values()), " err=%d" % err if err else "")


def n_outcome(t):
    kinds = t.get("criteriaKinds")
    return sum(1 for k in kinds if k == "outcome") if kinds else len(t["criteria"])


def render_set(s):
    tasks = load("tasks/%s/tasks.json" % s["key"])["tasks"]
    scores = load("grades/%s/scores.json" % s["key"])
    lines = ["### %s" % s["label"], "", "Mean criteria passed per cell, runs in brackets; `err=n`: n criteria had fewer than two valid votes and are left out.", ""]
    lines.append("| Task | Criteria | " + " | ".join(ARMS) + " |")
    lines.append("| --- | --- | " + " | ".join("---" for _ in ARMS) + " |")
    totals = {a: 0.0 for a in ARMS}
    best = {}
    rows = []
    for t in tasks:
        row = []
        m = {}
        for a in ARMS:
            c = cells(scores, t["id"], a)
            row.append(fmt_cell(c))
            m[a] = mean(c)
            if m[a] is not None:
                totals[a] += m[a]
        pb = [x for x in (m["pp"], m["ppi"]) if x is not None]
        m["pp/ppi"] = max(pb) if pb else None
        best[t["id"]] = (m, n_outcome(t))
        lines.append("| %s | %d | %s |" % (t["id"], n_outcome(t), " | ".join(row)))
        rows.append(t["id"])
    mx = sum(n_outcome(t) for t in tasks)
    lines.append("| Total | %d | %s |" % (mx, " | ".join("%.2f" % totals[a] for a in ARMS)))
    # Rival totals: pp and ppi count as one rival, the better of the two per task.
    rt = {"pp/ppi": sum(best[i][0]["pp/ppi"] or 0 for i in rows)}
    for r in RIVALS[1:]:
        rt[r] = totals[r]
    top = max(rt, key=lambda k: rt[k])
    ours_lost = mx - totals["ours"]
    rival_lost = mx - rt[top]
    limit = 0.8 * rival_lost
    lines += ["", "**Rule A** (our lost points at most 80 percent of the lost points of the rival with the highest total).", ""]
    lines.append("- Maximum: %d. Ours: %.2f, lost %.2f." % (mx, totals["ours"], ours_lost))
    lines.append("- Rival totals (pp/ppi = better of the two per task): " + ", ".join("%s %.2f" % (k, rt[k]) for k in RIVALS) + ".")
    lines.append("- Highest rival: %s, lost %.2f; limit 0.8 x %.2f = %.2f." % (top, rival_lost, rival_lost, limit))
    ok_a = ours_lost <= limit + 1e-9
    lines.append("- %.2f <= %.2f is %s: **Rule A %s**." % (ours_lost, limit, "true" if ok_a else "false", "passes" if ok_a else "fails"))
    lines += ["", "**Rule B** (on every task our mean is strictly above every rival; where a rival is at the maximum, ours must be at the maximum too).", ""]
    fails = []
    for i in rows:
        m, nmax = best[i]
        o = m["ours"]
        bad = []
        for r in RIVALS:
            v = m[r]
            if v is None:
                continue
            if abs(v - nmax) < 1e-9:
                if abs(o - nmax) > 1e-9:
                    bad.append("%s %.2f at maximum, ours %.2f" % (r, v, o))
            elif not o > v + 1e-9:
                bad.append("%s %.2f, ours %.2f" % (r, v, o))
        if bad:
            fails.append("%s (%s)" % (i, "; ".join(bad)))
    lines.append("- Tasks checked: %d. Failing: %s." % (len(rows), ", ".join(fails) if fails else "none"))
    ok_b = not fails
    lines.append("- **Rule B %s**." % ("passes" if ok_b else "fails"))
    lines.append("")
    return lines, ok_a, ok_b, totals, rt


def main():
    meta = load("summary-meta.json")
    out = ["# %s" % meta["title"], "", "**Result.** %s" % meta["sentence"], "",
           "Protocol frozen in commit `%s` before any scored run (see `PROTOCOL.md`). Product: `%s`. Date: %s." % (meta["protocol_commit"], meta["product"], meta["date"]), ""]
    verdicts = []
    for s in meta["sets"]:
        block, a, b, totals, rt = render_set(s)
        out += block
        verdicts.append((s["label"], a, b))
    out += ["## Gate", ""]
    for label, a, b in verdicts:
        out.append("- %s: Rule A %s, Rule B %s." % (label, "passes" if a else "fails", "passes" if b else "fails"))
    gate = all(a and b for _, a, b in verdicts)
    out.append("- Gate (both sets, both rules): **%s**." % ("passed" if gate else "failed"))
    out += ["", "## Departures from the frozen protocol and caveats", ""] + ["- %s" % d for d in meta["departures"]] + [""]
    return "\n".join(out)


if __name__ == "__main__":
    text = main()
    if "--check" in sys.argv:
        cur = open(os.path.join(HERE, "SUMMARY.md"), encoding="utf-8").read()
        if cur != text:
            print("SUMMARY.md differs from score.py output", file=sys.stderr)
            sys.exit(1)
        print("SUMMARY.md matches score.py output")
    else:
        sys.stdout.write(text)
