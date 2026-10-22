#!/usr/bin/env python3
"""Assembles one round's evidence folder from the local run folders (maintainer tool, needs the raw runs).

Usage: python3 -I build-evidence.py <round-key> <dest-results-dir>     (round-key: r7 or r8)
Reads the raw run folders, redacts with ../scrub.py (addresses, keys and tokens, local paths), compresses
traces, writes the files EVIDENCE-SPEC items 1 to 11 name, then scrub --check and SHA256SUMS.
Not needed to verify a published folder: score.py and VERIFY.md work on the folder alone.
"""
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
K = HOME + "/claude-kredi-runs/2026-10-22"
sys.path.insert(0, BENCH)
import scrub  # noqa: E402

ARMS = ["ours", "pp", "ppi", "hist", "bf", "base"]

ARMS_JSON = {
    "ours": {"name": "surviving-lines (this repository)", "source": "https://github.com/Bubblegunn/surviving-lines", "licence": "MIT", "pinned": None,
             "install": "git archive <product commit> into a folder, claude --plugin-dir <folder>", "prompt": "natural prompt"},
    "pp": {"name": "project-pilot 1.0.0", "source": "https://github.com/bukoo93/project-pilot", "licence": "MIT (LICENSE in the clone)", "pinned": "bf6eabe (full sha in the round's MANIFEST of the earlier round, same clone)",
           "install": "clone, git archive copy, claude --plugin-dir <copy>", "prompt": "natural prompt"},
    "ppi": {"name": "project-pilot 1.0.0, invoked", "source": "https://github.com/bukoo93/project-pilot", "licence": "MIT", "pinned": "bf6eabe",
            "install": "same copy as pp", "prompt": "'Use the /project-pilot:bus-factor command for this. ' + natural prompt; only on tasks that define ppInvokedPrompt"},
    "hist": {"name": "mcp-git-historian", "source": "https://github.com/AleBrito124356/mcp-git-historian", "licence": "MIT (LICENSE in the clone)", "pinned": "bb2e209",
             "install": "pip install into a venv from a git archive copy, .mcp.json points at the venv binary, claude --plugin-dir <plugin dir>", "prompt": "natural prompt (no invoked arm)"},
    "bf": {"name": "busfactor (k41n)", "source": "https://github.com/k41n/busfactor", "licence": "MIT (LICENSE in the clone)", "pinned": "d898d8d (full sha d898d8db4346160b0a6ef253b96d60712704fe9f)",
           "install": "git archive copy as a plugin, with the --no-github line, claude --plugin-dir <plugin dir>", "prompt": "natural prompt (no invoked arm)"},
    "base": {"name": "no code-ownership plugin", "source": "none", "licence": "n/a", "pinned": None,
             "install": "an empty plugin that only has a name", "prompt": "natural prompt"},
}

ROUNDS = {
    "r7": {
        "dir": K + "/r7", "name": "round7-claude-sonnet-5-5", "product": "4b65d05", "protocol_commit": "512788b", "rulings_commits": "ca567a3 (R7-1 to R7-3), c620dc9 (R7-4)",
        "protocol_header": "## Round 7 and final gate measurement protocol", "rulings_header": "## Round 7 rulings", "rulings_commit": "c620dc9",
        "results_commit": "9518a7c", "cost": K + "/surviving-lines-r7-cost.tsv", "writer_prompt": K + "/r7/writer.prompt.md",
        "sets": [
            {"key": "heldout-c", "label": "Held-out C1 to C5 (new, written by an agent that had not seen the code)", "out": "out-C", "tasks": "c-tasks.json", "truth": "truth-c", "authored": K + "/r7/heldout-c-work",
             "branch": "heldout-2026-10-c at 51b9ab2b3cddadc0370616c1ad3202dccb11ceb0 (local, never pushed)", "ids": "c"},
            {"key": "public", "label": "Public tasks (11)", "out": "out-P", "tasks": BENCH + "/tasks.json", "truth": "truth-pub", "authored": None, "ids": None},
        ],
        "pubfix": K + "/r7/pubfix", "grade_logs": {"heldout-c": ["out-C.grade.log"], "public": ["out-P.grade.log"]},
        "title": "surviving-lines round 7 and final gate (failed)",
        "date": "2026-10-22",
        "sentence": "On 2026-10-22, on the Claude Agent SDK path with claude-sonnet-5-5, with 3 runs per cell and a model grader, surviving-lines at 4b65d05 had the highest total of six arms (itself, project-pilot with and without its command, mcp-git-historian, k41n/busfactor, plain Claude) on 5 new held-out tasks and on 11 public tasks, but it did not win every task, so the preregistered gate failed and F9 and F6 were not run.",
        "departures": [
            "The public set was graded by a model on every outcome criterion for six arms together, not by the round 4 and 5 script checks on four arms; public numbers are not comparable to rounds 4 and 5.",
            "Two public cells (T1i ppi, bf) have one criterion with fewer than two valid votes (`err=1`); it is left out of the mean.",
            "No cell of an earlier round is reused. The SDK path differs from the earlier CLI path only in that the desktop application's Artifact tool and artifact-diagramming skill are absent.",
            "The held-out writer's tasks were not read by the controller; the product changes of round 7 (R7-1 to R7-4) were driven by the seen sets (N1 to N4, H1 to H3) only.",
            "Cost logged: 31.20 USD (stop line 36, maximum 40). F9 (Haiku, Opus) and F6 were not run because the gate failed.",
        ],
    },
    "r8": {
        "dir": K + "/r8", "name": "round8-claude-sonnet-5-5", "product": "dabc18f", "protocol_commit": "115bc01", "rulings_commits": "ba829aa (R8-1 to R8-5)",
        "protocol_header": "## Round 8 and final gate measurement protocol", "rulings_header": "## Round 8 rulings", "rulings_commit": "ba829aa",
        "results_commit": "2371def (first version), later commit for the completed public grading", "cost": K + "/surviving-lines-r8-cost.tsv", "writer_prompt": K + "/r8/writer.prompt.md",
        "sets": [
            {"key": "heldout-d", "label": "Held-out D1 to D5 (new, written by an agent that had not seen the code)", "out": "out-D", "tasks": "d-tasks.json", "truth": "truth-d", "authored": K + "/r8/heldout-d-work",
             "branch": "heldout-2026-10-d at 05e81b3babc4de270fc5457213ab00ed0ef05677 (local, never pushed)", "ids": "d"},
            {"key": "public", "label": "Public tasks (11)", "out": "out-P", "tasks": BENCH + "/tasks.json", "truth": K + "/r7/truth-pub", "authored": None, "ids": None},
        ],
        "pubfix": K + "/r7/pubfix", "grade_logs": {"heldout-d": ["out-D.grade.log"], "public": ["out-P.grade.pass1.log", "out-P.regrade1.log", "out-P.regrade2.log"]},
        "title": "surviving-lines round 8 and final gate (failed)",
        "date": "2026-10-22",
        "sentence": None, "departures": None,
    },
}


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return h.hexdigest()


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
    """Scrubbed trace, one JSON object per line, gzip. The redundant wire_tool_inputs key (a copy of each tool call input) is dropped."""
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
            rec["model"] = next(iter(e.get("modelUsage", {}) or {}), None)
    return rec


def section(commit, header):
    text = subprocess.run(["git", "-C", REPO, "show", "%s:docs/HEAD-TO-HEAD.md" % commit], capture_output=True, text=True, check=True).stdout
    i = text.index(header)
    j = text.find("\n## ", i + 5)
    return text[i:j if j > 0 else len(text)].rstrip() + "\n"


def build(key, dest):
    cfg = ROUNDS[key]
    d = os.path.join(dest, cfg["name"])
    # Keep nothing of an earlier layout of this folder except files named below.
    if os.path.isdir(d):
        shutil.rmtree(d)
    os.makedirs(d)
    # PROTOCOL.md
    write(d + "/PROTOCOL.md", "# Frozen protocol\n\nExtracted verbatim from `docs/HEAD-TO-HEAD.md` at the commits that froze it (the file at those commits is the source; `git show <commit>:docs/HEAD-TO-HEAD.md`).\n\n"
          "- Rulings: %s\n- Measurement protocol: `%s`\n\n%s\n%s" % (cfg["rulings_commits"], cfg["protocol_commit"],
                                                                      section(cfg["rulings_commit"], cfg["rulings_header"]), section(cfg["protocol_commit"], cfg["protocol_header"])))
    json.dump(ARMS_JSON, open(d + "/arms.json", "w"), indent=1)
    claude_real = open(HOME + "/claude-kredi-runs/sdk-shim/REAL_CLAUDE").read().strip()
    sdk = subprocess.run([HOME + "/claude-kredi-runs/sdk-venv/bin/pip", "list"], capture_output=True, text=True).stdout
    sdk_v = next((l.split()[1] for l in sdk.splitlines() if l.startswith("claude-agent-sdk")), "unknown")
    json.dump({"run_model": "claude-sonnet-5-5", "grader_model": "claude-sonnet-5-5", "claude_cli_version": os.path.basename(claude_real), "agent_sdk_version": sdk_v,
               "run_path": "Claude Agent SDK query() shim in front of the same installed CLI (stream-json unchanged)", "parallelism": 3, "date": cfg["date"],
               "os": "macOS (Darwin 27.0.0, arm64)", "node": subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip(),
               "git": subprocess.run(["git", "--version"], capture_output=True, text=True).stdout.strip(), "product_commit": cfg["product"],
               "known_sdk_vs_cli_difference": "the desktop application's Artifact tool and its artifact-diagramming skill are absent on the SDK path; unrelated to these tasks",
               "grader_call": "claude -p --model claude-sonnet-5-5 --setting-sources project --strict-mcp-config --output-format json, prompt on stdin, 3 calls per cell"},
              open(d + "/env.json", "w"), indent=1)
    meta_sets = []
    for s in cfg["sets"]:
        out = cfg["dir"] + "/" + s["out"]
        tasks_path = s["tasks"] if os.path.isabs(s["tasks"]) else cfg["dir"] + "/" + s["tasks"]
        truth = s["truth"] if os.path.isabs(s["truth"]) else cfg["dir"] + "/" + s["truth"]
        tdir = d + "/tasks/" + s["key"]
        shutil.copy(tasks_path, tdir + "/tasks.json") if os.makedirs(tdir, exist_ok=True) is None else None
        for f in glob.glob(truth + "/*.txt"):
            copy_scrubbed(f, tdir + "/truth/" + os.path.basename(f))
        tasks = json.load(open(tasks_path))["tasks"]
        if s["authored"]:
            for t in tasks:
                src = s["authored"] + "/" + t["fixture"]
                for f in ("prompt.txt", "build-fixture.sh", "truth.py", "truth.txt", "criteria.md"):
                    copy_scrubbed(src + "/" + f, "%s/%s/%s" % (tdir, t["id"], f))
            copy_scrubbed(s["authored"] + "/README.md", tdir + "/WRITER-README.md")
            copy_scrubbed(cfg["writer_prompt"], tdir + "/WRITER-PROMPT.md")
            write(tdir + "/WRITER.md", "# Who wrote this set and what the writer was shown\n\nA fresh `claude-sonnet-5-5` agent (headless, no plugins). Shown: the prompt in `WRITER-PROMPT.md` (the one-sentence user problem from the top of `README.md` and the list of files a task consists of). "
                  "Not shown: the product code, `docs/HEAD-TO-HEAD.md`, the research report, any earlier task set. Not told which cases the product handles or loses. The controller did not read the tasks, criteria or ground-truth scripts before the run (a disclosed slip, if any, is in SUMMARY.md). "
                  "Source branch: %s. The set was held-out until this gate and is public from here on.\n" % s["branch"])
        else:
            shutil.copy(BENCH + "/build-fixture.sh", tdir + "/build-fixture.sh")
            shutil.copy(BENCH + "/truth.py", tdir + "/truth.py")
            shutil.copy(BENCH + "/criteria-labels.json", tdir + "/criteria-labels.json")
            for t in tasks:
                write("%s/%s/prompt.txt" % (tdir, t["id"]), t["prompt"].strip() + "\n")
                crit = t["criteria"]
                write("%s/%s/criteria.md" % (tdir, t["id"]), "# %s\n\n" % t["id"] + "\n".join("%d. %s" % (i + 1, c) for i, c in enumerate(crit)) + "\n")
            write(tdir + "/WRITER.md", "# Public tasks\n\nWritten by the maintainers in earlier rounds (see docs/HEAD-TO-HEAD.md); fixtures are built by `build-fixture.sh`, ground truth by `truth.py` (plain git blame). Not held-out.\n")
        # runs
        for rd in sorted(glob.glob(out + "/runs/*")):
            m = re.fullmatch(r"(\w+?)-(ours|pp|ppi|hist|bf|base)-(\d+)", os.path.basename(rd))
            if not m or not os.path.exists(rd + "/final.txt"):
                continue
            task, arm, rep = m.groups()
            base = "%s/runs/%s/%s/%s" % (d, task, arm, rep)
            copy_scrubbed(rd + "/final.txt", base + "/final.txt")
            if os.path.exists(rd + "/mailmap.txt"):
                copy_scrubbed(rd + "/mailmap.txt", base + "/mailmap.txt")
            if os.path.exists(rd + "/run.jsonl"):
                trace(rd + "/run.jsonl", base + "/trace.jsonl.gz")
                write(base + "/cost.json", json.dumps(cost_of(rd + "/run.jsonl"), indent=1) + "\n")
        # grades
        gd = d + "/grades/" + s["key"]
        for f in sorted(glob.glob(out + "/grade/*")):
            if os.path.isfile(f):
                copy_scrubbed(f, gd + "/" + os.path.basename(f))
        for name in cfg["grade_logs"][s["key"]]:
            p = cfg["dir"] + "/" + name
            if os.path.exists(p):
                copy_scrubbed(p, gd + "/logs/" + name)
        before = cfg["dir"] + "/grade-P-before-regrade"
        if key == "r8" and s["key"] == "public" and os.path.isdir(before):
            for f in sorted(glob.glob(before + "/*.call*.out")):
                cur = out + "/grade/" + os.path.basename(f)
                if not os.path.exists(cur) or open(cur, errors="replace").read() != open(f, errors="replace").read():
                    copy_scrubbed(f, gd + "/reasks/" + os.path.basename(f))
        meta_sets.append({"key": s["key"], "label": s["label"]})
    # cost table
    copy_scrubbed(cfg["cost"], d + "/cost.tsv")
    shutil.copy(HERE + "/score.py", d + "/score.py")
    return d, meta_sets


if __name__ == "__main__":
    key, dest = sys.argv[1], os.path.abspath(sys.argv[2])
    d, meta_sets = build(key, dest)
    cfg = ROUNDS[key]
    print(d)
    json.dump({"sets": meta_sets}, open(d + "/.sets.json", "w"))
