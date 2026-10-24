#!/usr/bin/env python3
"""Recomputes SUMMARY.md of this folder from the files in it (no network, no model calls).

Usage: python3 -I score.py [--check]     (--check: fail unless SUMMARY.md equals the recomputed text)
Reads: summary-meta.json, tasks/final-tasks.json, grades/<set>/scores.json and the grader replies next to it,
       runs/<set>/<task>/<arm>/<n>/{cost.json,trace.jsonl.gz}, cost-ledger.tsv, drive.log.txt,
       f6/sample.json, f6/grader/<unit>/grade/scores.json, f6/runs/<cell>/grade/scores.json,
       f9/best.json, f9/<model>/grade/scores.json (the F6 and F9 files are optional: a missing part prints "Not run").
Sets: SEALED z (task ids HZ*) and PUBLIC (all other tasks of tasks/final-tasks.json).
Votes: five per criterion, a criterion is the strict majority of its valid votes, `err` below MIN_VALID valid votes.
"""
import gzip
import json
import math
import os
import random
import re
import sys

HERE = os.environ.get("SCORE_ROOT") or os.path.dirname(os.path.abspath(__file__))
EPS = 1e-9
SEED = 20261023
RESAMPLES = 10000
ARMS = ["ours", "pp", "ppi", "hist", "bf", "base"]
OTHERS = ["pp", "ppi", "hist", "bf", "base"]
SETS = [("sealed-z", "SEALED z"), ("public", "PUBLIC")]
VOTES = 5
MIN_VALID = 3
RUNS = (1, 2, 3)
HOOK_TEXT = "Check your answer against surviving-lines"
F9_MODELS = ("claude-haiku-5-5", "claude-opus-5-5")
CLAIM_WORDS = re.compile(r"\bfirst\b|highest total", re.I)


def load(p, default=None):
    p = os.path.join(HERE, p)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else default


def set_of(task_id):
    return "sealed-z" if task_id.startswith("HZ") else "public"


def majority(v):
    """True or False by the strict majority of the valid votes; None (err) below MIN_VALID valid votes."""
    ok = [x for x in v if x is not None]
    if len(ok) < MIN_VALID:
        return None
    return sum(1 for x in ok if x) * 2 > len(ok)


def reason_first(raw):
    """True when every entry of a grader reply writes "reason" before "pass"; None when the reply does not parse."""
    try:
        env = json.loads(raw)
        text = env["result"] if isinstance(env, dict) and isinstance(env.get("result"), str) else raw
    except ValueError:
        text = raw
    try:
        obj = json.loads(text[text.find("{"):text.rfind("}") + 1], object_pairs_hook=lambda p: p)
    except ValueError:
        return None
    ok = True
    if not isinstance(obj, list):
        return None
    for _lab, entries in obj:
        if not isinstance(entries, list):
            return None
        for e in entries:
            keys = [k for k, _ in e] if isinstance(e, list) else []
            if "reason" not in keys or "pass" not in keys or keys.index("reason") > keys.index("pass"):
                ok = False
    return ok


def cell(rec):
    return float(sum(1 for c in rec["criteria"] if c["pass"]))


def passed(v):
    return sum(1 for x in v if x)


def mean(x):
    return sum(x) / len(x) if x else None


def nmax(t):
    k = t.get("criteriaKinds")
    return sum(1 for x in k if x == "outcome") if k else len(t["criteria"])


def expected_arms(t):
    return [a for a in ARMS if a != "ppi" or t.get("ppInvokedPrompt")]


def collect(sc, tasks):
    """data: task -> arm -> {run number: score}."""
    data = {}
    for t in tasks:
        for arm in ARMS:
            runs = sc.get(t["id"], {}).get(arm, {})
            if runs:
                data.setdefault(t["id"], {})[arm] = {int(n): cell(r) for n, r in runs.items()}
    return data


def arm_mean(data, tid, arm, idx=None):
    r = data.get(tid, {}).get(arm)
    if not r:
        return None
    vals = [r[i] for i in (idx if idx is not None else sorted(r)) if i in r]
    return mean(vals)


def bestof(data, tid, idx=None):
    v = [x for x in (arm_mean(data, tid, "pp", idx), arm_mean(data, tid, "ppi", idx)) if x is not None]
    return max(v) if v else None


def pct_lo(xs, q=0.025):
    return xs[min(len(xs) - 1, max(0, int(math.floor(q * len(xs)))))]


def pct_hi(xs, q=0.975):
    return xs[min(len(xs) - 1, int(math.ceil(q * len(xs))) - 1)]


def make_comparators(data):
    comp = {a: (lambda tid, idx, a=a: arm_mean(data, tid, a, idx)) for a in OTHERS}
    comp["project-pilot best-of"] = lambda tid, idx: bestof(data, tid, idx)
    return comp


def bootstrap(ids, data, comparators, seed=SEED, resamples=RESAMPLES):
    """Paired bootstrap over runs: per resample and task, three run numbers are drawn with replacement from 1..3 and
    the same draw is used for every arm of the task; an arm's total is the sum over tasks of its mean over the drawn runs
    (a run that does not exist is skipped; an arm without cells on a task adds 0). Returns name -> (lo, hi, observed)."""
    rng = random.Random(seed)
    diffs = {k: [] for k in comparators}
    for _ in range(resamples):
        draw = {tid: [rng.randint(1, 3) for _ in range(3)] for tid in ids}
        ours = 0.0
        tot = {k: 0.0 for k in comparators}
        for tid in ids:
            o = arm_mean(data, tid, "ours", draw[tid])
            ours += o if o is not None else 0.0
            for k, fn in comparators.items():
                v = fn(tid, draw[tid])
                tot[k] += v if v is not None else 0.0
        for k in comparators:
            diffs[k].append(ours - tot[k])
    out = {}
    for k, fn in comparators.items():
        d = sorted(diffs[k])
        obs = sum((arm_mean(data, tid, "ours") or 0.0) - (fn(tid, None) or 0.0) for tid in ids)
        out[k] = (pct_lo(d), pct_hi(d), obs)
    return out


def at_ceiling_or_above(o, v, mx):
    """Ours o against a rival v on a task with maximum mx: strictly above, or both at the maximum."""
    return v is None or o > v + EPS or (v >= mx - EPS and o >= mx - EPS)


def rule_b(data, tasks):
    """Rule B: ours strictly above every rival on every task (pp and ppi as the better of the two), or at the ceiling together.
    Returns (pass, [(task, ours, best rival)])."""
    fails = []
    for t in tasks:
        tid, mx = t["id"], float(nmax(t))
        o = arm_mean(data, tid, "ours")
        if o is None:
            continue
        riv = {"project-pilot": bestof(data, tid), "hist": arm_mean(data, tid, "hist"), "bf": arm_mean(data, tid, "bf"), "base": arm_mean(data, tid, "base")}
        if not all(at_ceiling_or_above(o, v, mx) for v in riv.values()):
            fails.append((tid, o, max(v for v in riv.values() if v is not None)))
    return not fails, fails


def rule_b2(data, tasks):
    """Rule B': every other arm separately; at most one task not strictly above or at the ceiling together, with a deficit
    to the best other arm of at most 0.34 on that task. Returns (pass, [(task, ours, best other)])."""
    fails = []
    for t in tasks:
        tid, mx = t["id"], float(nmax(t))
        o = arm_mean(data, tid, "ours")
        if o is None:
            continue
        sep = {a: arm_mean(data, tid, a) for a in OTHERS}
        if not all(at_ceiling_or_above(o, v, mx) for v in sep.values()):
            fails.append((tid, o, max([v for v in sep.values() if v is not None] or [0.0])))
    ok = len(fails) == 0 or (len(fails) == 1 and fails[0][2] - fails[0][1] <= 0.34 + EPS)
    return ok, fails


def rule_a(maxs, totals, best_total):
    ours_lost = maxs - totals
    best_lost = maxs - best_total
    limit = 0.8 * best_lost
    return ours_lost <= limit + EPS, ours_lost, best_lost, limit


def f6_compare(cells):
    """cells: [{"cell", "original": [bool|None], "regrade": [bool|None]}]. Criteria agree when both verdicts exist and are equal
    (an err in either grading is a disagreement). Pass: no cell differs by more than one point and agreement is at least 90%.
    Returns dict(agree, total, rate, bad, passed, rows)."""
    tot = agree = 0
    bad, rows = [], []
    for c in cells:
        o, n = c["original"], c["regrade"]
        a = sum(1 for x, y in zip(o, n) if x is not None and y is not None and x == y)
        tot += len(o)
        agree += a
        so, sn = passed(o), passed(n)
        ok = abs(so - sn) <= 1
        if not ok:
            bad.append(c["cell"])
        rows.append((c["cell"], len(o), so, sn, a, sum(1 for x in n if x is None) + sum(1 for x in o if x is None), ok))
    rate = 100.0 * agree / tot if tot else 0.0
    return {"agree": agree, "total": tot, "rate": rate, "bad": bad, "passed": bool(cells) and not bad and rate >= 90.0 - EPS, "rows": rows}


def f6_sample(names, seed):
    return random.Random(seed).sample(sorted(names), int(math.ceil(0.10 * len(names))))


# ---- trace helpers ---------------------------------------------------------

def hook_blocked(path):
    """True when the trace holds the Stop hook's repair request, False when not, None when there is no trace."""
    if not os.path.exists(path):
        return None
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if HOOK_TEXT in line:
                try:
                    if json.loads(line).get("type") != "user":
                        continue
                except ValueError:
                    pass
                return True
    return False


def read_cost(setname, tid, arm, n):
    return load("runs/%s/%s/%s/%d/cost.json" % (setname, tid, arm, n))


# ---- sections ---------------------------------------------------------------

def section(setname, title, tasks, out):
    sc = load("grades/%s/scores.json" % setname, {})
    data = collect(sc, tasks)
    if not data:
        out.append("## %s\n\nNo graded cells.\n" % title)
        return {"complete": False, "I1": False, "A": None, "B": None, "B2": None, "tasks": len(tasks), "graded": 0}
    graded = [t for t in tasks if t["id"] in data and "ours" in data[t["id"]]]
    missing = []
    for t in tasks:
        for a in expected_arms(t):
            have = {int(n) for n in sc.get(t["id"], {}).get(a, {})}
            for n in RUNS:
                if n not in have:
                    missing.append("%s-%s-%d" % (t["id"], a, n))
    complete = not missing and len(graded) == len(tasks)
    out.append("## %s (%d tasks, %d with graded ours cells%s)\n" % (title, len(tasks), len(graded), "" if complete else "; NOT COMPLETE, no claim for this set"))
    if missing:
        out.append("Cells without a graded result (%d): %s.\n" % (len(missing), ", ".join(missing[:40]) + (" ..." if len(missing) > 40 else "")))
    out.append("Mean criteria passed; every run's score in brackets (run 1/2/3); `n=` appears when fewer than three runs are graded; no cell is reused in this round; `err=n`: criteria with fewer than %d valid votes after the re-asks and the reverse pass (counted as not passed). `ppi` has cells only on tasks with an invoked prompt (`-` elsewhere).\n" % MIN_VALID)
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
            row.append("%.2f (%s) min %d max %d%s%s" % (mean(v), "/".join("%d" % x for x in v), min(v), max(v), " n=%d" % len(v) if len(v) < 3 else "", " err=%d" % errs if errs else ""))
        out.append("| %s | %d | %s |" % (t["id"], nmax(t), " | ".join(row)))
    out.append("| Total | %d | %s |" % (sum(nmax(t) for t in graded), " | ".join("%.2f" % totals[a] for a in ARMS)))
    out.append("")
    # Rules
    maxs = sum(nmax(t) for t in graded)
    rt = {"project-pilot (better of pp and ppi per task)": sum(bestof(data, t["id"]) or 0.0 for t in graded)}
    for a in ("hist", "bf", "base"):
        rt[a] = totals[a]
    best_name = max(rt, key=lambda k: rt[k])
    okA, lostO, lostB, limit = rule_a(maxs, totals["ours"], rt[best_name])
    out.append("**Rule A.** Ours lost %.2f of %d. The rival with the highest total is %s (%.2f), lost %.2f; limit 80%% = %.2f. %s.\n" % (lostO, maxs, best_name, rt[best_name], lostB, limit, "PASS" if okA else "FAIL"))
    okB, failB = rule_b(data, graded)
    out.append("**Rule B** (pp and ppi as the better of the two per task): %s. Tasks failing: %s.\n" % ("PASS" if okB else "FAIL", "none" if not failB else "; ".join("%s ours %.2f vs best %.2f" % x for x in failB)))
    okB2, failB2 = rule_b2(data, graded)
    out.append("**Rule B'** (every other arm separately; at most one task not strictly above or at the ceiling together, deficit at most 0.34 on that task): %s. Tasks not strictly above/at ceiling: %s.\n" % ("PASS" if okB2 else "FAIL", "none" if not failB2 else "; ".join("%s ours %.2f vs best other %.2f (deficit %.2f)" % (x[0], x[1], x[2], x[2] - x[1]) for x in failB2)))
    # Bootstrap
    ids = [t["id"] for t in graded]
    bt = bootstrap(ids, data, make_comparators(data))
    best_other = max(OTHERS, key=lambda a: (totals[a], -OTHERS.index(a)))
    out.append("**Bootstrap** (seed %d, %d resamples over runs, the same run draw for every arm of a task; 95%% percentile interval; total points, ours minus comparator). Best other arm by observed total: **%s**.\n" % (SEED, RESAMPLES, best_other))
    out.append("| Comparator | observed difference | 95% interval | includes zero |")
    out.append("| --- | --- | --- | --- |")
    for k, (lo, hi, obs) in bt.items():
        out.append("| %s%s | %+.2f | [%+.2f, %+.2f] | %s |" % (k, " (best other)" if k == best_other else "", obs, lo, hi, "yes" if lo <= 0 <= hi else "no"))
    i1 = bt[best_other][0] > 0
    out.append("\nI1 (%s): lower bound for ours minus %s = %+.2f, so the interval %s zero. %s.\n" % (title, best_other, bt[best_other][0], "lies entirely above" if i1 else "includes or lies below", "I1 PASS" if (i1 and complete) else ("I1 FAIL" if complete else "I1 not claimed (set incomplete)")))
    # Grader reliability
    crits = [c for arms in sc.values() for runs in arms.values() for rec in runs.values() for c in rec["criteria"]]
    tot = len(crits)
    agree = sum(1 for c in crits if all(x is not None for x in c["votes"]) and len(set(c["votes"])) == 1)
    errs = sum(1 for c in crits if c["pass"] is None)
    rev = sum(1 for c in crits if c.get("via") == "reverse")
    nvotes = sum(len(c["votes"]) for c in crits)
    nvalid = sum(1 for c in crits for x in c["votes"] if x is not None)
    nprob = sum(len(rec.get("problems") or []) for arms in sc.values() for runs in arms.values() for rec in runs.values())
    gdir = os.path.join(HERE, "grades", setname)
    rf = [reason_first(open(os.path.join(gdir, f), encoding="utf-8", errors="replace").read()) for f in sorted(os.listdir(gdir)) if ".call" in f and f.endswith(".out")] if os.path.isdir(gdir) else []
    parsed = [x for x in rf if x is not None]
    out.append("**Grader reliability.** %d criterion verdicts, %d votes of which %d valid (%d votes without a result); all five votes equal on %d verdicts (%.1f%%); %d criteria decided by the reverse-order second grading; %d still `err`; %d problems recorded in scores.json. Grader replies kept: %d, of which %d parsed and %d (%.1f%%) wrote `reason` before `pass`.\n" % (tot, nvotes, nvalid, nvotes - nvalid, agree, 100.0 * agree / max(tot, 1), rev, errs, nprob, len(rf), len(parsed), sum(1 for x in parsed if x), 100.0 * sum(1 for x in parsed if x) / max(len(parsed), 1)))
    # Cost per arm
    out.append("**Cost per arm** (USD, list-price `total_cost_usd` of the run, from `cost.json` of each cell):\n")
    out.append("| Arm | cells | cost | mean per cell | mean per task | input tok | output tok | cache read | cache create | turns | wall s |")
    out.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    per_arm = {}
    for a in ARMS:
        agg = [0, 0.0, 0, 0, 0, 0, 0, 0.0]
        tasks_with = set()
        for t in tasks:
            for n in RUNS:
                c = read_cost(setname, t["id"], a, n)
                if c:
                    tasks_with.add(t["id"])
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
            out.append("| %s | %d | %.2f | %.3f | %.2f | %d | %d | %d | %d | %d | %.0f |" % (a, agg[0], agg[1], agg[1] / agg[0], agg[1] / len(tasks_with), agg[2], agg[3], agg[4], agg[5], agg[6], agg[7]))
    if per_arm["ours"][0]:
        ratios = ["%s %.2fx" % (a, (per_arm["ours"][1] / per_arm["ours"][0]) / (per_arm[a][1] / per_arm[a][0])) for a in OTHERS if per_arm[a][0] and per_arm[a][1]]
        out.append("\nOurs / other cost ratio per cell: %s.\n" % ", ".join(ratios))
    return {"complete": complete, "I1": i1 and complete, "A": okA, "B": okB, "B2": okB2, "tasks": len(tasks), "graded": len(graded), "best_other": best_other, "reasons_first": (sum(1 for x in parsed if x), len(parsed)), "agree": (agree, tot)}


def hook_section(tasks_by_set, out):
    out.append("## Hook (Stop hook in the `ours` cells)\n")
    out.append("A cell counts as blocked when its trace holds the hook's repair request (a user message containing \"%s\"). Scores are criteria passed (the final answer is what the grader saw).\n" % HOOK_TEXT)
    out.append("| Set | ours cells | blocked | share blocked | mean score blocked | mean score unblocked |")
    out.append("| --- | --- | --- | --- | --- | --- |")
    allb, allu, listing = [], [], []
    for setname, title in SETS:
        sc = load("grades/%s/scores.json" % setname, {})
        b, u = [], []
        for t in tasks_by_set[setname]:
            for n, rec in sorted(sc.get(t["id"], {}).get("ours", {}).items(), key=lambda kv: int(kv[0])):
                blk = hook_blocked(os.path.join(HERE, "runs", setname, t["id"], "ours", n, "trace.jsonl.gz"))
                if blk is None:
                    continue
                (b if blk else u).append(cell(rec))
                if blk:
                    listing.append("%s-ours-%s (%d)" % (t["id"], n, cell(rec)))
        allb += b
        allu += u
        n_all = len(b) + len(u)
        out.append("| %s | %d | %d | %s | %s | %s |" % (title, n_all, len(b), "%.1f%%" % (100.0 * len(b) / n_all) if n_all else "-", "%.2f" % mean(b) if b else "-", "%.2f" % mean(u) if u else "-"))
    n_all = len(allb) + len(allu)
    out.append("| Both sets | %d | %d | %s | %s | %s |" % (n_all, len(allb), "%.1f%%" % (100.0 * len(allb) / n_all) if n_all else "-", "%.2f" % mean(allb) if allb else "-", "%.2f" % mean(allu) if allu else "-"))
    out.append("")
    if listing:
        out.append("Blocked cells (score in brackets): %s.\n" % ", ".join(listing))


def cost_section(out):
    out.append("## Round cost (USD, from the wrapper ledger rows of this round; every call, list-price estimate)\n")
    out.append("| Category | calls | USD |")
    out.append("| --- | --- | --- |")
    rows = []
    p = os.path.join(HERE, "cost-ledger.tsv")
    if os.path.exists(p):
        for l in open(p, encoding="utf-8"):
            f = l.rstrip("\n").split("\t")
            if len(f) >= 3 and f[0] != "category":
                try:
                    rows.append((f[0], f[1], float(f[2])))
                except ValueError:
                    continue
    for c, n, usd in rows:
        out.append("| %s | %s | %.4f |" % (c, n, usd))
    groups = [("scored runs", lambda c: c.startswith("runs-")), ("grading of the scored runs", lambda c: c.startswith("grade-")),
              ("F6 (grader and runs)", lambda c: c.startswith("f6-")), ("F9", lambda c: c.startswith("f9-")),
              ("development gates and probes", lambda c: c.startswith("development")),
              ("ledger rows of the final folder that no category matched", lambda c: c.startswith("final-unmapped")),
              ("not in the wrapper ledger (writers, research, implementers, reviewers, controller; as given in cost-ledger.tsv)", lambda c: c.startswith("other-"))]
    out.append("")
    if rows:
        out.append("| Group | USD |")
        out.append("| --- | --- |")
        for name, fn in groups:
            out.append("| %s | %.2f |" % (name, sum(r[2] for r in rows if fn(r[0]))))
        out.append("| Grand total (all rows above) | %.2f |" % sum(r[2] for r in rows))
        out.append("")
        run_ledger = sum(r[2] for r in rows if r[0].startswith("runs-out"))
        run_cells = 0.0
        for setname, _t in SETS:
            sc = load("grades/%s/scores.json" % setname, {})
            for tid, arms in sc.items():
                for arm, runs in arms.items():
                    for n in runs:
                        c = read_cost(setname, tid, arm, int(n))
                        run_cells += (c or {}).get("total_cost_usd") or 0.0
        out.append("Cross-check: `cost.json` of the graded scored cells sums to %.2f USD; the ledger rows for the scored runs sum to %.2f USD (the difference is cells set aside, failed attempts and cells not yet graded).\n" % (run_cells, run_ledger))
    else:
        out.append("No ledger rows.\n")


def f6_section(out, graded_names, all_scores):
    sample = load("f6/sample.json")
    if not sample:
        out += ["## F6 independent audit", "", "Not run.", ""]
        return None
    cells = sample["cells"]
    expect = f6_sample(graded_names, sample["seed"])
    reproduced = [c["cell"] for c in cells] == expect and sample["graded_cells"] == len(graded_names)
    out += ["## F6 independent audit, part 1: F6-grader (pass or fail)", "",
            "%d cells drawn with `random.Random(%d).sample` from the %d graded cells of this round (cells named `<task>-<arm>-<n>`, sorted; ceil(0.10 x N)). Sample reproduced from the graded cells by this script: **%s**. Their ORIGINAL answers (no agent re-run) were graded again by fresh grader sessions in the original grading unit (all arms of the task and run together, same shuffled order), five calls, same majority rule, re-ask passes, no reverse pass. A criterion that is `err` in either grading counts as a disagreement and as not passed. **Pass condition, fixed before the first run:** no cell differs by more than one point and criterion agreement is at least 90%%.\n" % (len(cells), sample["seed"], len(graded_names), "yes" if reproduced else "NO (the recorded sample differs from the rule)")]
    comp, missing = [], []
    for c in cells:
        tid, arm, n = c["cell"].rsplit("-", 2)
        o = all_scores.get(tid, {}).get(arm, {}).get(n)
        rg = load("f6/grader/%s-%s/grade/scores.json" % (tid, n), {}).get(tid, {}).get(arm, {}).get(n)
        if not o or not rg:
            missing.append(c["cell"])
            continue
        comp.append({"cell": c["cell"], "set": set_of(tid), "original": [x["pass"] for x in o["criteria"]], "regrade": [x["pass"] for x in rg["criteria"]]})
    res = f6_compare(comp)
    out.append("| Cell | set | criteria | original score | regrade score | criteria equal | err (either grading) | within one point |")
    out.append("| --- | --- | --- | --- | --- | --- | --- | --- |")
    for (name, nc, so, sn, a, e, ok), c in zip(res["rows"], comp):
        out.append("| %s | %s | %d | %d | %d | %d | %d | %s |" % (name, c["set"], nc, so, sn, a, e, "yes" if ok else "NO"))
    for m in missing:
        out.append("| %s | %s | - | - | - | - | - | not regraded |" % (m, set_of(m.rsplit("-", 2)[0])))
    complete = not missing
    out += ["", "Criteria equal to the original verdict: %d of %d (%.1f%%). Cells differing by more than one point: %s.%s **F6-grader %s** (pass condition: no such cell and at least 90%% agreement).\n" % (res["agree"], res["total"], res["rate"], ", ".join(res["bad"]) if res["bad"] else "none", " Cells not regraded: %d." % len(missing) if missing else "", ("PASS" if res["passed"] else "FAIL") if complete else "NOT COMPLETE (no verdict)")]
    out += ["## F6 independent audit, part 2: F6-runs (descriptive, no pass condition)", "",
            "The same %d cells were run again once (same arm and prompt, new fixture copy) and the new answer was graded alone (one answer, five calls, same method). Reported: the re-run score against the minimum and maximum of the cell's three original runs.\n" % len(cells),
            "| Cell | re-run score | original three runs | within min-max |", "| --- | --- | --- | --- |"]
    inside = ncomp = 0
    for c in cells:
        tid, arm, n = c["cell"].rsplit("-", 2)
        t3 = [int(cell(all_scores[tid][arm][str(k)])) for k in RUNS if str(k) in all_scores.get(tid, {}).get(arm, {})]
        r = load("f6/runs/%s/grade/scores.json" % c["cell"], {}).get(tid, {}).get(arm, {}).get(n)
        t3s = "/".join(str(x) for x in t3)
        if r is None:
            out.append("| %s | not run or not graded | %s | - |" % (c["cell"], t3s))
            continue
        rv = [x["pass"] for x in r["criteria"]]
        if any(x is None for x in rv):
            out.append("| %s | not gradable (err) | %s | - |" % (c["cell"], t3s))
            continue
        w = bool(t3) and min(t3) <= passed(rv) <= max(t3)
        ncomp += 1
        inside += 1 if w else 0
        out.append("| %s | %d | %s | %s |" % (c["cell"], passed(rv), t3s, "yes" if w else "no"))
    out += ["", "Within the range of the three original runs: %d of %d gradable re-runs.\n" % (inside, ncomp)]
    return res if complete else None


def f9_section(out, tasks_by_set):
    best = load("f9/best.json")
    if not best:
        out += ["## F9 other models", "", "Not run.", ""]
        return
    out += ["## F9 other models (descriptive)", "", "One run per task (run 1), arms ours, base and the best rival of the task (highest Sonnet mean of this round in that set among pp, ppi, hist, bf; ties in that order; fixed from the Sonnet grades before any F9 call, `f9/best.json`), both sets, graded per task by the same method (grader claude-sonnet-5-5). Score = criteria passed. No bootstrap, no interval and no claim of being first: one run per task. Rule B per model: ours strictly above base and the best rival on every task, or at the ceiling together with them.\n"]
    for m in F9_MODELS:
        sc = load("f9/%s/grade/scores.json" % m)
        out.append("### %s\n" % m)
        if not sc:
            out += ["Not run or no cell graded.", ""]
            continue
        for setname, title in SETS:
            tasks = tasks_by_set[setname]
            out.append("**%s**\n" % title)
            out.append("| Task | max | ours | base | best rival (name) | Rule B |")
            out.append("| --- | --- | --- | --- | --- | --- |")
            to = tb = tr = 0.0
            fails, missing = [], []
            for t in tasks:
                tid = t["id"]
                a = sc.get(tid, {})
                rv = best.get(tid)
                recs = {k: (a.get(k, {}).get("1") if k else None) for k in ("ours", "base", rv)}
                if rv is None or any(v is None for v in recs.values()):
                    missing.append(tid)
                    out.append("| %s | %d | - | - | - | not graded |" % (tid, nmax(t)))
                    continue
                o, b, r = (int(cell(recs[k])) for k in ("ours", "base", rv))
                errs = sum(1 for k in ("ours", "base", rv) for x in recs[k]["criteria"] if x["pass"] is None)
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
                out.append("Descriptive: ours %.0f, base %.0f, best rivals %.0f; ours is %s in total.\n" % (to, tb, tr, "ahead of both" if to > tb and to > tr else "not ahead of both"))
        out.append("")


def trace_paths():
    import glob
    pats = ["runs/*/*/*/*/trace.jsonl.gz", "f6/runs/*/trace.jsonl.gz", "f9/*/runs/*/trace.jsonl.gz"]
    return sorted(p for pat in pats for p in glob.glob(os.path.join(HERE, pat)))


def rate_limit_summary():
    """Counts rate_limit_event records in all traces by (type, status); also cells whose result has is_error true."""
    counts, bad_status, errs, n = {}, 0, 0, 0
    for p in trace_paths():
        n += 1
        with gzip.open(p, "rt", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if "rate_limit_info" in line:
                    try:
                        r = json.loads(line).get("rate_limit_info") or {}
                    except ValueError:
                        continue
                    k = (r.get("rateLimitType"), r.get("status"))
                    counts[k] = counts.get(k, 0) + 1
                    if r.get("status") not in ("allowed", "allowed_warning"):
                        bad_status += 1
                elif '"type": "result"' in line or '"type":"result"' in line:
                    try:
                        o = json.loads(line)
                    except ValueError:
                        continue
                    if o.get("type") == "result" and o.get("is_error"):
                        errs += 1
    return n, counts, bad_status, errs


def incidents_section(meta, out):
    out.append("## Cells set aside, re-asks and driver events\n")
    sa = meta.get("set_aside") or []
    if sa:
        out.append("| Cell | reason |")
        out.append("| --- | --- |")
        for x in sa:
            out.append("| %s | %s |" % (x["cell"], x["reason"]))
        out.append("")
    else:
        out.append("No scored run was set aside (no cell was moved out of the run folder).\n")
    n, counts, bad_status, errs = rate_limit_summary()
    out.append("Rate limits and errors, counted in the %d traces (scored runs, F6 re-runs, F9 runs): %s; events with a status other than allowed or allowed_warning: %d; cells whose result event has is_error true: %d.\n" % (n, ", ".join("%s %s x%d" % (k[0], k[1], v) for k, v in sorted(counts.items(), key=str)) if counts else "no rate-limit event", bad_status, errs))
    p = os.path.join(HERE, "drive.log.txt")
    if os.path.exists(p):
        lines = open(p, encoding="utf-8", errors="replace").read().splitlines()
        reasks = [l for l in lines if "re-ask" in l]
        stops = [l for l in lines if "STOPPED" in l]
        out.append("Driver log (`drive.log.txt`): %d re-ask passes recorded, %d stop events.\n" % (len(reasks), len(stops)))
        if reasks or stops:
            out.append("Re-ask and stop lines: " + "; ".join(l.strip() for l in (stops + reasks)[:60]) + ".\n")


def verdict_table(res, out):
    out.append("## Verdicts (computed)\n")
    out.append("| Set | tasks | complete | I1 | Rule A | Rule B | Rule B' |")
    out.append("| --- | --- | --- | --- | --- | --- | --- |")
    for setname, title in SETS:
        r = res.get(setname) or {}
        yn = lambda v: "-" if v is None else ("PASS" if v else "FAIL")
        out.append("| %s | %s | %s | %s | %s | %s | %s |" % (title, r.get("tasks", "-"), "yes" if r.get("complete") else "no", ("PASS" if r.get("I1") else "FAIL") if r.get("complete") else "not claimed", yn(r.get("A")), yn(r.get("B")), yn(r.get("B2"))))
    out.append("")


def claim_lint(meta, res):
    """The result sentence may not use claim words unless the sealed set's I1 passed on a complete set."""
    s = meta.get("sentence") or ""
    if CLAIM_WORDS.search(s) and not (res.get("sealed-z") or {}).get("I1"):
        return "CLAIM CHECK FAILED: the result sentence uses a claim word (%s) but I1 did not pass on the complete SEALED z set." % CLAIM_WORDS.search(s).group(0)
    return None


def build():
    meta = load("summary-meta.json", {})
    tasks_all = (load("tasks/final-tasks.json") or {}).get("tasks", [])
    tasks_by_set = {s: [t for t in tasks_all if set_of(t["id"]) == s] for s, _ in SETS}
    all_scores = {}
    for s, _ in SETS:
        for tid, arms in load("grades/%s/scores.json" % s, {}).items():
            all_scores[tid] = arms
    graded_names = [("%s-%s-%s" % (tid, arm, n)) for tid, arms in all_scores.items() for arm, runs in arms.items() for n in runs]
    body = []
    res = {}
    for setname, title in SETS:
        res[setname] = section(setname, title, tasks_by_set[setname], body)
    lint = claim_lint(meta, res)
    out = ["# %s" % meta.get("title", "surviving-lines round 13 final measurement"), ""]
    if lint:
        out += ["**%s**" % lint, ""]
    if meta.get("sentence"):
        out += ["**Result.** " + meta["sentence"], ""]
    verdict_table(res, out)
    out += body
    hook_section(tasks_by_set, out)
    cost_section(out)
    f6res = f6_section(out, graded_names, all_scores)
    f9_section(out, tasks_by_set)
    incidents_section(meta, out)
    for k in ("departures", "grader_reliability_note", "payer", "versions"):
        if meta.get(k):
            out += ["## " + k.replace("_", " ").capitalize(), "", meta[k], ""]
    return "\n".join(out).rstrip() + "\n", lint


def main(argv):
    text, lint = build()
    path = os.path.join(HERE, "SUMMARY.md")
    if "--check" in argv:
        if lint:
            print(lint)
            return 1
        if not os.path.exists(path) or open(path, encoding="utf-8").read() != text:
            print("SUMMARY.md differs from the recomputed text")
            return 1
        print("score.py --check: SUMMARY.md matches the recomputation")
        return 0
    open(path, "w", encoding="utf-8").write(text)
    print(text)
    return 2 if lint else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
