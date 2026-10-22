# surviving-lines round 7 and final gate (failed)

**Result.** On 2026-10-22, on the Claude Agent SDK path with claude-sonnet-5-5, with 3 runs per cell and a model grader, surviving-lines at 4b65d05 had the highest total of six arms (itself, project-pilot with and without its command, mcp-git-historian, k41n/busfactor, plain Claude) on 5 new held-out tasks (15.00 of 25 against 11.33 for the best rival, better-of pp/ppi) and on 11 public tasks (49.67 of 51 against 41.67), but it did not win every task (held-out C1 tied plain Claude; public T1 and E5 were not strictly above every rival), so the preregistered gate failed and F9 and F6 were not run.

Protocol frozen in commit `512788b` before any scored run (see `PROTOCOL.md`). Product: `4b65d05`. Date: 2026-10-22.

### Held-out C1 to C5 (new, written by an agent that had not seen the code)

Mean criteria passed per cell, runs in brackets; `err=n`: n criteria had fewer than two valid votes and are left out.

| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | 5 | 3.00 (3/3/3) | 0.67 (0/1/1) | 2.67 (5/3/0) | 2.33 (3/2/2) | 2.00 (1/3/2) | 3.00 (5/2/2) |
| C2 | 5 | 4.00 (4/4/4) | 2.00 (2/2/2) | 3.00 (3/3/3) | 3.00 (3/3/3) | 3.67 (4/4/3) | 3.33 (3/4/3) |
| C3 | 5 | 1.33 (1/2/1) | 0.67 (0/1/1) | 0.67 (0/1/1) | 0.67 (0/1/1) | 0.67 (0/1/1) | 0.33 (0/0/1) |
| C4 | 5 | 3.67 (3/5/3) | 3.00 (3/3/3) | 2.33 (2/3/2) | 1.00 (1/1/1) | 1.67 (2/2/1) | 2.00 (2/1/3) |
| C5 | 5 | 3.00 (3/3/3) | 2.00 (2/2/2) | 2.00 (2/2/2) | 2.00 (2/2/2) | 2.00 (2/2/2) | 2.00 (2/2/2) |
| Total | 25 | 15.00 | 8.33 | 10.67 | 9.00 | 10.00 | 10.67 |

**Rule A** (our lost points at most 80 percent of the lost points of the rival with the highest total).

- Maximum: 25. Ours: 15.00, lost 10.00.
- Rival totals (pp/ppi = better of the two per task): pp/ppi 11.33, hist 9.00, bf 10.00, base 10.67.
- Highest rival: pp/ppi, lost 13.67; limit 0.8 x 13.67 = 10.93.
- 10.00 <= 10.93 is true: **Rule A passes**.

**Rule B** (on every task our mean is strictly above every rival; where a rival is at the maximum, ours must be at the maximum too).

- Tasks checked: 5. Failing: C1 (base 3.00, ours 3.00).
- **Rule B fails**.

### Public tasks (11)

Mean criteria passed per cell, runs in brackets; `err=n`: n criteria had fewer than two valid votes and are left out.

| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 4 | 3.67 (3/4/4) | 3.67 (3/4/4) | 1.67 (1/2/2) | 3.00 (2/3/4) | 3.00 (1/4/4) | 4.00 (4/4/4) |
| T2 | 4 | 4.00 (4/4/4) | 2.67 (3/3/2) | 3.33 (3/3/4) | 1.00 (1/1/1) | 2.00 (2/2/2) | 3.67 (4/4/3) |
| T3 | 5 | 5.00 (5/5/5) | 4.33 (5/4/4) | - | 4.00 (5/3/4) | 4.33 (5/5/3) | 4.33 (4/5/4) |
| T4 | 5 | 5.00 (5/5/5) | 3.00 (3/3/3) | 3.33 (3/2/5) | 3.00 (3/3/3) | 2.67 (3/4/1) | 3.00 (3/3/3) |
| T1i | 4 | 4.00 (4/4/4) | 4.00 (4/4/4) | 2.33 (2/2/3) | 3.33 (4/3/3) | 3.67 (4/4/3) | 4.00 (4/4/4) |
| T4i | 5 | 5.00 (5/5/5) | 3.00 (3/3/3) | 4.00 (4/4/4) | 3.00 (3/3/3) | 3.00 (3/3/3) | 2.67 (3/2/3) |
| E1 | 5 | 5.00 (5/5/5) | 3.33 (4/3/3) | 3.33 (5/3/2) | 4.33 (4/5/4) | 2.33 (2/2/3) | 3.67 (3/4/4) |
| E2k | 5 | 5.00 (5/5/5) | 4.00 (4/4/4) | 4.00 (4/4/4) | 4.00 (4/3/5) | 3.67 (4/3/4) | 4.00 (4/4/4) |
| E3 | 4 | 3.67 (3/4/4) | 2.67 (3/2/3) | - | 2.67 (2/3/3) | 3.00 (3/3/3) | 2.67 (2/3/3) |
| E4h | 5 | 5.00 (5/5/5) | 4.00 (5/4/3) | - | 4.33 (5/3/5) | 5.00 (5/5/5) | 4.33 (3/5/5) |
| E5 | 5 | 4.33 (4/5/4) | 5.00 (5/5/5) | 4.00 (5/5/2) | 5.00 (5/5/5) | 5.00 (5/5/5) | 4.33 (3/5/5) |
| Total | 51 | 49.67 | 39.67 | 26.00 | 37.67 | 37.67 | 40.67 |

**Rule A** (our lost points at most 80 percent of the lost points of the rival with the highest total).

- Maximum: 51. Ours: 49.67, lost 1.33.
- Rival totals (pp/ppi = better of the two per task): pp/ppi 41.67, hist 37.67, bf 37.67, base 40.67.
- Highest rival: pp/ppi, lost 9.33; limit 0.8 x 9.33 = 7.47.
- 1.33 <= 7.47 is true: **Rule A passes**.

**Rule B** (on every task our mean is strictly above every rival; where a rival is at the maximum, ours must be at the maximum too).

- Tasks checked: 11. Failing: T1 (pp/ppi 3.67, ours 3.67; base 4.00 at maximum, ours 3.67), E5 (pp/ppi 5.00 at maximum, ours 4.33; hist 5.00 at maximum, ours 4.33; bf 5.00 at maximum, ours 4.33; base 4.33, ours 4.33).
- **Rule B fails**.

## Gate

- Held-out C1 to C5 (new, written by an agent that had not seen the code): Rule A passes, Rule B fails.
- Public tasks (11): Rule A passes, Rule B fails.
- Gate (both sets, both rules): **failed**.

## Departures from the frozen protocol and caveats

- The public set was graded by a model on every outcome criterion for six arms together, not by the round 4 and 5 script checks on four arms; public numbers are not comparable to rounds 4 and 5.
- Two public cells (T1i ppi, bf) have one criterion with fewer than two valid votes (`err=1`); it is left out of the mean.
- No cell of an earlier round is reused. The SDK path differs from the earlier CLI path only in that the desktop application's Artifact tool and artifact-diagramming skill are absent.
- The held-out writer's tasks were not read by the controller; the product changes of round 7 (R7-1 to R7-4) were driven by the seen sets (N1 to N4, H1 to H3) only. The tie on C1 and the T1 and E5 misses were not investigated before the round.
- Cost logged: 31.20 USD (stop line 36, maximum 40). F9 (Haiku, Opus) and F6 were not run because the gate failed. No tolerance exists in Rule B; one-criterion differences decided C1, T1 and E5.
- Evidence folder completed after the round (2026-10-22) from the local raw runs: traces are scrubbed copies; the unscrubbed originals stay local.
