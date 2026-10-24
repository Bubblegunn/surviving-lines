# Frozen protocol

Extracted verbatim from `docs/HEAD-TO-HEAD.md` (`git show <commit>:docs/HEAD-TO-HEAD.md` is the source).

- Rulings R13-1 to R13-5, before any product change: `866d7c3` (2026-10-23T19:52:11+03:00).
- Development gate 1 protocol: `8f47718` (2026-10-24T05:01:02+03:00); result: `779b201` (2026-10-24T07:28:22+03:00).
- Development gate 2 protocol: `779b201` (2026-10-24T07:28:22+03:00); result: `8345b3d` (2026-10-24T07:53:10+03:00).
- **Final measurement protocol, frozen before any run: `8345b3d` (2026-10-24T07:53:10+03:00), "docs: round 13 gate 2 result (clear lead) and final measurement protocol (frozen before any run)".**

Documents behind the protocol (all in the repository):
- `docs/BEST-RIVAL-r13.md` (last changed ae924ce 2026-10-23T20:22:01+03:00)
- `docs/BEST-RIVAL-r13-deep.md` (last changed 781f21b 2026-10-24T02:23:56+03:00)
- `docs/SWEEP-2026-10-23.md` (last changed 1582bed 2026-10-23T20:50:44+03:00)
- `docs/RESEARCH-DEEP-2026-10-22.md` (last changed 8cbc3a3 2026-10-22T17:21:51+03:00)

Rule B-prime of EVIDENCE-SPEC (owner decision, 2026-10-22) is written in the protocol of round 11 and applies unchanged here; the final protocol below restates it as I2.

## Round 13 final measurement protocol (verbatim)

## Round 13 final measurement protocol (frozen before any run, 2026-10-24)

Written and committed before the first scored run of the final measurement. This section is not changed after results exist. The product, the grader and the analysis do not change in the final round.

**Product.** `git archive` of `8af57f4` (the gate 2 product; `bin/`, `hooks/`, `agents/`, `skills/`, `schema/` are byte-identical to `HEAD` at the time of this commit: `git diff --stat 8af57f4 HEAD -- bin hooks agents skills schema` is empty). Model `claude-sonnet-5-5`. Hooks run as shipped.

**Sets.**
- SEALED z (`HZ1` to `HZ5`, 25 outcome criteria): written for this round by a fresh Sonnet agent given only a plain description of the user's job and the file layout (writer prompt kept as `tasks/sealed-z/writer.prompt.md`); it did not read this repository, its documents or any task. Branch `heldout-2026-10-z` (`93fb942`, local, never pushed before the round is published); a read-only copy is outside `/private/tmp`. The controller read no task prompt, criterion or ground-truth script; setup was validated by script only (all five fixtures build, the ground truth equals the committed `truth.txt`). **Disclosure:** the writer's closing summary, which lists the five repositories, pinned commits and one line of hazards per task, was shown to the controller before this section was written. The product was already frozen at `8af57f4` and is not changed. Invoked prompt of `ppi` = "Use the /project-pilot:bus-factor command for this. " plus the natural prompt.
- PUBLIC: the 11 tasks of `tasks.json` (SHA-256 `96dbeadbcebf21272265d4fdaff93bb284d79c07daf40a2594b88f51ea276d8e`), fixtures of round 7's `pubfix`. **The public set is development material since ruling R13-1** (it was read during round 13 diagnosis); it is reported but the launch claim rests on SEALED z.

**Arms.** `ours`, `pp`, `ppi`, `hist`, `bf`, `base` as in round 11 (`results/round11-claude-sonnet-5-5/arms.json`; rival copies from `git archive`); `ppi` only on tasks with an invoked prompt. **All cells new, none reused**, 3 runs per arm and task, parallelism 3: SEALED z 5 x 6 x 3 = 90 runs; PUBLIC 189 runs.

**Path and isolation.** The owner's subscription login through `~/claude-kredi-runs/sub-shim/claude` (fresh HOME per call; a working directory below `<home>` is refused). All work directories under `/private/tmp/r13/final`. Plugins are passed with `--plugin-dir`.

**Grading.** `gate-grade5.py` as in the gate: five calls per cell, reason before verdict, strict majority of valid votes, `err` below three valid votes, re-ask passes, reverse-order pass for `err` criteria; all arms of a task and run graded together in a shuffled order (`random.Random("<task>-<n>-gate")`), `claude-sonnet-5-5`.

**Claims.**
- **I1 (launch claim, Sonnet only).** In SEALED z, the 95% bootstrap interval of the paired difference between ours and the single best other arm (highest observed total; ties pp, ppi, hist, bf, base) lies entirely above zero. Bootstrap exactly as in rounds 11 and 12 (seed `20261023`, 10,000 resamples over runs, the same draw for every arm of a task, percentile interval). The same I1 statement is reported for PUBLIC (seen set). Reported too: ours minus the per-task better of pp and ppi, and minus every other arm. An incomplete set makes no claim.
- **I2 (descriptive).** Rule A, Rule B and Rule B-prime per set, as in round 11.

**F6 (two parts, as in the round 12 protocol, same sample rule).** `random.Random(20261023).sample(sorted cell names, ceil(0.10 x N))`, N = all graded cells. **F6-grader (pass or fail):** the sampled cells' original answers graded again in their original units by fresh grader sessions (five calls, same majority rule and `err` threshold, re-ask passes, no reverse pass); pass = no sampled cell differs by more than one point and criterion agreement is at least 90% (a criterion that is `err` in either grading counts as a disagreement). **F6-runs (descriptive):** one fresh re-run of each sampled cell graded alone, reported against the min and max of the cell's three original runs.

**F9 (descriptive).** After F6: `claude-haiku-5-5`, then `claude-opus-5-5`; run 1 of ours, base and the best rival (highest Sonnet mean in the set for that task among pp, ppi, hist, bf; ties in that order; fixed from the Sonnet grades before any F9 call) on the 16 tasks of both sets; graded per task with the same method (grader model Sonnet). Reported: totals per model and set, and whether ours is ahead in total. No interval, no claim.

**Order and stop rule.** (1) SEALED z runs, then PUBLIC runs; (2) grading (z grading starts when its runs are complete); (3) F6; (4) F9. A cell that fails (usage limit, authentication, no result) is set aside, run again and never graded. A usage-limit or authentication error stops the driver; the state is written and the driver resumed after the reset. A guard change of the hooks/mcpServers hash stops the round; a change that the host itself made (hashes back to baseline) is recorded as a departure. No dollar cap; each call's list-price `total_cost_usd` is logged.

**Result wording.** One sentence naming, for I1 and I2 and each set, the number of tasks, the rivals, the model, the date, the path (Claude Code CLI 2.1.308, owner subscription login), and stating that no cell was reused and that PUBLIC is a development-seen set.

## Appendix: rulings and development protocols (verbatim, same commit)

## Round 13 (research and development round): rulings before any product change (2026-10-23)

Round 13 is not a measurement. Owner request: make surviving-lines first in total by analysing the rivals, the open-source alternatives and the places where it fails on real repositories; product changes are allowed again (the product was frozen only for rounds 11 and 12). Nothing in a frozen protocol above is changed.

- **R13-1 Seen sets become development material.** The held-out sets b, c, d, e and f (local branches `heldout-2026-10-b` to `heldout-2026-10-f`) have all been read or graded and are no longer held-out; set f's cells were also contaminated (round 12 isolation breach). They, and the public `tasks.json`, are development material from now on. Rule for using them: diagnose the user capability behind a loss; never copy repository names, file names, numbers or criteria into the product.
- **R13-2 Isolation.** Every benchmark work directory (fixtures, run cwd, grader cwd) is under `/private/tmp`. A working directory under `<home>` loads the owner's `~/.claude/CLAUDE.md` into every arm; the subscription wrapper refuses such calls.
- **R13-3 Rivals.** mcp-git-historian (hist), k41n/busfactor (bf) and project-pilot (pp, ppi), read only from `git archive` copies. MIT, Apache and BSD code may be adapted with the copyright line kept.
- **R13-4 Method.** Loss diagnosis (e: HE1 and HE3 against pp, HE4 against ppi; f: HF2 and HF3 against hist, f overall against base; public T1, T1i, E5 against bf or base, E2k against hist) -> real-repository sweep against plain git and other tools (no model cost; log in `docs/SWEEP-2026-10-23.md`) -> open-source and literature review -> implementation with tests -> development gate on sets written by fresh agents that never saw this repository -> final measurement only on a clear lead, on a new sealed set.
- **R13-5 Clear lead (defined before any gate run).** On the development gate, the 95% bootstrap interval (seed 20261023, 10,000 resamples over runs, same draw for every arm of a task) of ours minus the best other arm's total has a lower bound above zero on the union of the fresh writers' sets, and ours is not behind the best other arm in total on the seen sets e and f. A final measurement is started only then; otherwise the round goes back to diagnosis.

## Round 13 development gate 1 protocol (frozen before any gate run, 2026-10-24)

This is a development gate, not a measurement for a claim: it decides whether a final measurement is started. Nothing here is published as a head-to-head result. Rulings R13-1 to R13-5 above apply.

**Product under test.** `git archive` of `6fa5c6d` (round 13 work: sweep fixes, both-counts headline, wider reformat/boilerplate/generated detection, per-file owners, committer and re-apply notes, activity/orphans/`--without`, `--brief` with hook injection, the Stop-hook answer check and the claim-checker agent, `--for-diff`, `--owned-by`, `--why-not`, `--check-codeowners`, adaptive `--suggest-codeowners`, history caveats, active bus factor, skill rules). Not yet implemented and therefore not in this gate: ownership tree, attention list, coupling, recent-code survival, timeline (rows #7 to #10 and #12 of `docs/BEST-RIVAL-r13-deep.md`). Test suite at that commit: 704 of 704 pass.

**Tasks.** `gate-tasks.json` (SHA-256 `5097c1f2921d5533e7c7a4d347b73568f4b791e33b4aeac77ae5048fc2fad75f`), 22 tasks, 110 outcome criteria: DA1 to DA4, DB1 to DB4, DC1 to DC4 (development sets a, b, c, written by three fresh Sonnet agents that were not shown this repository, its documents or any task; the controller read none of their prompts, criteria or truth scripts; branch `devgate-2026-10-r13` `8b450eb`, local) and the seen sets HE1 to HE5 (set e) and HF1 to HF5 (set f; ground truth and fixtures as in rounds 11 and 12). Sets a and b share three repositories with different synthetic hazards and different prompts (disclosed). The invoked prompt of `ppi` is "Use the /project-pilot:bus-factor command for this. " plus the natural prompt.

**Arms.** `ours`, `pp`, `ppi`, `hist`, `bf`, `base`, as in round 11 (`results/round11-claude-sonnet-5-5/arms.json`; rival copies from `git archive`). 3 runs per arm and task, all new, no reuse: 22 x 6 x 3 = about 390 runs (`ppi` runs on every task). Model `claude-sonnet-5-5`, parallelism 3.

**Path and isolation.** The owner's subscription login through `~/claude-kredi-runs/sub-shim/claude` (fresh HOME per call, cwd below `<home>` refused). Every work directory (fixtures, run cwd, grader cwd) under `/private/tmp/r13/gate`. Plugins are passed with `--plugin-dir`. The plugin's hooks run in the `ours` arm as shipped.

**Grading.** `gate-grade5.py` (five calls per cell, reason before verdict, strict majority of valid votes, `err` below three valid votes, re-ask passes, reverse-order pass for `err` criteria), `claude-sonnet-5-5`, all arms of a task and run graded together in a shuffled order, as in rounds 7 to 12.

**Analysis and decision (R13-5, restated).** Bootstrap exactly as in round 11 (seed 20261023, 10,000 resamples over runs, the same draw for every arm of a task). Groups: DEV (the 12 fresh-writer tasks), E (seen), F (seen). Ours minus the single best other arm in total, with 95% interval, is reported per group, together with ours minus the per-task better of `pp` and `ppi`. **Clear lead** = the lower bound of the DEV interval against the best other arm of DEV is above zero AND ours is not behind the best other arm in total on E and on F. Otherwise no final measurement is started and the round returns to diagnosis. The analysis script is `analyse.py` in the gate folder (copied to the evidence of any later round).

**Stop rule.** A usage-limit or authentication error stops the driver, the failed cells are set aside and re-run, never graded. No protocol change after the first run.

### Round 13 development gate 1: result and the defects it found (2026-10-24)

Protocol above, product `6fa5c6d`, all 396 cells run and graded (five-vote reason-first grading, 0 cells needed the reverse pass). Not a claim; the decision rule R13-5 gives **NO CLEAR LEAD**.

| Group | ours | pp | ppi | hist | bf | base | ours minus best other (95% interval) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DEV (12 fresh-writer tasks, max 60) | 20.00 | 33.33 | 28.67 | 20.67 | 24.67 | 28.67 | -13.33 (-17.67 to -9.00) vs pp |
| E, seen (5 tasks, max 25) | 17.33 | 14.00 | 11.67 | 6.67 | 11.33 | 13.67 | +3.33 (-0.33 to +6.00) vs pp |
| F, seen (5 tasks, max 25) | 12.33 | 13.67 | 14.33 | 10.67 | 5.67 | 14.00 | -2.00 (-7.00 to +4.00) vs ppi |

**Diagnosis (before any change).** (1) In 30 of the 66 `ours` cells the new Stop hook blocked the first answer. Those cells scored 0.80 of 5 on average, the 36 unblocked cells 3.47. On the repair turn the model replied with a list of corrections only, and that became the final answer the graders saw; many findings were also false positives (numbers that the injected brief or other tool output contained). (2) Machine-written files without a banner (an Xcode project file, a `*.generated.json` fixture) were counted as human code (DA3, DA4). (3) The skill rule "name only active people to ask" contradicted what independent writers treat as correct (the top owner by surviving lines is the person to ask, with a note when they are inactive). These are product defects of commit `6fa5c6d`, not a property of the grader. DA3 scored 0 for every arm, which the same diagnosis explains for ours; for the rivals it reflects criteria none of them met.

**Consequence.** The `ours` cells of gate 1 do not measure the product as it will ship. They are kept as recorded. Gate 2 (protocol below) re-runs `ours` with the fixed product; the rival cells of gate 1 are reused (same path, same day, same fixtures), and every unit is graded again, so the pairing by grading cell holds.

## Round 13 development gate 2 protocol (frozen before any gate 2 run, 2026-10-24)

Same rules as gate 1 (the section above) except what is stated here. Not a claim.

**Product under test.** `git archive` of `8af57f4`: gate 1 product plus `--tree`, `--attention`, `--coupled`, `--written-since`, `--timeline`, the copy-detection line term, and the three fixes for the defects above (Stop hook precision and a complete-answer repair request; name-based generated files; skill rule naming the top owner first). 790 of 790 tests pass.

**Cells.** `ours`: 22 tasks x 3 runs, all new (66 runs, same path, parallelism 3, work directories under `/private/tmp/r13/gate2`). `pp`, `ppi`, `hist`, `bf`, `base`: the 330 cells of gate 1 are reused (same day, same fixtures, same path, same rival copies); they are marked as reused in any table. Every one of the 66 task-run units is graded again with `gate-grade5.py` (new grader replies; the labels and shuffled order are those of gate 1, so only the `ours` answer changed), so the gate 1 grades of the rivals are not carried over.

**Decision rule.** Unchanged from R13-5 and gate 1 (`analyse.py`, seed 20261023): clear lead = DEV lower bound against the best other arm above zero AND ours not behind the best other arm in total on E and F. Additionally reported: the share of `ours` cells in which the Stop hook blocked the first answer (gate 1: 30 of 66) and the mean score of blocked and unblocked cells. If more than 25% of the `ours` cells are blocked again, the hook is treated as a defect and is fixed before any further decision.

**Stop rule.** As gate 1. No protocol change after the first run.

### Round 13 development gate 2: result (2026-10-24)

Protocol above, product `8af57f4`; 66 new `ours` cells, 330 rival cells reused from gate 1, all 66 units graded again (five-vote reason-first, 0 cells needed the reverse pass). Rule R13-5 gives **CLEAR LEAD** (a decision to start a final measurement, not a claim).

| Group | ours | pp | ppi | hist | bf | base | ours minus best other (95% interval) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DEV (12 fresh-writer tasks, max 60) | 36.67 | 32.00 | 29.67 | 20.00 | 25.00 | 28.33 | +4.67 (+1.00 to +8.33) vs pp |
| E, seen (5 tasks, max 25) | 19.67 | 13.00 | 11.67 | 5.67 | 11.00 | 13.00 | +6.67 (+4.67 to +8.67) vs pp |
| F, seen (5 tasks, max 25) | 22.00 | 12.67 | 14.00 | 10.33 | 5.67 | 14.33 | +7.67 (+5.67 to +10.00) vs base |

Against the per-task better of pp and ppi the intervals are DEV -2.00 to +4.00 (includes zero), E +4.33 to +7.33, F +2.00 to +7.67. The Stop hook blocked the first answer in 13 of 66 `ours` cells (20%, below the 25% bound of the gate 2 protocol); blocked cells averaged 3.46 of 5 and unblocked cells 3.58. Tasks where ours still trails the best other arm in DEV: DA1, DA2, DB1, DC4 (and DA4, DB4 by 0.67 or less). Per-task means are in the gate 2 analysis, kept with the evidence of the final round.
