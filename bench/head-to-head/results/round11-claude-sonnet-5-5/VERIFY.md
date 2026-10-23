# Verify round11-claude-sonnet-5-5 (checklist for another LLM or a person)

Run all commands from inside this folder (`bench/head-to-head/results/round11-claude-sonnet-5-5`). No network and no model calls are needed.

1. **Protocol was frozen before the runs.** `git log --format='%h %cI %s' -- docs/HEAD-TO-HEAD.md` from the repository root: `11276e3` (confirmation protocol) precedes this folder's commit; `3f5ef57` (subscription departure) was committed before any public grade existed; `5ae4965` (F9 decision) before the first F9 call. Then `python3 -I check-order.py`: prints the earliest timestamp in the traces of this round's own cells and exits 0 only if it is not before the protocol commit time in `summary-meta.json`. Proves no scored run started before the freeze.
2. **Reused cells are named.** `reused.json` lists the 156 public rival cells copied from round 8 (SDK path, 2026-10-22); they are excluded from the time check and marked `R` in every table. Held-out e has no reused cell; the public `ours` cells are new.
3. **Scores recompute.** `python3 -I score.py --check` prints "score.py --check: SUMMARY.md matches the recomputation". Proves every table, Rule A, Rule B, Rule B', bootstrap interval, F6 rate and F9 table come from `grades/`, `f6.json`, `f9.json`, `runs/*/cost.json` and `cost-ledger.tsv`.
4. **Rules as frozen.** Compare `PROTOCOL.md` ("Claims, registered in advance") with the worked numbers in `SUMMARY.md`.
5. **Grading was blind and joint.** Open one `grades/<set>/<cell>.in` (exact grader prompt, answers labelled in a shuffled order, plugin names hidden), `<cell>.labels.json`, `<cell>.call1..3.out` (three votes with reasons). `grades/<set>/logs/` holds the per-cell grading logs including parse failures and re-asks; a reply that failed to parse was overwritten by its re-ask and is not kept (see departures in `SUMMARY.md`).
6. **Redaction holds.** `python3 -I ../../scrub.py --check .` exits 0 (it reads the `.gz` traces too). Addresses, keys and local paths are replaced by placeholders; traces drop the redundant `wire_tool_inputs` key.
7. **Held-out writer did not see the code.** See `tasks/heldout-e` and the departures in `SUMMARY.md` (what the controller saw). The held-out e set is now used and published here.
8. **Folder is unchanged.** `shasum -a 256 -c SHA256SUMS` prints OK for every file.
9. **The claim does not exceed the tables.** `SUMMARY.md` states per set which of I1 and I2 passed; "first" is never claimed beyond what those lines show.
