# Verify round9-devgate-claude-sonnet-5-5 (checklist for another LLM or a person)

Run commands from inside this folder (`bench/head-to-head/results/round9-devgate-claude-sonnet-5-5`). No network and no model calls are needed. This folder is a development gate, not a scored round.

1. **Rulings frozen before the code and the runs.** `git log --format='%h %cI %s' -- docs/HEAD-TO-HEAD.md` from the repository root: `53cc762` (round 9 rulings), `706f3a1` (iteration 1 diagnosis) and `ca5b21c` (iteration 2 diagnosis) each come before the product commits that implement them (`d8dbd81`/`09e09d9`, `c689450`, `fd519c6`/`7c78c82`). `python3 -I check-order.py` prints the earliest trace timestamp and exits 0 only if it is not before the rulings commit time in `summary-meta.json`.
2. **Counts.** `ls runs/*/*/* -d | wc -l` is 90 (10 tasks, 3 iterations, 3 runs). Each has `final.txt`, `trace.jsonl.gz`, `cost.json`.
3. **Scores recompute.** `python3 -I score.py --check` prints "SUMMARY.md matches score.py output". Every table, the bootstrap intervals (seed in `summary-meta.json`), the reliability and cost tables come from the raw files.
4. **Gate rule applied as written.** `PROTOCOL.md` quotes the rule (strictly above the best published rival on every task, or at the ceiling together with it). In `SUMMARY.md` check one failing row, for example iteration 3 set D task D4 (2.00 against 2.00, below the ceiling) and `rivals.json` for the rival's published runs (source files named there).
5. **Grading.** Open one `grades/<iteration>/<set>/<cell>.in` (the exact grader prompt, ours alone as label A), `<cell>.labels.json`, `<cell>.call1..3.out` (the three votes) and `grades/<iteration>/<set>/logs/` (parse failures). Err criteria are listed per run in `SUMMARY.md`.
6. **Redaction holds.** `python3 -I ../../scrub.py --check .` exits 0 (reads the `.gz` traces too); `python3 -I ../../scrub.py --self-test` prints OK.
7. **No scored claim.** `SUMMARY.md` says the gate failed and that nothing enters a score table; the word "first" appears only in the sentence that disclaims it. Held-out set e is not in this folder and was never run.
8. **Folder unchanged.** `shasum -a 256 -c SHA256SUMS` prints OK for every file.
