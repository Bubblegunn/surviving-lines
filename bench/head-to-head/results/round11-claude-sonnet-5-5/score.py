#!/usr/bin/env python3
"""Recomputes SUMMARY.md of this folder from grades/ and runs/ (no network, no model calls).

Usage: python3 -I score.py [--check]     (--check: fail unless SUMMARY.md equals the recomputed text)
Reads: summary-meta.json, tasks/*.json, grades/<set>/scores.json, runs/<set>/<task>/<arm>/<n>/cost.json,
       reused.json, cost-ledger.tsv, f6.json (optional), f9.json (optional).
"""
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EPS = 1e-9
SEED = 20261023
RESAMPLES = 10000
ARMS = ["ours", "pp", "ppi", "hist", "bf", "base"]
OTHERS = ["pp", "ppi", "hist", "bf", "base"]
SETS = [("heldout-e", "HELD-OUT e", "tasks/e-tasks.json"), ("public", "PUBLIC", "tasks/tasks.json")]


def load(p, default=None):
    p = os.path.join(HERE, p)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else default


def majority(v):
    ok = [x for x in v if x is not None]
    if len(ok) < 2:
        return None
    return sum(ok) * 2 > len(ok) if len(ok) == 3 else (ok[0] if ok[0] == ok[1] else None)


def cell(rec):
    return float(sum(1 for c in rec["criteria"] if c["pass"]))


def mean(x):
    return sum(x) / len(x) if x else None


def f2(x):
    return "-" if x is None else "%.2f" % x


def collect(setname, tasks):
    sc = load("grades/%s/scores.json" % setname, {})
    data = {}  # task -> arm -> {n: score}
    for t in tasks:
        for arm in ARMS:
            runs = sc.get(t["id"], {}).get(arm, {})
            if runs:
                data.setdefault(t["id"], {})[arm] = {int(n): cell(r) for n, r in runs.items()}
    return sc, data


def nmax(t):
    k = t.get("criteriaKinds")
    return sum(1 for x in k if x == "outcome") if k else len(t["criteria"])


def arm_means(data, tid, arm):
    r = data.get(tid, {}).get(arm)
    return mean(list(r.values())) if r else None


def bestof(data, tid):
    a, b = arm_means(data, tid, "pp"), arm_means(data, tid, "ppi")
    v = [x for x in (a, b) if x is not None]
    return max(v) if v else None


def pct(xs, q):
    return xs[min(len(xs) - 1, max(0, int(math.floor(q * len(xs)))))]


def bootstrap(tasks, data, comparators):
    """comparators: name -> function(task_id, idx list) -> score or None. Returns name -> (lo, hi, observed)."""
    rng = random.Random(SEED)
    ids = [t["id"] for t in tasks if t["id"] in data]
    diffs = {k: [] for k in comparators}
    for _ in range(RESAMPLES):
        draw = {tid: [rng.randint(1, 3) for _ in range(3)] for tid in ids}
        tot = {k: 0.0 for k in comparators}
        tot["ours"] = 0.0
        for tid in ids:
            o = mean([data[tid]["ours"].get(i, 0.0) for i in draw[tid]])
            tot["ours"] += o
            for k, fn in comparators.items():
                v = fn(tid, draw[tid])
                tot[k] += v if v is not None else 0.0
        for k in comparators:
            diffs[k].append(tot["ours"] - tot[k])
    out = {}
    for k, fn in comparators.items():
        d = sorted(diffs[k])
        obs = sum(mean(list(data[tid]["ours"].values())) - (fn(tid, [1, 2, 3]) or 0.0) for tid in ids)
        out[k] = (pct(d, 0.025), d[min(len(d) - 1, int(math.ceil(0.975 * len(d))) - 1)], obs)
    return out


def arm_fn(arm):
    def f(tid, idx):
        r = DATA_CUR.get(tid, {}).get(arm)
        if not r:
            return None
        return mean([r.get(i, 0.0) for i in idx])
    return f


def best_fn(tid, idx):
    a, b = arm_fn("pp")(tid, idx), arm_fn("ppi")(tid, idx)
    v = [x for x in (a, b) if x is not None]
    return max(v) if v else None


DATA_CUR = {}


def section(setname, title, tasksfile, reused, out):
    global DATA_CUR
    tasks = (load(tasksfile) or {}).get("tasks", [])
    sc, data = collect(setname, tasks)
    DATA_CUR = data
    if not data:
        out.append("## %s\n\nNo graded cells.\n" % title)
        return {}
    graded = [t for t in tasks if t["id"] in data and all(arm_has3(data, t["id"], a) for a in ["ours"])]
    complete = len(graded) == len(tasks)
    out.append("## %s (%d tasks, %d graded%s)\n" % (title, len(tasks), len(graded), "" if complete else "; NOT COMPLETE, no claim for this set"))
    out.append("Mean criteria passed; runs in brackets (run 1/2/3); `R` marks arms whose cells are reused from round 8 (SDK path); `err=n` criteria with fewer than two valid votes after re-asks and the reverse pass (counted as not passed).\n")
    out.append("| Task | Criteria | " + " | ".join(ARMS) + " |")
    out.append("| --- | --- | " + " | ".join("---" for _ in ARMS) + " |")
    totals = {a: 0.0 for a in ARMS}
    for t in graded:
        row = []
        for a in ARMS:
            r = data[t["id"]].get(a)
            if not r:
                row.append("-")
                continue
            v = [r[k] for k in sorted(r)]
            errs = sum(1 for rec in sc[t["id"]][a].values() for c in rec["criteria"] if c["pass"] is None)
            totals[a] += mean(v)
            tag = " R" if (reused and a != "ours") else ""
            row.append("%.2f (%s) min %d max %d%s%s" % (mean(v), "/".join("%d" % x for x in v), min(v), max(v), " err=%d" % errs if errs else "", tag))
        out.append("| %s | %d | %s |" % (t["id"], nmax(t), " | ".join(row)))
    out.append("| Total | %d | %s |" % (sum(nmax(t) for t in graded), " | ".join("%.2f" % totals[a] for a in ARMS)))
    out.append("")
    # Rules
    maxs = sum(nmax(t) for t in graded)
    rivals = ["project-pilot (better of pp and ppi per task)", "hist", "bf", "base"]
    rt = {}
    rt[rivals[0]] = sum(bestof(data, t["id"]) or 0.0 for t in graded)
    for a in ("hist", "bf", "base"):
        rt[a] = totals[a]
    best_name = max(rt, key=lambda k: rt[k])
    ours_lost = maxs - totals["ours"]
    best_lost = maxs - rt[best_name]
    limit = 0.8 * best_lost
    ruleA = ours_lost <= limit + EPS
    out.append("**Rule A.** Ours lost %.2f of %d. The rival with the highest total is %s (%.2f), lost %.2f; limit 80%% = %.2f. %s.\n" % (ours_lost, maxs, best_name, rt[best_name], best_lost, limit, "PASS" if ruleA else "FAIL"))
    failB, failB2 = [], []
    for t in graded:
        tid, mx = t["id"], float(nmax(t))
        o = arm_means(data, tid, "ours")
        riv = {"project-pilot": bestof(data, tid), "hist": arm_means(data, tid, "hist"), "bf": arm_means(data, tid, "bf"), "base": arm_means(data, tid, "base")}
        okB = all(v is None or o > v + EPS or (v >= mx - EPS and o >= mx - EPS) for v in riv.values())
        sep = {a: arm_means(data, tid, a) for a in OTHERS}
        okB2 = all(v is None or o > v + EPS or (v >= mx - EPS and o >= mx - EPS) for v in sep.values())
        best_sep = max([v for v in sep.values() if v is not None] or [0.0])
        if not okB:
            failB.append((tid, o, max(v for v in riv.values() if v is not None)))
        if not okB2:
            failB2.append((tid, o, best_sep))
    out.append("**Rule B** (rivals as in round 8, pp and ppi as the better of the two per task): %s. Tasks failing: %s.\n" % ("PASS" if not failB else "FAIL", "none" if not failB else "; ".join("%s ours %.2f vs best %.2f" % x for x in failB)))
    okB2 = len(failB2) == 0 or (len(failB2) == 1 and failB2[0][2] - failB2[0][1] <= 0.34 + EPS)
    out.append("**Rule B'** (every other arm separately; at most one task not strictly above or at the ceiling together, deficit at most 0.34 on that task): %s. Tasks not strictly above/at ceiling: %s.\n" % ("PASS" if okB2 else "FAIL", "none" if not failB2 else "; ".join("%s ours %.2f vs best other %.2f (deficit %.2f)" % (x[0], x[1], x[2], x[2] - x[1]) for x in failB2)))
    # Bootstrap
    comp = {a: arm_fn(a) for a in OTHERS}
    comp["project-pilot best-of"] = best_fn
    bt = bootstrap(graded, data, comp)
    best_other = max(OTHERS, key=lambda a: (totals[a], -OTHERS.index(a)))
    out.append("**Bootstrap** (seed %d, %d resamples over runs, same run draw for every arm of a task; 95%% percentile interval; total points, ours minus comparator). Best other arm by observed total: **%s**.\n" % (SEED, RESAMPLES, best_other))
    out.append("| Comparator | observed difference | 95% interval | includes zero |")
    out.append("| --- | --- | --- | --- |")
    for k, (lo, hi, obs) in bt.items():
        out.append("| %s%s | %+.2f | [%+.2f, %+.2f] | %s |" % (k, " (best other)" if k == best_other else "", obs, lo, hi, "yes" if lo <= 0 <= hi else "no"))
    i1 = bt[best_other][0] > 0
    out.append("\nI1 (%s): lower bound for ours minus %s = %+.2f, so the interval %s zero. %s.\n" % (title, best_other, bt[best_other][0], "lies entirely above" if i1 else "includes or lies below", "I1 PASS" if (i1 and complete) else ("I1 FAIL" if complete else "I1 not claimed (set incomplete)")))
    # Grader reliability
    tot = agree = errs = 0
    for tid, arms in sc.items():
        for arm, runs in arms.items():
            for rec in runs.values():
                for c in rec["criteria"]:
                    tot += 1
                    v = c["votes"]
                    if all(x is not None for x in v) and len(set(v)) == 1:
                        agree += 1
                    if c["pass"] is None:
                        errs += 1
    rev = sum(1 for arms in sc.values() for runs in arms.values() for rec in runs.values() for c in rec["criteria"] if c.get("via") == "reverse")
    out.append("**Grader reliability.** %d criterion verdicts; all three votes equal on %d (%.1f%%); %d criteria decided by the reverse-order second grading; %d still `err`.\n" % (tot, agree, 100.0 * agree / max(tot, 1), rev, errs))
    # Cost per arm
    out.append("**Cost per arm** (USD, `total_cost_usd` of the run; reused cells are round 8 costs and not part of this round's total):\n")
    out.append("| Arm | cells | cost | mean per task | input tok | output tok | cache read | cache create | turns | wall s |")
    out.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    per_arm = {}
    for a in ARMS:
        agg = [0, 0.0, 0, 0, 0, 0, 0, 0.0]
        for t in tasks:
            for n in (1, 2, 3):
                c = load("runs/%s/%s/%s/%d/cost.json" % (setname, t["id"], a, n))
                if c:
                    agg[0] += 1
                    agg[1] += c.get("total_cost_usd") or 0
                    agg[2] += c.get("input_tokens") or 0
                    agg[3] += c.get("output_tokens") or 0
                    agg[4] += c.get("cache_read_input_tokens") or 0
                    agg[5] += c.get("cache_creation_input_tokens") or 0
                    agg[6] += c.get("num_turns") or 0
                    agg[7] += (c.get("duration_ms") or 0) / 1000.0
        per_arm[a] = agg
        if agg[0]:
            out.append("| %s%s | %d | %.2f | %.2f | %d | %d | %d | %d | %d | %.0f |" % (a, " (R)" if reused and a != "ours" else "", agg[0], agg[1], agg[1] * 3.0 / agg[0], agg[2], agg[3], agg[4], agg[5], agg[6], agg[7]))
    if per_arm["ours"][0] and per_arm["base"][0]:
        ob = (per_arm["ours"][1] / per_arm["ours"][0]) / (per_arm["base"][1] / per_arm["base"][0])
        out.append("\nOurs / base cost ratio per cell: %.2fx.\n" % ob)
    return {"complete": complete, "I1": i1 and complete, "A": ruleA, "B": not failB, "B2": okB2}


def arm_has3(data, tid, arm):
    return arm in data.get(tid, {}) and len(data[tid][arm]) >= 1


def passed(v):
    return sum(1 for x in v if x)


def f6_section(out):
    d = load("f6.json")
    if not d:
        out += ["## F6 independent audit", "", "Not run.", ""]
        return
    cells = d["cells"]
    out += ["## F6 independent audit", "", "%d cells drawn with `random.Random(%d)` from the %d graded cells of this round (cells named `<task>-<arm>-<n>`, sorted; ceil(0.10 x N)); each run again by a fresh agent session on a new fixture copy with the same arm and prompt, and graded alone (one answer, three calls, subscription CLI path). A cell in which any criterion stayed `err` is listed but not compared.\n" % (len(cells), d["seed"], d["graded_cells"])]
    tot = agree = within = nerr = ncells = 0
    rows = []
    for c in cells:
        o, n = c["original"], c["rerun"]
        errs = sum(1 for x in n if x is None) + sum(1 for x in o if x is None)
        so, sn = passed(o), passed(n)
        if errs:
            nerr += errs
            rows.append((c["cell"], c["set"], "reused" if c["reused_original"] else "new", len(o), so, sn, 0, errs, None))
            continue
        a = sum(1 for x, y in zip(o, n) if x == y)
        tot += len(o)
        agree += a
        ok1 = abs(so - sn) <= 1
        within += 1 if ok1 else 0
        ncells += 1
        rows.append((c["cell"], c["set"], "reused" if c["reused_original"] else "new", len(o), so, sn, a, errs, ok1))
    out.append("| Cell | set | original cell | criteria | original score | re-run score | criteria equal | err criteria (either grading) | within one point |")
    out.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for r in rows:
        out.append("| %s | %s | %s | %d | %d | %d | %d | %d | %s |" % (r[:8] + ("not gradable (err)" if r[8] is None else ("yes" if r[8] else "NO"),)))
    out.append("")
    bad = [r[0] for r in rows if r[8] is False]
    skipped = [r[0] for r in rows if r[8] is None]
    out.append("Cells with no `err` criterion: %d of %d. On these, criteria on which the independent verdict equals the original verdict: %d of %d (%.1f%%). Cells within one point: %d of %d (%.1f%%). Cells that differ by more than one point (a failed audit under the protocol): %s. Cells where a grading stayed `err` after the re-asks (the grader gave several answer blocks that did not parse; they are not compared and not counted as agreement): %s.\n" % (
        ncells, len(rows), agree, tot, 100.0 * agree / tot, within, ncells, 100.0 * within / ncells, ", ".join(bad) if bad else "none", ", ".join(skipped) or "none"))
    out.append("The F6 re-run is a new model run of the same cell, so a difference mixes agent variance and grader variance; it is not a pure grader audit.\n")


def f6b_section(out):
    d = load("f6b.json")
    f6 = load("f6.json")
    if not d:
        out += ["## F6b grader reproducibility audit", "", "Not run.", ""]
        return
    out += ["## F6b grader reproducibility audit (registered after F6 failed, before any F6b call)", "",
            "F6b-1: the same %d sampled cells, the original answers (no agent re-run), graded again in the original grading unit (all arms of the task and run together, same shuffled order) by fresh grader sessions, three calls, majority rule, re-ask passes, subscription CLI path. A criterion that stayed `err` in either grading counts as a disagreement and as not passed in the cell score. Pass condition fixed in advance: no cell differs by more than one point and criterion agreement is at least 90%%.\n" % len(d["cells"])]
    out.append("| Cell | criteria | original score | regrade score | criteria equal | err (regrade) | within one point |")
    out.append("| --- | --- | --- | --- | --- | --- | --- |")
    tot = agree = 0
    bad = []
    for c in d["cells"]:
        o, n = c["original"], c["regrade"]
        a = sum(1 for x, y in zip(o, n) if x is not None and x == y)
        tot += len(o)
        agree += a
        so, sn = passed(o), passed(n)
        ok = abs(so - sn) <= 1
        if not ok:
            bad.append(c["cell"])
        out.append("| %s | %d | %d | %d | %d | %d | %s |" % (c["cell"], len(o), so, sn, a, sum(1 for x in n if x is None), "yes" if ok else "NO"))
    rate = 100.0 * agree / tot
    ok = not bad and rate >= 90.0
    out += ["", "Criteria equal to the original verdict: %d of %d (%.1f%%). Cells differing by more than one point: %s. **F6b-1 %s** (pass condition: no such cell and at least 90%% agreement).\n" % (agree, tot, rate, ", ".join(bad) if bad else "none", "PASS" if ok else "FAIL")]
    comp = [c for c in (f6 or {}).get("cells", []) if all(x is not None for x in c["original"] + c["rerun"])]
    by3 = {c["cell"]: c["original_three_runs"] for c in d["cells"]}
    inside = 0
    out += ["F6b-2 (descriptive, no new calls, no pass condition): for each of the %d comparable F6 re-runs, whether the re-run score lies within the minimum and maximum of that cell's three original runs (reused rival cells: their three round 8 runs).\n" % len(comp), "| Cell | re-run score | original three runs | within min-max |", "| --- | --- | --- | --- |"]
    for c in comp:
        r = passed(c["rerun"])
        t3 = by3[c["cell"]]
        w = min(t3) <= r <= max(t3)
        inside += 1 if w else 0
        out.append("| %s | %d | %s | %s |" % (c["cell"], r, "/".join(str(x) for x in t3), "yes" if w else "no"))
    out += ["", "Within the range of the three original runs: %d of %d.\n" % (inside, len(comp))]


def f9_section(out):
    d = load("f9.json")
    if not d:
        out += ["## F9 other models", "", "Not run.", ""]
        return
    best = d["best_rival"]
    out += ["## F9 other models", "", "One run per task (run 1), arms ours, base and the best rival of the task (highest Sonnet mean of this round in that set; ties pp, ppi, hist, bf), both sets, graded per task by the same method. Score = criteria passed. No bootstrap and no claim of being first: one run per task. Rule B per model: ours strictly above base and the best rival on every task, or at the ceiling together with them.\n"]
    for m in ("claude-haiku-5-5", "claude-opus-5-5"):
        mm = d["models"].get(m)
        out.append("### %s\n" % m)
        if not mm:
            out += ["Not run or no cell graded.", ""]
            continue
        for setname, title, tf in SETS:
            tasks = (load(tf) or {}).get("tasks", [])
            sc = mm.get(setname, {})
            out.append("**%s**\n" % title)
            out.append("| Task | max | ours | base | best rival (name) | Rule B |")
            out.append("| --- | --- | --- | --- | --- | --- |")
            to = tb = tr = 0.0
            fails, missing = [], []
            for t in tasks:
                tid = t["id"]
                a = sc.get(tid, {})
                rv = best.get(tid)
                if not all(k in a for k in ("ours", "base", rv)):
                    missing.append(tid)
                    out.append("| %s | %d | - | - | - | not graded |" % (tid, nmax(t)))
                    continue
                o, b, r = passed(a["ours"]), passed(a["base"]), passed(a[rv])
                errs = sum(1 for k in ("ours", "base", rv) for x in a[k] if x is None)
                mx = nmax(t)
                ok = all(o > v or (v >= mx and o >= mx) for v in (b, r))
                if not ok:
                    fails.append(tid)
                to += o
                tb += b
                tr += r
                out.append("| %s | %d | %d | %d | %d (%s) | %s%s |" % (tid, mx, o, b, r, rv, "ok" if ok else "NO", " err=%d" % errs if errs else ""))
            if missing:
                out.append("\nNot completed: %s not graded; no totals claimed for this set.\n" % ", ".join(missing))
            else:
                out.append("| Total | %d | %d | %d | %d | Rule B %s |" % (sum(nmax(t) for t in tasks), to, tb, tr, "PASS" if not fails else "FAIL on " + ", ".join(fails)))
                out.append("")
        out.append("")


def main():
    meta = load("summary-meta.json", {})
    reused = load("reused.json", {})
    out = ["# %s" % meta.get("title", "surviving-lines round 11 confirmation"), ""]
    if meta.get("sentence"):
        out += ["**Result.** " + meta["sentence"], ""]
    res = {}
    for setname, title, tf in SETS:
        res[setname] = section(setname, title, tf, setname == "public", out)
    out.append("## Round cost (USD, from the shim ledger rows of this round; every call)\n")
    out.append("| Category | calls | USD |")
    out.append("| --- | --- | --- |")
    gt = 0.0
    p = os.path.join(HERE, "cost-ledger.tsv")
    if os.path.exists(p):
        for l in open(p):
            f = l.rstrip("\n").split("\t")
            if len(f) >= 3 and f[0] != "category":
                out.append("| %s | %s | %s |" % (f[0], f[1], f[2]))
                if f[0] != "grand total (calls above plus controller session, if listed)":
                    try:
                        gt += float(f[2])
                    except ValueError:
                        pass
        out.append("| sum of rows above | | %.2f |" % gt)
    out.append("")
    f6_section(out)
    f6b_section(out)
    f9_section(out)
    for k in ("grader_reliability_note", "departures", "payer", "versions"):
        if meta.get(k):
            out += ["## " + k.replace("_", " ").capitalize(), "", meta[k], ""]
    text = "\n".join(out).rstrip() + "\n"
    path = os.path.join(HERE, "SUMMARY.md")
    if "--check" in sys.argv:
        if open(path, encoding="utf-8").read() != text:
            print("SUMMARY.md differs from the recomputed text")
            sys.exit(1)
        print("score.py --check: SUMMARY.md matches the recomputation")
    else:
        open(path, "w", encoding="utf-8").write(text)
        print(text)


main()
