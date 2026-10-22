#!/usr/bin/env python3
"""Assembles the round 9 development-gate evidence folder from the local run folders (maintainer tool, needs the raw runs).

Usage: python3 -I build-devgate.py <dest-results-dir>
Reads ~/claude-kredi-runs/2026-10-23/r9 (three iterations, sets D and C), redacts with ../scrub.py, compresses traces,
writes the files EVIDENCE-SPEC items 1 to 11 name, SUMMARY.md through devgate-score.py (copied as score.py), SHA256SUMS.
Not needed to verify a published folder.
"""
import datetime
import glob
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BENCH = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(BENCH))
HOME = os.path.expanduser("~")
K = HOME + "/claude-kredi-runs"
R9 = K + "/2026-10-23/r9"
sys.path.insert(0, BENCH)
import scrub  # noqa: E402

NAME = "round9-devgate-claude-sonnet-5-5"
ITERS = [
    {"key": "iter1", "n": 1, "src": "dev", "product": "09e09d9", "extra": "grade2"},
    {"key": "iter2", "n": 2, "src": "dev2", "product": "c689450", "extra": None},
    {"key": "iter3", "n": 3, "src": "dev3", "product": "7c78c82", "extra": None},
]
SETS = [
    {"key": "D", "label": "Set D (D1 to D5, seen in round 8; development set)", "tasks_src": BENCH + "/results/round8-claude-sonnet-5-5/tasks/heldout-d", "truth": K + "/2026-10-22/r8/truth-d",
     "rival_summary": BENCH + "/results/round8-claude-sonnet-5-5/SUMMARY.md", "rival_header": "### Held-out D1 to D5", "rival_source": "results/round8-claude-sonnet-5-5/SUMMARY.md"},
    {"key": "C", "label": "Set C (C1 to C5, seen in round 7; development set)", "tasks_src": BENCH + "/results/round7-claude-sonnet-5-5/tasks/heldout-c", "truth": K + "/2026-10-22/r7/truth-c",
     "rival_summary": BENCH + "/results/round7-claude-sonnet-5-5/SUMMARY.md", "rival_header": "### Held-out C1 to C5", "rival_source": "results/round7-claude-sonnet-5-5/SUMMARY.md"},
]
SECTIONS = [  # (header, commit that froze it)
    ("## Round 9: rulings", "53cc762"),
    ("## Round 9 development gate, iteration 1: diagnosis and rulings", "706f3a1"),
    ("## Round 9 development gate, iteration 2: diagnosis and rulings", "ca5b21c"),
]


def ensure(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)


def write(path, text):
    ensure(path)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def copy_scrubbed(src, dst):
    ensure(dst)
    text = open(src, encoding="utf-8", errors="surrogateescape").read()
    with open(dst, "w", encoding="utf-8", errors="surrogateescape", newline="") as fh:
        fh.write(scrub.scrub_text(text))


def trace(src, dst):
    ensure(dst)
    with gzip.open(dst, "wt", encoding="utf-8", compresslevel=9, newline="") as out:
        for line in open(src, encoding="utf-8", errors="replace"):
            body = line.rstrip("\n")
            try:
                obj = json.loads(body)
                obj.pop("wire_tool_inputs", None)
                body = json.dumps(obj, ensure_ascii=False)
            except ValueError:
                pass
            out.write(scrub.scrub_text(body) + "\n")


def cost_of(run_jsonl):
    rec = {"total_cost_usd": None, "duration_ms": None, "num_turns": None, "is_error": None}
    for line in open(run_jsonl, encoding="utf-8", errors="replace"):
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("type") == "result":
            for k in rec:
                rec[k] = e.get(k)
            u = e.get("usage") or {}
            rec["input_tokens"] = u.get("input_tokens", 0)
            rec["output_tokens"] = u.get("output_tokens", 0)
            rec["cache_creation_input_tokens"] = u.get("cache_creation_input_tokens", 0)
            rec["cache_read_input_tokens"] = u.get("cache_read_input_tokens", 0)
            rec["model"] = next(iter(e.get("modelUsage", {}) or {}), None)
    return rec


def section(commit, header):
    text = subprocess.run(["git", "-C", REPO, "show", "%s:docs/HEAD-TO-HEAD.md" % commit], capture_output=True, text=True, check=True).stdout
    i = text.index(header)
    j = text.find("\n## ", i + 5)
    return text[i:j if j > 0 else len(text)].rstrip() + "\n"


def rival_table(path, header):
    lines = open(path, encoding="utf-8").read().splitlines()
    i = next(k for k, l in enumerate(lines) if l.startswith(header))
    hdr = next(l for l in lines[i:] if l.startswith("| Task"))
    cols = [c.strip() for c in hdr.strip("|").split("|")]
    out = {}
    for l in lines[lines.index(hdr, i) + 2:]:
        if not l.startswith("|") or l.startswith("| Total"):
            break
        cells = [c.strip() for c in l.strip("|").split("|")]
        arms = {}
        for col, cell in zip(cols[2:], cells[2:]):
            if col == "ours":
                continue
            m = re.fullmatch(r"([\d.]+) \(([\d/]+)\)( err=\d+)?", cell)
            arms[col] = {"mean": float(m.group(1)), "runs": [int(x) for x in m.group(2).split("/")]}
        out[cells[0]] = {"arms": arms}
    return out


def utc(ts):
    return datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).strftime("%Y-%m-%d %H:%M")


def main(dest):
    d = os.path.join(dest, NAME)
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d)
    text = json.load(open(HERE + "/devgate-text.json"))
    # PROTOCOL.md
    parts = ["# Frozen rulings of round 9 (development gate)\n\nExtracted verbatim from `docs/HEAD-TO-HEAD.md` at the commits that froze each section (`git show <commit>:docs/HEAD-TO-HEAD.md`). "
             "The development-gate rule itself is step 6 of the best-rival specification (below). Commit order of this round: 53cc762 (analysis and rulings), d8dbd81 (feature code), 09e09d9 (iteration 1 product), "
             "706f3a1 (iteration 1 diagnosis, before code), c689450 (iteration 2 product), ca5b21c (iteration 2 diagnosis, before code), fd519c6 and 7c78c82 (iteration 3 product).\n\n"
             "## Development gate rule (BEST-RIVAL-SPEC step 6, as written by the owner on 2026-10-22)\n\n"
             "> Measuring on a new held-out set is expensive and burns that set. Before it, run ours x3 on the most recent already-seen set (it no longer counts for scoring; it is the development set) with the same grading method, "
             "and compare with the best rival's published scores on those tasks. Ours must be strictly higher on every task, or at the ceiling together with the rival. If not, do not measure: analyse the lost criteria, "
             "make a general fix (no fixture-specific entries), test and review, and rerun the development gate. At most three iterations per round; record each with its cost. Publish the development-gate results in the evidence folder "
             "as a separate section that does not enter the score tables.\n\n"
             "This round ran the gate on two seen sets (D from round 8, C from round 7) because the owner asked for both.\n"]
    for hdr, commit in SECTIONS:
        parts.append("\n<!-- source: docs/HEAD-TO-HEAD.md at %s -->\n%s" % (commit, scrub.scrub_text(section(commit, hdr))))
    parts.insert(1, "\nRedaction: three non-personal automation or placeholder addresses named in the rulings (a hosted translation bot, a lint-bot address, a localhost placeholder) are replaced by `<email redacted>` by `scrub.py`; the names beside them stay.\n")
    write(d + "/PROTOCOL.md", "".join(parts))
    arms8 = json.load(open(BENCH + "/results/round8-claude-sonnet-5-5/arms.json"))
    arms = {"ours": dict(arms8["ours"], pinned="iteration 1 09e09d9, iteration 2 c689450, iteration 3 7c78c82 (each from a git archive of that commit)")}
    arms["_rivals_referenced"] = {k: v for k, v in arms8.items() if k != "ours"}
    arms["_note"] = "Only ours was run in this development gate. The rival arms below are the pinned arms of the earlier rounds whose published scores are used for comparison (rivals.json); they were not run here."
    json.dump(arms, open(d + "/arms.json", "w"), indent=1)
    claude_real = open(K + "/sdk-shim/REAL_CLAUDE").read().strip()
    sdk = subprocess.run([K + "/sdk-venv/bin/pip", "list"], capture_output=True, text=True).stdout
    sdk_v = next((l.split()[1] for l in sdk.splitlines() if l.startswith("claude-agent-sdk")), "unknown")
    rng = {}
    for it in ITERS:
        ts = [os.path.getmtime(p) for p in glob.glob("%s/%s-[DC]/runs/*/run.jsonl" % (R9, it["src"]))]
        ts += [os.path.getmtime(p) for p in glob.glob("%s/%s-[DC]/grade/*.out" % (R9, it["src"]))]
        rng[it["key"]] = [utc(min(ts)), utc(max(ts))]
    json.dump({"run_model": "claude-sonnet-5-5", "grader_model": "claude-sonnet-5-5", "claude_cli_version": os.path.basename(claude_real), "agent_sdk_version": sdk_v,
               "run_path": "Claude Agent SDK query() shim in front of the same installed CLI (stream-json unchanged)", "parallelism": 3, "date": "2026-10-23",
               "api_key_name": "anthropic_key_2", "os": "macOS (Darwin 27.0.0, arm64)", "git": subprocess.run(["git", "--version"], capture_output=True, text=True).stdout.strip(),
               "product_commits": {it["key"]: it["product"] for it in ITERS}, "mtime_utc": rng,
               "known_sdk_vs_cli_difference": "the desktop application's Artifact tool and its artifact-diagramming skill are absent on the SDK path; unrelated to these tasks",
               "grader_call": "claude -p --model claude-sonnet-5-5 --setting-sources project --strict-mcp-config --output-format json, prompt on stdin, 3 calls per cell, ours alone in each grader prompt (label A only)"},
              open(d + "/env.json", "w"), indent=1)
    riv = {}
    for s in SETS:
        riv[s["key"]] = rival_table(s["rival_summary"], s["rival_header"])
        tdir = d + "/tasks/" + s["key"]
        for f in glob.glob(s["tasks_src"] + "/*"):
            if os.path.isdir(f):
                for g in glob.glob(f + "/**", recursive=True):
                    if os.path.isfile(g):
                        copy_scrubbed(g, tdir + "/" + os.path.relpath(g, s["tasks_src"]))
            else:
                copy_scrubbed(f, tdir + "/" + os.path.basename(f))
        write(tdir + "/WRITER.md", open(s["tasks_src"] + "/WRITER.md").read().rstrip() + "\n\n**Status in this folder.** Set %s was already used in an earlier scored round (see `rivals.json` source). Here it served only as the development set; "
              "it is not held-out and its numbers here do not enter any score table.\n" % s["key"])
        tasks = json.load(open(s["tasks_src"] + "/tasks.json"))["tasks"]
        for it in ITERS:
            out = "%s/%s-%s" % (R9, it["src"], s["key"])
            for t in tasks:
                for rep in (1, 2, 3):
                    rd = "%s/runs/%s-ours-%d" % (out, t["id"], rep)
                    base = "%s/runs/%s/%s/%d" % (d, t["id"], it["key"], rep)
                    copy_scrubbed(rd + "/final.txt", base + "/final.txt")
                    if os.path.exists(rd + "/mailmap.txt"):
                        copy_scrubbed(rd + "/mailmap.txt", base + "/mailmap.txt")
                    trace(rd + "/run.jsonl", base + "/trace.jsonl.gz")
                    write(base + "/cost.json", json.dumps(cost_of(rd + "/run.jsonl"), indent=1) + "\n")
            gd = "%s/grades/%s/%s" % (d, it["key"], s["key"])
            for f in sorted(glob.glob(out + "/grade/*")):
                if os.path.isfile(f):
                    copy_scrubbed(f, gd + "/" + os.path.basename(f))
            for lg in sorted(glob.glob("%s/%s-%s.grade*.log" % (R9, it["src"], s["key"]))):
                copy_scrubbed(lg, gd + "/logs/" + os.path.basename(lg))
    for s in SETS:
        for t in riv[s["key"]]:
            riv[s["key"]][t]["source"] = s["rival_source"]
    json.dump(riv, open(d + "/rivals.json", "w"), indent=1)
    copy_scrubbed(K + "/2026-10-22/surviving-lines-r9-cost.tsv", d + "/cost.tsv")
    meta = {"title": "surviving-lines round 9 development gate (failed after three iterations, no scored round)", "sentence": text["sentence"], "protocol_commit": "53cc762",
            "protocol_commit_time": subprocess.run(["git", "-C", REPO, "show", "-s", "--format=%cI", "53cc762"], capture_output=True, text=True).stdout.strip(),
            "date": "2026-10-22 UTC (2026-10-23 in the UTC+03:00 time zone of the commits)", "scope": text["scope"], "wrong": text["wrong"],
            "iterations": [{"key": it["key"], "n": it["n"], "product": it["product"], "note": text["iteration_notes"][it["key"]]} for it in ITERS],
            "sets": [{"key": s["key"], "label": s["label"], "rival_source": s["rival_source"]} for s in SETS],
            "bootstrap_seed": 9, "bootstrap_resamples": 10000,
            "cost_rows": {"runs": {"iter1": {"D": "devgate-iter1-D-runs", "C": "devgate-iter1-C-runs"}, "iter2": {"D": "devgate-dev2-D-runs", "C": "devgate-dev2-C-runs"}, "iter3": {"D": "devgate-dev3-D-runs", "C": "devgate-dev3-C-runs"}},
                          "grading": {"iter1": {"D": "devgate-iter1-D-grading", "C": "devgate-iter1-C-grading"}, "iter2": {"D": "devgate-dev2-D-grading", "C": "devgate-dev2-C-grading"}, "iter3": {"D": "devgate-dev3-D-grading", "C": "devgate-dev3-C-grading"}}},
            "cost_other": [["writer-e", "held-out set e writing (set never opened or run)"], ["bestrival-agent", "best-rival analysis (controller-session subagent, logged estimate)"], ["haiku-billing-check", "billing check"]],
            "cost_not_included": text["cost_not_included"]}
    json.dump(meta, open(d + "/summary-meta.json", "w"), indent=1)
    shutil.copy(HERE + "/check-order.py", d + "/check-order.py")
    shutil.copy(HERE + "/devgate-score.py", d + "/score.py")
    write(d + "/REPRODUCE.md", text["reproduce"])
    write(d + "/VERIFY.md", text["verify"])
    summary = subprocess.run([sys.executable, "-I", d + "/score.py"], capture_output=True, text=True, check=True).stdout
    write(d + "/SUMMARY.md", summary)
    subprocess.run([sys.executable, "-I", BENCH + "/scrub.py", "--check", d], check=True)
    lines = []
    for root, _, files in os.walk(d):
        for f in sorted(files):
            if f == "SHA256SUMS":
                continue
            p = os.path.join(root, f)
            lines.append("%s  %s" % (hashlib.sha256(open(p, "rb").read()).hexdigest(), os.path.relpath(p, d)))
    write(d + "/SHA256SUMS", "\n".join(sorted(lines, key=lambda l: l.split("  ", 1)[1])) + "\n")
    print(d)


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
