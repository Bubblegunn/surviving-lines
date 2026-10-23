# Round 13: rival analysis, diagnosis and plan (2026-10-23)

Sources: loss packets for the seen sets (e, f, public), read by three diagnosis agents; literature review (`LIT.md`, 29 sources); fresh-writer development sets a, b, c (12 tasks, not read by the controller). The real-repository sweep was started and is not finished (see Resume in `HEAD-TO-HEAD.md`). Rival code was read from `git archive` copies only. No fixture name, person, file or number goes into the product.

## Gaps found (generic capability, evidence, confidence that a change closes it)

| # | Gap | Evidence | Product location | Confidence |
| --- | --- | --- | --- | --- |
| G1 | The primary line count excludes blank lines; the blank-inclusive count is a second column and is missing from `--history`, `--reviewers` and the headline. Graders and users with a blank-inclusive truth fail the non-blank figure. | public T1i, E5, E2k (bf and base count every blame line) | `bin/surviving-lines.js` 3037, 3139-3165, 3295 | medium-high |
| G2 | The reformat block puts the committer's name next to a large line total ("Fiona Formatter 291 lines"), against the skill's own rule. | public T1 criterion 3, 3 of 3 runs | 2976-3003, SKILL.md:41 | medium |
| G3 | Formatter and mechanical commits are not set aside by default in scoped views: floor of 20 lines or 5% of scope, content check rejects commits that add a formatter config file, `lua` and `dart` missing from the quote-fold list, narrow subject vocabulary, a subject match alone is only listed. | e HE1, f HF2 HF3 HF4 HF5 | 1229, 1263-1265, 1383, 1420, 1446, 1487, 2371 | high (config tolerance), medium (subject rule) |
| G4 | Generated and compiled output is under-detected: the marker is case-sensitive and narrow, no source/output pair rule. | f HF2, HF5 | 679, 771 | high (marker), medium (pair) |
| G5 | Automation identities such as "Release Bot" and "Copybara-Service" are missed. | f HF3, HF5 | 326, 336 | medium-high |
| G6 | Boilerplate commits (identical inserted text in several files, licence/SPDX headers) are not set aside; the mechanical check needs 10 files. | e HE3 | 1483, 1501, 2371 | medium |
| G7 | `--reviewers <dir>` prints no per-file owners and no single-owner files, so the second reviewer is never tied to files. | e HE4 c5, HE3 c4; f HF4 c4 | 1750, 3063, SKILL.md:56,70 | high |
| G8 | A reverted-then-reapplied or cherry-picked change is credited to the committer, not the original author. | e HE3 c3 | 1049 | medium |
| G9 | Scope: all text files and the whole repo are counted even when the user names directories or a language; the skill does not tell the model to pass `--include` or `-- dirs`. | e HE1 run 2, f HF3 HF5 | SKILL.md | medium-high |
| G10 | When the model itself finds an automated or mechanical commit, the skill does not say to re-run with `--ignore-rev` and lead with the corrected figure. | f HF3 (3 of 3 runs) | SKILL.md | medium |
| G11 | No activity summary (as-of date, active in the last 365 days, share held by inactive people); no orphan view. | f HF1 run 2, HF3, HF4; hist `ORPHAN_PERCENT` (core.py:49, 1068, MIT) | default view | medium-high |
| G12 | No note when the lines owner is not the committer (author differs from committer). | e HE3 | blame porcelain | medium |
| G13 | Path views lose history across renames (no `--follow`); last-commit date is path-scoped only. | f HF2, HF4 | 1560 | high |
| G14 | A same-name `strong` person is never merged (reverses a recorded design decision; not adopted without a ruling). | f HF2 | 3996 | medium |

## From the literature (LIT.md), ranked

`--without <author>` (knowledge-loss what-if), orphaned-code list, ownership concentration measures, cohort table by year written, `--reformat-impact`, others lower. Not adopted: hercules as a dependency, DOA/DOK coefficients as the main score, stylometry, any GPL code (code-maat, gitinspector).

## Rival code worth adapting

Winners pp and ppi are prompts only (nothing to copy; `agents/git-archaeologist.md:46-52` has revert detection, MIT, "Project Pilot Contributors"). bf wins with a plain blame loop run by the model (nothing to copy). hist counts every blame line and has an orphan share (MIT, "Copyright (c) 2026 Alejandro Brito"): idea only.

## Plan (one implementer at a time, tests with a mutation check per new test, `npm test` green, commit and push after each reviewed task)

1. G1+G2: headline and `--history`/`--reviewers` carry both counts ("N lines, M non-blank"); reformat block prints "rewrote N lines in M files" without a per-name total. Re-check existing tests for the non-blank-first layout.
2. G3+G4+G5+G6: detection widening (config-file tolerance, languages, subject vocabulary with content proof, scoped floor, marker, bot names, boilerplate rule).
3. G7+G12+G13: per-file block and single-owner files in `--reviewers <dir>`, author/committer note, `--follow`, last commit in path and anywhere.
4. G8: revert/reapply credit.
5. G11 and `--without`: activity line, orphan share, what-if view.
6. G9+G10: SKILL.md and hook guidance.

## Development gate (defined, not run)

Sets: fresh-writer sets a, b, c (12 tasks, local branch `devgate-2026-10-r13`) plus the seen sets e and f. Arms ours, pp, ppi, hist, bf, base, 3 runs, Sonnet, `gate-grade5.py`, all work under `/private/tmp`. Clear lead = ruling R13-5 in `HEAD-TO-HEAD.md`. Estimated calls: 22 tasks x 6 arms x 3 runs = about 390 runs plus 66 units x 5 grading calls = 330 grading calls.
