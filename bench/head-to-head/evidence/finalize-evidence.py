#!/usr/bin/env python3
"""finalize-evidence.py <staged-round-dir> <r7|r8> : writes summary-meta.json, SUMMARY.md, REPRODUCE.md, VERIFY.md, SHA256SUMS, then the checks."""
import hashlib
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib.util
spec = importlib.util.spec_from_file_location("be", HERE + "/build-evidence.py")
be = importlib.util.module_from_spec(spec); spec.loader.exec_module(be)

d, key = os.path.abspath(sys.argv[1]), sys.argv[2]
cfg = be.ROUNDS[key]
extra = json.load(open(os.path.join(HERE, "round-text.json")))[key]
sets = json.load(open(d + "/.sets.json"))["sets"]
os.remove(d + "/.sets.json")
ct = subprocess.run(["git", "-C", be.REPO, "show", "-s", "--format=%cI", cfg["protocol_commit"]], capture_output=True, text=True).stdout.strip()
meta = {"title": cfg["title"], "sentence": extra["sentence"], "protocol_commit": cfg["protocol_commit"], "protocol_commit_time": ct, "product": cfg["product"],
        "date": cfg["date"], "departures": extra["departures"], "sets": sets}
json.dump(meta, open(d + "/summary-meta.json", "w"), indent=1)
shutil.copy(HERE + "/check-order.py", d + "/check-order.py")
shutil.copy(HERE + "/score.py", d + "/score.py")
summary = subprocess.run([sys.executable, "-I", d + "/score.py"], capture_output=True, text=True, check=True).stdout
open(d + "/SUMMARY.md", "w").write(summary)
name = cfg["name"]
open(d + "/REPRODUCE.md", "w").write("""# Reproduce %(name)s

Everything below runs from a clone of this repository at the product commit `%(product)s` (or later: the scripts did not change the way cells are run or graded).
Paths in angle brackets are folders you choose. Needs: `claude` CLI (see `env.json` for the version used), an API key in `ANTHROPIC_API_KEY`, git, python3, node. Do not run the Vaara plugin; run rivals only from `git archive` copies.

1. **Build the fixtures.** Public: `bash bench/head-to-head/build-fixture.sh <fixtures>` (the script is also in `tasks/public/`). Held-out set: for each task `bash tasks/<set>/<task>/build-fixture.sh <fixtures>/<fixture>` (two builds give the same HEAD sha; the sha is the first line of that task's `truth.txt`).
2. **Ground truth.** `python3 -I tasks/<set>/<task>/truth.py <fixture>` must print the committed `truth.txt` (public: `python3 -I bench/head-to-head/truth.py <fixture> [--ignore-rev <sha>]`, outputs in `tasks/public/truth/`).
3. **Install the pinned arms** (`arms.json`): `git archive <sha>` of each rival into its own folder (for `hist`, `pip install` into a venv and point `.mcp.json` at the binary; for `bf`, the `--no-github` line), ours from `git archive %(product)s`. Export `OURS_DIR PP_DIR HIST_DIR BF_DIR` and `MODEL=claude-sonnet-5-5`. The Agent SDK shim used here is a drop-in `claude -p` replacement; with the plain CLI the only known difference is the desktop-only Artifact tool (see `env.json`).
4. **Rerun any cell.** `PARALLEL=3 bash bench/head-to-head/run-gate.sh <out> <tasks.json> <fixtures> <arms,comma> <run-number> [task,comma]`, then `ls <out>/runs/<task>-<arm>-<n>/final.txt`. One cell is one task, one arm, one run number.
5. **Regrade.** `python3 -I bench/head-to-head/gate-grade.py <out> <tasks.json> <truth-dir>` (all arms of a task and run are graded together in a shuffled order, three grader calls per cell; an existing parsed reply on disk is reused, a reply that does not parse is asked again). The prompt of every cell is `grades/<set>/<cell>.in`.
6. **Rescore.** `python3 -I score.py` prints `SUMMARY.md`; `python3 -I score.py --check` fails on any difference. It reads only `grades/` and `tasks/`.

**Cost and time (this round, from `cost.tsv`).** %(cost)s Wall time was several hours at parallelism 3.

**What differs on a rerun.** Model output varies run to run. In this round the per-cell spread is visible in the table (the three run scores in brackets); single cells moved by one criterion between runs in many rows, and the grader's own votes disagreed on some criteria (see `votes` in `grades/<set>/scores.json`). The F6 audit (independent re-run and re-grade of 10 percent of cells) was not run in this round because the gate failed, so there is no measured agreement rate; do not read one into this folder.
""" % {"name": name, "product": cfg["product"], "cost": extra["cost"]})
open(d + "/VERIFY.md", "w").write("""# Verify %(name)s (checklist for another LLM or a person)

Run all commands from inside this folder (`bench/head-to-head/results/%(name)s`). No network and no model calls are needed.

1. **Protocol was frozen before the runs.** `git log --format='%%h %%cI %%s' -- docs/HEAD-TO-HEAD.md` from the repository root: the protocol commit `%(proto)s` (and the rulings commit(s) %(rulings)s) must come before the results commit(s). Then `python3 -I check-order.py`: it prints the earliest timestamp in all traces and exits 0 only if it is not before the protocol commit time stored in `summary-meta.json`. Proves: no scored run started before the freeze.
2. **No reused cells** (the protocol says none). Every `runs/<task>/<arm>/<rep>/` has its own `cost.json` and trace, and `check-order.py` covers all of them: all traces are from the run day after the freeze, none from an earlier round. Count: `ls runs/*/*/* -d | wc -l` equals the number of cells in the tables (runs per task times arms; `ppi` exists only where a task has an invoked prompt).
3. **Scores recompute.** `python3 -I score.py --check` prints "SUMMARY.md matches score.py output". Proves: every table, Rule A and Rule B in `SUMMARY.md` come from the raw votes in `grades/`.
4. **Rules applied as frozen.** Open `PROTOCOL.md` section "Rules" and compare with the worked arithmetic in `SUMMARY.md` (Rule A: 80 percent of the highest rival's lost points, pp and ppi as the better of the two per task; Rule B: strictly above every rival, ours at the maximum where a rival is).
5. **Grading was blind and joint.** Open one `grades/<set>/<cell>.in` (the exact grader prompt, answers labelled A to F in a shuffled order, plugin names hidden), `<cell>.labels.json` (label to arm), `<cell>.call1..3.out` (the three votes with reasons). `grades/<set>/logs/` and `grades/<set>/reasks/` hold parse failures and the replies that were asked again.
6. **Redaction holds.** `python3 -I ../../scrub.py --check .` exits 0 (it also reads the `.gz` traces); `python3 -I ../../scrub.py --self-test` prints OK. Addresses other than `*.example` and `noreply@anthropic.com`, keys and tokens of common providers, and local home, scratch and temp paths are replaced by `<email redacted>`, `<secret redacted>`, `<home>`, `<scratch>`, `<tmp>`. Traces drop the redundant `wire_tool_inputs` key (a copy of each tool call input); nothing else is removed.
7. **Held-out writer did not see the code.** Open `tasks/%(held)s/WRITER.md` and `WRITER-PROMPT.md` (the whole prompt the writer got). Check that the prompt names no product file. `git ls-remote --heads origin` does not list the held-out branch named in `WRITER.md` (it was never pushed). Any slip is stated in `SUMMARY.md`.
8. **Folder is unchanged.** `shasum -a 256 -c SHA256SUMS` prints OK for every file.
9. **The claim does not exceed the tables.** `SUMMARY.md` says gate "failed" or "passed" from the same numbers; "first" appears only if the gate passed.
""" % {"name": name, "proto": cfg["protocol_commit"], "rulings": cfg["rulings_commits"], "held": sets[0]["key"]})
subprocess.run([sys.executable, "-I", be.BENCH + "/scrub.py", d], check=True)
subprocess.run([sys.executable, "-I", be.BENCH + "/scrub.py", "--check", d], check=True)
sums = []
for folder, _, names in os.walk(d):
    for n in names:
        if n == "SHA256SUMS":
            continue
        p = os.path.join(folder, n)
        sums.append("%s  %s" % (hashlib.sha256(open(p, "rb").read()).hexdigest(), os.path.relpath(p, d)))
open(d + "/SHA256SUMS", "w").write("\n".join(sorted(sums, key=lambda l: l.split("  ", 1)[1])) + "\n")
print("finalized", d, len(sums), "files")
