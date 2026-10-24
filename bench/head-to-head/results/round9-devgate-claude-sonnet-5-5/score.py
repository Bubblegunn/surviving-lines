#!/usr/bin/env python3
"""Recomputes every table of SUMMARY.md from grades/, tasks/, rivals.json, cost.json files and cost.tsv. No network, no model calls.

Usage (run inside the results folder):
  python3 -I score.py            print SUMMARY.md to stdout
  python3 -I score.py --check    exit 1 unless SUMMARY.md equals that output byte for byte

Scope: a development gate (BEST-RIVAL-SPEC step 6), not a scored round. Ours only, 3 runs per task, three iterations,
two already-seen sets. Nothing printed here is a score table of the benchmark.
A criterion passes when a majority of its valid votes pass (3 valid votes: 2 of 3; 2 valid votes: both);
fewer than 2 valid votes means the criterion is not passed (it adds 0 to the cell) and is marked err.
Bootstrap: 10,000 resamples over runs, seed in summary-meta.json, resampling the 3 runs of ours and the 3 published runs of the
best other arm of each task (the arm with the highest published mean, first listed on a tie), summed over the tasks of the set.
"""
import glob
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
EPS = 1e-9


def load(path):
    with open(os.path.join(HERE, path), encoding="utf-8") as fh:
        return json.load(fh)


def majority(votes):
    valid = [v for v in votes if v is not None]
    if len(valid) < 2:
        return None
    if len(valid) == 3:
        return sum(valid) * 2 > len(valid)
    return valid[0] if valid[0] == valid[1] else None


def cell_scores(scores, task):
    """{run: (passed, err)} for ours, recomputed from the raw votes."""
    out = {}
    for run, rec in sorted(scores.get(task, {}).get("ours", {}).items(), key=lambda kv: int(kv[0])):
        res = [majority(c["votes"]) for c in rec["criteria"]]
        out[int(run)] = (sum(1 for r in res if r), sum(1 for r in res if r is None))
    return out


def mean(xs):
    return sum(xs) / len(xs) if xs else None


def best_rival(riv):
    best = None
    for arm, v in riv["arms"].items():
        if best is None or mean(v["runs"]) > mean(best[1]["runs"]) + EPS:
            best = (arm, v)
    return best


def pct(x):
    return "%.2f" % x


def percentile_interval(xs, n):
    xs = sorted(xs)
    return xs[int(0.025 * n)], xs[int(0.975 * n) - 1]


def boot(ours, rival, rng, n):
    """ours, rival: lists (per task) of run-score lists. Returns sorted (o, r, d) intervals."""
    os_, rs, ds = [], [], []
    for _ in range(n):
        o = r = 0.0
        for a, b in zip(ours, rival):
            o += mean([a[int(rng.random() * len(a))] for _ in a])
            r += mean([b[int(rng.random() * len(b))] for _ in b])
        os_.append(o)
        rs.append(r)
        ds.append(o - r)
    return percentile_interval(os_, n), percentile_interval(rs, n), percentile_interval(ds, n)


def read_tsv(path):
    rows = {}
    with open(os.path.join(HERE, path), encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            f = line.rstrip("\n").split("\t")
            if i == 0 and f[0] == "step":
                continue
            name = f[1] if len(f) == 3 and f[0][:2] == "20" else f[0]
            rows[name] = float(f[-1])
    return rows


def run_costs(task, it):
    out = []
    for d in sorted(glob.glob(os.path.join(HERE, "runs", task, it, "*"))):
        c = json.load(open(os.path.join(d, "cost.json"), encoding="utf-8"))
        out.append((int(os.path.basename(d)), c))
    return out


def main():
    meta = load("summary-meta.json")
    riv = load("rivals.json")
    env = load("env.json")
    tsv = read_tsv("cost.tsv")
    N = meta["bootstrap_resamples"]
    rng = random.Random(meta["bootstrap_seed"])
    its = meta["iterations"]
    sets = meta["sets"]
    tasks = {s["key"]: load("tasks/%s/tasks.json" % s["key"])["tasks"] for s in sets}
    out = ["# %s" % meta["title"], "", "**Result.** %s" % meta["sentence"], "",
           "Rulings frozen in commit `%s` (see `PROTOCOL.md`). Date: %s." % (meta["protocol_commit"], meta["date"]), ""]
    out += ["**Scope and limits.**", ""] + ["- %s" % x for x in meta["scope"]] + [""]
    summary_rows = []
    cost_totals = {}
    reliab = []
    for it in its:
        out += ["## Iteration %s: product `%s`" % (it["n"], it["product"]), "", it["note"], ""]
        iter_total = {"cost": 0.0, "in": 0, "out": 0, "cc": 0, "cr": 0, "turns": 0, "ms": 0, "cells": 0}
        for s in sets:
            scores = load("grades/%s/%s/scores.json" % (it["key"], s["key"]))
            out += ["### %s, iteration %s" % (s["label"], it["n"]), ""]
            out.append("Criteria passed per task (ours, 3 runs). `err`: criteria with fewer than two valid votes, counted as 0 points. `valid runs`: runs with no err criterion. `rival`: best other arm published for this task in `%s` (rivals.json; earlier round, same SDK path, not graded together with these runs)." % s["rival_source"])
            out.append("")
            out.append("| Task | Criteria | ours mean | min | max | runs | err | valid runs | rival (arm) | verdict | mean of valid runs |")
            out.append("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |")
            tot_o = tot_r = 0.0
            ok = 0
            ok_valid = 0
            ours_runs, rival_runs = [], []
            for t in tasks[s["key"]]:
                nmax = len(t["criteria"]) if not t.get("criteriaKinds") else sum(1 for k in t["criteriaKinds"] if k == "outcome")
                c = cell_scores(scores, t["id"])
                ps = [p for p, _ in c.values()]
                errs = sum(e for _, e in c.values())
                valid = [p for p, e in c.values() if e == 0]
                m = mean(ps)
                arm, rv = best_rival(riv[s["key"]][t["id"]])
                r = mean(rv["runs"])

                def verdict(x):
                    if x is None:
                        return "no valid run"
                    if x > r + EPS:
                        return "above"
                    if abs(x - r) < EPS and abs(r - nmax) < EPS:
                        return "ceiling tie"
                    return "tie below ceiling" if abs(x - r) < EPS else "below"
                v = verdict(m)
                ok += v in ("above", "ceiling tie")
                mv = mean(valid)
                ok_valid += verdict(mv) in ("above", "ceiling tie")
                tot_o += m
                tot_r += r
                ours_runs.append(ps)
                rival_runs.append(rv["runs"])
                out.append("| %s | %d | %s | %d | %d | %s | %d | %d | %s (%s) | %s | %s |" % (
                    t["id"], nmax, pct(m), min(ps), max(ps), "/".join(str(p) for p in ps), errs, len(valid),
                    pct(r), arm, v, pct(mv) if mv is not None else "-"))
            n_t = len(tasks[s["key"]])
            mx = sum(len(t["criteria"]) if not t.get("criteriaKinds") else sum(1 for k in t["criteriaKinds"] if k == "outcome") for t in tasks[s["key"]])
            out.append("| Total | %d | %s | | | | | | %s | %d of %d tasks pass | |" % (mx, pct(tot_o), pct(tot_r), ok, n_t))
            gate = ok == n_t
            out += ["", "Development gate rule (ours strictly above the best published rival on every task, or at the ceiling together with it): %s (%d of %d tasks). Counting only runs with no err criterion the count would be %d of %d; this does not change the set verdict: %s." % (
                "**passes**" if gate else "**fails**", ok, n_t, ok_valid, n_t, "same" if (ok_valid == n_t) == gate else "DIFFERENT"), ""]
            lo_o, lo_r, lo_d = boot(ours_runs, rival_runs, rng, N)
            out.append("95%% bootstrap interval (%d resamples over runs, seed %d): ours total %s to %s (point %s); best published rival total %s to %s (point %s); ours minus rival %s to %s (point %s)%s." % (
                N, meta["bootstrap_seed"], pct(lo_o[0]), pct(lo_o[1]), pct(tot_o), pct(lo_r[0]), pct(lo_r[1]), pct(tot_r),
                pct(lo_d[0]), pct(lo_d[1]), pct(tot_o - tot_r),
                "; the interval for the difference includes zero" if lo_d[0] <= 0 <= lo_d[1] else ("; the interval for the difference is entirely below zero" if lo_d[1] < 0 else "; the interval for the difference is entirely above zero")))
            out.append("")
            summary_rows.append((it["n"], s["key"], tot_o, tot_r, ok, n_t, gate, lo_d, mx))
            # grader reliability
            ncrit = same = valid_all = nerr = unparsed_calls = ncells = 0
            for t in tasks[s["key"]]:
                for run, rec in scores.get(t["id"], {}).get("ours", {}).items():
                    ncells += 1
                    for cr in rec["criteria"]:
                        ncrit += 1
                        v = cr["votes"]
                        if all(x is not None for x in v) and len(set(v)) == 1:
                            same += 1
                        if majority(v) is None:
                            nerr += 1
                    for k in range(3):
                        if all(cr["votes"][k] is None for cr in rec["criteria"]):
                            unparsed_calls += 1
            logs = []
            for lf in sorted(glob.glob(os.path.join(HERE, "grades", it["key"], s["key"], "logs", "*.log.txt"))):
                lines = open(lf, encoding="utf-8").read().splitlines()
                cells_bad = [l.split(":")[0] for l in lines if "did not parse" in l]
                logs.append("`%s`: %d cell(s) with an unparsed call (%s)" % (os.path.basename(lf)[:-4], len(cells_bad), ", ".join(cells_bad) if cells_bad else "none"))
            reliab.append((it["n"], s["key"], ncells, ncrit, same, nerr, unparsed_calls, logs))
            # cost
            for t in tasks[s["key"]]:
                for run, c in run_costs(t["id"], it["key"]):
                    iter_total["cost"] += c["total_cost_usd"]
                    iter_total["in"] += c["input_tokens"]
                    iter_total["out"] += c["output_tokens"]
                    iter_total["cc"] += c["cache_creation_input_tokens"]
                    iter_total["cr"] += c["cache_read_input_tokens"]
                    iter_total["turns"] += c["num_turns"]
                    iter_total["ms"] += c["duration_ms"]
                    iter_total["cells"] += 1
        cost_totals[it["key"]] = iter_total
        # per cell cost table for this iteration
        out += ["### Cost per cell, iteration %s (USD of `total_cost_usd`, runs 1/2/3; turns; wall seconds)" % it["n"], "", "| Task | cost | turns | wall s |", "| --- | --- | --- | --- |"]
        for s in sets:
            for t in tasks[s["key"]]:
                rc = run_costs(t["id"], it["key"])
                out.append("| %s | %s | %s | %s |" % (t["id"], "/".join("%.4f" % c["total_cost_usd"] for _, c in rc), "/".join(str(c["num_turns"]) for _, c in rc), "/".join("%.0f" % (c["duration_ms"] / 1000.0) for _, c in rc)))
        out.append("")
    out += ["## Development gate across iterations", "",
            "Ours total of 25 per set (mean of 3 runs per task) against the sum of the best published rival means; `ours - rival` with its 95% bootstrap interval. These numbers do not enter any score table.", "",
            "| Iteration | Set | ours | best published rival | ours - rival (95% interval) | tasks passing the rule | set verdict |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for n, k, o, r, ok, nt, g, d, mx in summary_rows:
        out.append("| %s | %s | %s of %d | %s | %s (%s to %s) | %d of %d | %s |" % (n, k, pct(o), mx, pct(r), pct(o - r), pct(d[0]), pct(d[1]), ok, nt, "pass" if g else "fail"))
    out += ["", "| Iteration | both sets pass the rule | outcome |", "| --- | --- | --- |"]
    all_pass = []
    for it in its:
        g = all(x[6] for x in summary_rows if x[0] == it["n"])
        all_pass.append(g)
        out.append("| %s | %s | %s |" % (it["n"], "yes" if g else "no", "gate passed" if g else "gate failed, no held-out measurement allowed"))
    out += ["", "Development gate outcome: **%s** after %d measured iterations (limit three per round). No new held-out set was measured." % ("passed" if all_pass[-1] else "FAILED", len(its)), ""]
    out += ["## Grader reliability", "",
            "Share of criteria where all three grader votes were valid and equal; criteria with fewer than two valid votes (err); grader calls whose reply did not parse (all five criteria without a vote) in the final files.", "",
            "| Iteration | Set | cells | criteria | all three votes equal | err criteria | unparsed grader calls (final) |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for n, k, nc, ncrit, same, nerr, unp, logs in reliab:
        out.append("| %s | %s | %d | %d | %d (%.1f%%) | %d | %d |" % (n, k, nc, ncrit, same, 100.0 * same / ncrit, nerr, unp))
    out += ["", "Parse failures and re-asks as logged by the grading driver (the driver asks a reply that did not parse again, up to 5 times per call; the shell loop around it started the whole pass again up to 3 times). Logs are in `grades/<iteration>/<set>/logs/`:", ""]
    for n, k, nc, ncrit, same, nerr, unp, logs in reliab:
        for l in logs:
            out.append("- iteration %s, set %s, %s" % (n, k, l))
    out += ["", "The F6 independent re-grade was not run (no scored round).", ""]
    # cost
    out += ["## Cost", "", "From `total_cost_usd` of each call. Per iteration, ours only (no rival arm was run, so there is no ours/baseline cost ratio):", "",
            "| Iteration | cells | cost (cost.json sum) | input tokens | output tokens | cache creation tokens | cache read tokens | turns | wall time | mean cost per task |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for it in its:
        c = cost_totals[it["key"]]
        out.append("| %s | %d | %.2f | %d | %d | %d | %d | %d | %.1f min | %.2f |" % (it["n"], c["cells"], c["cost"], c["in"], c["out"], c["cc"], c["cr"], c["turns"], c["ms"] / 60000.0, c["cost"] / (c["cells"] / 3.0)))
    out += ["", "Per round, from `cost.tsv` (the controller's cost log) and the cost.json files:", "",
            "| Item | USD | source |", "| --- | --- | --- |"]
    cr = meta["cost_rows"]
    runs_tsv = grading_tsv = 0.0
    for it in its:
        r = sum(tsv[cr["runs"][it["key"]][s["key"]]] for s in sets)
        g = sum(tsv[cr["grading"][it["key"]][s["key"]]] for s in sets)
        runs_tsv += r
        grading_tsv += g
        out.append("| iteration %s runs | %.2f | tsv (cost.json sum %.2f) |" % (it["n"], r, cost_totals[it["key"]]["cost"]))
        out.append("| iteration %s grading | %.2f | tsv |" % (it["n"], g))
    other = 0.0
    for name, label in meta["cost_other"]:
        out.append("| %s | %.2f | tsv row `%s` |" % (label, tsv[name], name))
        other += tsv[name]
    out.append("| **Logged total** | **%.2f** | runs %.2f + grading %.2f + other %.2f |" % (runs_tsv + grading_tsv + other, runs_tsv, grading_tsv, other))
    out += ["", "Not in this total: " + meta["cost_not_included"], "",
            "Payer: API key named `%s` (name only), run path: %s. Model `%s` for every run and grader call; CLI %s; Agent SDK %s." % (env["api_key_name"], env["run_path"], env["run_model"], env["claude_cli_version"], env["agent_sdk_version"]), ""]
    out += ["Time range (UTC, from file modification times of the run and grading files): " + "; ".join("iteration %s %s to %s" % (it["n"], env["mtime_utc"][it["key"]][0], env["mtime_utc"][it["key"]][1]) for it in its) + ".", ""]
    out += ["## Everything that went wrong", ""] + ["- %s" % x for x in meta["wrong"]] + [""]
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
