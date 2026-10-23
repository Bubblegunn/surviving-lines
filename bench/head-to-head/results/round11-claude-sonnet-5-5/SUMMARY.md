# surviving-lines round 11 confirmation (I1 passed in both sets; I2, F6 and F6b failed)

**Result.** On 2026-10-23, with claude-sonnet-5-5 and a model grader (three votes), surviving-lines at 1670228 had the highest total of six arms (itself, project-pilot with and without its command, mcp-git-historian, k41n/busfactor, plain Claude) on 5 held-out e tasks (17.00 of 25 against 12.67 for the best other arm, project-pilot invoked; 95% bootstrap interval for the difference +2.00 to +7.00, above zero, so I1 passes for that set) and on 11 public tasks (45.67 of 51 against 40.33 for the best other arm, plain Claude; interval +3.00 to +7.67, above zero, so I1 passes for that set). Against the better of pp and ppi per task, the held-out e interval is +0.00 to +5.33 and includes zero; the public interval is +0.67 to +5.33. I2 failed in both sets: Rule A passes in both, but Rule B and Rule B' fail (held-out e: HE1, HE3, HE4; public: T1, T1i, E2k, E3, E5), so the preregistered per-task gate failed and no claim of being first on every task is made. Runs and held-out e grading were on the Agent SDK path, public grading, F6 and F9 on the Claude Code CLI path (subscription); the 156 public rival cells (pp, ppi, hist, bf, base) are reused from round 8 (SDK path, 2026-10-22), every other cell is new. F6 (agent re-run, graded alone) FAILED: 74.6% of criteria equal and 19 of 26 comparable cells within one point; 7 cells differ by more than one point, which is a failed audit under the protocol, and 2 cells could not be compared. F6b (registered after F6 failed, separate, does not replace F6): re-grading the original answers gave 92.4% criterion agreement (121 of 131) but one of 28 cells (HE2-base-3, 0 against 2) differs by more than one point, so F6b-1 also FAILS its fixed pass condition; 16 of 26 F6 re-runs lie within the min-max of their three original runs (descriptive). F9 (one run per task) is reported per model in the F9 section. Logged cost of every call of this round at list price: 63.62 USD, of which 12.60 USD on key_2, 0.47 USD on test_key and 50.55 USD on the subscription (list-price estimate, not billed to a key).

## HELD-OUT e (5 tasks, 5 graded)

Mean criteria passed; runs in brackets (run 1/2/3); `R` marks arms whose cells are reused from round 8 (SDK path); `err=n` criteria with fewer than two valid votes after re-asks and the reverse pass (counted as not passed).

| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HE1 | 5 | 4.00 (4/3/5) min 3 max 5 | 4.33 (4/4/5) min 4 max 5 | 3.67 (3/4/4) min 3 max 4 | 2.33 (2/4/1) min 1 max 4 | 2.67 (2/5/1) min 1 max 5 | 3.33 (4/5/1) min 1 max 5 |
| HE2 | 5 | 3.67 (2/5/4) min 2 max 5 | 0.67 (1/0/1) min 0 max 1 | 1.33 (1/1/2) min 1 max 2 | 0.00 (0/0/0) min 0 max 0 | 2.33 (4/2/1) min 1 max 4 | 0.67 (0/2/0) min 0 max 2 |
| HE3 | 5 | 2.00 (2/3/1) min 1 max 3 | 2.67 (5/2/1) min 1 max 5 | 1.67 (3/1/1) min 1 max 3 | 0.33 (1/0/0) min 0 max 1 | 2.00 (2/2/2) min 2 max 2 | 1.67 (0/4/1) min 0 max 4 |
| HE4 | 5 | 4.67 (5/5/4) min 4 max 5 | 4.33 (5/5/3) min 3 max 5 | 5.00 (5/5/5) min 5 max 5 | 4.33 (5/4/4) min 4 max 5 | 4.33 (5/4/4) min 4 max 5 | 4.33 (5/5/3) min 3 max 5 |
| HE5 | 5 | 2.67 (3/3/2) min 2 max 3 | 0.33 (0/0/1) min 0 max 1 | 1.00 (2/0/1) min 0 max 2 | 1.33 (2/1/1) min 1 max 2 | 0.67 (1/1/0) min 0 max 1 | 0.67 (1/0/1) min 0 max 1 |
| Total | 25 | 17.00 | 12.33 | 12.67 | 8.33 | 12.00 | 10.67 |

**Rule A.** Ours lost 8.00 of 25. The rival with the highest total is project-pilot (better of pp and ppi per task) (14.33), lost 10.67; limit 80% = 8.53. PASS.

**Rule B** (rivals as in round 8, pp and ppi as the better of the two per task): FAIL. Tasks failing: HE1 ours 4.00 vs best 4.33; HE3 ours 2.00 vs best 2.67; HE4 ours 4.67 vs best 5.00.

**Rule B'** (every other arm separately; at most one task not strictly above or at the ceiling together, deficit at most 0.34 on that task): FAIL. Tasks not strictly above/at ceiling: HE1 ours 4.00 vs best other 4.33 (deficit 0.33); HE3 ours 2.00 vs best other 2.67 (deficit 0.67); HE4 ours 4.67 vs best other 5.00 (deficit 0.33).

**Bootstrap** (seed 20261023, 10000 resamples over runs, same run draw for every arm of a task; 95% percentile interval; total points, ours minus comparator). Best other arm by observed total: **ppi**.

| Comparator | observed difference | 95% interval | includes zero |
| --- | --- | --- | --- |
| pp | +4.67 | [+1.67, +7.67] | no |
| ppi (best other) | +4.33 | [+2.00, +7.00] | no |
| hist | +8.67 | [+5.67, +11.67] | no |
| bf | +5.00 | [+0.67, +8.67] | no |
| base | +6.33 | [+3.00, +10.00] | no |
| project-pilot best-of | +2.67 | [+0.00, +5.33] | yes |

I1 (HELD-OUT e): lower bound for ours minus ppi = +2.00, so the interval lies entirely above zero. I1 PASS.

**Grader reliability.** 450 criterion verdicts; all three votes equal on 368 (81.8%); 3 criteria decided by the reverse-order second grading; 0 still `err`.

**Cost per arm** (USD, `total_cost_usd` of the run; reused cells are round 8 costs and not part of this round's total):

| Arm | cells | cost | mean per task | input tok | output tok | cache read | cache create | turns | wall s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ours | 15 | 1.26 | 0.25 | 170 | 35531 | 1609583 | 298540 | 87 | 392 |
| pp | 15 | 1.13 | 0.23 | 118 | 32668 | 1350408 | 267564 | 71 | 344 |
| ppi | 15 | 1.20 | 0.24 | 154 | 36685 | 1404232 | 278078 | 88 | 385 |
| hist | 15 | 1.20 | 0.24 | 148 | 31434 | 1319420 | 300638 | 87 | 318 |
| bf | 15 | 1.06 | 0.21 | 132 | 33072 | 1323512 | 240008 | 75 | 353 |
| base | 15 | 1.08 | 0.22 | 112 | 32160 | 1211943 | 252823 | 68 | 340 |

Ours / base cost ratio per cell: 1.17x.

## PUBLIC (11 tasks, 11 graded)

Mean criteria passed; runs in brackets (run 1/2/3); `R` marks arms whose cells are reused from round 8 (SDK path); `err=n` criteria with fewer than two valid votes after re-asks and the reverse pass (counted as not passed).

| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 4 | 3.33 (3/4/3) min 3 max 4 | 3.67 (3/4/4) min 3 max 4 R | 2.00 (2/2/2) min 2 max 2 R | 2.67 (3/3/2) min 2 max 3 R | 4.00 (4/4/4) min 4 max 4 R | 3.67 (3/4/4) min 3 max 4 R |
| T2 | 4 | 4.00 (4/4/4) min 4 max 4 | 2.33 (2/2/3) min 2 max 3 R | 3.33 (3/3/4) min 3 max 4 R | 1.33 (2/1/1) min 1 max 2 R | 2.67 (2/3/3) min 2 max 3 R | 4.00 (4/4/4) min 4 max 4 R |
| T3 | 5 | 5.00 (5/5/5) min 5 max 5 | 4.33 (5/4/4) min 4 max 5 R | - | 4.33 (5/4/4) min 4 max 5 R | 4.33 (5/4/4) min 4 max 5 R | 4.00 (3/5/4) min 3 max 5 R |
| T4 | 5 | 5.00 (5/5/5) min 5 max 5 | 3.00 (3/3/3) min 3 max 3 R | 4.00 (4/3/5) min 3 max 5 R | 2.67 (3/2/3) min 2 max 3 R | 2.33 (3/3/1) min 1 max 3 R | 2.67 (3/2/3) min 2 max 3 R |
| T1i | 4 | 2.67 (4/2/2) min 2 max 4 | 3.00 (3/3/3) min 3 max 3 R | 2.67 (4/2/2) min 2 max 4 R | 3.33 (4/4/2) min 2 max 4 R | 3.67 (3/4/4) min 3 max 4 R | 3.00 (4/3/2) min 2 max 4 R |
| T4i | 5 | 4.33 (5/4/4) min 4 max 5 | 3.00 (3/3/3) min 3 max 3 R | 3.33 (3/3/4) min 3 max 4 R | 2.67 (3/2/3) min 2 max 3 R | 3.33 (3/3/4) min 3 max 4 R | 3.67 (3/5/3) min 3 max 5 R |
| E1 | 5 | 5.00 (5/5/5) min 5 max 5 | 4.00 (4/3/5) min 3 max 5 R | 2.67 (3/2/3) min 2 max 3 R | 3.33 (4/4/2) min 2 max 4 R | 2.00 (2/2/2) min 2 max 2 R | 3.00 (3/3/3) min 3 max 3 R |
| E2k | 5 | 4.33 (4/4/5) min 4 max 5 | 4.00 (4/5/3) min 3 max 5 R | 4.33 (5/4/4) min 4 max 5 R | 4.67 (4/5/5) min 4 max 5 R | 4.00 (4/4/4) min 4 max 4 R | 4.00 (4/4/4) min 4 max 4 R |
| E3 | 4 | 3.00 (3/3/3) min 3 max 3 | 3.00 (3/3/3) min 3 max 3 R | - | 3.00 (3/3/3) min 3 max 3 R | 3.00 (3/3/3) min 3 max 3 R | 3.00 (3/3/3) min 3 max 3 R |
| E4h | 5 | 5.00 (5/5/5) min 5 max 5 | 4.67 (5/5/4) min 4 max 5 R | - | 3.00 (3/3/3) min 3 max 3 R | 5.00 (5/5/5) min 5 max 5 R | 4.33 (5/3/5) min 3 max 5 R |
| E5 | 5 | 4.00 (4/4/4) min 4 max 4 | 4.67 (5/5/4) min 4 max 5 R | 4.33 (3/5/5) min 3 max 5 R | 4.00 (5/2/5) min 2 max 5 R | 5.00 (5/5/5) min 5 max 5 R | 5.00 (5/5/5) min 5 max 5 R |
| Total | 51 | 45.67 | 39.67 | 26.67 | 35.00 | 39.33 | 40.33 |

**Rule A.** Ours lost 5.33 of 51. The rival with the highest total is project-pilot (better of pp and ppi per task) (42.33), lost 8.67; limit 80% = 6.93. PASS.

**Rule B** (rivals as in round 8, pp and ppi as the better of the two per task): FAIL. Tasks failing: T1 ours 3.33 vs best 4.00; T1i ours 2.67 vs best 3.67; E2k ours 4.33 vs best 4.67; E3 ours 3.00 vs best 3.00; E5 ours 4.00 vs best 5.00.

**Rule B'** (every other arm separately; at most one task not strictly above or at the ceiling together, deficit at most 0.34 on that task): FAIL. Tasks not strictly above/at ceiling: T1 ours 3.33 vs best other 4.00 (deficit 0.67); T1i ours 2.67 vs best other 3.67 (deficit 1.00); E2k ours 4.33 vs best other 4.67 (deficit 0.33); E3 ours 3.00 vs best other 3.00 (deficit 0.00); E5 ours 4.00 vs best other 5.00 (deficit 1.00).

**Bootstrap** (seed 20261023, 10000 resamples over runs, same run draw for every arm of a task; 95% percentile interval; total points, ours minus comparator). Best other arm by observed total: **base**.

| Comparator | observed difference | 95% interval | includes zero |
| --- | --- | --- | --- |
| pp | +6.00 | [+3.67, +8.33] | no |
| ppi | +19.00 | [+17.00, +21.00] | no |
| hist | +10.67 | [+8.33, +13.33] | no |
| bf | +6.33 | [+4.00, +8.67] | no |
| base (best other) | +5.33 | [+3.00, +7.67] | no |
| project-pilot best-of | +3.33 | [+0.67, +5.33] | no |

I1 (PUBLIC): lower bound for ours minus base = +3.00, so the interval lies entirely above zero. I1 PASS.

**Grader reliability.** 876 criterion verdicts; all three votes equal on 829 (94.6%); 0 criteria decided by the reverse-order second grading; 0 still `err`.

**Cost per arm** (USD, `total_cost_usd` of the run; reused cells are round 8 costs and not part of this round's total):

| Arm | cells | cost | mean per task | input tok | output tok | cache read | cache create | turns | wall s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ours | 33 | 2.58 | 0.23 | 364 | 64405 | 3397102 | 639018 | 188 | 727 |
| pp (R) | 33 | 2.10 | 0.19 | 230 | 55662 | 2256585 | 528841 | 138 | 595 |
| ppi (R) | 24 | 1.81 | 0.23 | 258 | 57134 | 2342867 | 403542 | 145 | 591 |
| hist (R) | 33 | 2.29 | 0.21 | 300 | 57033 | 2673311 | 579846 | 175 | 590 |
| bf (R) | 33 | 2.13 | 0.19 | 290 | 62057 | 2709157 | 494038 | 166 | 668 |
| base (R) | 33 | 1.85 | 0.17 | 222 | 48831 | 2184714 | 456132 | 136 | 587 |

Ours / base cost ratio per cell: 1.40x.

## Round cost (USD, from the shim ledger rows of this round; every call)

| Category | calls | USD |
| --- | --- | --- |
| f6-grade [subscription] | 126 | 7.4836 |
| f6-runs [subscription] | 28 | 2.6665 |
| f6b-grade [subscription] | 64 | 7.6092 |
| f9-claude-haiku-5-5-grade [subscription] | 53 | 4.9033 |
| f9-claude-haiku-5-5-runs [subscription] | 48 | 0.3336 |
| f9-claude-opus-5-5-grade [subscription] | 52 | 5.0812 |
| f9-claude-opus-5-5-runs [subscription] | 48 | 11.3924 |
| grade-out-E [key_2] | 43 | 3.0878 |
| grade-out-E [test_key] | 6 | 0.4661 |
| grade-out-P [subscription] | 105 | 11.0810 |
| runs-out-E [key_2] | 90 | 6.9332 |
| runs-out-P [key_2] | 33 | 2.5820 |
| sum of rows above | | 63.62 |

## F6 independent audit

28 cells drawn with `random.Random(20261023)` from the 279 graded cells of this round (cells named `<task>-<arm>-<n>`, sorted; ceil(0.10 x N)); each run again by a fresh agent session on a new fixture copy with the same arm and prompt, and graded alone (one answer, three calls, subscription CLI path). A cell in which any criterion stayed `err` is listed but not compared.

| Cell | set | original cell | criteria | original score | re-run score | criteria equal | err criteria (either grading) | within one point |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HE3-ours-1 | heldout-e | new | 5 | 2 | 2 | 3 | 0 | yes |
| HE3-ppi-1 | heldout-e | new | 5 | 3 | 1 | 3 | 0 | NO |
| HE2-base-2 | heldout-e | new | 5 | 2 | 0 | 3 | 0 | NO |
| T4i-pp-1 | public | reused | 5 | 3 | 3 | 5 | 0 | yes |
| T1-hist-1 | public | reused | 4 | 3 | 3 | 2 | 0 | yes |
| HE3-bf-1 | heldout-e | new | 5 | 2 | 1 | 2 | 0 | yes |
| T1-pp-2 | public | reused | 4 | 4 | 2 | 2 | 0 | NO |
| E1-ours-3 | public | new | 5 | 5 | 4 | 4 | 0 | yes |
| T1i-ppi-2 | public | reused | 4 | 2 | 0 | 0 | 4 | not gradable (err) |
| E3-bf-1 | public | reused | 4 | 3 | 3 | 4 | 0 | yes |
| T1i-pp-1 | public | reused | 4 | 3 | 4 | 3 | 0 | yes |
| HE2-base-3 | heldout-e | new | 5 | 0 | 0 | 5 | 0 | yes |
| HE5-bf-1 | heldout-e | new | 5 | 1 | 2 | 4 | 0 | yes |
| T1-bf-1 | public | reused | 4 | 4 | 4 | 4 | 0 | yes |
| HE4-pp-2 | heldout-e | new | 5 | 5 | 5 | 5 | 0 | yes |
| HE3-pp-1 | heldout-e | new | 5 | 5 | 1 | 1 | 0 | NO |
| T1-hist-2 | public | reused | 4 | 3 | 3 | 2 | 0 | yes |
| E2k-bf-2 | public | reused | 5 | 4 | 4 | 5 | 0 | yes |
| T1i-pp-3 | public | reused | 4 | 3 | 4 | 3 | 0 | yes |
| E1-ours-2 | public | new | 5 | 5 | 5 | 5 | 0 | yes |
| E5-hist-2 | public | reused | 5 | 2 | 0 | 0 | 5 | not gradable (err) |
| T3-bf-3 | public | reused | 5 | 4 | 2 | 3 | 0 | NO |
| T1i-base-1 | public | reused | 4 | 4 | 3 | 3 | 0 | yes |
| E5-ours-1 | public | new | 5 | 4 | 3 | 4 | 0 | yes |
| HE4-ours-3 | heldout-e | new | 5 | 4 | 4 | 5 | 0 | yes |
| E2k-ours-1 | public | new | 5 | 4 | 2 | 3 | 0 | NO |
| HE4-hist-2 | heldout-e | new | 5 | 4 | 4 | 5 | 0 | yes |
| HE2-pp-2 | heldout-e | new | 5 | 0 | 2 | 3 | 0 | NO |

Cells with no `err` criterion: 26 of 28. On these, criteria on which the independent verdict equals the original verdict: 91 of 122 (74.6%). Cells within one point: 19 of 26 (73.1%). Cells that differ by more than one point (a failed audit under the protocol): HE3-ppi-1, HE2-base-2, T1-pp-2, HE3-pp-1, T3-bf-3, E2k-ours-1, HE2-pp-2. Cells where a grading stayed `err` after the re-asks (the grader gave several answer blocks that did not parse; they are not compared and not counted as agreement): T1i-ppi-2, E5-hist-2.

The F6 re-run is a new model run of the same cell, so a difference mixes agent variance and grader variance; it is not a pure grader audit.

## F6b grader reproducibility audit (registered after F6 failed, before any F6b call)

F6b-1: the same 28 sampled cells, the original answers (no agent re-run), graded again in the original grading unit (all arms of the task and run together, same shuffled order) by fresh grader sessions, three calls, majority rule, re-ask passes, subscription CLI path. A criterion that stayed `err` in either grading counts as a disagreement and as not passed in the cell score. Pass condition fixed in advance: no cell differs by more than one point and criterion agreement is at least 90%.

| Cell | criteria | original score | regrade score | criteria equal | err (regrade) | within one point |
| --- | --- | --- | --- | --- | --- | --- |
| HE3-ours-1 | 5 | 2 | 2 | 5 | 0 | yes |
| HE3-ppi-1 | 5 | 3 | 4 | 4 | 0 | yes |
| HE2-base-2 | 5 | 2 | 1 | 4 | 0 | yes |
| T4i-pp-1 | 5 | 3 | 3 | 5 | 0 | yes |
| T1-hist-1 | 4 | 3 | 4 | 3 | 0 | yes |
| HE3-bf-1 | 5 | 2 | 1 | 4 | 0 | yes |
| T1-pp-2 | 4 | 4 | 4 | 4 | 0 | yes |
| E1-ours-3 | 5 | 5 | 5 | 5 | 0 | yes |
| T1i-ppi-2 | 4 | 2 | 2 | 4 | 0 | yes |
| E3-bf-1 | 4 | 3 | 3 | 4 | 0 | yes |
| T1i-pp-1 | 4 | 3 | 3 | 4 | 0 | yes |
| HE2-base-3 | 5 | 0 | 2 | 3 | 0 | NO |
| HE5-bf-1 | 5 | 1 | 1 | 5 | 0 | yes |
| T1-bf-1 | 4 | 4 | 4 | 4 | 0 | yes |
| HE4-pp-2 | 5 | 5 | 5 | 5 | 0 | yes |
| HE3-pp-1 | 5 | 5 | 5 | 5 | 0 | yes |
| T1-hist-2 | 4 | 3 | 2 | 3 | 0 | yes |
| E2k-bf-2 | 5 | 4 | 4 | 5 | 0 | yes |
| T1i-pp-3 | 4 | 3 | 4 | 3 | 0 | yes |
| E1-ours-2 | 5 | 5 | 5 | 5 | 0 | yes |
| E5-hist-2 | 5 | 2 | 2 | 5 | 0 | yes |
| T3-bf-3 | 5 | 4 | 3 | 4 | 0 | yes |
| T1i-base-1 | 4 | 4 | 4 | 4 | 0 | yes |
| E5-ours-1 | 5 | 4 | 4 | 5 | 0 | yes |
| HE4-ours-3 | 5 | 4 | 5 | 4 | 0 | yes |
| E2k-ours-1 | 5 | 4 | 4 | 5 | 0 | yes |
| HE4-hist-2 | 5 | 4 | 4 | 5 | 0 | yes |
| HE2-pp-2 | 5 | 0 | 0 | 5 | 0 | yes |

Criteria equal to the original verdict: 121 of 131 (92.4%). Cells differing by more than one point: HE2-base-3. **F6b-1 FAIL** (pass condition: no such cell and at least 90% agreement).

F6b-2 (descriptive, no new calls, no pass condition): for each of the 26 comparable F6 re-runs, whether the re-run score lies within the minimum and maximum of that cell's three original runs (reused rival cells: their three round 8 runs).

| Cell | re-run score | original three runs | within min-max |
| --- | --- | --- | --- |
| HE3-ours-1 | 2 | 2/3/1 | yes |
| HE3-ppi-1 | 1 | 3/1/1 | yes |
| HE2-base-2 | 0 | 0/2/0 | yes |
| T4i-pp-1 | 3 | 3/3/3 | yes |
| T1-hist-1 | 3 | 3/3/2 | yes |
| HE3-bf-1 | 1 | 2/2/2 | no |
| T1-pp-2 | 2 | 3/4/4 | no |
| E1-ours-3 | 4 | 5/5/5 | no |
| E3-bf-1 | 3 | 3/3/3 | yes |
| T1i-pp-1 | 4 | 3/3/3 | no |
| HE2-base-3 | 0 | 0/2/0 | yes |
| HE5-bf-1 | 2 | 1/1/0 | no |
| T1-bf-1 | 4 | 4/4/4 | yes |
| HE4-pp-2 | 5 | 5/5/3 | yes |
| HE3-pp-1 | 1 | 5/2/1 | yes |
| T1-hist-2 | 3 | 3/3/2 | yes |
| E2k-bf-2 | 4 | 4/4/4 | yes |
| T1i-pp-3 | 4 | 3/3/3 | no |
| E1-ours-2 | 5 | 5/5/5 | yes |
| T3-bf-3 | 2 | 5/4/4 | no |
| T1i-base-1 | 3 | 4/3/2 | yes |
| E5-ours-1 | 3 | 4/4/4 | no |
| HE4-ours-3 | 4 | 5/5/4 | yes |
| E2k-ours-1 | 2 | 4/4/5 | no |
| HE4-hist-2 | 4 | 5/4/4 | yes |
| HE2-pp-2 | 2 | 1/0/1 | no |

Within the range of the three original runs: 16 of 26.

## F9 other models

One run per task (run 1), arms ours, base and the best rival of the task (highest Sonnet mean of this round in that set; ties pp, ppi, hist, bf), both sets, graded per task by the same method. Score = criteria passed. No bootstrap and no claim of being first: one run per task. Rule B per model: ours strictly above base and the best rival on every task, or at the ceiling together with them.

### claude-haiku-5-5

**HELD-OUT e**

| Task | max | ours | base | best rival (name) | Rule B |
| --- | --- | --- | --- | --- | --- |
| HE1 | 5 | 5 | 2 | 2 (pp) | ok |
| HE2 | 5 | 3 | 0 | 0 (bf) | ok |
| HE3 | 5 | 3 | 0 | 1 (pp) | ok |
| HE4 | 5 | 4 | 4 | 4 (ppi) | NO |
| HE5 | 5 | 1 | 1 | 0 (hist) | NO |
| Total | 25 | 16 | 7 | 7 | Rule B FAIL on HE4, HE5 |

**PUBLIC**

| Task | max | ours | base | best rival (name) | Rule B |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | 1 | 1 | 1 (bf) | NO |
| T2 | 4 | 4 | 3 | 3 (ppi) | ok |
| T3 | 5 | 5 | 4 | 3 (pp) | ok |
| T4 | 5 | 5 | 1 | 2 (ppi) | ok |
| T1i | 4 | 2 | 3 | 1 (bf) | NO |
| T4i | 5 | 5 | 2 | 3 (ppi) | ok |
| E1 | 5 | 4 | 4 | 3 (pp) | NO |
| E2k | 5 | 3 | 4 | 4 (hist) | NO |
| E3 | 4 | 3 | 2 | 2 (pp) | ok |
| E4h | 5 | 5 | 4 | 5 (bf) | ok |
| E5 | 5 | 4 | 3 | 2 (bf) | ok |
| Total | 51 | 41 | 31 | 29 | Rule B FAIL on T1, T1i, E1, E2k |


### claude-opus-5-5

**HELD-OUT e**

| Task | max | ours | base | best rival (name) | Rule B |
| --- | --- | --- | --- | --- | --- |
| HE1 | 5 | 5 | 4 | 4 (pp) | ok |
| HE2 | 5 | 5 | 5 | 0 (bf) | ok |
| HE3 | 5 | 3 | 5 | 4 (pp) | NO |
| HE4 | 5 | 4 | 5 | 5 (ppi) | NO |
| HE5 | 5 | 3 | 0 | 0 (hist) | ok |
| Total | 25 | 20 | 19 | 13 | Rule B FAIL on HE3, HE4 |

**PUBLIC**

| Task | max | ours | base | best rival (name) | Rule B |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | 3 | 4 | 3 (bf) | NO |
| T2 | 4 | 4 | 2 | 4 (ppi) | ok |
| T3 | 5 | 5 | 5 | 5 (pp) | ok |
| T4 | 5 | 5 | 1 | 5 (ppi) | ok |
| T1i | 4 | 4 | 3 | 4 (bf) | ok |
| T4i | 5 | 5 | 3 | 4 (ppi) | ok |
| E1 | 5 | 5 | 3 | 4 (pp) | ok |
| E2k | 5 | 5 | 4 | 4 (hist) | ok |
| E3 | 4 | 3 | 3 | 2 (pp) | NO |
| E4h | 5 | 5 | 4 | 4 (bf) | ok |
| E5 | 5 | 5 | 5 | 5 (bf) | ok |
| Total | 51 | 49 | 37 | 44 | Rule B FAIL on T1, E3 |


## Grader reliability note

Held-out e: three votes equal on 81.8% of criteria; public: 94.6%. The public rate is higher partly because the public criteria are older and more mechanical. F6 agreement is in the F6 section.

## Departures

- Run path: the held-out e runs and grading and the public ours runs went through the Agent SDK shim; after both API keys' limits were set to 0 on the owner's decision at about 04:20, public grading and F6 went through the owner's Claude Code subscription (departure commit 3f5ef57), and F9 followed on the same path (decision commit 5ae4965). Public grading is therefore on a different path from held-out e grading; within one grading cell every arm is graded by the same calls.
- Key switch: the last six grading calls of held-out e went through the second key (test_key) after the first (key_2) reached its limit, as the protocol describes.
- Reuse: the 156 public rival cells (pp, ppi, hist, bf, base; 3 runs per task, ppi on 8 tasks) are copied from round 8 and ran on 2026-10-22; their run costs are round 8 costs. The frozen protocol states this reuse in advance; it departs from the owner's rule of no reused cell in the final gate.
- Held-out e slip (disclosed in the protocol): the controller saw the first 600 characters of the writer's README and the first eight lines of one build script after the product was frozen. The writer's own prompt is not in this folder.
- Parse failures: one held-out e cell stayed unparsed after the re-asks and was graded again with gate-regrade-reverse.py (3 criteria decided by the reverse pass). No public cell needed it. A reply that failed to parse was overwritten by its re-ask; only the logs are kept. Two F6 re-grading cells (T1i-ppi-2, E5-hist-2) stayed unparsed after four passes because the grader returned several answer blocks; they are listed and not compared. The reverse pass is the same answer in the same order for a single-answer cell, so it was not run for F6.
- Rate limits, killed cells and harness bugs: none occurred in the new cells of this round. Every F6 and F9 run finished with a result line and no `run.failed` file exists in the round folders; the F9 driver ran each cell list twice (the second pass only fills cells without a final answer), and no cell was dropped.
- Isolation of the subscription wrapper: the wrapper forces an isolated HOME, so the F6 and F9 sessions report only built-in skills and plugins; the held-out e and public ours runs on the SDK path used the real HOME with --setting-sources project. The guard (hooks and mcpServers hashes) ran around every rival run and F6/F9 rival cells and never changed. Vaara was not run.
- F6 is a new model run graded alone, so its disagreement mixes agent variance and grader variance. Its sample contains 13 public rival cells from round 8, whose original verdicts come from the round 8 run (graded on the subscription path in this round, rival answers from the SDK path).
- F9 uses the grader claude-sonnet-5-5 for every model, one run per task, no bootstrap. The dollar gates of the F9 paragraph did not apply on the subscription.
- Not in the dollar table: the one billing check call of 0.0034 USD at the start of the round, the controller sessions, and the cost of earlier rounds (round 9 writer, round 10 implementation); they are logged in their own folders.
- F6b was registered (commit b40c3e4) after F6 failed and before any F6b call, as a separate audit; F6 stays reported as failed and is not re-scored. F6b-1 regraded 20 grading units (the 28 sampled cells with the other arms of their task and run) on the subscription path; the regrade of each unit is in f6b/<unit>/grade. No I1 or I2 recomputation with the F6 cells was done.

## Payer

Held-out e runs (90) and public ours runs (33): API organization key named key_2, Agent SDK path. Held-out e grading: key_2 (43 calls) and test_key (6 calls). Public grading (105 calls), F6 (154 calls), F6b-1 (64 calls), F9 (201 calls): the owner's Claude Code subscription; the dollar figures shown for them are the CLI's list-price estimate, not billed to a key. Keys are never written in this folder.

## Versions

Claude Code CLI 2.1.308; Claude Agent SDK 0.2.172; models claude-sonnet-5-5 (all cells and every grader call), claude-haiku-5-5 and claude-opus-5-5 (F9 runs only); run date 2026-10-23, 01:01 UTC to about 07:20 UTC; macOS Darwin 27.0.0 arm64.
