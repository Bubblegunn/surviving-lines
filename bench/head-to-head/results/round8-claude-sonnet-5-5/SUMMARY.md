# surviving-lines round 8 and final gate (failed)

**Result.** On 2026-10-22, on the Claude Agent SDK path with claude-sonnet-5-5, with 3 runs per cell and a model grader, surviving-lines at dabc18f had the highest total of six arms (itself, project-pilot with and without its command, mcp-git-historian, k41n/busfactor, plain Claude) on 5 new held-out tasks (19.33 of 25 against 13.00 for the best rival, better-of pp/ppi) and on 11 public tasks (50.67 of 51 against 43.00; Rule A and Rule B both pass on the public set), but Rule B failed on the held-out set (D1 and D2), so the preregistered gate failed and F9 and F6 were not run.

Protocol frozen in commit `115bc01` before any scored run (see `PROTOCOL.md`). Product: `dabc18f`. Date: 2026-10-22.

### Held-out D1 to D5 (new, written by an agent that had not seen the code)

Mean criteria passed per cell, runs in brackets; `err=n`: n criteria had fewer than two valid votes and are left out.

| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | 5 | 3.00 (3/3/3) | 3.33 (3/2/5) | 3.67 (4/3/4) | 2.67 (3/2/3) | 3.67 (4/4/3) | 3.67 (5/3/3) |
| D2 | 5 | 3.00 (3/3/3) | 2.33 (0/3/4) | 4.33 (4/5/4) | 3.00 (4/4/1) | 0.33 (0/1/0) | 3.33 (4/3/3) |
| D3 | 5 | 4.67 (5/4/5) | 0.00 (0/0/0) | 0.33 (0/0/1) | 0.00 (0/0/0) | 0.00 (0/0/0) | 0.00 (0/0/0) |
| D4 | 5 | 4.67 (5/5/4) | 1.67 (1/2/2) | 1.33 (1/2/1) | 0.00 (0/0/0) | 1.67 (1/3/1) | 2.00 (2/2/2) |
| D5 | 5 | 4.00 (4/4/4) | 3.00 (3/3/3) | 3.00 (3/3/3) | 2.67 (3/3/2) | 2.67 (3/3/2) | 3.00 (3/3/3) |
| Total | 25 | 19.33 | 10.33 | 12.67 | 8.33 | 8.33 | 12.00 |

**Rule A** (our lost points at most 80 percent of the lost points of the rival with the highest total).

- Maximum: 25. Ours: 19.33, lost 5.67.
- Rival totals (pp/ppi = better of the two per task): pp/ppi 13.00, hist 8.33, bf 8.33, base 12.00.
- Highest rival: pp/ppi, lost 12.00; limit 0.8 x 12.00 = 9.60.
- 5.67 <= 9.60 is true: **Rule A passes**.

**Rule B** (on every task our mean is strictly above every rival; where a rival is at the maximum, ours must be at the maximum too).

- Tasks checked: 5. Failing: D1 (pp/ppi 3.67, ours 3.00; bf 3.67, ours 3.00; base 3.67, ours 3.00), D2 (pp/ppi 4.33, ours 3.00; hist 3.00, ours 3.00; base 3.33, ours 3.00).
- **Rule B fails**.

### Public tasks (11)

Mean criteria passed per cell, runs in brackets; `err=n`: n criteria had fewer than two valid votes and are left out.

| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 4 | 4.00 (4/4/4) | 4.00 (4/4/4) | 1.67 (2/1/2) | 3.33 (4/3/3) | 3.33 (3/3/4) | 3.33 (3/3/4) |
| T2 | 4 | 4.00 (4/4/4) | 2.33 (2/2/3) | 3.33 (3/3/4) | 1.33 (2/1/1) | 2.67 (2/3/3) | 3.67 (4/4/3) |
| T3 | 5 | 5.00 (5/5/5) | 4.33 (5/4/4) | - | 4.33 (5/4/4) | 4.00 (5/4/3) | 4.00 (3/5/4) |
| T4 | 5 | 5.00 (5/5/5) | 3.00 (3/3/3) | 4.00 (4/3/5) | 3.00 (3/3/3) | 2.33 (3/3/1) | 2.67 (3/2/3) |
| T1i | 4 | 4.00 (4/4/4) | 3.33 (3/3/4) | 2.67 (4/2/2) | 3.33 (4/4/2) | 3.67 (3/4/4) | 2.67 (4/2/2) |
| T4i | 5 | 5.00 (5/5/5) | 3.00 (3/3/3) | 3.33 (3/3/4) | 3.00 (3/3/3) | 3.33 (3/3/4) | 3.67 (3/5/3) |
| E1 | 5 | 5.00 (5/5/5) | 4.00 (4/3/5) | 2.67 (3/2/3) | 4.00 (5/4/3) | 2.00 (2/2/2) | 3.33 (3/4/3) |
| E2k | 5 | 5.00 (5/5/5) | 4.33 (4/5/4) | 4.33 (5/4/4) | 4.67 (4/5/5) | 4.00 (4/4/4) | 4.00 (4/4/4) |
| E3 | 4 | 3.67 (3/4/4) | 3.00 (3/3/3) | - | 3.00 (3/3/3) | 3.00 (3/3/3) | 3.00 (3/3/3) |
| E4h | 5 | 5.00 (5/5/5) | 4.67 (5/5/4) | - | 3.00 (3/3/3) | 5.00 (5/5/5) | 4.33 (5/3/5) |
| E5 | 5 | 5.00 (5/5/5) | 4.67 (5/5/4) | 4.33 (3/5/5) | 4.00 (5/2/5) | 5.00 (5/5/5) | 5.00 (5/5/5) |
| Total | 51 | 50.67 | 40.67 | 26.33 | 37.00 | 38.33 | 39.67 |

**Rule A** (our lost points at most 80 percent of the lost points of the rival with the highest total).

- Maximum: 51. Ours: 50.67, lost 0.33.
- Rival totals (pp/ppi = better of the two per task): pp/ppi 43.00, hist 37.00, bf 38.33, base 39.67.
- Highest rival: pp/ppi, lost 8.00; limit 0.8 x 8.00 = 6.40.
- 0.33 <= 6.40 is true: **Rule A passes**.

**Rule B** (on every task our mean is strictly above every rival; where a rival is at the maximum, ours must be at the maximum too).

- Tasks checked: 11. Failing: none.
- **Rule B passes**.

## Gate

- Held-out D1 to D5 (new, written by an agent that had not seen the code): Rule A passes, Rule B fails.
- Public tasks (11): Rule A passes, Rule B passes.
- Gate (both sets, both rules): **failed**.

## Departures from the frozen protocol and caveats

- Public grading was completed after the budget stop line (34 USD) had been crossed, on the owner's instruction: the cells whose grader replies did not parse (T1-2, T1i-3, E1-2, E3-1, plus one that failed again in the first re-ask) were graded again with the same `gate-grade.py`, same grader model and same prompts; no new run. Replaced failed replies are kept in `grades/public/reasks/`. First published public result (before completion): ours 50.33, Rule B failed on T1 (tie with pp at 3.67). Completed result: ours 50.67, Rule B passes. The held-out result did not change.
- The run driver skipped grading after each batch because of a shell status bug; grading was run afterwards by a separate script with the same grader code and the same budget check.
- The controller saw two README entries of the held-out writer (d4 and d5 hazard summaries) on a terminal while checking that the file existed; this was after the product code was frozen and changed nothing.
- One implementer run used `git checkout -- hooks` on its own uncommitted edit, which the handoff rules forbid. Nothing else was touched.
- No cell of an earlier round is reused. The SDK path differs from the earlier CLI path only in that the desktop application's Artifact tool and artifact-diagramming skill are absent.
- Product change of round 8 (R8-1 to R8-5) came from the diagnosis of seen cells (C1, T1, E5, C3). The losses on D1 and D2 were not investigated. Diagnostic runs (ours, one run each, not scored) are not part of any table.
- F9 (Haiku, Opus) and F6 were not run because the gate failed. Rule B has no tolerance.
