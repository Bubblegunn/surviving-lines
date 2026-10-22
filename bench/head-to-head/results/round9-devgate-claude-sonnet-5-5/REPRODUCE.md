# Reproduce round9-devgate-claude-sonnet-5-5 (development gate, not a scored round)

Runs from a clone of this repository. Needs: `claude` CLI (`env.json`), an API key in `ANTHROPIC_API_KEY`, git, python3, node. Do not run the Vaara plugin. Only ours was run, so no rival needs installing.

1. **Fixtures and truth.** For each task `bash tasks/<set>/<task>/build-fixture.sh <fixtures>/<fixture>` (sets `D`, `C`); the first line of that task's `truth.txt` is the HEAD sha two builds must agree on. `python3 -I tasks/<set>/<task>/truth.py <fixture>` must print `truth.txt`.
2. **Install ours** at one iteration's product commit (`env.json`: iteration 1 `09e09d9`, 2 `c689450`, 3 `7c78c82`): `git archive <commit>` into a folder, `export OURS_DIR=<folder> MODEL=claude-sonnet-5-5`.
3. **Rerun a cell.** `PARALLEL=3 bash bench/head-to-head/run-gate.sh <out> tasks/<set>/tasks.json <fixtures> ours <run-number> [task,comma]` (the `tasks.json` files are in `tasks/`; the SDK shim is a drop-in `claude -p`; the only known difference to the plain CLI is the desktop-only Artifact tool).
4. **Regrade.** `python3 -I bench/head-to-head/gate-grade.py <out> tasks/<set>/tasks.json <truth-dir>` (three grader calls per cell, a reply that does not parse is asked again). The exact prompt of each cell is `grades/<iteration>/<set>/<cell>.in`; ours alone, label A.
5. **Rescore.** `python3 -I score.py` prints `SUMMARY.md`; `python3 -I score.py --check` fails on any difference. It reads `grades/`, `tasks/`, `rivals.json`, `runs/*/*/*/cost.json`, `cost.tsv`, `env.json` and `summary-meta.json`, with no network and no model calls.

**Cost and time.** Per iteration about 2.4 USD for the 30 runs (cost.json sum) and 2.4 to 2.7 USD for the grading, about 15 to 18 minutes of run wall time at parallelism 3 plus grading and re-asks. The whole logged round is in `SUMMARY.md` (Cost).

**What differs on a rerun.** Model output varies. In this folder the spread is visible per task (`runs` column: every run), and the grader's votes disagree on many criteria in the iterations with unparsed replies (reliability table). No F6 independent re-grade was run, so there is no measured agreement rate with a re-grade.
