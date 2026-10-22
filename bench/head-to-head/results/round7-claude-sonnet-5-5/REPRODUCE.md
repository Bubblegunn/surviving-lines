# Reproduce round7-claude-sonnet-5-5

Everything below runs from a clone of this repository at the product commit `4b65d05` (or later: the scripts did not change the way cells are run or graded).
Paths in angle brackets are folders you choose. Needs: `claude` CLI (see `env.json` for the version used), an API key in `ANTHROPIC_API_KEY`, git, python3, node. Do not run the Vaara plugin; run rivals only from `git archive` copies.

1. **Build the fixtures.** Public: `bash bench/head-to-head/build-fixture.sh <fixtures>` (the script is also in `tasks/public/`). Held-out set: for each task `bash tasks/<set>/<task>/build-fixture.sh <fixtures>/<fixture>` (two builds give the same HEAD sha; the sha is the first line of that task's `truth.txt`).
2. **Ground truth.** `python3 -I tasks/<set>/<task>/truth.py <fixture>` must print the committed `truth.txt` (public: `python3 -I bench/head-to-head/truth.py <fixture> [--ignore-rev <sha>]`, outputs in `tasks/public/truth/`).
3. **Install the pinned arms** (`arms.json`): `git archive <sha>` of each rival into its own folder (for `hist`, `pip install` into a venv and point `.mcp.json` at the binary; for `bf`, the `--no-github` line), ours from `git archive 4b65d05`. Export `OURS_DIR PP_DIR HIST_DIR BF_DIR` and `MODEL=claude-sonnet-5-5`. The Agent SDK shim used here is a drop-in `claude -p` replacement; with the plain CLI the only known difference is the desktop-only Artifact tool (see `env.json`).
4. **Rerun any cell.** `PARALLEL=3 bash bench/head-to-head/run-gate.sh <out> <tasks.json> <fixtures> <arms,comma> <run-number> [task,comma]`, then `ls <out>/runs/<task>-<arm>-<n>/final.txt`. One cell is one task, one arm, one run number.
5. **Regrade.** `python3 -I bench/head-to-head/gate-grade.py <out> <tasks.json> <truth-dir>` (all arms of a task and run are graded together in a shuffled order, three grader calls per cell; an existing parsed reply on disk is reused, a reply that does not parse is asked again). The prompt of every cell is `grades/<set>/<cell>.in`.
6. **Rescore.** `python3 -I score.py` prints `SUMMARY.md`; `python3 -I score.py --check` fails on any difference. It reads only `grades/` and `tasks/`.

**Cost and time (this round, from `cost.tsv`).** Logged `claude -p` cost of the whole round: 31.20 USD (runs C 6.33 + public 11.80, grading 2.73 + 5.52, diagnostics and subagents about 5). Wall time was several hours at parallelism 3.

**What differs on a rerun.** Model output varies run to run. In this round the per-cell spread is visible in the table (the three run scores in brackets); single cells moved by one criterion between runs in many rows, and the grader's own votes disagreed on some criteria (see `votes` in `grades/<set>/scores.json`). The F6 audit (independent re-run and re-grade of 10 percent of cells) was not run in this round because the gate failed, so there is no measured agreement rate; do not read one into this folder.
