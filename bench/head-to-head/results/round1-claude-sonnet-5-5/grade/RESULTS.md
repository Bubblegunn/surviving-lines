# Head-to-head results, model claude-sonnet-5-5

On these 11 tasks, model claude-sonnet-5-5, date 2026-10-21: the arms, criteria and tasks are those in tasks.json. This report makes no claim beyond these tasks, this model and this date.

Arms: ours (this repository), pp (project-pilot as it loads), ppi (project-pilot with its command invoked, where the task has one), base (no plugin).

## Plugin loading

| Arm | Status | Runs with plugin loaded | Runs with a skill or command invoked | Runs |
| --- | --- | --- | --- | --- |
| ours | run | 33 | 27 | 33 |
| pp | run | 33 | 3 | 33 |
| ppi | run | 24 | 24 | 24 |
| base | run | 33 | 0 | 33 |

## Outcome criteria only (mean, min and max of criteria passed per run)

| Task | Outcome criteria | ours | pp | ppi | base |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | mean 3.33 (min 3, max 4, runs 3) | mean 3.33 (min 3, max 4, runs 3) | mean 1.67 (min 1, max 2, runs 3) | mean 3.00 (min 2, max 4, runs 3) |
| T2 | 4 | mean 4.00 (min 4, max 4, runs 3) | mean 3.33 (min 3, max 4, runs 3) | mean 2.33 (min 2, max 3, runs 3) | mean 3.67 (min 3, max 4, runs 3) |
| T3 | 5 | mean 4.00 (min 2, max 5, runs 3) | mean 4.00 (min 4, max 4, runs 3) | not in task | mean 4.33 (min 4, max 5, runs 3) |
| T4 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) |
| T1i | 4 | mean 3.00 (min 3, max 3, runs 3) | mean 2.67 (min 2, max 4, runs 3) | mean 2.00 (min 2, max 2, runs 3) | mean 4.00 (min 4, max 4, runs 3) |
| T4i | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 2.67 (min 2, max 3, runs 3) |
| E1 | 5 | mean 4.67 (min 4, max 5, runs 3) | mean 3.00 (min 2, max 4, runs 3) | mean 3.00 (min 2, max 4, runs 3) | mean 3.00 (min 2, max 4, runs 3) |
| E2 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) |
| E3 | 4 | mean 3.33 (min 3, max 4, runs 3) | mean 3.00 (min 3, max 3, runs 3) | not in task | mean 3.00 (min 3, max 3, runs 3) |
| E4 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 4.33 (min 3, max 5, runs 3) | not in task | mean 5.00 (min 5, max 5, runs 3) |
| E5 | 5 | mean 3.67 (min 3, max 4, runs 3) | mean 3.67 (min 2, max 5, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 4.33 (min 3, max 5, runs 3) |

## All criteria (outcome and process)

| Task | All criteria | ours | pp | ppi | base |
| --- | --- | --- | --- | --- | --- |
| T1 | 5 | mean 4.33 (min 4, max 5, runs 3) | mean 4.33 (min 4, max 5, runs 3) | mean 2.67 (min 2, max 3, runs 3) | mean 4.00 (min 3, max 5, runs 3) |
| T2 | 5 | mean 4.67 (min 4, max 5, runs 3) | mean 4.33 (min 4, max 5, runs 3) | mean 3.33 (min 3, max 4, runs 3) | mean 4.67 (min 4, max 5, runs 3) |
| T3 | 5 | mean 4.00 (min 2, max 5, runs 3) | mean 4.00 (min 4, max 4, runs 3) | not in task | mean 4.33 (min 4, max 5, runs 3) |
| T4 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) |
| T1i | 5 | mean 4.00 (min 4, max 4, runs 3) | mean 3.67 (min 3, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) | mean 5.00 (min 5, max 5, runs 3) |
| T4i | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 2.67 (min 2, max 3, runs 3) |
| E1 | 5 | mean 4.67 (min 4, max 5, runs 3) | mean 3.00 (min 2, max 4, runs 3) | mean 3.00 (min 2, max 4, runs 3) | mean 3.00 (min 2, max 4, runs 3) |
| E2 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) |
| E3 | 5 | mean 4.33 (min 4, max 5, runs 3) | mean 4.00 (min 4, max 4, runs 3) | not in task | mean 4.00 (min 4, max 4, runs 3) |
| E4 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 4.33 (min 3, max 5, runs 3) | not in task | mean 5.00 (min 5, max 5, runs 3) |
| E5 | 5 | mean 3.67 (min 3, max 4, runs 3) | mean 3.67 (min 2, max 5, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 4.33 (min 3, max 5, runs 3) |

## Process criteria (listed separately, not in the win rule)

| Task | Process criterion | ours | pp | ppi | base |
| --- | --- | --- | --- | --- | --- |
| T1 | 5. The number comes from a line-level command on the repo (git blame or a tool that wraps it), not from shortlog or commit counts alone. | 3 of 3 runs | 3 of 3 runs | 3 of 3 runs | 3 of 3 runs |
| T2 | 5. Numbers are reproducible: a command is shown or the run used a script, not a guess over a few sampled files. | 2 of 3 runs | 3 of 3 runs | 3 of 3 runs | 3 of 3 runs |
| T1i | 5. The number comes from a line-level command on the repo (git blame or a tool that wraps it), not from shortlog or commit counts alone. | 3 of 3 runs | 3 of 3 runs | 3 of 3 runs | 3 of 3 runs |
| E3 | 5. The numbers come from a line-level command on the repository (git blame or a tool that wraps it). | 3 of 3 runs | 3 of 3 runs | not in task | 3 of 3 runs |

## Per-run scores

| Task | Arm | Run | All criteria | Outcome criteria | Per criterion (1 pass, 0 fail) |
| --- | --- | --- | --- | --- | --- |
| T1 | ours | 1 | 4 of 5 | 3 of 4 | 1 1 0 1 1 |
| T1 | ours | 2 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| T1 | ours | 3 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T1 | pp | 1 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T1 | pp | 2 | 4 of 5 | 3 of 4 | 1 1 1 0 1 |
| T1 | pp | 3 | 4 of 5 | 3 of 4 | 1 1 1 0 1 |
| T1 | ppi | 1 | 2 of 5 | 1 of 4 | 0 0 0 1 1 |
| T1 | ppi | 2 | 3 of 5 | 2 of 4 | 0 0 1 1 1 |
| T1 | ppi | 3 | 3 of 5 | 2 of 4 | 0 0 1 1 1 |
| T1 | base | 1 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T1 | base | 2 | 3 of 5 | 2 of 4 | 1 0 1 0 1 |
| T1 | base | 3 | 4 of 5 | 3 of 4 | 1 1 1 0 1 |
| T2 | ours | 1 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T2 | ours | 2 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T2 | ours | 3 | 4 of 5 | 4 of 4 | 1 1 1 1 0 |
| T2 | pp | 1 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T2 | pp | 2 | 4 of 5 | 3 of 4 | 1 0 1 1 1 |
| T2 | pp | 3 | 4 of 5 | 3 of 4 | 1 0 1 1 1 |
| T2 | ppi | 1 | 4 of 5 | 3 of 4 | 1 0 1 1 1 |
| T2 | ppi | 2 | 3 of 5 | 2 of 4 | 0 0 1 1 1 |
| T2 | ppi | 3 | 3 of 5 | 2 of 4 | 0 0 1 1 1 |
| T2 | base | 1 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T2 | base | 2 | 4 of 5 | 3 of 4 | 1 0 1 1 1 |
| T2 | base | 3 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T3 | ours | 1 | 2 of 5 | 2 of 5 | 0 1 0 1 0 |
| T3 | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T3 | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T3 | pp | 1 | 4 of 5 | 4 of 5 | 1 1 1 1 0 |
| T3 | pp | 2 | 4 of 5 | 4 of 5 | 1 1 1 1 0 |
| T3 | pp | 3 | 4 of 5 | 4 of 5 | 1 1 1 1 0 |
| T3 | base | 1 | 4 of 5 | 4 of 5 | 1 1 1 1 0 |
| T3 | base | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T3 | base | 3 | 4 of 5 | 4 of 5 | 1 1 1 1 0 |
| T4 | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4 | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4 | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4 | pp | 1 | 3 of 5 | 3 of 5 | 1 0 1 0 1 |
| T4 | pp | 2 | 3 of 5 | 3 of 5 | 1 0 1 0 1 |
| T4 | pp | 3 | 3 of 5 | 3 of 5 | 1 0 1 0 1 |
| T4 | ppi | 1 | 4 of 5 | 4 of 5 | 1 1 1 0 1 |
| T4 | ppi | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4 | ppi | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4 | base | 1 | 3 of 5 | 3 of 5 | 1 0 1 0 1 |
| T4 | base | 2 | 3 of 5 | 3 of 5 | 1 0 1 0 1 |
| T4 | base | 3 | 3 of 5 | 3 of 5 | 1 0 1 0 1 |
| T1i | ours | 1 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| T1i | ours | 2 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| T1i | ours | 3 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| T1i | pp | 1 | 3 of 5 | 2 of 4 | 0 0 1 1 1 |
| T1i | pp | 2 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T1i | pp | 3 | 3 of 5 | 2 of 4 | 1 0 1 0 1 |
| T1i | ppi | 1 | 3 of 5 | 2 of 4 | 0 0 1 1 1 |
| T1i | ppi | 2 | 3 of 5 | 2 of 4 | 0 0 1 1 1 |
| T1i | ppi | 3 | 3 of 5 | 2 of 4 | 0 0 1 1 1 |
| T1i | base | 1 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T1i | base | 2 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T1i | base | 3 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| T4i | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4i | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4i | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4i | pp | 1 | 3 of 5 | 3 of 5 | 1 0 1 0 1 |
| T4i | pp | 2 | 3 of 5 | 3 of 5 | 1 0 1 0 1 |
| T4i | pp | 3 | 3 of 5 | 3 of 5 | 1 0 1 0 1 |
| T4i | ppi | 1 | 4 of 5 | 4 of 5 | 1 1 1 0 1 |
| T4i | ppi | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4i | ppi | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| T4i | base | 1 | 3 of 5 | 3 of 5 | 1 0 1 0 1 |
| T4i | base | 2 | 3 of 5 | 3 of 5 | 1 0 1 0 1 |
| T4i | base | 3 | 2 of 5 | 2 of 5 | 0 0 1 0 1 |
| E1 | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E1 | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E1 | ours | 3 | 4 of 5 | 4 of 5 | 0 1 1 1 1 |
| E1 | pp | 1 | 3 of 5 | 3 of 5 | 0 1 1 0 1 |
| E1 | pp | 2 | 4 of 5 | 4 of 5 | 0 1 1 1 1 |
| E1 | pp | 3 | 2 of 5 | 2 of 5 | 1 1 0 0 0 |
| E1 | ppi | 1 | 3 of 5 | 3 of 5 | 0 1 1 0 1 |
| E1 | ppi | 2 | 4 of 5 | 4 of 5 | 0 1 1 1 1 |
| E1 | ppi | 3 | 2 of 5 | 2 of 5 | 0 1 1 0 0 |
| E1 | base | 1 | 4 of 5 | 4 of 5 | 1 1 1 0 1 |
| E1 | base | 2 | 2 of 5 | 2 of 5 | 0 1 0 1 0 |
| E1 | base | 3 | 3 of 5 | 3 of 5 | 0 1 1 0 1 |
| E2 | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2 | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2 | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2 | pp | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2 | pp | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2 | pp | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2 | ppi | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2 | ppi | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2 | ppi | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2 | base | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2 | base | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E2 | base | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E3 | ours | 1 | 5 of 5 | 4 of 4 | 1 1 1 1 1 |
| E3 | ours | 2 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| E3 | ours | 3 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| E3 | pp | 1 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| E3 | pp | 2 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| E3 | pp | 3 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| E3 | base | 1 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| E3 | base | 2 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| E3 | base | 3 | 4 of 5 | 3 of 4 | 0 1 1 1 1 |
| E4 | ours | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E4 | ours | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E4 | ours | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E4 | pp | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E4 | pp | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E4 | pp | 3 | 3 of 5 | 3 of 5 | 0 0 1 1 1 |
| E4 | base | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E4 | base | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E4 | base | 3 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E5 | ours | 1 | 3 of 5 | 3 of 5 | 0 1 1 0 1 |
| E5 | ours | 2 | 4 of 5 | 4 of 5 | 1 1 1 0 1 |
| E5 | ours | 3 | 4 of 5 | 4 of 5 | 1 1 1 0 1 |
| E5 | pp | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E5 | pp | 2 | 2 of 5 | 2 of 5 | 0 0 1 0 1 |
| E5 | pp | 3 | 4 of 5 | 4 of 5 | 1 1 1 0 1 |
| E5 | ppi | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E5 | ppi | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E5 | ppi | 3 | 4 of 5 | 4 of 5 | 1 1 1 0 1 |
| E5 | base | 1 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E5 | base | 2 | 5 of 5 | 5 of 5 | 1 1 1 1 1 |
| E5 | base | 3 | 3 of 5 | 3 of 5 | 0 1 1 0 1 |

## Win rule (outcome criteria only)

- T1: ours 3.33 against project-pilot (pp) 3.33, base 3.00: no
- T2: ours 4.00 against project-pilot (pp) 3.33, base 3.67: yes
- T3: ours 4.00 against project-pilot (pp) 4.00, base 4.33: no
- T4: ours 5.00 against project-pilot (ppi) 4.67, base 3.00: yes
- T1i: ours 3.00 against project-pilot (pp) 2.67, base 4.00: no
- T4i: ours 5.00 against project-pilot (ppi) 4.67, base 2.67: yes
- E1: ours 4.67 against project-pilot (pp) 3.00, base 3.00: yes
- E2: ours 5.00 against project-pilot (pp) 5.00, base 5.00: no
- E3: ours 3.33 against project-pilot (pp) 3.00, base 3.00: yes
- E4: ours 5.00 against project-pilot (pp) 4.33, base 5.00: no
- E5: ours 3.67 against project-pilot (ppi) 4.67, base 4.33: no
- Total: ours 46.00, higher other total 42.67 (project-pilot), needs at least 51.20: no
- Overall: no

Project-pilot is represented on each task by the higher of its pp and ppi outcome means. An arm whose plugin never loaded is not an opponent.

## Cost and turns (from META lines, per run)

| Arm | mean cost (USD) | mean turns | runs with META |
| --- | --- | --- | --- |
| ours | 0.0586 | 4.5 | 33 |
| pp | 0.0558 | 3.0 | 33 |
| ppi | 0.0737 | 4.8 | 24 |
| base | 0.0472 | 3.0 | 33 |
