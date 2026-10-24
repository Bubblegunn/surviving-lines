# surviving-lines round 13 final measurement (verdicts in the tables)

**Result.** Round 13 final measurement, run 2026-10-24, claude-sonnet-5-5 through the Claude Code CLI 2.1.308 on the owner's subscription login: surviving-lines at 8af57f4 and five other arms (project-pilot with and without its command, mcp-git-historian, k41n/busfactor, plain Claude) on 5 SEALED z tasks (written by a fresh agent) and 11 PUBLIC tasks (a development-seen set), 3 runs per arm and task, no cell reused from any earlier run, five-vote model grading; the verdicts for I1 and I2 per set are in the table "Verdicts (computed)" and nothing beyond that table is claimed. F6 and F9 are in their own sections.

## Verdicts (computed)

| Set | tasks | complete | I1 | Rule A | Rule B | Rule B' |
| --- | --- | --- | --- | --- | --- | --- |
| SEALED z | 5 | yes | PASS | FAIL | FAIL | FAIL |
| PUBLIC | 11 | yes | PASS | PASS | FAIL | FAIL |

## SEALED z (5 tasks, 5 with graded ours cells)

Mean criteria passed; every run's score in brackets (run 1/2/3); `n=` appears when fewer than three runs are graded; no cell is reused in this round; `err=n`: criteria with fewer than 3 valid votes after the re-asks and the reverse pass (counted as not passed). `ppi` has cells only on tasks with an invoked prompt (`-` elsewhere).

| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HZ1 | 5 | 3.33 (3/3/4) min 3 max 4 | 0.67 (2/0/0) min 0 max 2 | 2.67 (3/3/2) min 2 max 3 | 0.00 (0/0/0) min 0 max 0 | 1.00 (0/2/1) min 0 max 2 | 1.33 (2/0/2) min 0 max 2 |
| HZ2 | 5 | 4.00 (4/4/4) min 4 max 4 | 0.00 (0/0/0) min 0 max 0 | 2.00 (1/2/3) min 1 max 3 | 2.00 (2/1/3) min 1 max 3 | 0.33 (1/0/0) min 0 max 1 | 0.00 (0/0/0) min 0 max 0 |
| HZ3 | 5 | 0.67 (1/0/1) min 0 max 1 | 0.33 (1/0/0) min 0 max 1 | 1.33 (0/2/2) min 0 max 2 | 0.00 (0/0/0) min 0 max 0 | 0.00 (0/0/0) min 0 max 0 | 0.33 (0/0/1) min 0 max 1 |
| HZ4 | 5 | 0.33 (0/0/1) min 0 max 1 | 0.00 (0/0/0) min 0 max 0 | 0.00 (0/0/0) min 0 max 0 | 0.00 (0/0/0) min 0 max 0 | 0.00 (0/0/0) min 0 max 0 | 0.00 (0/0/0) min 0 max 0 |
| HZ5 | 5 | 1.33 (2/1/1) min 1 max 2 | 1.33 (2/1/1) min 1 max 2 | 1.33 (2/1/1) min 1 max 2 | 0.00 (0/0/0) min 0 max 0 | 1.33 (1/2/1) min 1 max 2 | 1.67 (2/2/1) min 1 max 2 |
| Total | 25 | 9.67 | 2.33 | 7.33 | 2.00 | 2.67 | 3.33 |

**Rule A.** Ours lost 15.33 of 25. The rival with the highest total is project-pilot (better of pp and ppi per task) (7.33), lost 17.67; limit 80% = 14.13. FAIL.

**Rule B** (pp and ppi as the better of the two per task): FAIL. Tasks failing: HZ3 ours 0.67 vs best 1.33; HZ5 ours 1.33 vs best 1.67.

**Rule B'** (every other arm separately; at most one task not strictly above or at the ceiling together, deficit at most 0.34 on that task): FAIL. Tasks not strictly above/at ceiling: HZ3 ours 0.67 vs best other 1.33 (deficit 0.67); HZ5 ours 1.33 vs best other 1.67 (deficit 0.33).

**Bootstrap** (seed 20261023, 10000 resamples over runs, the same run draw for every arm of a task; 95% percentile interval; total points, ours minus comparator). Best other arm by observed total: **ppi**.

| Comparator | observed difference | 95% interval | includes zero |
| --- | --- | --- | --- |
| pp | +7.33 | [+5.67, +8.67] | no |
| ppi (best other) | +2.33 | [+0.33, +4.33] | no |
| hist | +7.67 | [+6.33, +9.00] | no |
| bf | +7.00 | [+5.33, +8.67] | no |
| base | +6.33 | [+5.00, +7.67] | no |
| project-pilot best-of | +2.33 | [+0.33, +4.33] | no |

I1 (SEALED z): lower bound for ours minus ppi = +0.33, so the interval lies entirely above zero. I1 PASS.

**Grader reliability.** 450 criterion verdicts, 2250 votes of which 2250 valid (0 votes without a result); all five votes equal on 412 verdicts (91.6%); 0 criteria decided by the reverse-order second grading; 0 still `err`; 0 problems recorded in scores.json. Grader replies kept: 75, of which 75 parsed and 75 (100.0%) wrote `reason` before `pass`.

**Cost per arm** (USD, list-price `total_cost_usd` of the run, from `cost.json` of each cell):

| Arm | cells | cost | mean per cell | mean per task | input tok | output tok | cache read | cache create | turns | wall s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ours | 15 | 1.76 | 0.117 | 0.35 | 168 | 44296 | 1657819 | 286821 | 85 | 471 |
| pp | 15 | 1.24 | 0.082 | 0.25 | 122 | 42998 | 1072658 | 174891 | 67 | 396 |
| ppi | 15 | 1.51 | 0.101 | 0.30 | 174 | 53693 | 1395874 | 209113 | 98 | 477 |
| hist | 15 | 1.49 | 0.099 | 0.30 | 144 | 34294 | 1040310 | 259985 | 99 | 305 |
| bf | 15 | 1.32 | 0.088 | 0.26 | 198 | 40988 | 1458548 | 190878 | 99 | 411 |
| base | 15 | 1.05 | 0.070 | 0.21 | 114 | 35530 | 937382 | 134470 | 60 | 336 |

Ours / other cost ratio per cell: pp 1.42x, ppi 1.16x, hist 1.18x, bf 1.33x, base 1.67x.

## PUBLIC (11 tasks, 11 with graded ours cells)

Mean criteria passed; every run's score in brackets (run 1/2/3); `n=` appears when fewer than three runs are graded; no cell is reused in this round; `err=n`: criteria with fewer than 3 valid votes after the re-asks and the reverse pass (counted as not passed). `ppi` has cells only on tasks with an invoked prompt (`-` elsewhere).

| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 4 | 3.00 (3/3/3) min 3 max 3 | 3.67 (3/4/4) min 3 max 4 | 2.67 (2/2/4) min 2 max 4 | 3.33 (4/4/2) min 2 max 4 | 4.00 (4/4/4) min 4 max 4 | 4.00 (4/4/4) min 4 max 4 |
| T2 | 4 | 4.00 (4/4/4) min 4 max 4 | 2.67 (3/3/2) min 2 max 3 | 3.33 (4/3/3) min 3 max 4 | 1.67 (2/2/1) min 1 max 2 | 2.67 (2/4/2) min 2 max 4 | 3.33 (3/4/3) min 3 max 4 |
| T3 | 5 | 5.00 (5/5/5) min 5 max 5 | 4.00 (4/4/4) min 4 max 4 | - | 4.33 (5/4/4) min 4 max 5 | 4.00 (4/4/4) min 4 max 4 | 4.00 (4/4/4) min 4 max 4 |
| T4 | 5 | 5.00 (5/5/5) min 5 max 5 | 3.00 (3/3/3) min 3 max 3 | 4.00 (5/3/4) min 3 max 5 | 3.00 (3/3/3) min 3 max 3 | 3.00 (3/3/3) min 3 max 3 | 3.00 (3/3/3) min 3 max 3 |
| T1i | 4 | 3.00 (3/3/3) min 3 max 3 | 3.67 (4/3/4) min 3 max 4 | 2.00 (2/2/2) min 2 max 2 | 3.00 (3/3/3) min 3 max 3 | 4.00 (4/4/4) min 4 max 4 | 4.00 (4/4/4) min 4 max 4 |
| T4i | 5 | 5.00 (5/5/5) min 5 max 5 | 3.00 (3/3/3) min 3 max 3 | 4.33 (4/5/4) min 4 max 5 | 2.67 (2/3/3) min 2 max 3 | 3.33 (4/3/3) min 3 max 4 | 3.00 (3/3/3) min 3 max 3 |
| E1 | 5 | 5.00 (5/5/5) min 5 max 5 | 3.67 (3/4/4) min 3 max 4 | 3.00 (3/3/3) min 3 max 3 | 3.67 (5/2/4) min 2 max 5 | 3.00 (2/4/3) min 2 max 4 | 3.67 (4/3/4) min 3 max 4 |
| E2k | 5 | 4.67 (5/5/4) min 4 max 5 | 4.00 (5/3/4) min 3 max 5 | 4.00 (4/4/4) min 4 max 4 | 4.00 (3/5/4) min 3 max 5 | 4.00 (4/4/4) min 4 max 4 | 4.33 (4/4/5) min 4 max 5 |
| E3 | 4 | 4.00 (4/4/4) min 4 max 4 | 3.33 (3/4/3) min 3 max 4 | - | 2.67 (3/2/3) min 2 max 3 | 3.33 (3/3/4) min 3 max 4 | 3.00 (3/3/3) min 3 max 3 |
| E4h | 5 | 5.00 (5/5/5) min 5 max 5 | 5.00 (5/5/5) min 5 max 5 | - | 5.00 (5/5/5) min 5 max 5 | 4.33 (5/5/3) min 3 max 5 | 4.00 (3/4/5) min 3 max 5 |
| E5 | 5 | 4.00 (4/4/4) min 4 max 4 | 4.33 (5/5/3) min 3 max 5 | 4.00 (5/4/3) min 3 max 5 | 5.00 (5/5/5) min 5 max 5 | 4.67 (4/5/5) min 4 max 5 | 4.67 (4/5/5) min 4 max 5 |
| Total | 51 | 47.67 | 40.33 | 27.33 | 38.33 | 40.33 | 41.00 |

**Rule A.** Ours lost 3.33 of 51. The rival with the highest total is project-pilot (better of pp and ppi per task) (43.33), lost 7.67; limit 80% = 6.13. PASS.

**Rule B** (pp and ppi as the better of the two per task): FAIL. Tasks failing: T1 ours 3.00 vs best 4.00; T1i ours 3.00 vs best 4.00; E5 ours 4.00 vs best 5.00.

**Rule B'** (every other arm separately; at most one task not strictly above or at the ceiling together, deficit at most 0.34 on that task): FAIL. Tasks not strictly above/at ceiling: T1 ours 3.00 vs best other 4.00 (deficit 1.00); T1i ours 3.00 vs best other 4.00 (deficit 1.00); E5 ours 4.00 vs best other 5.00 (deficit 1.00).

**Bootstrap** (seed 20261023, 10000 resamples over runs, the same run draw for every arm of a task; 95% percentile interval; total points, ours minus comparator). Best other arm by observed total: **base**.

| Comparator | observed difference | 95% interval | includes zero |
| --- | --- | --- | --- |
| pp | +7.33 | [+5.67, +9.33] | no |
| ppi | +20.33 | [+18.33, +22.33] | no |
| hist | +9.33 | [+7.00, +11.67] | no |
| bf | +7.33 | [+5.33, +9.33] | no |
| base (best other) | +6.67 | [+5.00, +8.33] | no |
| project-pilot best-of | +4.33 | [+2.00, +6.00] | no |

I1 (PUBLIC): lower bound for ours minus base = +5.00, so the interval lies entirely above zero. I1 PASS.

**Grader reliability.** 876 criterion verdicts, 4380 votes of which 4380 valid (0 votes without a result); all five votes equal on 850 verdicts (97.0%); 0 criteria decided by the reverse-order second grading; 0 still `err`; 0 problems recorded in scores.json. Grader replies kept: 165, of which 165 parsed and 165 (100.0%) wrote `reason` before `pass`.

**Cost per arm** (USD, list-price `total_cost_usd` of the run, from `cost.json` of each cell):

| Arm | cells | cost | mean per cell | mean per task | input tok | output tok | cache read | cache create | turns | wall s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ours | 33 | 2.49 | 0.076 | 0.23 | 212 | 51085 | 1748380 | 451496 | 108 | 642 |
| pp | 33 | 1.93 | 0.059 | 0.18 | 226 | 46386 | 1806329 | 309520 | 113 | 478 |
| ppi | 24 | 1.84 | 0.077 | 0.23 | 256 | 54468 | 1900103 | 276006 | 129 | 529 |
| hist | 33 | 2.16 | 0.066 | 0.20 | 290 | 44427 | 2006115 | 337241 | 138 | 455 |
| bf | 33 | 2.00 | 0.061 | 0.18 | 294 | 53133 | 2171414 | 313448 | 147 | 552 |
| base | 33 | 1.60 | 0.049 | 0.15 | 204 | 43170 | 1595786 | 252663 | 103 | 450 |

Ours / other cost ratio per cell: pp 1.29x, ppi 0.99x, hist 1.15x, bf 1.24x, base 1.56x.

## Hook (Stop hook in the `ours` cells)

A cell counts as blocked when its trace holds the hook's repair request (a user message containing "Check your answer against surviving-lines"). Scores are criteria passed (the final answer is what the grader saw).

| Set | ours cells | blocked | share blocked | mean score blocked | mean score unblocked |
| --- | --- | --- | --- | --- | --- |
| SEALED z | 15 | 2 | 13.3% | 1.50 | 2.00 |
| PUBLIC | 33 | 3 | 9.1% | 4.67 | 4.30 |
| Both sets | 48 | 5 | 10.4% | 3.40 | 3.60 |

Blocked cells (score in brackets): HZ1-ours-1 (3), HZ4-ours-1 (0), T2-ours-2 (4), E4h-ours-2 (5), E4h-ours-3 (5).

## Round cost (USD, from the wrapper ledger rows of this round; every call, list-price estimate)

| Category | calls | USD |
| --- | --- | --- |
| development-gate1-grade [subscription] | 332 | 32.7138 |
| development-gate1-runs [subscription] | 477 | 32.4558 |
| development-gate2-grade [subscription] | 338 | 33.9625 |
| development-gate2-runs [subscription] | 66 | 5.4448 |
| development-spike [subscription] | 5 | 0.1826 |
| f6-grader [subscription] | 808 | 8.8946 |
| f6-runs [subscription] | 84 | 2.0274 |
| f6-runs-grading [subscription] | 140 | 6.1718 |
| f9-claude-haiku-5-5-grade [subscription] | 80 | 5.3424 |
| f9-claude-haiku-5-5-runs [subscription] | 48 | 0.3141 |
| f9-claude-opus-5-5-grade [subscription] | 80 | 5.7119 |
| f9-claude-opus-5-5-runs [subscription] | 48 | 11.1898 |
| grade-out-F [subscription] | 240 | 20.6491 |
| runs-out-F [subscription] | 279 | 20.3984 |

| Group | USD |
| --- | --- |
| scored runs | 20.40 |
| grading of the scored runs | 20.65 |
| F6 (grader and runs) | 17.09 |
| F9 | 22.56 |
| development gates and probes | 104.76 |
| ledger rows of the final folder that no category matched | 0.00 |
| not in the wrapper ledger (writers, research, implementers, reviewers, controller; as given in cost-ledger.tsv) | 0.00 |
| Grand total (all rows above) | 185.46 |

Cross-check: `cost.json` of the graded scored cells sums to 20.40 USD; the ledger rows for the scored runs sum to 20.40 USD (the difference is cells set aside, failed attempts and cells not yet graded).

## F6 independent audit, part 1: F6-grader (pass or fail)

28 cells drawn with `random.Random(20261023).sample` from the 279 graded cells of this round (cells named `<task>-<arm>-<n>`, sorted; ceil(0.10 x N)). Sample reproduced from the graded cells by this script: **yes**. Their ORIGINAL answers (no agent re-run) were graded again by fresh grader sessions in the original grading unit (all arms of the task and run together, same shuffled order), five calls, same majority rule, re-ask passes, no reverse pass. A criterion that is `err` in either grading counts as a disagreement and as not passed. **Pass condition, fixed before the first run:** no cell differs by more than one point and criterion agreement is at least 90%.

| Cell | set | criteria | original score | regrade score | criteria equal | err (either grading) | within one point |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HZ3-ours-1 | sealed-z | 5 | 1 | 1 | 5 | 0 | yes |
| HZ3-ppi-1 | sealed-z | 5 | 0 | 0 | 5 | 0 | yes |
| HZ2-base-2 | sealed-z | 5 | 0 | 0 | 5 | 0 | yes |
| T4i-pp-1 | public | 5 | 3 | 3 | 5 | 0 | yes |
| T1-hist-1 | public | 4 | 4 | 4 | 4 | 0 | yes |
| HZ3-bf-1 | sealed-z | 5 | 0 | 0 | 5 | 0 | yes |
| T1-pp-2 | public | 4 | 4 | 4 | 4 | 0 | yes |
| E1-ours-3 | public | 5 | 5 | 5 | 5 | 0 | yes |
| T1i-ppi-2 | public | 4 | 2 | 2 | 4 | 0 | yes |
| E3-bf-1 | public | 4 | 3 | 3 | 4 | 0 | yes |
| T1i-pp-1 | public | 4 | 4 | 4 | 4 | 0 | yes |
| HZ2-base-3 | sealed-z | 5 | 0 | 0 | 5 | 0 | yes |
| HZ5-bf-1 | sealed-z | 5 | 1 | 1 | 5 | 0 | yes |
| T1-bf-1 | public | 4 | 4 | 4 | 4 | 0 | yes |
| HZ4-pp-2 | sealed-z | 5 | 0 | 0 | 5 | 0 | yes |
| HZ3-pp-1 | sealed-z | 5 | 1 | 1 | 3 | 0 | yes |
| T1-hist-2 | public | 4 | 4 | 4 | 4 | 0 | yes |
| E2k-bf-2 | public | 5 | 4 | 4 | 5 | 0 | yes |
| T1i-pp-3 | public | 4 | 4 | 4 | 4 | 0 | yes |
| E1-ours-2 | public | 5 | 5 | 5 | 5 | 0 | yes |
| E5-hist-2 | public | 5 | 5 | 5 | 5 | 0 | yes |
| T3-bf-3 | public | 5 | 4 | 4 | 5 | 0 | yes |
| T1i-base-1 | public | 4 | 4 | 4 | 4 | 0 | yes |
| E5-ours-1 | public | 5 | 4 | 4 | 5 | 0 | yes |
| HZ4-ours-3 | sealed-z | 5 | 1 | 1 | 5 | 0 | yes |
| E2k-ours-1 | public | 5 | 5 | 5 | 5 | 0 | yes |
| HZ4-hist-2 | sealed-z | 5 | 0 | 0 | 5 | 0 | yes |
| HZ2-pp-2 | sealed-z | 5 | 0 | 0 | 5 | 0 | yes |

Criteria equal to the original verdict: 129 of 131 (98.5%). Cells differing by more than one point: none. **F6-grader PASS** (pass condition: no such cell and at least 90% agreement).

## F6 independent audit, part 2: F6-runs (descriptive, no pass condition)

The same 28 cells were run again once (same arm and prompt, new fixture copy) and the new answer was graded alone (one answer, five calls, same method). Reported: the re-run score against the minimum and maximum of the cell's three original runs.

| Cell | re-run score | original three runs | within min-max |
| --- | --- | --- | --- |
| HZ3-ours-1 | 0 | 1/0/1 | yes |
| HZ3-ppi-1 | 1 | 0/2/2 | yes |
| HZ2-base-2 | 0 | 0/0/0 | yes |
| T4i-pp-1 | 3 | 3/3/3 | yes |
| T1-hist-1 | 4 | 4/4/2 | yes |
| HZ3-bf-1 | 0 | 0/0/0 | yes |
| T1-pp-2 | 4 | 3/4/4 | yes |
| E1-ours-3 | 5 | 5/5/5 | yes |
| T1i-ppi-2 | 2 | 2/2/2 | yes |
| E3-bf-1 | 3 | 3/3/4 | yes |
| T1i-pp-1 | 4 | 4/3/4 | yes |
| HZ2-base-3 | 2 | 0/0/0 | no |
| HZ5-bf-1 | 1 | 1/2/1 | yes |
| T1-bf-1 | 3 | 4/4/4 | no |
| HZ4-pp-2 | 0 | 0/0/0 | yes |
| HZ3-pp-1 | 0 | 1/0/0 | yes |
| T1-hist-2 | 4 | 4/4/2 | yes |
| E2k-bf-2 | 4 | 4/4/4 | yes |
| T1i-pp-3 | 4 | 4/3/4 | yes |
| E1-ours-2 | 5 | 5/5/5 | yes |
| E5-hist-2 | 5 | 5/5/5 | yes |
| T3-bf-3 | 4 | 4/4/4 | yes |
| T1i-base-1 | 4 | 4/4/4 | yes |
| E5-ours-1 | 4 | 4/4/4 | yes |
| HZ4-ours-3 | 0 | 0/0/1 | yes |
| E2k-ours-1 | 5 | 5/5/4 | yes |
| HZ4-hist-2 | 0 | 0/0/0 | yes |
| HZ2-pp-2 | 3 | 0/0/0 | no |

Within the range of the three original runs: 25 of 28 gradable re-runs.

## F9 other models (descriptive)

One run per task (run 1), arms ours, base and the best rival of the task (highest Sonnet mean of this round in that set among pp, ppi, hist, bf; ties in that order; fixed from the Sonnet grades before any F9 call, `f9/best.json`), both sets, graded per task by the same method (grader claude-sonnet-5-5). Score = criteria passed. No bootstrap, no interval and no claim of being first: one run per task. Rule B per model: ours strictly above base and the best rival on every task, or at the ceiling together with them.

### claude-haiku-5-5

**SEALED z**

| Task | max | ours | base | best rival (name) | Rule B |
| --- | --- | --- | --- | --- | --- |
| HZ1 | 5 | 2 | 0 | 0 (ppi) | ok |
| HZ2 | 5 | 2 | 2 | 0 (ppi) | NO |
| HZ3 | 5 | 0 | 0 | 0 (ppi) | NO |
| HZ4 | 5 | 1 | 0 | 0 (pp) | ok |
| HZ5 | 5 | 1 | 1 | 0 (pp) | NO |
| Total | 25 | 6 | 3 | 0 | Rule B FAIL on HZ2, HZ3, HZ5 |

Descriptive: ours 6, base 3, best rivals 0; ours is ahead of both in total.

**PUBLIC**

| Task | max | ours | base | best rival (name) | Rule B |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | 3 | 1 | 1 (bf) | ok |
| T2 | 4 | 4 | 3 | 3 (ppi) | ok |
| T3 | 5 | 5 | 4 | 4 (hist) | ok |
| T4 | 5 | 5 | 3 | 2 (ppi) | ok |
| T1i | 4 | 2 | 0 | 1 (bf) | ok |
| T4i | 5 | 5 | 3 | 3 (ppi) | ok |
| E1 | 5 | 5 | 4 | 4 (pp) | ok |
| E2k | 5 | 5 | 4 | 3 (pp) | ok |
| E3 | 4 | 3 | 2 | 3 (pp) | NO |
| E4h | 5 | 5 | 4 | 5 (pp) | ok |
| E5 | 5 | 4 | 5 | 4 (hist) | NO |
| Total | 51 | 46 | 33 | 33 | Rule B FAIL on E3, E5 |

Descriptive: ours 46, base 33, best rivals 33; ours is ahead of both in total.


### claude-opus-5-5

**SEALED z**

| Task | max | ours | base | best rival (name) | Rule B |
| --- | --- | --- | --- | --- | --- |
| HZ1 | 5 | 4 | 2 | 3 (ppi) | ok |
| HZ2 | 5 | 4 | 2 | 4 (ppi) | NO |
| HZ3 | 5 | 2 | 1 | 3 (ppi) | NO |
| HZ4 | 5 | 2 | 4 | 1 (pp) | NO |
| HZ5 | 5 | 3 | 3 | 3 (pp) | NO |
| Total | 25 | 15 | 12 | 14 | Rule B FAIL on HZ2, HZ3, HZ4, HZ5 |

Descriptive: ours 15, base 12, best rivals 14; ours is ahead of both in total.

**PUBLIC**

| Task | max | ours | base | best rival (name) | Rule B |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | 4 | 4 | 3 (bf) | ok |
| T2 | 4 | 4 | 3 | 4 (ppi) | ok |
| T3 | 5 | 5 | 5 | 5 (hist) | ok |
| T4 | 5 | 5 | 1 | 5 (ppi) | ok |
| T1i | 4 | 4 | 3 | 4 (bf) | ok |
| T4i | 5 | 5 | 5 | 4 (ppi) | ok |
| E1 | 5 | 5 | 4 | 2 (pp) | ok |
| E2k | 5 | 5 | 4 | 4 (pp) | ok |
| E3 | 4 | 4 | 2 | 4 (pp) | ok |
| E4h | 5 | 5 | 3 | 3 (pp) | ok |
| E5 | 5 | 5 | 5 | 5 (hist) | ok |
| Total | 51 | 51 | 39 | 43 | Rule B PASS |

Descriptive: ours 51, base 39, best rivals 43; ours is ahead of both in total.


## Cells set aside, re-asks and driver events

No scored run was set aside (no cell was moved out of the run folder).

Rate limits and errors, counted in the 403 traces (scored runs, F6 re-runs, F9 runs): five_hour allowed_warning x147, seven_day allowed_warning x303; events with a status other than allowed or allowed_warning: 0; cells whose result event has is_error true: 0.

Driver log (`drive.log.txt`): 0 re-ask passes recorded, 2 stop events.

Re-ask and stop lines: 08:58:29 STOPPED: usage limit or auth error in F6-runs; 10:33:02 STOPPED: usage limit or auth error in F6-runs.

## Departures

- Run path as frozen (Claude Code CLI 2.1.308, owner subscription login, wrapper with isolated HOME); no SDK path and no API key in this round (apiKeySource in the traces: none x403).
- Guard: hooks and mcpServers hashes were identical in all 234 guarded cells (one value).
- Product check: `ours-src` equals `git archive 8af57f4`: yes.
- Amendments to the frozen protocol after the freeze: none recorded.
- Driver log lines other than routine progress (`drive.log.txt`): 279 28; 08:58:29 STOPPED: usage limit or auth error in F6-runs; 10:31:48 RESUME after session limit (F6-runs stopped 08:58); failed F6-run cells set aside (never graded); 10:33:02 STOPPED: usage limit or auth error in F6-runs; 10:38:27 RESUME after login renewed (~10:40; account may differ from earlier calls, same CLI/model/flags); failed F6-run cells set aside (never graded).
Session limits stopped the drivers several times; every cell that failed on a limit or on a missing login was set aside (set-aside/), never graded, and run again. The final measurement was paused at 08:58 (usage limit during F6-runs) and again at 10:33; the owner renewed the subscription login at about 10:40, and the account behind the calls after that point may differ from the earlier calls (same CLI 2.1.308, same models and flags; the wrapper reports apiKeySource none for all calls). The development gates also had one guard stop, caused by the host editing its own configuration file while the cells were running (hashes back to the baseline), recorded in drive.log. The sealed-z scripts are published with e-mail addresses replaced by their SHA-256 (owner ruling 2026-10-24); this changes only the published form of the evidence, not anything that was run or graded; the published scripts were verified to rebuild the fixtures with the graded HEAD shas and reproduce truth.txt byte for byte. The controller saw the writer's closing summary for sealed z (repositories, pinned commits, hazards) before the protocol was written, but no prompt, criterion or truth script, and the product was already frozen. Public is a development-seen set (ruling R13-1) and is reported with that label; the launch claim rests on sealed z.

## Payer

Every call (runs, grading, F6, F9) went through the owner's Claude Code subscription login; no API key or organization key was used (apiKeySource in the traces: none x403). The dollar figures are the CLI's list-price `total_cost_usd` estimate, not billed to a key. Keys are never written in this folder.

## Versions

Claude Code CLI 2.1.308 (traces: 2.1.308 x403); Claude Agent SDK: not used; models in the traces: claude-haiku-5-5 x48, claude-opus-5-5 x48, claude-sonnet-5-5 x307; run time range UTC 2026-10-24T04:54:15.080Z to 2026-10-24T08:23:07.534Z; Darwin 27.0.0 arm64.
