# Head-to-head results, model claude-sonnet-5-5

On these 11 tasks, model claude-sonnet-5-5, date 2026-10-22: the arms, criteria and tasks are those in tasks.json. This report makes no claim beyond these tasks, this model and this date.

Arms: ours (this repository), pp (project-pilot as it loads), ppi (project-pilot with its command invoked, where the task has one), base (no plugin).

## Plugin loading

| Arm | Status | Runs with plugin loaded | Runs with a skill or command invoked | Runs |
| --- | --- | --- | --- | --- |
| ours | run | 33 | 33 | 33 |
| pp | not run: no runs | 0 | 0 | 0 |
| ppi | not run: no runs | 0 | 0 | 0 |
| base | not run: no runs | 0 | 0 | 0 |

## Outcome criteria only (mean, min and max of criteria passed per run)

| Task | Outcome criteria | ours | pp | ppi | base |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | mean 3.67 (min 3, max 4, runs 3) | not in task | not in task | not in task |
| T2 | 4 | mean 4.00 (min 4, max 4, runs 3) | not in task | not in task | not in task |
| T3 | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| T4 | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| T1i | 4 | mean 4.00 (min 4, max 4, runs 3) | not in task | not in task | not in task |
| T4i | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| E1 | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| E2k | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| E3 | 4 | mean 4.00 (min 4, max 4, runs 3) | not in task | not in task | not in task |
| E4h | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| E5 | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |

## All criteria (outcome and process)

| Task | All criteria | ours | pp | ppi | base |
| --- | --- | --- | --- | --- | --- |
| T1 | 5 | mean 4.67 (min 4, max 5, runs 3) | not in task | not in task | not in task |
| T2 | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| T3 | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| T4 | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| T1i | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| T4i | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| E1 | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| E2k | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| E3 | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| E4h | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |
| E5 | 5 | mean 5.00 (min 5, max 5, runs 3) | not in task | not in task | not in task |

## Process criteria (listed separately, not in the win rule)

| Task | Process criterion | ours | pp | ppi | base |
| --- | --- | --- | --- | --- | --- |
| T1 | 5. The number comes from a line-level command on the repo (git blame or a tool that wraps it), not from shortlog or commit counts alone. | 3 of 3 runs | not in task | not in task | not in task |
| T2 | 5. Numbers are reproducible: a command is shown or the run used a script, not a guess over a few sampled files. | 3 of 3 runs | not in task | not in task | not in task |
| T1i | 5. The number comes from a line-level command on the repo (git blame or a tool that wraps it), not from shortlog or commit counts alone. | 3 of 3 runs | not in task | not in task | not in task |
| E3 | 5. The numbers come from a line-level command on the repository (git blame or a tool that wraps it). | 3 of 3 runs | not in task | not in task | not in task |

## Per-run scores

| Task | Arm | Run | All criteria | Outcome criteria | Per criterion (1 pass, 0 fail) |
| --- | --- | --- | --- | --- | --- |
| T1 | ours | 1 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T1 | ours | 2 | 5 of 5 | 4 of 4 | 1 1 1* 1 1 |
| T1 | ours | 3 | 4 of 5 | 3 of 4 | 1 1 0* 1 1 |
| T2 | ours | 1 | 5 of 5 | 4 of 4 | 1 1 1 1 1* |
| T2 | ours | 2 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T2 | ours | 3 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T3 | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T3 | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T3 | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4 | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4 | ours | 2 | 5 of 5 | 5 of 5 | 1 1* 1* 1 1 |
| T4 | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1* 1 1 |
| T1i | ours | 1 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T1i | ours | 2 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T1i | ours | 3 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T4i | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4i | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4i | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E1 | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E1 | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E1 | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2k | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2k | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2k | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E3 | ours | 1 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| E3 | ours | 2 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| E3 | ours | 3 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| E4h | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E4h | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E4h | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E5 | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1* 1 |
| E5 | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1* 1 |
| E5 | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |

## Win rule (outcome criteria only)

- T1: ours 3.67 against no opponent scored: n/a
- T2: ours 4.00 against no opponent scored: n/a
- T3: ours 5.00 against no opponent scored: n/a
- T4: ours 5.00 against no opponent scored: n/a
- T1i: ours 4.00 against no opponent scored: n/a
- T4i: ours 5.00 against no opponent scored: n/a
- E1: ours 5.00 against no opponent scored: n/a
- E2k: ours 5.00 against no opponent scored: n/a
- E3: ours 4.00 against no opponent scored: n/a
- E4h: ours 5.00 against no opponent scored: n/a
- E5: ours 5.00 against no opponent scored: n/a
- pp: not run: no runs; no win is counted against it
- ppi: not run: no runs; no win is counted against it
- base: not run: no runs; base is not an opponent
- Total: n/a (no opponent scored)
- Overall: n/a

Project-pilot is represented on each task by the higher of its pp and ppi outcome means. An arm whose plugin never loaded is not an opponent.

## Cost and turns (from META lines, per run)

| Arm | mean cost (USD) | mean turns | runs with META |
| --- | --- | --- | --- |
| ours | 0.0967 | 4.9 | 33 |
| pp | n/a | n/a | 0 |
| ppi | n/a | n/a | 0 |
| base | n/a | n/a | 0 |
## Grading method and agreement

A check in tasks.json decides a criterion by script: a number near a name, the order of names, names that appear together, a file pattern or the mailmap. The model decides every other criterion. Each model-judged cell is graded by three independent calls, and the criterion takes the majority of the three votes (two of three). A criterion with fewer than two valid votes is an error and is left out of the counts.

The scripted rules are lenient: a hedged mention counts, so "probably 812 lines" passes a number check. A script can pass an answer that a careful reader would fail.

In the per-run table, E marks a criterion with an error, and * after a model verdict marks votes that were not unanimous.

| Task | Script-checked criteria | Model-judged criteria | Pairs decided by script | Pairs judged by model | Unanimous model pairs |
| --- | --- | --- | --- | --- | --- |
| T1 | 2 | 3 | 6 | 9 | 7 of 9 (77.8%) |
| T2 | 1 | 4 | 3 | 12 | 11 of 12 (91.7%) |
| T3 | 3 | 2 | 9 | 6 | 6 of 6 (100.0%) |
| T4 | 3 | 2 | 9 | 6 | 3 of 6 (50.0%) |
| T1i | 2 | 3 | 6 | 9 | 9 of 9 (100.0%) |
| T4i | 3 | 2 | 9 | 6 | 6 of 6 (100.0%) |
| E1 | 1 | 4 | 3 | 12 | 12 of 12 (100.0%) |
| E2k | 3 | 2 | 9 | 6 | 6 of 6 (100.0%) |
| E3 | 3 | 2 | 9 | 6 | 6 of 6 (100.0%) |
| E4h | 3 | 2 | 9 | 6 | 6 of 6 (100.0%) |
| E5 | 3 | 2 | 9 | 6 | 4 of 6 (66.7%) |
| Overall | 27 | 28 | 81 | 84 | 76 of 84 (90.5%) |

Pairs decided by script: 49.1% of the scored (cell, criterion) pairs. Model-judged pairs with three unanimous votes: 76 of 84 (90.5%).


## Grading errors

- T4 ours run 2: call 2 did not parse
