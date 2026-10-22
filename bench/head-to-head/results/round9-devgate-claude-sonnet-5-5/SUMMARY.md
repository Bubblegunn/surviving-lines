# surviving-lines round 9 development gate (failed after three iterations, no scored round)

**Result.** On 2026-10-22 (UTC), on the Claude Agent SDK path with claude-sonnet-5-5, surviving-lines alone (3 runs per task, model grader, ours alone in each grader prompt) was run in three iterations of the round 9 development gate (BEST-RIVAL-SPEC step 6) on two already-seen sets, D (D1 to D5) and C (C1 to C5), and compared with the best other arm's published score per task from rounds 8 and 7. The gate failed in every iteration: set D had 4, 2 and 2 of 5 tasks strictly above the best published rival or at the ceiling together with it (totals 19.00, 16.33, 15.33 of 25 against 13.33), set C had 1, 5 and 5 of 5 (totals 12.33, 24.33, 23.33 of 25 against 12.33). No scored round was run, held-out set e was written but never opened or run, and the limit of three iterations is used up. These numbers do not enter any score table, and nothing here claims that surviving-lines is first.

Rulings frozen in commit `53cc762` (see `PROTOCOL.md`). Date: 2026-10-22 UTC (2026-10-23 in the UTC+03:00 time zone of the commits).

**Scope and limits.**

- This folder documents the development gate only. It is not a scored round: no held-out set was measured, no rival arm was run, Rule A, Rule B and Rule B' were not applied, F9 and F6 were not run.
- Sets C and D were already used in scored rounds 7 and 8 and the product changes of round 9 (rulings R9-1 to R9-14) were driven by their failed criteria. They are development data, so any total here is optimistic as a measure of new work; that is why the owner's rule keeps them out of the score tables.
- Rival numbers are the published numbers of earlier rounds (set D: round 8, set C: round 7), same SDK path and grader model, each task graded with all six arms together. Ours here was graded alone (label A only), same prompt format and grader model, other days. The comparison is indicative, not a controlled head-to-head.
- The best rival per task is the other arm with the highest published mean (taken from the published run scores in `rivals.json`; first listed on a tie). It can be a different arm on each task.
- The rule per task: ours strictly above that rival, or ours and the rival both at the ceiling (5 of 5). A tie below the ceiling fails.
- Criteria with fewer than two valid grader votes (err) count as 0 points in the mean, as in `score.py` of rounds 7 and 8. The column `mean of valid runs` and the sentence under each table show what the verdict would be without the runs that have an err criterion.
- The truth of set D counts all lines of a file, the truth of set C counts non-blank lines (see `PROTOCOL.md`, iteration 2 diagnosis). Iterations 1 changed the tool to ignore blank lines (R9-8), iteration 2 made it print both counts (R9-13).
- Bootstrap intervals resample ours' three runs and the best rival's three published runs per task; the rival arm per task is fixed from the published means, so the interval does not include the uncertainty of choosing that arm.

## Iteration 1: product `09e09d9`

Ours run x3 on D and C after the first round 9 rulings (R9-1, R9-3 to R9-7). Frozen diagnosis and rulings R9-8 to R9-12 for iteration 2 are in `PROTOCOL.md`.

### Set D (D1 to D5, seen in round 8; development set), iteration 1

Criteria passed per task (ours, 3 runs). `err`: criteria with fewer than two valid votes, counted as 0 points. `valid runs`: runs with no err criterion. `rival`: best other arm published for this task in `results/round8-claude-sonnet-5-5/SUMMARY.md` (rivals.json; earlier round, same SDK path, not graded together with these runs).

| Task | Criteria | ours mean | min | max | runs | err | valid runs | rival (arm) | verdict | mean of valid runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | 5 | 5.00 | 5 | 5 | 5/5/5 | 0 | 3 | 3.67 (ppi) | above | 5.00 |
| D2 | 5 | 4.33 | 3 | 5 | 5/5/3 | 0 | 3 | 4.33 (ppi) | tie below ceiling | 4.33 |
| D3 | 5 | 2.00 | 1 | 3 | 1/3/2 | 0 | 3 | 0.33 (ppi) | above | 2.00 |
| D4 | 5 | 4.00 | 4 | 4 | 4/4/4 | 0 | 3 | 2.00 (base) | above | 4.00 |
| D5 | 5 | 3.67 | 3 | 4 | 3/4/4 | 0 | 3 | 3.00 (pp) | above | 3.67 |
| Total | 25 | 19.00 | | | | | | 13.33 | 4 of 5 tasks pass | |

Development gate rule (ours strictly above the best published rival on every task, or at the ceiling together with it): **fails** (4 of 5 tasks). Counting only runs with no err criterion the count would be 4 of 5; this does not change the set verdict: same.

95% bootstrap interval (10000 resamples over runs, seed 9): ours total 17.33 to 20.33 (point 19.00); best published rival total 12.33 to 14.33 (point 13.33); ours minus rival 4.00 to 7.33 (point 5.67); the interval for the difference is entirely above zero.

### Set C (C1 to C5, seen in round 7; development set), iteration 1

Criteria passed per task (ours, 3 runs). `err`: criteria with fewer than two valid votes, counted as 0 points. `valid runs`: runs with no err criterion. `rival`: best other arm published for this task in `results/round7-claude-sonnet-5-5/SUMMARY.md` (rivals.json; earlier round, same SDK path, not graded together with these runs).

| Task | Criteria | ours mean | min | max | runs | err | valid runs | rival (arm) | verdict | mean of valid runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | 5 | 2.67 | 0 | 4 | 4/0/4 | 5 | 2 | 3.00 (base) | below | 4.00 |
| C2 | 5 | 2.00 | 2 | 2 | 2/2/2 | 2 | 2 | 3.67 (bf) | below | 2.00 |
| C3 | 5 | 3.00 | 0 | 5 | 0/5/4 | 6 | 1 | 0.67 (pp) | above | 5.00 |
| C4 | 5 | 2.67 | 2 | 3 | 3/2/3 | 0 | 3 | 3.00 (pp) | below | 2.67 |
| C5 | 5 | 2.00 | 2 | 2 | 2/2/2 | 0 | 3 | 2.00 (pp) | tie below ceiling | 2.00 |
| Total | 25 | 12.33 | | | | | | 12.33 | 1 of 5 tasks pass | |

Development gate rule (ours strictly above the best published rival on every task, or at the ceiling together with it): **fails** (1 of 5 tasks). Counting only runs with no err criterion the count would be 2 of 5; this does not change the set verdict: same.

95% bootstrap interval (10000 resamples over runs, seed 9): ours total 9.00 to 15.33 (point 12.33); best published rival total 10.67 to 14.33 (point 12.33); ours minus rival -3.67 to 3.67 (point 0.00); the interval for the difference includes zero.

### Cost per cell, iteration 1 (USD of `total_cost_usd`, runs 1/2/3; turns; wall seconds)

| Task | cost | turns | wall s |
| --- | --- | --- | --- |
| D1 | 0.0869/0.0763/0.0860 | 6/5/6 | 33/25/34 |
| D2 | 0.1169/0.0969/0.0902 | 8/6/6 | 46/33/38 |
| D3 | 0.0757/0.0759/0.0853 | 6/5/6 | 26/24/35 |
| D4 | 0.0734/0.0761/0.0746 | 6/6/6 | 23/24/24 |
| D5 | 0.0687/0.0705/0.0669 | 5/5/5 | 21/21/18 |
| C1 | 0.0928/0.0933/0.0873 | 6/6/6 | 35/38/47 |
| C2 | 0.0898/0.0751/0.0702 | 8/6/5 | 35/25/33 |
| C3 | 0.0651/0.0720/0.0845 | 5/6/7 | 23/15/38 |
| C4 | 0.0744/0.0737/0.0771 | 6/5/5 | 15/29/36 |
| C5 | 0.0910/0.0946/0.0892 | 7/7/6 | 37/41/43 |

## Iteration 2: product `c689450`

Ours run x3 on D and C after R9-8 to R9-12 (blank lines not counted, hosted automation bots, placeholder identities, codemod commits set aside, package-scope skill rule). Frozen diagnosis and rulings R9-13, R9-14 are in `PROTOCOL.md`.

### Set D (D1 to D5, seen in round 8; development set), iteration 2

Criteria passed per task (ours, 3 runs). `err`: criteria with fewer than two valid votes, counted as 0 points. `valid runs`: runs with no err criterion. `rival`: best other arm published for this task in `results/round8-claude-sonnet-5-5/SUMMARY.md` (rivals.json; earlier round, same SDK path, not graded together with these runs).

| Task | Criteria | ours mean | min | max | runs | err | valid runs | rival (arm) | verdict | mean of valid runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | 5 | 3.67 | 2 | 5 | 4/5/2 | 2 | 2 | 3.67 (ppi) | tie below ceiling | 4.50 |
| D2 | 5 | 4.33 | 3 | 5 | 5/3/5 | 0 | 3 | 4.33 (ppi) | tie below ceiling | 4.33 |
| D3 | 5 | 2.00 | 2 | 2 | 2/2/2 | 0 | 3 | 0.33 (ppi) | above | 2.00 |
| D4 | 5 | 2.00 | 2 | 2 | 2/2/2 | 0 | 3 | 2.00 (base) | tie below ceiling | 2.00 |
| D5 | 5 | 4.33 | 3 | 5 | 5/3/5 | 2 | 2 | 3.00 (pp) | above | 5.00 |
| Total | 25 | 16.33 | | | | | | 13.33 | 2 of 5 tasks pass | |

Development gate rule (ours strictly above the best published rival on every task, or at the ceiling together with it): **fails** (2 of 5 tasks). Counting only runs with no err criterion the count would be 3 of 5; this does not change the set verdict: same.

95% bootstrap interval (10000 resamples over runs, seed 9): ours total 14.00 to 18.33 (point 16.33); best published rival total 12.33 to 14.33 (point 13.33); ours minus rival 0.67 to 5.00 (point 3.00); the interval for the difference is entirely above zero.

### Set C (C1 to C5, seen in round 7; development set), iteration 2

Criteria passed per task (ours, 3 runs). `err`: criteria with fewer than two valid votes, counted as 0 points. `valid runs`: runs with no err criterion. `rival`: best other arm published for this task in `results/round7-claude-sonnet-5-5/SUMMARY.md` (rivals.json; earlier round, same SDK path, not graded together with these runs).

| Task | Criteria | ours mean | min | max | runs | err | valid runs | rival (arm) | verdict | mean of valid runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | 5 | 5.00 | 5 | 5 | 5/5/5 | 0 | 3 | 3.00 (base) | above | 5.00 |
| C2 | 5 | 5.00 | 5 | 5 | 5/5/5 | 0 | 3 | 3.67 (bf) | above | 5.00 |
| C3 | 5 | 4.67 | 4 | 5 | 4/5/5 | 0 | 3 | 0.67 (pp) | above | 4.67 |
| C4 | 5 | 4.67 | 4 | 5 | 4/5/5 | 0 | 3 | 3.00 (pp) | above | 4.67 |
| C5 | 5 | 5.00 | 5 | 5 | 5/5/5 | 0 | 3 | 2.00 (pp) | above | 5.00 |
| Total | 25 | 24.33 | | | | | | 12.33 | 5 of 5 tasks pass | |

Development gate rule (ours strictly above the best published rival on every task, or at the ceiling together with it): **passes** (5 of 5 tasks). Counting only runs with no err criterion the count would be 5 of 5; this does not change the set verdict: same.

95% bootstrap interval (10000 resamples over runs, seed 9): ours total 23.67 to 25.00 (point 24.33); best published rival total 10.67 to 14.00 (point 12.33); ours minus rival 10.00 to 13.67 (point 12.00); the interval for the difference is entirely above zero.

### Cost per cell, iteration 2 (USD of `total_cost_usd`, runs 1/2/3; turns; wall seconds)

| Task | cost | turns | wall s |
| --- | --- | --- | --- |
| D1 | 0.0792/0.0854/0.0788 | 6/6/6 | 36/44/29 |
| D2 | 0.0824/0.0859/0.0853 | 5/6/6 | 48/50/37 |
| D3 | 0.0769/0.0795/0.0800 | 5/5/6 | 38/39/27 |
| D4 | 0.0812/0.0808/0.0811 | 6/6/6 | 46/40/39 |
| D5 | 0.0723/0.0708/0.0741 | 6/6/6 | 39/33/32 |
| C1 | 0.0806/0.0735/0.0848 | 6/5/6 | 37/25/31 |
| C2 | 0.0876/0.0856/0.0851 | 6/6/6 | 27/29/31 |
| C3 | 0.0738/0.0693/0.0909 | 5/5/8 | 23/19/24 |
| C4 | 0.0760/0.0638/0.0725 | 5/4/5 | 28/17/28 |
| C5 | 0.0845/0.0780/0.1001 | 6/5/8 | 30/25/53 |

## Iteration 3: product `7c78c82`

Ours run x3 on D and C after R9-13 (header states the size with and without blank lines), R9-14 (merged row shows the personal name before a handle) and the R9-11 flag fix (7c78c82). This was the third and last allowed iteration; no diagnosis was written after it.

### Set D (D1 to D5, seen in round 8; development set), iteration 3

Criteria passed per task (ours, 3 runs). `err`: criteria with fewer than two valid votes, counted as 0 points. `valid runs`: runs with no err criterion. `rival`: best other arm published for this task in `results/round8-claude-sonnet-5-5/SUMMARY.md` (rivals.json; earlier round, same SDK path, not graded together with these runs).

| Task | Criteria | ours mean | min | max | runs | err | valid runs | rival (arm) | verdict | mean of valid runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | 5 | 4.33 | 4 | 5 | 4/4/5 | 0 | 3 | 3.67 (ppi) | above | 4.33 |
| D2 | 5 | 4.33 | 4 | 5 | 5/4/4 | 0 | 3 | 4.33 (ppi) | tie below ceiling | 4.33 |
| D3 | 5 | 1.67 | 1 | 3 | 1/3/1 | 0 | 3 | 0.33 (ppi) | above | 1.67 |
| D4 | 5 | 2.00 | 2 | 2 | 2/2/2 | 0 | 3 | 2.00 (base) | tie below ceiling | 2.00 |
| D5 | 5 | 3.00 | 0 | 5 | 5/4/0 | 5 | 2 | 3.00 (pp) | tie below ceiling | 4.50 |
| Total | 25 | 15.33 | | | | | | 13.33 | 2 of 5 tasks pass | |

Development gate rule (ours strictly above the best published rival on every task, or at the ceiling together with it): **fails** (2 of 5 tasks). Counting only runs with no err criterion the count would be 3 of 5; this does not change the set verdict: same.

95% bootstrap interval (10000 resamples over runs, seed 9): ours total 12.33 to 18.00 (point 15.33); best published rival total 12.33 to 14.33 (point 13.33); ours minus rival -1.00 to 4.67 (point 2.00); the interval for the difference includes zero.

### Set C (C1 to C5, seen in round 7; development set), iteration 3

Criteria passed per task (ours, 3 runs). `err`: criteria with fewer than two valid votes, counted as 0 points. `valid runs`: runs with no err criterion. `rival`: best other arm published for this task in `results/round7-claude-sonnet-5-5/SUMMARY.md` (rivals.json; earlier round, same SDK path, not graded together with these runs).

| Task | Criteria | ours mean | min | max | runs | err | valid runs | rival (arm) | verdict | mean of valid runs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | 5 | 5.00 | 5 | 5 | 5/5/5 | 0 | 3 | 3.00 (base) | above | 5.00 |
| C2 | 5 | 4.67 | 4 | 5 | 5/4/5 | 0 | 3 | 3.67 (bf) | above | 4.67 |
| C3 | 5 | 5.00 | 5 | 5 | 5/5/5 | 0 | 3 | 0.67 (pp) | above | 5.00 |
| C4 | 5 | 4.33 | 4 | 5 | 4/4/5 | 0 | 3 | 3.00 (pp) | above | 4.33 |
| C5 | 5 | 4.33 | 4 | 5 | 5/4/4 | 0 | 3 | 2.00 (pp) | above | 4.33 |
| Total | 25 | 23.33 | | | | | | 12.33 | 5 of 5 tasks pass | |

Development gate rule (ours strictly above the best published rival on every task, or at the ceiling together with it): **passes** (5 of 5 tasks). Counting only runs with no err criterion the count would be 5 of 5; this does not change the set verdict: same.

95% bootstrap interval (10000 resamples over runs, seed 9): ours total 22.33 to 24.33 (point 23.33); best published rival total 10.67 to 14.00 (point 12.33); ours minus rival 9.00 to 13.00 (point 11.00); the interval for the difference is entirely above zero.

### Cost per cell, iteration 3 (USD of `total_cost_usd`, runs 1/2/3; turns; wall seconds)

| Task | cost | turns | wall s |
| --- | --- | --- | --- |
| D1 | 0.0822/0.0858/0.0890 | 6/6/6 | 45/44/39 |
| D2 | 0.0856/0.0961/0.0957 | 5/6/6 | 49/52/66 |
| D3 | 0.0765/0.0811/0.0844 | 5/6/5 | 41/40/39 |
| D4 | 0.0811/0.0801/0.0800 | 6/6/6 | 38/42/41 |
| D5 | 0.0687/0.0707/0.0723 | 5/6/6 | 28/33/36 |
| C1 | 0.0803/0.0831/0.0841 | 6/6/6 | 45/29/29 |
| C2 | 0.0836/0.0732/0.0863 | 7/5/6 | 35/22/27 |
| C3 | 0.0712/0.0772/0.0713 | 5/6/5 | 31/20/20 |
| C4 | 0.0893/0.0650/0.0746 | 6/4/5 | 31/22/23 |
| C5 | 0.1062/0.0954/0.0861 | 7/8/6 | 45/37/28 |

## Development gate across iterations

Ours total of 25 per set (mean of 3 runs per task) against the sum of the best published rival means; `ours - rival` with its 95% bootstrap interval. These numbers do not enter any score table.

| Iteration | Set | ours | best published rival | ours - rival (95% interval) | tasks passing the rule | set verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | D | 19.00 of 25 | 13.33 | 5.67 (4.00 to 7.33) | 4 of 5 | fail |
| 1 | C | 12.33 of 25 | 12.33 | 0.00 (-3.67 to 3.67) | 1 of 5 | fail |
| 2 | D | 16.33 of 25 | 13.33 | 3.00 (0.67 to 5.00) | 2 of 5 | fail |
| 2 | C | 24.33 of 25 | 12.33 | 12.00 (10.00 to 13.67) | 5 of 5 | pass |
| 3 | D | 15.33 of 25 | 13.33 | 2.00 (-1.00 to 4.67) | 2 of 5 | fail |
| 3 | C | 23.33 of 25 | 12.33 | 11.00 (9.00 to 13.00) | 5 of 5 | pass |

| Iteration | both sets pass the rule | outcome |
| --- | --- | --- |
| 1 | no | gate failed, no held-out measurement allowed |
| 2 | no | gate failed, no held-out measurement allowed |
| 3 | no | gate failed, no held-out measurement allowed |

Development gate outcome: **FAILED** after 3 measured iterations (limit three per round). No new held-out set was measured.

## Grader reliability

Share of criteria where all three grader votes were valid and equal; criteria with fewer than two valid votes (err); grader calls whose reply did not parse (all five criteria without a vote) in the final files.

| Iteration | Set | cells | criteria | all three votes equal | err criteria | unparsed grader calls (final) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | D | 15 | 75 | 68 (90.7%) | 0 | 0 |
| 1 | C | 15 | 75 | 43 (57.3%) | 13 | 7 |
| 2 | D | 15 | 75 | 48 (64.0%) | 4 | 3 |
| 2 | C | 15 | 75 | 68 (90.7%) | 0 | 1 |
| 3 | D | 15 | 75 | 52 (69.3%) | 5 | 3 |
| 3 | C | 15 | 75 | 71 (94.7%) | 0 | 0 |

Parse failures and re-asks as logged by the grading driver (the driver asks a reply that did not parse again, up to 5 times per call; the shell loop around it started the whole pass again up to 3 times). Logs are in `grades/<iteration>/<set>/logs/`:

- iteration 1, set D, `dev-D.grade.log`: 1 cell(s) with an unparsed call (D2-3)
- iteration 1, set D, `dev-D.grade2.log`: 0 cell(s) with an unparsed call (none)
- iteration 1, set C, `dev-C.grade.log`: 8 cell(s) with an unparsed call (C1-2, C2-1, C2-3, C3-1, C3-3, C5-1, C5-2, C5-3)
- iteration 1, set C, `dev-C.grade2.log`: 5 cell(s) with an unparsed call (C1-2, C2-3, C3-1, C3-3, C5-1)
- iteration 2, set D, `dev2-D.grade.log`: 5 cell(s) with an unparsed call (D1-1, D1-3, D5-1, D5-2, D5-3)
- iteration 2, set C, `dev2-C.grade.log`: 1 cell(s) with an unparsed call (C3-2)
- iteration 3, set D, `dev3-D.grade.log`: 2 cell(s) with an unparsed call (D1-3, D5-3)
- iteration 3, set C, `dev3-C.grade.log`: 0 cell(s) with an unparsed call (none)

The F6 independent re-grade was not run (no scored round).

## Cost

From `total_cost_usd` of each call. Per iteration, ours only (no rival arm was run, so there is no ours/baseline cost ratio):

| Iteration | cells | cost (cost.json sum) | input tokens | output tokens | cache creation tokens | cache read tokens | turns | wall time | mean cost per task |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 30 | 2.45 | 344 | 67978 | 578643 | 3233000 | 178 | 15.2 min | 0.25 |
| 2 | 30 | 2.40 | 342 | 66084 | 567379 | 3200208 | 173 | 16.7 min | 0.24 |
| 3 | 30 | 2.46 | 340 | 68261 | 582248 | 3174132 | 174 | 17.9 min | 0.25 |

Per round, from `cost.tsv` (the controller's cost log) and the cost.json files:

| Item | USD | source |
| --- | --- | --- |
| iteration 1 runs | 2.45 | tsv (cost.json sum 2.45) |
| iteration 1 grading | 2.51 | tsv |
| iteration 2 runs | 2.40 | tsv (cost.json sum 2.40) |
| iteration 2 grading | 2.44 | tsv |
| iteration 3 runs | 2.46 | tsv (cost.json sum 2.46) |
| iteration 3 grading | 2.65 | tsv |
| held-out set e writing (set never opened or run) | 1.39 | tsv row `writer-e` |
| best-rival analysis (controller-session subagent, logged estimate) | 1.27 | tsv row `bestrival-agent` |
| billing check | 0.00 | tsv row `haiku-billing-check` |
| **Logged total** | **17.57** | runs 7.31 + grading 7.60 + other 2.66 |

Not in this total: the controller session itself (diagnosis, implementer and reviewer subagents, grading re-runs beyond the logged driver calls, this evidence build) is not in `cost.tsv`; the line `best-rival analysis` is the controller's logged estimate for one subagent, not a `total_cost_usd`. The tsv grading rows are the logged `total_cost_usd` of the grading calls including re-asks; the grade `.out` files in this folder hold only the final reply of each call, so grading cost cannot be recomputed from them and is taken from the tsv. Run costs are recomputed from the `cost.json` files and match the tsv run rows.

Payer: API key named `anthropic_key_2` (name only), run path: Claude Agent SDK query() shim in front of the same installed CLI (stream-json unchanged). Model `claude-sonnet-5-5` for every run and grader call; CLI 2.1.308; Agent SDK 0.2.172.

Time range (UTC, from file modification times of the run and grading files): iteration 1 2026-10-22 21:16 to 2026-10-22 21:33; iteration 2 2026-10-22 21:59 to 2026-10-22 22:47; iteration 3 2026-10-22 23:00 to 2026-10-22 23:17.

## Everything that went wrong

- Iteration 1 failed on both sets. Set D: 4 of 5 tasks (D2 tied the best rival at 4.33, below the ceiling). Set C: 1 of 5 tasks; C2 2.00 (round 7 with the same product family: 4.00), C4 2.67 (3.67), C5 2.00 (3.00) were regressions against round 7, and C1 had a run with all five criteria unparsed. The documented causes (blank lines counted, bots and placeholder identities ranked as people, codemod commit only named, per-file answer for a package question) are in `PROTOCOL.md`; R9-8 to R9-12 were the fix.
- Iteration 2 fixed set C (5 of 5, 24.33) but regressed set D: D4 fell from 4.00 to 2.00 (tie with plain Claude at 2.00), D2 stayed tied at 4.33 with project-pilot invoked, D1 and D5 had unparsed grader replies (err criteria). The documented cause of the D4 drop is the denominator: R9-8 dropped blank lines, while the D truth counts all lines. R9-13 and R9-14 were the fix.
- Iteration 3 did not recover set D: 2 of 5 tasks (D1, D3). D2 is again a tie at 4.33 (4/5/4 for project-pilot invoked against 5/4/4 for ours), D4 is again a tie at 2.00 with plain Claude, and D5 shows 3.00 against 3.00 only because run 3 stayed unparsed after 5 re-asks by the driver (all five criteria err, counted as 0 points); without that run D5 would be 4.50. The D2 and D4 ties have no err criterion. Set C passed again (23.33). The gate failed on set D, so no held-out measurement was allowed and the three iterations are used up.
- Grader parse failures were frequent in iterations 1 and 2 on set C and D (`grades/<iteration>/<set>/logs/` and the reliability table): iteration 1 set C ended with 7 unparsed grader calls and 13 err criteria (C1 run 2, C2 run 3, C3 runs 1 and 3; C5 run 1 had one unparsed call and kept two valid votes), iteration 2 set D with 3 unparsed calls and 4 err criteria (D1, D5), iteration 3 set D with 3 unparsed calls and 5 err criteria (D5 run 3). The grading driver asks a reply that does not parse again up to 5 times and the shell wrapper repeated the whole pass up to 3 times; the controller also ran additional grading passes (`*.grade2.log`). Cells were not dropped; err criteria count 0.
- Grader votes within a criterion disagree often when replies are missing (all three votes equal on 57.3 percent of criteria in iteration 1 set C, 64.0 percent in iteration 2 set D) and some grader reasons contradict their own verdict (documented for D2 runs in iterations 1 and 2, see `PROTOCOL.md`); no vote was changed by hand.
- Run cells: every one of the 90 cells has a final answer and a trace. `dev.log` and the iteration logs contain `skip ... (final.txt exists)` lines because the run driver was started again for the same run numbers and skipped finished cells; no cell was run twice and no cell was dropped. No rate limit or killed cell was logged.
- Product test fixes during the round (not benchmark cells): a flaky unit test was fixed, and a test that used `Iterator.take` (`.entries().take(3)`) was rewritten in the iteration 2 product commit c689450 so that it does not depend on that method.
- Cost: the controller session (diagnosis, implementer and reviewer subagents, regrading) is not in the cost log except one logged estimate line; see Cost. Held-out set e was written (1.39 USD) and left untouched; it stays held-out and is not part of this folder.
- No rival arm was run, so there is no ours/baseline cost ratio and no F6 agreement rate; none is implied.
