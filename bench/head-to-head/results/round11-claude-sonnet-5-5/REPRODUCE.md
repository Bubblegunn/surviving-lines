# Reproduce round11-claude-sonnet-5-5

Run from a clone at or after the commit that holds this folder. Needs: the `claude` CLI (version in `env.json`), either an API key or a Claude Code login, git, python3, node. Do not run the Vaara plugin; run rivals only from `git archive` copies at the commits in `arms.json`.

1. **Fixtures.** Public: `bash bench/head-to-head/build-fixture.sh <fixtures>` (also `tasks/public/build-fixture.sh`). Held-out e: `bash tasks/heldout-e/e/<n>/build-fixture.sh <dir>` for each task (see `tasks/heldout-e`); the ground truth of every fixture is `tasks/heldout-e/truth-output/` and `tasks/public/truth/`.
2. **Arms.** `ours`: `git archive 1670228` into a folder. Rivals: see `arms.json`. Export `OURS_DIR PP_DIR HIST_DIR BF_DIR` and `MODEL=claude-sonnet-5-5`.
3. **Rerun any cell.** `PARALLEL=3 bash bench/head-to-head/run-gate.sh <out> <tasks.json or tasks/e-tasks.json> <fixtures> <arms,comma> <run-number> [task,comma]`. One cell is one task, one arm, one run number. The F6 and F9 cells were run with `run.sh` on one cell at a time.
4. **Regrade.** `python3 -I bench/head-to-head/gate-grade.py <out> <tasks-file> <truth-dir>` (all arms of a task and run together in a shuffled order, three calls per cell; a reply that does not parse is asked again; `gate-regrade-reverse.py` for cells still `err`). The prompt of every cell is `grades/<set>/<cell>.in`.
5. **Rescore.** `python3 -I score.py` prints `SUMMARY.md`; `python3 -I score.py --check` fails on any difference. It reads only files in this folder.

**Cost and time.** The dollar figures per category and payer are in `SUMMARY.md` (section Round cost). A rerun of the 189 public and 90 held-out cells costs the amounts shown for `runs-*` and `grade-*` rows at list price; on a subscription login the CLI reports the same list-price estimate. Wall time at parallelism 3 was about 20 to 30 minutes for the held-out runs and a similar time for the public ours runs.

**What differs on a rerun.** Model output varies run to run. The F6 audit (28 cells run again and graded again) is in `SUMMARY.md`: it gives the observed agreement rate and the cells that moved by more than one point. Read it before expecting a rerun to reproduce a single cell.
