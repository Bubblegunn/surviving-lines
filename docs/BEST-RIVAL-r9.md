# Best-rival analysis, round 9

Written 2026-10-22 under the standard in `BEST-RIVAL-SPEC.md` (steps 1 to 5). This file is the analysis only. It changes no criterion, check script, task or win rule, and it contains no code change. Section 6 lists candidate rules for the controller to freeze before any code is written.

Sources read for this file:

- Round 8 evidence: `bench/head-to-head/results/round8-claude-sonnet-5-5/` (`SUMMARY.md`, `tasks/heldout-d/tasks.json`, `grades/heldout-d/scores.json`, the per-cell grader replies `grades/heldout-d/D?-?.call?.out` with the label files, and `runs/<task>/<arm>/<rep>/final.txt`).
- Round 7 evidence for the C set: `bench/head-to-head/results/round7-claude-sonnet-5-5/SUMMARY.md`.
- Rival clones, read only and never run, in `/tmp/r9-rivals/`: project-pilot at `bf6eabea4e8bd51a3323ad99d1722fb9b9dfad0c`, busfactor at `d898d8db4346160b0a6ef253b96d60712704fe9f`, mcp-git-historian at `bb2e209c7d8a7163cd2a156d0abb332e4a90a753`. All three are MIT.
- Our product at `dabc18f`. Our own tool and hook were run on the D1 and D2 fixture repositories left in `/Users/efe/claude-kredi-runs/2026-10-22/r8/out-D/runs/` only to read their output (read-only git operations).

Arm names: `ours`, `pp` (project-pilot, natural prompt), `ppi` (project-pilot, invoked), `hist` (mcp-git-historian), `bf` (busfactor), `base` (plain Claude).

## 1. Who is the best rival, task by task

Scores are the mean criteria passed over 3 runs (round 8, grader votes as published).

### Held-out D (round 8, now seen)

| Task | Criteria | Best other arm | Its score | Ours | Gap (ours minus best) | Rule B |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | 5 | ppi, bf, base (tied) | 3.67 | 3.00 | -0.67 | lost |
| D2 | 5 | ppi | 4.33 | 3.00 | -1.33 | lost (base 3.33 also above, hist 3.00 tied) |
| D3 | 5 | ppi | 0.33 | 4.67 | +4.34 | won |
| D4 | 5 | base | 2.00 | 4.67 | +2.67 | won |
| D5 | 5 | pp, ppi, base (tied) | 3.00 | 4.00 | +1.00 | won |

### Public (round 8)

| Task | Criteria | Best other arm | Its score | Ours | Gap | Note |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | 4 | pp | 4.00 | 4.00 | 0.00 | tie at the ceiling, counts as a pass |
| T2 | 4 | base | 3.67 | 4.00 | +0.33 | won |
| T3 | 5 | pp, hist | 4.33 | 5.00 | +0.67 | won |
| T4 | 5 | ppi | 4.00 | 5.00 | +1.00 | won |
| T1i | 4 | bf | 3.67 | 4.00 | +0.33 | won |
| T4i | 5 | base | 3.67 | 5.00 | +1.33 | won |
| E1 | 5 | pp, hist | 4.00 | 5.00 | +1.00 | won |
| E2k | 5 | hist | 4.67 | 5.00 | +0.33 | won |
| E3 | 4 | pp, hist, bf, base | 3.00 | 3.67 | +0.67 | won, but ours is below the ceiling (3.67 of 4) |
| E4h | 5 | bf | 5.00 | 5.00 | 0.00 | tie at the ceiling, counts as a pass |
| E5 | 5 | bf, base | 5.00 | 5.00 | 0.00 | tie at the ceiling, counts as a pass |

Public cells at risk: T1, E4h and E5 pass only because both sides are at the ceiling. One lost criterion in any of them turns the cell into a Rule B loss. E3 is not at the ceiling for ours (one criterion failed once in 3 runs), but it stays strictly above every rival.

### C set (round 7, seen twice; for reference, not the latest results)

| Task | Best other arm | Its score | Ours | Gap |
| --- | --- | --- | --- | --- |
| C1 | base | 3.00 | 3.00 | 0.00 (lost then; r8 diagnostic raised it to 4 of 5, not scored) |
| C2 | bf | 3.67 | 4.00 | +0.33 |
| C3 | pp, ppi, hist, bf | 0.67 | 1.33 | +0.66 (far below the ceiling) |
| C4 | pp | 3.00 | 3.67 | +0.67 |
| C5 | pp, ppi, hist, bf, base | 2.00 | 3.00 | +1.00 |

### Primary rival and second-best arm

- Cells where another arm is above ours: D1 (ppi, bf, base, and pp at 3.33), D2 (ppi, base, and hist tied). No arm is above ours anywhere on the public set.
- Primary rival: **project-pilot, invoked form (ppi)**. It is above ours on both lost cells, it has the largest margin (D2, +1.33), and pp/ppi together have the highest total among the rivals on the held-out set (13.00 of 25, better-of per task).
- Second-best arm: **plain Claude (base)**. It is above ours on D1 and D2 and level at the ceiling on E5. bf is above ours on D1 only; hist is level with ours on D2 only.

Important reading of the grades: our failures are systematic. In D1 criteria 2 and 5 and in D2 criteria 3 and 4, all three graders voted fail in all three runs (`FFF` in every run). The rivals' passes on the same criteria are partial and unstable (for example base passes D1 criterion 2 in 1 of 3 runs, ppi in 2 of 3). So the loss is not grader noise, and a rival score of 3.67 is partly luck while our 3.00 is a fixed rule effect.

## 2. Primary rival read end to end: project-pilot (ppi)

Pinned `bf6eabe`. The repository has 12 skills, 12 commands, 8 agents, 1 hook, 2 scripts and a README. Only part of it loads for a bus-factor question.

### 2.1 What loads in the benchmark

From the run records (`runs/D1/ppi/*/final.txt`, `runs/D2/ppi/*/final.txt`, `runs/T1/ppi/*`): the invoked prompt "Use the /project-pilot:bus-factor command for this." made the model call the **Skill tool** with `project-pilot:bus-factor` in 6 of 6 D runs. The header lines show `SKILLS: project-pilot:bus-factor` and `SLASH: none`. So the text that loads is `skills/bus-factor/SKILL.md` (28 lines), not `commands/bus-factor.md` (125 lines). No Agent call was made in any ppi D run, so `agents/contributor-analyzer.md` was not launched (its name appears in the trace only because the skill text names it). The SessionStart hook runs in every session.

Files I read in full, with line counts:

| File | Lines | Loaded in the D runs |
| --- | --- | --- |
| `skills/bus-factor/SKILL.md` | 28 | yes (via the Skill tool) |
| `commands/bus-factor.md` | 125 | no (slash command never used) |
| `agents/contributor-analyzer.md` | 112 | no (no agent launched) |
| `skills/project-context/SKILL.md` | 34 | ambient skill, `user-invocable: false`, not called in D runs |
| `skills/project-context/references/risk-scoring.md` | 71 | no |
| `hooks/hooks.json` | 16 | yes (SessionStart) |
| `scripts/detect-package-manager.sh` | 59 | yes (runs from the hook) |
| `README.md` bus-factor section | lines 216-225 | no |

### 2.2 Steps in the order the arm gives them

`skills/bus-factor/SKILL.md` (the text the model saw):

1. Line 11-14: detect language, answer in the user's language (Korean or English).
2. Line 18: list all source files, excluding generated and vendor files.
3. Line 19-24: launch a haiku agent (`contributor-analyzer`) to count unique contributors per file, find files where one person has more than 80% of commits, cross-reference with how many files depend on each file, check whether primary owners committed in the last 90 days, and compute a project bus factor.
4. Line 26-28: output a bus factor score, critical single-owner files, a knowledge heat map and knowledge-sharing recommendations.

`commands/bus-factor.md` (not loaded in the benchmark, but it is what "invoked" suggests):

1. Lines 11-15: parse `--period 6m|1y|all` and `--lang ko`.
2. Lines 19-33: list source files by extension with `find`, excluding `node_modules`, `vendor`, `dist`, `build`; per file run `git log --all --no-merges --pretty=format:"%an"` and count authors (commit counts, not lines).
3. Lines 35-43: launch the haiku agent with the same six computations.
4. Lines 45-54: rank importance by `grep -rl "<filename>"` counts of files that mention the file name; 20 dependents is CRITICAL, 1 dependent is LOW.
5. Lines 56-115: print a fixed markdown template (project-level bus factor, overview table, critical risk areas, module table, text heat map, recommendations).

`agents/contributor-analyzer.md` (not launched): contributor overview with `git shortlog -sn` (lines 13-23), per-directory top authors (25-34), commit patterns by weekday and hour (36-51), bus factor algorithm (53-67), per-person concentration (69-79), output template (81-113).

### 2.3 Numbered rules, patterns and checks

1. Ownership is the share of commits per author name (`%an`) per file or directory (`commands/bus-factor.md:29-32`, `agents/contributor-analyzer.md:16,31,56`). Not lines. Not mailmap-resolved, not merged by e-mail.
2. A file has bus factor 1 when it has one contributor or the primary contributor has more than 80% of commits (`agents/contributor-analyzer.md:64-66`, `skills/bus-factor/SKILL.md:21`).
3. Project bus factor is the minimum number of people whose departure leaves more than 50% of files without a knowledgeable maintainer (`agents/contributor-analyzer.md:67`). File-count based.
4. Exclude generated and vendor files (`skills/bus-factor/SKILL.md:18`; the `find` in `commands/bus-factor.md:23` excludes `node_modules`, `vendor`, `dist`, `build`, `__pycache__`, `.git` by path only).
5. Owner activity: committed in the last 90 days is active (`skills/bus-factor/SKILL.md:23`, `commands/bus-factor.md:42`, `agents/contributor-analyzer.md:21-22,79`).
6. Importance cross-reference by counting files that contain the file name (`commands/bus-factor.md:49-54`).
7. For more than 500 files, sample (`commands/bus-factor.md:26`).
8. Output the fixed template with `[HIGH]`/`[CRITICAL]` badges (`commands/bus-factor.md:58-115`, risk formula in `skills/project-context/references/risk-scoring.md:5-63`).
9. SessionStart hook prints a one-line project profile (language, package manager, framework, test framework, CI) (`hooks/hooks.json:4-13`, `scripts/detect-package-manager.sh:49-55`). It says nothing about authorship.

Not present on the bus-factor path: `git blame`, line counts, `.mailmap` handling, same-person detection, bot exclusion, formatter or reformat commit handling, `.git-blame-ignore-revs`. A search for `blame`, `mailmap` and `identit` over the markdown, shell and JSON files finds `git blame -w -C -C -C` only in other features (`skills/history/SKILL.md:32`, `commands/history.md:34`, `agents/git-archaeologist.md:21`, `commands/debt.md:30`) and no hit at all for `mailmap` or identity handling.

### 2.4 Behaviour on input it does not recognise

- The skill and command have no branch for unusual input. `$ARGUMENTS` is parsed for two flags only (`commands/bus-factor.md:13-15`); any other text is simply ignored.
- Languages outside the `find` list (`commands/bus-factor.md:23` lists ts, tsx, js, jsx, py, go, rs, java, rb, php, cs) are not scanned. A C repository such as cJSON (D1) would give an empty file list from that command.
- There is no step for duplicate identities, formatter commits, bots or a mailmap. Whatever the model does there comes from the model, not from the arm.
- Observed: in all 6 ppi D runs the model ignored the commit-count recipe and ran `git blame --line-porcelain -w -M -C` itself (see the D1 ppi trace: `git blame $1 --line-porcelain -w -M -C`), then merged identities by its own judgment and flagged the merge as a guess. That is plain-model behaviour.

### 2.5 Invoked versus natural

- Natural (pp): on D1 and D2 the model loaded no skill at all (`SKILLS: none` in all 6 pp D runs). pp behaves like plain Claude with a different tool list. On T2 it did load `project-pilot:bus-factor`.
- Invoked (ppi): the model loads the 28-line skill text in all runs. The text adds only two behaviours: an activity check ("committed in last 90 days", rule 5) and a bus-factor definition.
- Scores: D1 pp 3.33 against ppi 3.67; D2 pp 2.33 against ppi 4.33. The D2 difference comes from outputs, not from the skill's recipe. pp run 1 on D2 excluded `_test.go` files and counted 6,397 lines instead of 12,194, so its ranking and shares were wrong and it failed all five criteria. ppi runs counted all Go files. The "Last commit" column in the ppi D2 tables (from skill rule 5) put recent contributors, including the squash-merge author, into the shown table.
- Therefore the invoked arm is better mainly because the skill text pushes the model to (a) check activity per author and (b) report a table with a date column, not because it carries ownership logic.

## 3. Side by side on the cells we lose

### 3.1 D1: "Who actually wrote the code in cJSON.c and cJSON.h that's still in this repo today?"

Criteria (e-mail addresses replaced):

1. Top owner is Max Bruckner with 75% of live lines (72.5 to 77.5) and ranked first.
2. The two Tomás Ibarra identities (one work address `<email>` and the display name "tomasi" on a noreply address `<email>`) appear as ONE person with about 4.0% (3.0 to 5.0), inside the top five. FAIL if listed as separate people at about 2% each without saying they are the same person, or if either identity is missing.
3. Alan Wang and Alanscut are one entry with about 3.6% (2.6 to 4.6).
4. Priya Nair (formatting commit author and author of the reverted MergePatchLite) at most 0.5%, and github-actions[bot] not ranked.
5. The answer says what it left out or merged: it ignored or looked through the formatting commit; it merged identities (at least the Tomás Ibarra pair); bot-authored lines (about 5) are excluded or reported separately. FAIL if any of the three is missing, or commit counts are presented as the ownership measure.

Failed criteria per run:

| Arm | Run 1 | Run 2 | Run 3 | Mean |
| --- | --- | --- | --- | --- |
| ours | 2, 5 | 2, 5 | 2, 5 | 3.00 |
| ppi | 5 | 2, (4 split vote), 5 | 5 | 3.67 |
| base | none | 2, 5 | 2, 5 | 3.67 |
| bf | 5 | 5 | 2, 5 | 3.67 |

Grader reasons for ours (all three runs): "tomasi and Tomás Ibarra listed as separate rows at ~2% each, not merged" (criterion 2) and "did not merge the Ibarra pair, so the merged-identities statement is missing for the required pair" (criterion 5). ppi fails 5 because it never mentions the bot lines.

Side by side (excerpts, run 1):

| Ours (`runs/D1/ours/1/final.txt`) | base (`runs/D1/base/1/final.txt`, the only 5/5 run) |
| --- | --- |
| Table: `5 Mike Jerris 2.1%`, `6 tomasi 74 lines 2.1%`, `7 Tomás Ibarra 68 lines 1.9%` | Table: `3 Tomás Ibarra (tomasi 74 + Tomás Ibarra 68) 142 3.94%` |
| "Weak same-person guess: tomasi (74 lines) and Tomás Ibarra (68 lines) might be one person. Together that would be 142 lines (3.9%), which would rank them 2nd. This rests on names and addresses only, so I kept them separate." | "I also merged tomasi and Tomás Ibarra. That one is a guess from the name and the address. If they are different people, tomasi has 74 lines (2.05%) and Tomás Ibarra has 68 (1.89%)." |
| Bot: "Bot excluded: 1 identity (5 lines, 1 commit)." Formatting commit named and set aside. | Bot: "The latest commit is by github-actions[bot]. It shows up with only 5 surviving lines." |

Both answers contain the same facts. The only difference is where the merged figure sits: base puts the merged person in the table and the unmerged figures in a hedge; ours does the reverse. The graders accept the first and reject the second.

Rival rule that produced the pass: none. The passing behaviour (a merged headline with the alternative stated) comes from the model's default judgment, not from a project-pilot rule (section 2.3 has no identity rule). The same default appears in `base`.

Why ours did not: the cause chain, with locations.

1. The tool does find the pair. Output on the D1 fixture (our tool, `dabc18f`): "possible same person ... tomasi <noreply address> / Tomás Ibarra <work address>: weak suggestion: lead with the unmerged figures ... 142 lines, 3.9% only as a possibility".
2. It is classed `weak` because the only evidence item is `contained`: the name "Tomás Ibarra" (letters only, accents removed) is contained in the dotted address name of the second identity (`bin/surviving-lines.js:3210`). `isStrongEvidence` treats a single `contained`, `stem` or `initial` item as weak (`bin/surviving-lines.js:3152-3155`, rule R7-4 in `docs/HEAD-TO-HEAD.md:797`). Here the name equals the whole address name, which is stronger than "contained", but the code does not distinguish equality from containment.
3. `--merge-identities` merges strong groups only (`bin/surviving-lines.js:2198`, R8-5), and the skill says to lead with the unmerged figure for weak groups (`skills/surviving-lines/SKILL.md:25,35,49`). The model followed the rule exactly in 3 of 3 runs. It never ran `--identities` (0 of 3 runs).
4. Criterion 5 fails for the same reason: "merged identities (at least the Tomás Ibarra pair)" is false when the answer merged only the Alan Wang pair.

Root cause class (general): **a same-person suggestion with one real but "weak" evidence item is presented as a hedge, while the reader's question ("ranked list ... who actually wrote") needs each person counted once.** The R7-4 weak/strong policy trades merge precision for headline accuracy, and for two-member groups with exact name-to-address agreement it chooses the wrong side. This is a policy class, not a fixture fact: any repository where a person appears as `First Last` and as `first.last@...` or a login hits it.

### 3.2 D2: "Which people wrote the Go code that is still alive in it, and how concentrated is that?"

Criteria:

1. Top owner Eric Paris 16.7% (14.2 to 19.2); next two Alex Ogier and Noah Dietz (about 10.1% each); top three about 37% (34 to 40).
2. Sam Okafor at most 0.5%; vendor/ and the generated file not counted; dependabot[bot] not an owner.
3. "bogem" and Albert Nigmatzianov (same e-mail) are one entry with about 1.8% (1.3 to 2.3). FAIL if "bogem" is a separate ranked person.
4. Lena Voss (squash-merge author) about 1.2% (0.7 to 1.7); Ravi Menon and Yuki Sato (trailers only) at most 0.2% each, or the answer says trailers cannot be attributed to lines. FAIL if Lena is missing or above 2.5%, or a co-author has 0.5% or more.
5. Concentration: ownership is spread out, nobody above 20%, about five people (4 to 6) reach half the lines. FAIL if it says one person owns a majority or one or two people cover half.

Failed criteria per run:

| Arm | Run 1 | Run 2 | Run 3 | Mean |
| --- | --- | --- | --- | --- |
| ours | 3, 4 | 3, 4 | 3, 4 | 3.00 |
| ppi | 3 | none (5/5) | 1, 2 (split), 3 (split) | 4.33 |
| base | 3 | 1, 5 | 3, 5 | 3.33 |
| hist | 3 | 3 | 1, 2, 3, 5 | 3.00 |

Grader reasons for ours: criterion 3: "Says the tool found no duplicates and nothing was merged, so bogem is not combined with Albert Nigmatzianov" (runs 1-3 equivalent). Criterion 4: "Lena Voss is not credited in the answer, and she is missing from the top-10 table" (runs 1-3).

Side by side (excerpts):

| Ours (`runs/D2/ours/1/final.txt`) | ppi (`runs/D2/ppi/2/final.txt`, the 5/5 run) |
| --- | --- |
| "No `.mailmap` exists, and the tool found no same-person duplicates. I ran with `--merge-identities`, so nothing was merged." | "I merged the 'Albert Nigmatzianov' and 'bogem' identities because they share an email." |
| Table ends at row 10 (`wu8685 3.1%`): "There are 77 more authors below these." Lena Voss is not named. | Table has 11 rows with a "Last commit" column; last row `Lena Voss 143 1.2% 2026-03`; "Lena Voss is the most recent author of real code ... they own all of it." |
| Bus factor 5 (50.5%), reaching 80% takes 15 authors, both with scope. | "Project bus factor is 5 ... It takes Paris, Ogier, Dietz, Reyna and Saha to pass 50% (50.7%)." |

Rival rule that produced the pass: again no project-pilot rule for identity merging or listing. Two partial sources: (a) `skills/bus-factor/SKILL.md:23` (check whether owners are active, last 90 days) made the model add a "Last commit" column and then look at recent authors, which pulled Lena Voss into the table and the text; (b) the model's own `git blame` run with `-w -M -C` and its own judgment merged the shared-address pair. The three ppi runs are uneven: run 3 used a blame without copy detection (Ogier 6.9%, Riobard 7.6%), failing criterion 1, and did not show a merged 1.8% row.

Why ours did not, with locations:

1. **Silent same-address merge.** Our tool keys authors by e-mail address (`mapIdentities` at `bin/surviving-lines.js:857`, rows by mail). The fixture's Albert Nigmatzianov and bogem share one address, so they already form one row of 215 lines (1.8%), labelled "bogem" (27 commits in the commit column). The default table does not say that one row carries two names. The only view that lists same-address names is `--identities` (`sameAddressNames`, `bin/surviving-lines.js:3374`, called at `3573`). None of the 3 ours D2 runs ran `--identities`. The row "bogem 215 lines" sits at rank 15, below both the default `--top 10` (`bin/surviving-lines.js:124`) and the `--top 12` the model asked for in runs 1 and 3, so the model never saw it in the table. It then said "no duplicates" because the tool printed no same-person suggestion for the pair (the pair is excluded from suggestions because it is already one row: `bin/surviving-lines.js:3204`, `a.row.mail === b.row.mail` is skipped).
2. **The prompt hint never fired.** The UserPromptSubmit hint (`hooks/surviving-lines-hint.sh:14-36`) matches fixed phrases. "Which people wrote the Go code ... how concentrated" matches none of them (`who (owns|wrote|maintains|knows)` at line 23 needs the words "who wrote"; there is no "which people", "still alive", "concentrated" or "losing"). I ran the hook on the D2 prompt in the fixture repository: empty output. The hint is the only place that lists same-address groups to the model before it answers (its rule R2 "the same address under two or more names", `hooks/surviving-lines-hint.sh:78`). Same for D1: "Who actually wrote" does not match `who (owns|wrote...)` either, and the hook was silent there too.
3. **Fixed table length.** `renderTable` prints `r.authors.slice(0, top)` (`bin/surviving-lines.js:2609`), default `top: 10` (line 124). Lena Voss sits at rank 20 with 1.1% (133 lines, 1.09%). The skill rule "For each person you name, give the share" (`skills/surviving-lines/SKILL.md:45`) does not require naming anyone below the table. The question asked "which people wrote the Go code", and everyone below rank 10 was reduced to "77 more authors".
4. **Trailers are never mentioned.** The skill mentions `--co-authors share` only as an option (`SKILL.md:66`). It has no rule to say that `Co-authored-by` trailers are not credited to lines in the default view. Criterion 4 allows that statement as a substitute for the two co-author figures, but Lena still has to appear.

Root cause class (general): **(a) identity merges that the tool performs silently are not reported, so the answer says "no duplicates"; (b) the ownership answer lists a fixed top 10 and cuts off the tail that "which people" questions ask for; (c) the hint that would give the model this information fires only on a narrow phrase list.**

## 4. Technique map (project-pilot, plus busfactor and mcp-git-historian techniques)

Licence for all three: MIT (LICENSE files in the clones). MIT code may be adapted with attribution in `THIRD-PARTY-NOTICES.md`. Nothing below needs adapted code; every adopted idea is a rule or a small output change that can be written independently, so no attribution entry is needed unless code is copied.

| Rival technique | Do we have it | General or task-specific | Licence | Decision |
| --- | --- | --- | --- | --- |
| pp: ownership by commit counts per file (`commands/bus-factor.md:29-32`) | Commits column exists but is secondary (`skills/surviving-lines/SKILL.md:8,52`) | General but wrong measure | MIT | Reject: counts show who was busy. D1 criterion 5 fails answers that use counts as the measure. |
| pp: single-owner file list, more than 80% of commits (`agents/contributor-analyzer.md:64-66`) | No per-file list; `--group-by dir` gives per-directory bus factor (`SKILL.md:26,64`) | General | MIT | Reject for r9: no lost criterion depends on it, and a commit-based 80% rule is not a line-based measure. Revisit only if a task asks for per-file silos. |
| pp: owner activity, last commit in 90 days (`skills/bus-factor/SKILL.md:23`) | Yes in `--reviewers` only: last commit date and active/inactive marker, never changes the order (`SKILL.md:59`) | General | MIT | Adapt (small): show the last-commit date column in the default table so the answer can state who is still around. Keep order by lines. Source of the Lena Voss row in ppi D2. |
| pp: importance by counting files that mention the file name (`commands/bus-factor.md:49-54`) | No | Fits only languages where file names appear in imports | MIT | Reject: naive grep heuristic, wrong for C headers, Go packages and monorepos. |
| pp: fixed risk template, heat map, `[HIGH]`/`[CRITICAL]` badges, recommendations (`commands/bus-factor.md:58-115`, `risk-scoring.md`) | Partial (`--group-by dir`, scope notes) | Format only; severity weights are arbitrary | MIT | Reject: no lost criterion, and the formula adds invented numbers. |
| pp: haiku sub-agent for the analysis (`SKILL.md:19`) | No | General | MIT | Reject: not launched in any D run; adds cost, no accuracy gain. |
| pp: answer in the user's language (`SKILL.md:11-14`) | The model already does this | General | MIT | Reject: no gap. |
| pp: SessionStart project profile hook (`hooks/hooks.json:4-13`) | Our hook is UserPromptSubmit | Not related to ownership | MIT | Reject. |
| Model default seen in base and ppi: merged headline with the unmerged alternative in a hedge, labelled as a guess | No: our skill forbids it for weak groups (`SKILL.md:25,35,49`) | General | n/a (model behaviour) | Adapt: see R9-1 and R9-2. This is the main source of the D1 lead. |
| Model default seen in ppi: add a last-commit column and talk about the most recent contributors | No in the default table | General | n/a | Adapt via the activity column above and R9-4. |
| Model default: list the long tail (base D1 lists 14 rows plus "about 25 other authors, 10 lines or fewer each") | No: fixed top 10 | General | n/a | Adopt: R9-4. |
| bf: merge several e-mails of one GitHub account (`SKILL.md:95-98`, `scripts/ownership.mjs:406-437`) | Partial: noreply login and name evidence in `linkIdentities` (`bin/surviving-lines.js:2951`) | General, but needs the GitHub API | MIT | Reject the network lookup (we run offline, no network by design). The idea is already in our noreply rules. |
| bf: "the output is inferred, not authoritative" caveat (`SKILL.md:128-132`) | Yes: "What the numbers cannot show" (`SKILL.md:82-91`) | General | MIT | Reject: already covered. |
| bf: orphaned versus bus factor 1 (`SKILL.md:15-25`) | No: only active/inactive marker in `--reviewers` | General | MIT | Defer: not tied to a lost criterion. Possible later addition to the bus-factor line. |
| bf: time-decayed commit weight, half life 365 days (`SKILL.md:88-89`) | No | Opinionated; conflicts with a line-based measure | MIT | Reject. |
| bf: replay of renames across the log (`SKILL.md:90-92`) | blame `-M -C` covers moved lines | General | MIT | Reject: already handled by blame. |
| bf: shallow history and bulk first commit flags (`SKILL.md:115-126`) | Shallow clone refused (`SKILL.md:72-74`); no bulk-import flag | General | MIT | Defer: not tied to a lost criterion. |
| hist: `.mailmap` through `%aN` everywhere (`core.py:15-16`, README line 40) | Yes through blame and `check-mailmap` (`bin/surviving-lines.js:857`) | General | MIT | Reject: already have it. |
| hist: merges are not authorship (README line 41) | Yes, merges excluded (`SKILL.md:79`) | General | MIT | Reject: already have it. |
| hist: orphaned file = inactive authors own more than 50% of lines at HEAD (README line 44, `core.py:996`) | No | General | MIT | Defer, same as bf's orphaned idea. |
| hist: coupling noise filter for large commits (README line 45) | Different: mechanical rewrite check (`SKILL.md:40`) | General | MIT | Reject: no counterpart needed. |

Everything marked adopt or adapt is a general rule (reading the people in the tail, reporting silent merges, strength policy for identity groups). I rejected nothing because it was too general; I rejected the items that are heuristic only for some languages (import grep) or measure the wrong thing (commit counts).

## 5. Second-best arm: plain Claude (base), with bf and hist notes

### 5.1 base (steps 2 and 4, short)

- There is no code to read. The arm is an empty plugin (`bench/head-to-head/results/round8-claude-sonnet-5-5/arms.json`, entry `base`). Its behaviour is what the model does with the shell: it ran `git blame -w -M -C --ignore-revs-file .git-blame-ignore-revs --line-porcelain` itself in D1 run 1 and listed authors from the blame output.
- What it did better than ours on D1: counted the Tomás Ibarra pair as one person in the table in 1 of 3 runs, and gave the unmerged figures as the fallback in the same sentence. In the other 2 runs it kept the pair apart and fell into the same loss as ours.
- What it did better than ours on D2: it passed criterion 4 in 3 of 3 runs (Lena Voss appeared) and criterion 3 in none (failed in 3 of 3). Failures: run 1 criterion 3; run 2 criteria 1 and 5 (blame without `-C` gave Ogier 6.9% and a wrong top three); run 3 criteria 3 and 5. Its 3.33 is therefore an average of unstable runs, and the stable part is the one criterion ours fails systematically (criterion 4).
- Technique decision: no technique is transferable beyond the two behaviours already listed in section 4 (merged headline with a fallback, a longer tail). Fixing ppi's lead through R9-1 to R9-5 also covers base, because base's wins are the same criteria.

### 5.2 bf (above ours on D1 only; 0.33 on D2)

- Loads `SKILL.md` (132 lines) and runs `scripts/ownership.mjs` (640 lines), which writes `.github/CODEOWNERS` and `.github/ownership.json` into the repository. It measures commit weight with a 365-day half life per zone, merges e-mails only through GitHub login lookup, excludes bots, lockfiles and generated code (`ownership.mjs:36-46`), and flags orphaned zones.
- In D1 the model loaded no skill (`SKILLS: none` in 3 of 3 runs), so bf's 3.67 is plain-model behaviour like base. In D2 the model loaded `busfactor:busfactor` and ran `ownership.mjs` in 3 of 3 runs, then ran its own `git blame` over 76 files (12,682 lines, a different file set from the 12,194 in the truth) and ranked by "active" status; it lost almost every criterion (0.33). This is not a technique we lack; it shows that a CODEOWNERS-oriented skill pulls the model off the ranking question.
- Decision: no adoption beyond the deferred "orphaned" idea in section 4.

### 5.3 hist (level with ours on D2 only)

- 11 MCP tools (`mcp_git_historian/server.py`, `core.py`). `blame_summary` (`core.py:633`) gives per-file line percentages; `bus_factor` (`core.py:668`) is commit-based, more than 50% of commits, merges excluded. The README (lines 36-47) lists the explicit rules (mailmap, merges, silo, orphan, coupling filter).
- Its D2 tie at 3.00 mixes one 4/5 pair of runs with one 1/5 run. Nothing in it beats our line-based method; no adoption.

Checking the second-best arm against the section 6 rules: R9-1 to R9-5 move base's and ppi's winning behaviours (merged headline, tail, same-address note) into our product. None of them relies on a technique base or bf have that we lack, so fixing the primary rival does not open a gap to another arm.

## 6. Proposed general rules for the controller to freeze

Each rule names a loss class, not a fixture. None changes a criterion, check script, task or win rule. Rule numbers continue the R8 series. The controller decides which to freeze; I list them in priority order.

**R9-1. Exact name-to-address agreement is strong identity evidence.**
- Loss class: weak classification of a pair that should be counted as one person (D1 criteria 2 and 5, 3 of 3 runs).
- Rule: add one evidence kind. When the full name of one identity (two or more words, accents and punctuation removed, letters only) equals the address name of the other identity (for example `Firstname Lastname` and `firstname.lastname@...`), the item is near-conclusive, like the existing `accent` kind (`bin/surviving-lines.js:3152-3155`). Containment of a part of a name (the current `contained` rule at `3210`) stays weak.
- Expected effect: the Tomás pair becomes `strong`, `--merge-identities` merges it, and the skill's existing strong rule makes the merged figure the headline. D1 criteria 2 and 5 pass if the answer also states the bot lines (ours already does).
- Risk: two different people with the same full name and a matching address. The existing same-name rule already links such pairs as strong (`linkIdentities`, name rule), so this adds no new class of false merge; it only extends the same logic across a name and an address.

**R9-2. A weak group is shown in the table as one person, labelled, when it has exactly two members and no other linked person.**
- Loss class: the hedge-versus-headline policy of R7-4 (D1 criterion 2 for the weak case in general).
- Rule: for a weak group of two members, the default table prints one row for the pair with a marker ("2 identities, unconfirmed"), the unmerged figures on a second line, and the skill leads with the merged row while stating that it is a guess. Groups of three or more members, and weak additions, keep the R8-5 behaviour.
- Expected effect: D1-style cases pass without relying on R9-1. This is what base did in its single 5/5 run.
- Risk: this reverses part of R7-4. R7-4 was written after a seen-set diagnosis in which a merge guess was wrong or hedged; I did not find the fixture list that motivated it. Before freezing, run a deterministic check (no model): on every fixture of public, C and D, list every weak two-member group and whether the task truth merges it. Freeze R9-2 only if no seen truth separates a weak pair that this rule would merge. If one does, drop R9-2 and rely on R9-1.

**R9-3. Report every same-address merge, in every view.**
- Loss class: silent merge reported as "no duplicates" (D2 criterion 3, 3 of 3 runs).
- Rule: when one address appears under more than one author name in the blamed lines, print one scope line in every view next to the `.mailmap` line: "one address, several names, counted as one: <label> also appears as <other names> (N lines)". Skill rule: name these in the answer and never write "no duplicates" while that line is printed. The `--identities` view already computes the data (`sameAddressNames`, `bin/surviving-lines.js:3374`).
- Expected effect: D2 criterion 3 passes (the 1.8% row is already correct; the answer only has to say it and show it).
- Risk: one extra scope line, with a length cap (names listed up to five).

**R9-4. The table shows the whole named tail, not a fixed top 10, and the skill asks for it on "which people" questions.**
- Loss class: truncation of the people list (D2 criterion 4, 3 of 3 runs).
- Rule: the default `--top` becomes "every author with at least 1% of the lines, at least 10 rows, at most 25 rows", followed by one tail line: "N more authors hold X% together; largest: <name> Y%". An explicit `--top` keeps its meaning. Skill rule: for a question that asks which people wrote the code, list every row shown and state the tail line.
- Expected effect: Lena Voss (1.09%) is above the 1% cut and appears. Also adds the "Last commit" date column (section 4, activity technique) so the answer can say who is recent.
- Risk: the 1% threshold is a round number; the D2 author sits just above it, so the effect on D2 depends on that. Say so when freezing, and do not tune the threshold on D2. Longer output costs more tokens on large repositories; the cap at 25 limits it.

**R9-5. The prompt hint matches intent, not a narrow phrase list.**
- Loss class: hint silent on natural phrasing (6 of 6 ours D runs; verified by running the hook on the D1 and D2 prompts: no output).
- Rule: extend the pattern list in `hooks/surviving-lines-hint.sh:14-36` with ownership phrasings that do not start with "who": "who actually wrote", "which people", "which authors", "still alive", "still in (this|the) (repo|code)", "ranked list", "losing (one|two|a few) (people|developers)", "concentrated", "taking over", "reviewing prs". Keep the 1,200-character context cap and the read-only guarantees.
- Expected effect: the hint lists same-person groups (including the same-address group, `hooks/surviving-lines-hint.sh:78`) before the model answers, on the prompts where we lost.
- Risk: more false triggers. The hint is read-only and capped, and silent when the repository is large, so the cost is small. Review the list against the public tasks so no phrase is copied from a task prompt; the phrases above are common wording, but "ranked list" and "taking over" appear in D1 and D2, so the controller should drop any phrase it considers too close to the seen prompts.

**R9-6. Say that trailer credit is not attributed to lines.**
- Loss class: the squash-merge case (D2 criterion 4 alternative path).
- Rule: skill rule only: when the default view is used, say that `Co-authored-by` trailer names carry no lines unless `--co-authors share` is used.
- Expected effect: removes any risk that a trailer-only name is credited; it does not make Lena appear, so it is not sufficient alone.
- Risk: none beyond a sentence of text.

**R9-7 (low priority, not driven by D). Deep copy detection and reverted code.**
- Loss class: C3 gap named in the r8 report (deep copy detection restoring authorship from reverted code). After R8-1 the default is plain `-C`, and D1 criterion 4 (Priya Nair, reverted code) passed in all 3 ours runs, so the default path is not affected. The gap remains for `--copies deep`.
- Rule: when `--copies deep` is used, print a scope line: "deep copy detection can credit lines to a commit that was later reverted; compare with the default (-C)". No effect on the default figures.
- Expected effect: honest scope text only. No measured score effect.
- Risk: none. The controller may leave it out for this round.

### Dependencies and test order

- R9-1 and R9-2 are alternatives for the same loss; R9-1 is the safer one. R9-3, R9-4 and R9-6 are independent of them.
- Expected score effect if all of R9-1, R9-3 and R9-4 work as described: D1 5 of 5 and D2 5 of 5 on the criteria we lost. The rivals' best means are 3.67 and 4.33, so ours would be strictly higher on both. This is an expectation from reading the failed criteria, not a measurement; criteria 1, 2 and 5 on D2 and 1, 3 and 4 on D1 already pass in our runs.
- Development gate (spec step 6): D is now a seen set and is the development set. After the code change, run ours x3 on D1 to D5 with the same grading and compare with the best rival's published scores above (D1 3.67, D2 4.33, D3 0.33, D4 2.00, D5 3.00). Ours must be strictly higher on every task, or at the ceiling together with the rival. Before a new held-out set is opened, also rerun the public cells at risk (T1, E4h, E5, E3) because R9-4 changes the default table shape.
