# Deep research, 2026-10-22 (loss analysis, competitor code, open-source techniques)

Written before any code change of the "deep" round. Method: three Sonnet research agents (`claude -p`, read-only tools; no competitor code was executed; Vaara was not touched). Their full outputs are Appendices A to C below, unedited except for a heading level. Every claim marked "unverified" in an appendix is unverified; this summary repeats only what the appendices support. Cost of the research: about 2.52 USD.

## 1. Phase 1 summary: why the final gate was lost

Old held-out set H1 to H3 (seen, so diagnosis only). Scores: ours 2.00 / 0.00 / 1.00, best rival 5.00 / 4.00 / 3.00. Table of causes (details with file:line in Appendix A):

| Task | Winner | What the winner did | What ours did | Root cause |
| --- | --- | --- | --- | --- |
| H1 bus factor, `lib/` | pp, ppi, hist, bf 5.00 each (base 4.33) | Hand-run `git blame -w -M -C` with both formatting commits ignored; dropped the generated bundle and the vendored copy and said so; merged the three identities of one person by reading names and emails | Headline counted the vendored copy and its committer; 5,032-line denominator; the second identity pair not merged | Product: vendored/generated not dropped (R1); identity pair differing in name and address not offered |
| H2 bus factor, whole repo | hist 4.00, pp 4.00 | Same hand method; excluded `vendor/`, `dist/`, lockfile; merged the three identities of one person; stated the effect of the whitespace commit | Vendored copy ranked second; the lockfile and bundle not discussed; bus factor only at 50%, the criterion wants 50% and 80% | Product: R1; accent-different name plus other address not offered; only one bus factor threshold printed |
| H3 reviewers for a file whose code was moved | pp 3.00 (5/0/4), ppi/bf 2.00, base 1.33, hist 0.00 | Hand-run `git blame -w -M -C` that follows the cut-and-paste to the original file; ranked the original author first; said plain log/blame on the new path misleads | Marta (who moved it) ranked first with 85.6% of lines; said "blame follows the file through the rename" | Product: default `-w -M` does not follow moved blocks (R3); the output did not say where lines came from |

Public set: round 5 ours 50.67 of 51. Ties and losses that still teach: the T3 one-address `.mailmap` line (fixed in round 5), phrasing that put an excluded figure next to the table (R1 grading noise). The public fixture contains none of the three failing classes, so the public result does not predict held-out results.

Three facts the agents found that change the design:

1. **The rivals did not win with their tools.** project-pilot was loaded but never invoked in the H1 and H3 runs (it is Markdown prompts; its only scripts detect package managers). hist and bf mostly lost points when their tool output was used and gained them when Sonnet ignored it and ran `git blame -w -M -C --ignore-rev` by hand. The bar to beat is a careful model with plain git. Our advantage must therefore be correct headline numbers that need no manual repair, plus plain statements of what was left out and why.
2. **Our draft (uncommitted, from the stopped session) already fixes the three classes in tool output.** Run on the old held-out fixtures it prints John Gee 89.2% (truth 89.3%) with the bundle and vendored copy listed as dropped (H1), drops the bundle, vendored copy and lockfile (H2), and ranks the original author first at 35.1% and Glen Mailer second at 25.2% (H3). No code of the old held-out set is in the product.
3. **Gaps left in the draft output**, from the criteria: (a) the reviewers and history views do not say that lines came from another path (H3 criterion 3), and the history sentence "made the first commit ... holds the most lines now (0 lines)" is wrong when the first committer owns nothing; (b) only the 50% bus factor is printed (H2 criterion 5 needs the 80% count as well); (c) "Ulises Gascón" and "Ulises Gascon" differ only by an accent and are not offered as one person by an explicit rule (they appear only because the name is contained in the address); (d) the skill text does not tell the agent to show the merged figure next to the unmerged one when a suggestion exists, which is what graders accepted.

## 2. The five most important techniques

| # | Technique | Source and licence | Class | Decision |
| --- | --- | --- | --- | --- |
| 1 | Drop lockfiles, vendored directories, generated files (header markers, `.min.*`, `.map`) and honour `linguist-vendored`/`linguist-generated`/`-linguist-*` in `.gitattributes`; always print what was dropped | GitHub linguist `vendor.yml`, `generated.rb`, `overrides.md` (MIT); scc default excludes (MIT); busfactor `ownership.mjs:39-47` (MIT) | vendored, lockfile, generated | Adopt (already in the draft, list extended) |
| 2 | `git blame -w -M -C -C` by default with a size gate and a printed note when off | git-blame docs; git-fame flag set (MPL-2.0, flags are not code); pp `agents/git-archaeologist.md:21` uses `-C -C -C` (MIT) | moved or copied code | Adopt (draft); reject `-C -C -C` as a default (any commit: slowest) |
| 3 | Identity suggestions with printed evidence, never an automatic merge: name contained in address, equal address names, equal GitHub numeric id, initial form; add "equal after removing accents" and "`ID+user@` equals `user@` in noreply addresses" | gambit paper arXiv 2103.05666 (code AGPL-3.0: ideas only); Mockus 2026 arXiv 2607.06920 ("the central problem is over-merge"); GitHub noreply docs | split identities | Adopt as suggestion tiers; reject transitive fuzzy closure, Levenshtein tier, LSA, GitHub API lookups |
| 4 | Tell the reader where lines came from: per blamed path, lines whose origin (`filename` in `--line-porcelain`) is another path | git blame porcelain format; our own design (no competitor does it) | moved code (explanation) | Adopt (new) |
| 5 | Report both concentration thresholds (fewest authors for 50% and for 80% of lines); keep "orphaned authors" as a separate fact where already shown | busfactor `SKILL.md:15-26` (separate verdicts, MIT, style only); hist `core.py:1053-1068` (MIT) | bus factor wording | Adopt the 80% line; reject commit-count and time-decay bus factor (the criteria forbid commit-based) |

Also worth keeping from hist/bf (MIT, style only): actionable error strings, the "inferred, not authoritative" caveat. Rejected: GitHub API identity merge (network), writing `.github/CODEOWNERS` into the target (read-only tool), skipping whole commits by bot, `.mailmap`-only identity (the held-out repos have none), commit-weighted ownership, change coupling as a reviewer signal, Co-authored-by credit, per-file `-C -C` time budget (untested here; idea only).

No code from these projects is copied. Lists of file names and path patterns are facts, but their source is credited in `THIRD-PARTY-NOTICES.md` when the code lands.

## 3. Hugging Face and arXiv

One search found nothing on Hugging Face for identity disambiguation, ownership, truck factor or vendored-code detection (not exhaustively checked: huggingface.co was not browsed). arXiv: gambit (2103.05666, rules and F1 0.985 on one project), Mockus 2026 (2607.06920, over-merge lesson), Avelino et al. truck factor (1604.06766, aliases are manual in the reference tool). Code-stylometry authorship models solve a different problem and are rejected.

## 4. Limits of this research

Agent A did not open `run.jsonl` transcripts and inferred some per-criterion results for ours (marked "inferred" in Appendix A). Agent B did not read the tests of the three competitors and did not read grader output for hist H2. Agent C could not open several pages (listed in Appendix C) and its `git --version` check did not run. git-fame's licence text was not opened by agent B; the scan opened `LICENCE` and found MPL-2.0 (treated as ideas only either way).


---

## Appendix A. Loss analysis and project-pilot


Scope note. I read: criteria for t1-t3, `RESULTS.md`, run 1 `final.txt` of ours (H1-H3), pp H1/H3, hist H2, and the grader output for H2-1. I did not open the `run.jsonl` transcripts or hv/hfix/t0 (budget: $1.30 total). Tool-output claims for ours come from the "COMMANDS RUN" lists and answer text in `final.txt`, not from raw tool output. Ours' H1/H3 per-criterion pass/fail is inferred from the criteria and the answer text (the grader outputs for those cells were not read), and is marked "inferred". Runs 2 and 3 were not read; the per-run scores (2/2/2, 0/0/0, 1/1/1) show the same failure each time.
Paths: G = `<sl-gate>`; runs = `G/out-sonnet/runs/<TASK>-<arm>-<n>/final.txt`; criteria = `G/heldout-src/heldout/t{1,2,3}/criteria.md`.

#### Part 1. Loss table

Scores (outcome criteria, mean of 3): `G/out-sonnet/grade/RESULTS.md:5-8`.

| Task | ours | best | pp | hist | bf | base |
|---|---|---|---|---|---|---|
| H1 (5) | 2.00 | 5.00 (pp, ppi, hist, bf) | 5.00 | 5.00 | 5.00 | 4.33 |
| H2 (5) | 0.00 | 4.00 (pp, hist) | 4.00 | 4.00 | 2.33 | 2.67 |
| H3 (5) | 1.00 | 3.00 (pp) | 3.00 | 0.00 | 2.00 | 1.33 |

### (a) Held-out H1-H3

| Task | Who won, by how much | What the winner did | What ours did and which tool output misled it | Root cause |
|---|---|---|---|---|
| **H1** (bus factor, `lib/`, commander) | pp, ppi, hist, bf 5/5 each run; base 4.33; ours 2/5. Ours failed criteria 1, 2, 4 (inferred): John Gee 80.3% vs truth 89.3% (needs ±2); Dana Importer in the owner table; Wee Bit not merged. Passed 3 (Pat Prettier excluded) and 5 (bus factor 1). | pp (`H1-pp-1/final.txt:8-12`): hand-run `git blame -w -M -C --ignore-revs-file` with `c48d035` and `5e995a2` ignored, per file. Dropped `lib/generated/typings.bundle.js` (3601 lines) and `lib/vendor/leven/index.js` (721) as generated/vendored (`:23-27`). Merged identities by hand from the blame name/email pairs, including the three Wee Bit identities (`:30-31`) and `TJ`/`Tj`. Table over 4310 hand-written lines, John Gee 3850 = 89.3% (`:36-44`). Said bus factor = 1. | Ran `$SL -- lib`, `--merge-identities`, `--identities` (`H1-ours-1/final.txt:8`). Headline listed Dana Importer 722 (14.3%) as an owner and used a 5,032-line denominator (`:18-26`). Vendor/generated were handled only in a second run with `--exclude` (`:12`), shown as a side note (`:30`). Wee Bit and aweebit shown as separate rows: "the tool's in-memory merge did not combine these" (`:42`). John Gee 4,039 vs pp's 3,850: ours is 189 lines higher. Cause not verified. A guess is that ours did not ignore the second formatting commit (`5e995a2`) that pp ignored. | Product bug + missing feature. (1) Vendored copy and generated file counted in the headline (R1). (2) `--merge-identities` did not join a chain: same name with two emails, plus one other name with one of those emails. That is a bug in the current linking code, not only the "both differ" tier. (3) The right fix was a secondary note, but the grader scored the headline. |
| **H2** (bus factor, whole repo, morgan) | hist 4.00 (4/4/4), pp 4.00 (4/5/3). Ours 0/5 in all 3 runs. All 5 criteria failed in run 1 (G `grade/H2-1.call1.out`, cell A = ours by `grade/H2-1.labels.json`... see note below). | hist (`H2-hist-1/final.txt:24-47`): blame `-w -M -C --ignore-rev f4ce92f` on 21 files, with `vendor/`, `dist/`, `package-lock` and fixtures filtered out of the file list (own.sh, `:13-17`). Said the four-space commit gives Tab Lover about 0 (`:28`). Merged the three Ulises identities (649 lines, 14.3%) and said so (`:49`). Wilson 61.7%. Gave bus factor "1" but by an activity definition (active owners), which the grader marked down on crit 5 in some cells. | Ran default, `--merge-identities`, `--identities` (`H2-ours-1/final.txt:8`). Table: Wilson 49.7% with Dana Importer 16.1% (vendored `on-finished`, 881 lines) as second owner. 3,047 `dist` lines left out only because the bot author is excluded, not because of the path. Lockfile not discussed. Bus factor "2" at 50%, then "1" after a manual `--exclude 'vendor/**'` (`:31-33`). No 80% figure. `--merge-identities` printed "none found" although `--identities` listed the same-email pair (`:40`). Ulises merge was the agent's own sum, hedged. Never mentioned the four-space commit, so Tab Lover did not appear, but the answer gave no statement for crit 2. | Product bug + missing feature + grader-defined metric. (1) Vendored copy as owner (R1). (2) `--merge-identities` reported none for a same-email pair that `--identities` lists. This is an inconsistency between the two code paths (`bin/surviving-lines.js:1793-1804` build `linked`). It needs a test. (3) The tool gives only one threshold (50%). Crit 5 wants both ">50%" and ">=80%" counts. |
| **H3** (reviewers, `lib/internal/helpers.js`, compression) | pp 3.00 (5/0/4); ppi 2.00; bf 2.00; base 1.33; hist 0.00; ours 1.00 (1/1/1). Ours passed only crit 4 (inferred). | pp H3-1 (`H3-pp-1/final.txt:7-9`): `git log --follow` plus plain blame first, saw Tab Lover 56 and Marta 42 (misleading), then `git blame -w -M -C --line-porcelain`, which follows the cut-and-paste back to `index.js`. Doug 39, Glen 28 (glenjamin merged by hand), maritz 14 (`:21-28`). Reviewers: Doug, glenjamin; skip Marta/Tab/Mass Renamer (`:30-35`). | Ran `--reviewers lib/internal/helpers.js` and `--history ...` (`H3-ours-1/final.txt:8`). Output used: Marta Mover 95 of 111 lines (85.6%), glenjamin 16 (14.4%), Mass Renamer 0 lines. Answer: "Marta Mover first, glenjamin second" (`:10`). Glen Mailer linked to glenjamin only as a guess. It told the reader that "Blame follows the file through the rename" (`:15`), which hides that the code was cut out of `index.js`. | Product bug (R3). Default `-w -M` does not follow code across files for a pasted block. Marta's 95 lines are the moved glue plus copied code. With `-C` (pp's flag) she drops to 13. Also: the agent trusted the tool's ranking and did not run its own `-C`. |

Note on the H2-1 label map: I did not read `H2-1.labels.json`. The grader cell I read (A) matches ours' answer (Wilson 49.7%, Dana counted), so A = ours there.

Why pp got H3 5/0/4: variance. Run 2 scored 0, so pp's win is not robust. The 0 cell was not examined.

Grader noise. Low. Criteria are mostly numeric (shares within 2-3 points, named people), so the failures on H1/H2/H3 are real. The two judgment points are: (i) crit 5 on H2 (what "bus factor" means), where only the answer that gave both 50% and 80% counts passes. Ours could not pass this. (ii) crit 4 on H2: the grader accepted hedged merges ("very likely the same person", hist `:49`; ppi/hist/bf all passed). Under Round 6 ruling R2 ours will never merge the name-only link in its headline (`HEAD-TO-HEAD.md:701`), while rivals merge it with a hedge and pass. **Tension:** R2 as written cannot pass a criterion that asks for a merge, unless the answer writes the `.mailmap` itself or the tool offers a clearly labelled "if confirmed" merged row beside the unmerged one.

### (b) Public set, rounds 1-5

Round 5 (current tool): ours 50.67/51. Only T1 shows a missing point (3.67/4). T1i tied base at the maximum 4 (`HEAD-TO-HEAD.md:603-621`). Earlier rounds that still teach something:

| Round / task | Result | Winner behaviour | Ours | Root cause |
|---|---|---|---|---|
| R3-R4 T3 (duplicate identities) | R3 ours 4.00 = base 4.00; R4 4.33 = base 4.33 (`:510,553`) | Base wrote a `.mailmap` itself from `git shortlog` | Skill not used in 2 of 3 R3 runs, so no hedge. Later (R3 `:496`) ours asked before writing `.mailmap`, and the scripted check wanted the file | Prompt/skill description (R3 `:433`), then criterion design. Fixed by R5 two-address `.mailmap` line in hint (`:623`) |
| R2/R3 T1, T1i, E3, E5 | Missed range criteria (`:352-355`) | | Showed unmerged figure first and merged figure as "if one person"; reformatter's 291 lines shown in a table; `--group-by` did not apply the reformat correction | Product feature gap (group-by correction) and presentation. Same shape as H1/H2 failure: the headline carried the unmerged number |
| R1 T1 run 3, crit 3 | 3 of 3 votes against | | Stated "counting it would give Fiona Formatter 291 lines" (`:497`); grader read it as crediting her | Grader noise / phrasing. Tied to the H1 case: the answer should not put the excluded figure next to the table |
| R3 E2k run 3 | Lost point | | Listed only Troy Goode, omitted Vansh Sharma (`:498`) | Prompt/skill issue |
| R5 T1 (3.67) | One lost criterion, reason not read | | | Unknown (`results/round5-claude-sonnet-5-5` has only `MANIFEST.txt`) |

Lesson from the public set: ours wins when the fixture matches the cases the tool handles (formatter commit, `.mailmap` line). The gate failed on three cases the public set did not contain.

#### Part 2. project-pilot (pp) deep read

Source: `G/src/pp` (version 1.0.0, `.claude-plugin/plugin.json:4`; MIT, `LICENSE`, 1083 bytes). Upstream: README says "bukoo93/project-pilot" (`README.md:377`). I fetched `https://github.com/bukoo93/project-pilot`: it exists, MIT, 10 commits, 12 analysis tools (verified by WebFetch; commit SHA not shown on the page, so bf6eabe is unverified against upstream). I did not open the copy at `G/src/pp/.git` (it has none; `git remote` fails).

Files read in full: `plugin.json`, `hooks/hooks.json`, `commands/bus-factor.md`, `commands/history.md` (lines 25-44), `commands/dashboard.md` (50-75), `agents/contributor-analyzer.md`, `agents/git-archaeologist.md`, `skills/bus-factor/SKILL.md`, `skills/project-context/references/risk-scoring.md`. Grepped across all files (no whole-file read): the other 8 commands, 5 other agents, 11 other skills, `scripts/*.sh`, README. There are no tests and no catalogs in the tree (file list: 41 files, 125 KB).

What it is: Markdown prompts only. The only code is two shell scripts (`scripts/detect-package-manager.sh` runs at SessionStart, `hooks/hooks.json:9`; `check-outdated-deps.sh`). No parsing, no counting, no identity logic. Quality of the numbers depends on the model improvising.

**Important finding on the benchmark.** In the H1 and H3 pp runs the plugin was loaded but never invoked. `PLUGIN_SKILLS` lists its skills but `SKILLS: none`, and `COMMANDS RUN` contains only Bash/Read, no Skill call (`H1-pp-1/final.txt:3-8`, `H3-pp-1/final.txt:3-9`). This repeats the round-1 note that pp "behaved like plain Claude" (`HEAD-TO-HEAD.md:259`). So pp's wins are plain-model wins. What the models did: hand-run `git blame -w -M -C` (+ `--ignore-revs-file`), merge identities by reading, drop vendor/generated by judgment. This is the bar ours must beat: a model that checks the repo first and fixes the three pitfalls by hand. Those wins come from freedom to decide scope, not from pp's content.

### How pp handles each situation

| Situation | pp | Evidence | Verdict |
|---|---|---|---|
| Vendored files | Exclude by path only in file discovery: `-not -path "*/vendor/*"`, also node_modules, dist, build, `__pycache__`. Not `third_party`, not `*.min.*`, not content markers. Applies to the bus-factor file list and debt scanner. | `commands/bus-factor.md:23`, `agents/debt-scanner.md:22,39` | Weaker than R1. Never reported to the user. |
| Lockfiles | Not excluded. Source extension list (ts, js, py...) means `package-lock.json` (JSON) and `yarn.lock` are never listed anyway. Lockfile names appear only for package manager detection. | `commands/bus-factor.md:23`, `scripts/detect-package-manager.sh:15-17,32-33` | Accidental. Do not copy. |
| Identity merging | None. Counts by `%an` only (author name), so the same person with two names counts twice. No `.mailmap`, no email. | `commands/bus-factor.md:29-32`, `agents/contributor-analyzer.md:16,31,56` | Absent. Ours is far ahead. |
| Moved code | `git blame -w -C -C -C` (three `-C`) in history, and `git log --follow`. Not used for bus factor, which uses `git log` per file. | `agents/git-archaeologist.md:21`, `commands/history.md:34`, `skills/history/SKILL.md:32`, `README.md:112` | `-C -C -C` is the broadest copy detection (also searches unmodified files in any commit). Matches or exceeds R3. Costly on large repos. |
| Formatting/reindent commits | Only `-w`. No `--ignore-revs-file`, no `.git-blame-ignore-revs`. | same lines | Absent. The winning pp runs did this by hand. |
| Bots | Not handled. | grep `bot` finds nothing outside dependabot | Absent. |
| Bus factor definition | Per file: bus factor 1 if 1 contributor or the top contributor has >80% of **commits**. Project: fewest people whose departure leaves >50% of **files** without a maintainer. Commit-count based, file-count based. Plus activity (last 90 days) and import-count importance. | `agents/contributor-analyzer.md:59-67`, `commands/bus-factor.md:26-53,68` | Differs from the criteria (line shares, >50% and >=80% of lines). Criteria say FAIL if "derived from commits" (t2 crit 5). pp's own recipe would fail; its runs passed because the model ignored it. |
| Phrasing | Report template with emoji headings, Korean option (`--lang ko`), tables, heat map, risk badges `[CRITICAL]`. Dashboard weights bus factor 20% (BF>=3 → 20, 2 → 12, 1 → 5). | `commands/bus-factor.md:60-126`, `commands/dashboard.md:69-72` | Wording is not what won. |
| Sampling | "or sample if >500 files" with no sampling rule. | `commands/bus-factor.md:26` | Not copyable. |

### Techniques worth adopting (MIT allows code adoption with attribution; pp has almost no code, so these are ideas)

| Technique | Source | Why |
|---|---|---|
| `git blame -w -C -C -C` as an opt-in `--deep-copies` | `agents/git-archaeologist.md:21` | Finds code copied from unmodified files of other commits, which `-C -C` misses. Use only under the 2000-file limit; R3 already covers the default. |
| Importance cross-check (how many files reference this file) next to ownership | `commands/bus-factor.md:45-53` | Gives the reader which single-owner file matters. Cheap grep. Optional; no criterion needs it. |
| Owner-active flag (committed in the last 90 days) | `commands/bus-factor.md:42`, `contributor-analyzer.md:77` | hist scored 4/5 on H2 partly by pointing out that 76% of lines belong to inactive authors (`H2-hist-1/final.txt:44`). Ours has this for reviewers only (`H3-ours-1/final.txt:14`). Add "active owner share" to the bus-factor view. |
| Two-threshold bus factor (>50% and >=80%) | not in pp; from criteria | Needed for H2 crit 5. Print both. |
| Narrative framing of "why raw history misleads" | pp H3 answer (`H3-pp-1/final.txt:13-19`), not pp's files | Tell the reader that plain `git log`/blame on the path would credit the mover, and say which commit moved it. H3 crit 3 asks for this. |

### Not worth adopting

| Technique | Reason |
|---|---|
| Commit-count bus factor (>80% of commits per file) | Contradicts the criteria (FAIL if derived from commits) and the tool's line-based definition. |
| Author-name-only identity (`%an`) | Splits people with several emails. |
| `*/vendor/*` path filter as the whole policy | Weaker than R1 and silent. |
| Project-level "files with no maintainer" definition | Not line-based; would give different numbers than the grader truth. |
| Haiku sub-agents, health score, risk-score formula (`risk-scoring.md:8-63`), dashboard, Korean output, sprint/ADR/release-note commands | Out of scope; the formula has no empirical basis (arbitrary multipliers). |
| Importing the plugin's skills as a trigger design | pp's skills were not triggered at all in the pp H1/H3 runs, so there is no evidence the keyword-description style helps. |

### Actions for the draft (from the evidence above, for the owner)

1. Test `--merge-identities` on the chain case (name A+email1, name A+email2, name B+email1). H1 (Wee Bit) and H2 (Ulises "none found" while `--identities` lists a pair) both failed here. If that is a bug it is separate from the R2 tier.
2. Check the draft handles a second formatting commit without `.git-blame-ignore-revs` (H1 John Gee +189 lines vs truth). I did not verify this.
3. Print bus factor at >50% and >=80%, and active owner share, in the default view.
4. R2 tension: the grader wants a merged figure with a hedge; "never merge" loses that criterion. Consider a labelled "if confirmed" merged row.
5. For `--reviewers`/`--history`, when the top author's lines come from a path other than the one asked about, say that the code was moved and from where (H3 crit 3).

---

## Appendix B. mcp-git-historian, busfactor, git-fame


Scope: deep read of three competitors, then diagnosis of hist and bf on held-out H1-H3, then adopt/reject list.
No competitor code was executed. Source paths are under `/tmp/sl-deep/`.

### 0. Provenance and limits

| Item | Value |
|---|---|
| mcp-git-historian | cloned `--depth 1` from `https://github.com/AleBrito124356/mcp-git-historian`. `.git/refs/heads/main` = `bb2e209c7d8a7163cd2a156d0abb332e4a90a753` (the pin). MIT (`LICENSE:1-3`). URL verified by successful clone, not WebFetch. |
| k41n/busfactor | cloned `--depth 1` from `https://github.com/k41n/busfactor`. `.git/refs/heads/main` = `d898d8db4346160b0a6ef253b96d60712704fe9f` (the pin). MIT (`LICENSE:1-3`). URL verified by clone only. |
| git-fame | cloned `--depth 1` from `https://github.com/casperdcl/git-fame`, latest default branch. Licence file is `LICENCE`. Task says MPL-2.0; I did not open the licence text, so MPL-2.0 is **unverified by me**. Treat as ideas only. |
| Not read end to end | The `tests/` files of all three, `README.md`/`CHANGELOG.md` of hist (only grepped), git-fame `README.rst`, hist `report.py`/`cli.py` (not needed for ranking). `core.py` (hist), `ownership.mjs` + `SKILL.md` (bf) and the option/blame code of `_gitfame.py` were read fully or in the relevant ranges. Budget ran out before the rest. |
| Competitor behaviour | Inferred from reading code and from the old transcripts. Never run. |

### 1. Summary

1. Neither hist nor bf computes the correct answer on the tasks in this benchmark. Both rank by something other than "surviving lines after ignoring formatting and moves":
   - hist's blame is plain `git blame --incremental` (`core.py:415`). No `-w`, `-M`, `-C`, no ignore-revs, no generated/vendor filter.
   - bf's score is a time-decayed **count of commits touching a file**, not lines (`ownership.mjs:166-183`).
2. Their held-out scores came mostly from **Sonnet ignoring or overriding the tool** and running `git blame -w -M -C --ignore-rev ...` itself. In H1 the hist arm never called a hist tool (§3). The tools' own output was called "misleading" by the model in H2 (hist-1, hist-3).
3. H3 (moved code) is where the tool, not the model, decided the result. hist used `blame_summary`/`file_history` (plain blame, path-scoped log) and got 0/0/0. bf (skill not invoked in run 1) fell back to hand `blame -w -M -C -C`, which sometimes reached Doug, and got 3/0/3.
4. What is worth taking: bf's **SKILL.md guidance style** (explicit hard rules, separate verdicts, caveats on thin history), its **path/bot pattern list**, hist's **explicit error messages and read-only guard config** (`_GIT_CONFIG`), and git-fame's **flag set** (`-w -M -C -C`, `--ignore-rev(s-file)`, `--ignore-author` turned into revs). Nothing needs code copying beyond small regex lists.

### 2. How each tool works

### 2.1 mcp-git-historian (Python, MCP server, MIT)

| Question | Answer | Evidence |
|---|---|---|
| Owner ranking | `blame_summary`: lines per `%aN`-style author from `git blame --incremental HEAD -- file`, percent of lines. `knowledge_risk`: blames up to `max_files` (default 200) tracked text files, ranks files by `inactive_percent` then top owner lines, plus per-author line rollup. | `core.py:410-443`, `633-665`, `996-1143` |
| Bus factor | **Commit-based**: smallest number of authors whose non-merge commits cover >50% of all commits. Silo = one author >80% of a directory's commits, ≥3 commits. | `core.py:668-749` (loop at 698-705) |
| Orphan | Authors with no commit since `inactive_after` (default "6 months ago") own >50% of file lines. | `core.py:49`, `1053-1068` |
| Identities | `.mailmap` only. `%aN` in log; blame's `author` line is already mailmapped by git. No name/email similarity, no noreply handling. `.mailmap` is stated as the single mechanism. | `core.py:42, 477`, `README.md:41`, `server.py:52` |
| Vendored / generated / lockfile | **None** in ranking code. Only mention is a change-coupling noise filter: commits touching >30 files are skipped (`max_files_per_commit`). `_text_files` skips only binary (`i/-text`) and empty files. | `core.py:976-988`, `863-954`, `server.py:211-212` |
| Bots | **None.** No bot detection anywhere. Bots appear as owners unless the repo's `.mailmap` hides them. | grep for `bot` in `core.py`: no match in logic |
| Merge commits | Excluded from authorship/churn (`--no-merges`); still count for "is this author still around". | `core.py:17-18, 540, 678, 957-973` |
| Moved/copied code (-M/-C) | Blame has **no** `-M`/`-C`/`-w`. Rename tracking exists only for log-based tools (`_RenameTracker`, `log -M --numstat`, `--follow` for `file_history`). | `core.py:363-379, 415` |
| Shallow clones | Not detected. No warning. | no `shallow` in code |
| Huge repos | Per-call timeout 30 s (`GIT_HISTORIAN_TIMEOUT`); `knowledge_risk` blames only the `max_files` most frequently changed files and sets `truncated`; 8 blame threads. | `core.py:36, 1035-1050, 1127-1135` |
| Weighting | None. No time decay, no degree-of-authorship. | - |
| Guidance text to the agent | `INSTRUCTIONS` string, 14 lines, generic: "Start with repo_summary, then hotspots ..., bus_factor / knowledge_risk (who knows what, and what is orphaned)". "Author names are .mailmap-resolved; merge commits are excluded". No rule about formatting commits, vendored code, moved code or identity merging. | `server.py:41-56` (decisive lines 47-53) |

Points specific to H1-H3:
- The tool descriptions steer the model to `blame_summary` for "who wrote this file". That output is plain blame (`core.py:415`).
- `file_history` uses `log --follow` for one path. Copy/move out of another file is invisible: the history of `lib/internal/helpers.js` starts with the move commit.

### 2.2 k41n/busfactor (Node, Claude skill, MIT)

| Question | Answer | Evidence |
|---|---|---|
| Owner ranking | One `git log --no-merges --find-renames --name-status` pass. Each commit adds `0.5^(age_days/half_life)` (half-life 365 d) to **every file it touches**. This is commits, not lines. | `ownership.mjs:114-121, 155-192` |
| Bus factor / orphan | Per directory zone: bus factor = fewest *active* authors reaching 50% of active weight; orphaned = active share < 0.25. Active = committed within 12 months of the newest commit. | `ownership.mjs:250-274`, `DEFAULTS` 24-33 |
| Identities | Raw `%ae`, lowercased, `%an` (**no mailmap**). Merges only emails that `gh api repos/<slug>/commits/<sha>` resolves to the same GitHub login; cache in `~/.cache/codeowners/authors.json`. Unresolved emails are left separate and the skill tells the agent to ask the user once. `--no-github` disables all merging. No name/email similarity. | `ownership.mjs:120, 141, 357-402, 411-449`; `SKILL.md:55-64, 95-98` |
| Vendored / generated / lockfile | Path regex list: `node_modules, dist, build, out, coverage, .next, .nx, vendor, third_party`, lockfiles (npm, yarn, pnpm, composer, Cargo, Gemfile), `__snapshots__`, `.min.js/.map/.snap/.lock`, binary extensions, `generated/`, `__generated__/`, `*.generated.*`. | `ownership.mjs:39-47, 179` |
| Bots | Regex on email or name: `[bot]`, `dependabot`, `github-actions`, `renovate`, `noreply@github.com`. The whole commit is skipped. | `ownership.mjs:36, 107, 164` |
| Merge commits | `--no-merges`. | `ownership.mjs:117` |
| Moved/copied code | `-M` only through `--find-renames` for the log; renames are replayed newest to oldest so weight follows the file (alias map). **Copies/moves between files are not detected.** | `ownership.mjs:155-189`; `SKILL.md:91-93` |
| Shallow / imported history | `meta.shallowHistory` (<550 days) and `meta.bulkFirstCommit` (root commit touches >25% of tracked files); the skill says which wording to use and not to conflate them. | `ownership.mjs:587-599`; `SKILL.md:115-126` |
| Huge repos | One `git log` pass, no per-file git calls, 1 GB buffer. No limit or timeout. | `ownership.mjs:91-95`; `SKILL.md:87` |
| Weighting | Time decay (half-life 365 d). No DOA/lines. | `ownership.mjs:166-167` |
| Guidance text | `SKILL.md` has real rules. Decisive quotes below. | |

Decisive `SKILL.md` rules:
- `SKILL.md:22-26`: orphaned vs low bus factor "Always report the two separately. Never present an orphaned zone as merely 'low bus factor'."
- `SKILL.md:93-94`: "Merge commits, bots, lockfiles, build output, generated code and binary assets are excluded."
- `SKILL.md:95-98`: merge multiple emails of one GitHub account; "Under-reports risk, which is the one direction this tool must not err in."
- `SKILL.md:109-110`: "Never name an inactive person as an owner."
- `SKILL.md:128-133`: "The output is inferred, not authoritative ... A reviewer who never commits looks like a stranger; someone who ran a mechanical refactor across the tree looks like an expert."

The last quote names the refactor-credit problem but the code does nothing about it: whitespace and rename commits count fully (weight per file touched).

Other behaviour to note: the script **writes** `.github/CODEOWNERS` and `.github/ownership.json` into the target repo unless `--dry-run` (`ownership.mjs:626-628`).

### 2.3 git-fame (Python CLI, MPL-2.0 per task, ideas only)

Read: `gitfame/_gitfame.py` lines 1-70 (usage), 285-335, grep of the rest. Tests not read.

| Question | Answer | Evidence |
|---|---|---|
| Ranking | Default `--loc=surviving`: `git blame --line-porcelain` per file, group by author name/email, sort by loc. Alternatives: insertions/deletions via `log --numstat`; `--cost` (COCOMO/hours). | `_gitfame.py:14-35, 319-335` |
| File set | `ls-files` at the branch, regex `--incl`/`--excl`; **text files only** via `git grep -I`. No built-in vendored/generated/lockfile list: the user passes `--excl`. | `_gitfame.py:305-316`, usage 19-22 |
| Moves/whitespace | Optional `-w`, `-M`, `-C` (`-C` is passed as `-C -C`, "twice to include file creation"). All **off by default**. | `_gitfame.py:329-334`, usage 51-55 |
| Ignore revs | `--ignore-rev`, `--ignore-revs-file` passed to blame; `--ignore-author <regex>` is turned into revs with `git log --format=%H --author` then passed as `--ignore-rev`. This is its only bot handling. | `_gitfame.py:285-291, 321-324`, usage 56-62 |
| Identities | Whatever blame prints (mailmap applies through git); `--show name,email`; `--auth` credits `Co-authored-by` trailers (checked with `git check-mailmap`) and splits loc among them. | `_gitfame.py:268-281, 340-341, 377-379` |
| Huge repos | `--jobs` parallel blame threads; `--since/--until`. | usage 38 |
| Shallow clones | Not detected (from the lines I read). | - |

### 3. Why hist and bf scored what they did

Scores from `sl-gate/out-sonnet/grade/RESULTS.md:5-7` (points out of 5 per run, runs 1/2/3 in a blind order):

| Task | hist | bf |
|---|---|---|
| H1 | 5.00 (5/5/5) | 5.00 (5/5/5) |
| H2 | 4.00 (4/4/4) | 2.33 (3/3/1) |
| H3 | 0.00 (0/0/0) | 2.00 (3/0/3) |

### H1 (lib/, bus factor, three identities of one person): both 5.00

Truth wanted: John Gee 89.3%, Wee Bit three identities merged 3.7%, vendored leven and the bot bundle excluded, Prettier commit ignored, bus factor 1 (`heldout/t1/criteria.md:5-9`).

- hist-1 never called a hist tool. The transcript's commands are `ToolSearch`, then `git shortlog`, then `git blame -w -M -C --line-porcelain` per file, then `--ignore-revs-file` with `c48d035` (`runs/H1-hist-1/final.txt:7-12`). It excluded `lib/generated` and `lib/vendor` itself.
- bf-1 ran the skill (`final.txt:7`), saw the script's dry run "found no ownership zones, only a fallback owner" (`H1-bf-1/final.txt:20`) and fell back to the same hand blame with `--ignore-rev c48d035 --ignore-rev 5e995a2`.
- Cause of score: plain Claude behaviour plus a hand-written merge map (`<address redacted>` and `wee.bit@example.net` merged by guess, `H1-bf-1/final.txt:41`). Not the tools.

### H2 (whole repo, whitespace reindent, vendor, bot bundle, lockfile, Ulises under 3 identities)

- hist 4.00 (4/4/4): runs called `knowledge_risk` and `repo_summary`, then declared the output misleading ("`knowledge_risk` credits 'Tab Lover' with 28% of the lines", `H2-hist-3/final.txt:Why not the historian default`; hist-1 `final.txt:26-28` says dist shows dependabot[bot] at 36%). That matches code: plain blame, no `-w` (`core.py:415`), no dist/vendor filter (§2.1). The model then redid the analysis with `-w -M -C --ignore-rev f4ce92f`, excluded `vendor/`, `dist/`, merged Ulises by shared email. A uniform 4 means a stable missing criterion; I could not read the grader output to say which. Candidate: bus-factor wording (hist-1 reports "real bus factor 1: Ulises" computed on *active* owners, `final.txt:44-45`, while the criterion is the fewest people holding >50% of lines, which is Wilson alone, with ≥80% needing 2-3: `t2/criteria.md:10`). Unverified.
- bf 2.33 (3/3/1): the skill's script gave "only a fallback rule and one `/tests/` rule" in dry run (`H2-bf-1/final.txt:19`), so the model again hand-blamed. Differences against hist: bf-1 merged only 2 Ulises emails ("Ulises Gascón (2 emails)", `final.txt:25`), and `sed 's/ugascon@example.com/<address redacted>/'` is the only merge, while the third identity (`ulises`) is not mentioned. `t2/criteria.md:9` requires all three merged and 12.6/14.3% for rank 2. bf-2 reports Ulises "three identities", 14%. The 1 point run probably missed one of: merge, scope statement, or bus-factor numbers. Unverified without the grader output.
- The `SKILL.md` text did not force the correct method. It tells the agent to run the script and check `unresolved` (`SKILL.md:55-64`), which mislead the model toward a commit-weighted view that has nothing to say about lines.

### H3 (reviewers for a file whose code was moved out of index.js)

Truth: Doug 35.1% first (his lines were written in `index.js` before the move), Glen Mailer second (28 lines, identity merged), history must be traced through the move (`t3/criteria.md:5-8`).

- hist 0/0/0, all three runs: `file_history` + `blame_summary` + `change_coupling` (`H3-hist-1/final.txt:9-11`). `file_history` follows renames but the file begins at the move commit (`core.py:589-598`); `blame_summary` is plain blame (`core.py:415`) which gives Tab Lover 49% and Marta Mover 37% for lines she only moved. Runs 1 and 3 recommend Marta Mover first and glenjamin second; run 2 says "the best reviewer is an active maintainer who knows `index.js`". Doug never appears. This fails criteria 1 and 3 outright (`t3/criteria.md:5, 7`: "FAIL if the first reviewer is Marta Mover", "FAIL if the answer bases reviewers on git log of the path"). **Direct tool cause**: no `-C` in blame, tool descriptions point the model at `blame_summary`.
- bf 3/0/3: bf-1 did not invoke the skill (`SKILLS: none`, `H3-bf-1/final.txt:4`) and ran `git blame -w -M -C -C` itself; it reached Doug with 39 lines ("the most of any author", line 18) and merged glenjamin/Glen Mailer, but ranked glenjamin first, Ulises second, Doug fourth, and listed Marta as "skip". bf-3 used `-w -C -C -C`, explicitly says "Plain git log on this file is misleading", ranks glenjamin, then Doug (`H3-bf-3/final.txt:4-10`). bf-2's final message is a stub about a stopped background command (`H3-bf-2/final.txt:2-5`), which scored 0. So bf's H3 points came from the model's own `-C`, not from the busfactor script, whose commit-count model would credit Tab Lover and the renamer fully (`ownership.mjs:177-183`).

### Pattern across the three

| Cause | hist | bf |
|---|---|---|
| Tool output usable as is | no (plain blame; no filters; no bot rule) | no (commit-weighted; no mailmap; no merges of non-GitHub identities when `--no-github`) |
| Model saved the run by hand blame `-w -M -C` | H1, H2 | H1, H2, H3 |
| Tool misled the model | H3 (strongly), H2 (partly) | H2 (dry run found no zones, wasted a step) |
| Guidance text helped | no rules at all (`server.py:41-56`) | rules exist but target CODEOWNERS and active/inactive, not line ownership (`SKILL.md:93-98`) |

### 4. Techniques to adopt into surviving-lines

Code adoption allowed only for MIT/Apache/BSD/CC0 with attribution. hist and bf are MIT. git-fame: ideas only.

| # | Technique | Source | Licence | Cost | Generalisation risk | Verdict |
|---|---|---|---|---|---|---|
| 1 | Path pattern list for generated/vendored/lockfile/minified/snapshot files, one regex array, applied to blame input (not commit input) | bf `ownership.mjs:39-47` | MIT: copy regexes with attribution, or rewrite (a regex list has little protectable expression) | Very low | Medium-low: `build/`, `out/`, `dist/` can be hand-written source in some repos; `vendor/` is correct for Go/PHP/Ruby. Mitigation: also detect `@generated` header, "DO NOT EDIT", and a vendored `README`/licence header in the dir (see H1 `lib/vendor/README.md` read by hist-1) rather than directory names only; report excluded files with line counts, as the best answers did | **Adopt** (already in draft; extend with content signals) |
| 2 | Bot filter on name or email (`[bot]`, dependabot, renovate, github-actions, `noreply@github.com`) | bf `ownership.mjs:36, 107` | MIT | Very low | `noreply@github.com` alone also matches humans who squash-merge in the GitHub UI (committer, not author; bf applies it to author email). Keep bot list on author only and as exclusion of *lines blamed to the bot*, not of the whole commit | **Adopt**, with the caveat |
| 3 | `--ignore-rev` for formatting-only commits, found automatically: commits whose diff is empty under `git diff -w` or touches >N files with only whitespace change | git-fame flags (`_gitfame.py:321-324`), idea only. Detection method is our own | n/a (our code) | Medium (one `git diff -w --stat` per candidate commit) | Medium: false positives drop real authorship; limit to commits where `-w` diff is empty or whitespace/quote-only, and always list ignored commits. Already partly there via `.git-blame-ignore-revs` | **Adopt as suggestion**, never silent |
| 4 | `blame -w -M -C -C` and, for H3, a move-aware reviewer path: when `git log` of a path starts with a creation by commit X, run blame with `-C -C -C` and rank by blame, not by log | git-fame `_gitfame.py:329-334`; bf-3 transcript used `-C -C -C` | idea only (flags) | Medium: `-C -C -C` is slower on big repos | Low risk of wrong output, high of timeout; make it adaptive (time budget, fall back to `-M` with a notice) | **Adopt** (already in draft) |
| 5 | Show the effect of `-w -M -C` explicitly: print "lines credited to the move/reformat commit vs original author" | bf-1/hist-1 answers, not tool code | n/a | Low | Low; helps graders (criteria 3 and 4 in t1/t3 ask for this statement) | **Adopt** |
| 6 | Separate verdicts: "orphaned" (authors gone own the lines) vs "bus factor" (people needed for >50% of lines) | bf `SKILL.md:15-26`, hist `core.py:1053-1068` | MIT | Low | The benchmark's bus factor is the lines-based "fewest people holding >50%, and ≥80%" (`t1/criteria.md:9`); an active-only bus factor (hist-1 H2) was marked down or at best ambiguous. Report both with definitions | **Adopt**, definition-explicit |
| 7 | Skill text style: hard "never/always" rules, an "inferred, not authoritative" caveat, instruction to batch identity questions into one | bf `SKILL.md:22-26, 55-64, 128-133` | MIT | Very low | Low | **Adopt style**, rewrite wording |
| 8 | Shallow clone detection (`git rev-parse --is-shallow-repository`) and imported-history signal (root commit touches >25% of files) | bf `ownership.mjs:587-599`, `SKILL.md:115-126` | MIT | Very low | Low; the second signal tells the user that blame credits the importer. Relevant to H1-style "bulk commit" and to vendored-copy by a human (Dana Importer) | **Adopt** |
| 9 | Read-only guard: `-c core.quotepath=off -c log.showSignature=false -c color.ui=never -c i18n.logOutputEncoding=UTF-8`, `LC_ALL=C`, `GIT_OPTIONAL_LOCKS=0`, drop `GIT_DIR/GIT_WORK_TREE`, timeout with a message naming the env override | hist `core.py:53-62, 91-100, 130-135` | MIT | Very low | Low | **Adopt** |
| 10 | Actionable error strings (what the user should type next) | hist `core.py:74-88, 155-161` | MIT | Low | Low | **Adopt style** |
| 11 | `--ignore-author` as regex -> revs via `git log --author` | git-fame `_gitfame.py:285-291` | idea only | Low | Equivalent to our bot exclusion but applies to humans too; useful for "exclude mass-rename accounts" | Optional |
| 12 | Text-only file set via `git grep -I --name-only .` | git-fame `_gitfame.py:306-315` | idea only | Low | Skips binary correctly; hist's `ls-files --eol` (`core.py:976-988`) is equivalent and MIT | Pick one |
| 13 | `Co-authored-by` trailer credit, splitting loc among co-authors | git-fame `_gitfame.py:268-281, 340` | idea only | Medium | High: squash-merge trailers inflate; not needed by H1-H3 | Reject for now |

### 5. Techniques to reject

| Technique | Source | Why reject | Cost saved | Risk if copied |
|---|---|---|---|---|
| Commit-count or commit-weighted ownership (also for bus factor) | hist `core.py:698-705`; bf `ownership.mjs:166-183` | Rewards reformatters and movers; all three held-out criteria say bus factor must be line-based (`t1/criteria.md:9`: "FAIL ... bases it on commit counts"; `t2/criteria.md:10`) | - | Direct failure on H1-H3 |
| Time decay half-life 365 d | bf `ownership.mjs:166-167` | Answers "who is current", not "who wrote the code still alive". Would demote Doug in H3 and H2 (2016/2020 authors). Useful only as a separate "active reviewer" signal | - | Wrong first reviewer |
| GitHub API (`gh api repos/.../commits/<sha>`) for identity merge | bf `ownership.mjs:357-402` | Network, auth, rate limits, and fails offline and on non-GitHub repos; `--no-github` leaves everything unmerged. Held-out repos are local fixtures with `@example.com` addresses | Network dependency | Zero benefit on the benchmark, a privacy/surprise cost for a read-only tool |
| Writing `.github/CODEOWNERS` into the target repo | bf `ownership.mjs:626-628` | Unrequested write; surviving-lines is read-only | - | Trust |
| Skip whole commits by bot/author | bf `ownership.mjs:164` | Removes the bot's lines from nothing; blame still attributes the lines to the bot. Exclude at the line/file level | - | Bot remains owner of surviving lines (the exact H1 failure) |
| Trust `.mailmap` only for identity | hist `README.md:41`; `server.py:52` | Held-out repos have no `.mailmap` (hist-1 H1 `final.txt:29`: "The repo has no `.mailmap`") and identities differ in both name and address | - | Failure on criterion 4 of t1 and t2 |
| Path-scoped `git log --follow` as the basis for "who should review" | hist `file_history` `core.py:589-598` | Shows only the move/rename commits (`t3/criteria.md:7`) | - | The H3 0.00 |
| Change coupling as reviewer signal | hist `core.py:863-954` | Led hist-1 H3 to "whoever owns index.js" with no name | - | Vague answer, no lines |
| `-C -C` default for every file with no budget | git-fame usage 54-55 (off by default for cost) | OK to adopt (#4) but with a time budget; git-fame itself defaults it off | - | Timeouts on large repos |

### 6. Mapping onto the three grader complaints

| Complaint | What competitors do | What to take |
|---|---|---|
| (1) vendored/generated/lockfile counted | Only bf has path patterns (`ownership.mjs:39-47`), applied to commit file lists; hist and git-fame have none. Winning arms (hist/pp/base) did it by hand and **stated the exclusion** (`runs/H1-hist-2/final.txt`: "Counting them would credit a bot and a copy-in") | #1, #2, #5: filter plus an explicit "excluded: <file> <lines> <reason>" table |
| (2) identities differing in name and address | Nobody has a similarity tier. bf merges only via GitHub login; hist only via mailmap; git-fame via mailmap. Winning answers merged by shared email, case-only name differences, and one *guess* flagged as a guess (`H1-bf-1/final.txt:41`, `H1-hist-1/final.txt:38`) | Nothing to copy. Keep our "possible same person" suggestion tier, label guesses as guesses |
| (3) moved code credits the mover | hist: unsolved (no `-C`). bf: only renames. git-fame: optional `-C -C`. The runs that handled H3 did it with hand `-w -C -C -C` and said "plain git log is misleading" (`H3-bf-3/final.txt:3`) | #4, #5: `-C -C -C` default for reviewer queries on files whose first commit is a move/rename; print the sentence |

### 7. Open points for the owner

- I did not run per-run grader outputs (`grade/H*-*.call*.out`) so the lost points of hist H2 (4/4/4) and bf H2 run 3 (1) are explained only by reading answers. Read `grade/H2-*.call1.out` if exact reasons are needed.
- git-fame MPL-2.0 is the task's statement; confirm in `/tmp/sl-deep/git-fame/LICENCE` before any copy. Nothing in §4 needs a file copy.
- bf's dry run produced "no zones" on all three fixtures (`H1-bf-1/final.txt:20`, `H2-bf-1/final.txt:19`): the fixtures are small synthetic histories under `minZoneWeight 1.5` / `minZoneFiles 3` (`ownership.mjs:31-32`). This is a design reason the script contributes nothing here; worth remembering when comparing against bf on small repos.

---

## Appendix C. Web and open-source survey


Date: 2026-10-22. No competitor code executed. Nothing in the repo edited.
"Opened" = I fetched the URL with WebFetch in this session. Note: WebFetch returns a model summary of a page, so quoted regexes are as reported by that tool; port them only after reading the raw file.

Limits of this survey (said plainly):
- `git --version` on this machine: **unverified**. The shell call needed approval and was not run. All git behaviour below comes from git-scm.com docs, not from the local binary.
- Not opened (so "unverified"): hercules/Pyrrha, Software Heritage identity work, Kouters et al. ICSM 2012 full text, Bird et al. 2006 full text, Goeminne 2013, Fry et al. MSR 2020 full text (the PDF at mockus.us/papers/MSRALIAS.pdf opened as binary; only DOI `10.1145/3379597.3387500` readable), GitHub's own blame move handling, ripgrep/cloc/CodeQL/Sonar lists, git-who / git-fame / gitinspector source code (READMEs only).
- The public-inbox thread on `blame -C -C` slowness returned HTTP 502 when I opened it. The claim comes from a search-result snippet only: **unverified**.

### 1. GitHub linguist (MIT)

Licence: MIT, "Copyright (c) 2017 GitHub, Inc." (opened: https://raw.githubusercontent.com/github-linguist/linguist/main/LICENSE).
Latest commit touching `lib/linguist/generated.rb`: `7678534`, 2026-07-27, "Identify ruby code generated by protoc-gen-twirp as generated (#8088)" (opened: https://github.com/github-linguist/linguist/commits/main/lib/linguist/generated.rb). The GitHub API URL returned 403, so I have no sha for vendor.yml or documentation.yml. Patterns below are from `main` as read on 2026-10-22.

Sources (all opened):
- https://raw.githubusercontent.com/github-linguist/linguist/main/lib/linguist/vendor.yml (about 330 lines)
- https://raw.githubusercontent.com/github-linguist/linguist/main/lib/linguist/generated.rb
- https://raw.githubusercontent.com/github-linguist/linguist/main/lib/linguist/documentation.yml (18 patterns, about 39 lines)
- https://github.com/github-linguist/linguist/blob/main/docs/overrides.md

Facts:
- `vendor.yml` has **no lockfile patterns**. It holds directory and library patterns.
- `generated.rb` holds lockfiles as name regexes inside `generated?`. Names matched: `package-lock.json`, `npm-shrinkwrap.json`, `Cargo.lock`, `composer.lock`, `Pipfile.lock`, `poetry.lock`, `Gopkg.lock`/`glide.lock`, `pnpm-lock.yaml`, `bun.lock(b)`, `uv.lock`, `pdm.lock`, `pixi.lock`, `deno.lock`, `flake.lock`, `MODULE.bazel.lock`, `Package.resolved`, `.terraform.lock.hcl`, Yarn PnP `.pnp.*`. **Absent from linguist: `yarn.lock`, `Gemfile.lock`, `go.sum`.** Our R1 list already names `yarn.lock`, `Gemfile.lock`, `go.sum`; keep them.
- Minified: `.js`/`.css` only, average line length > 110.
- Source map: last two lines match `/^\/[*\/][\#@] source(?:Mapping)?URL|sourceURL=/`; `.map` files by name `(\.css|\.js)\.map$`.
- Header markers per language, examples: Go first 40 lines `^// Code generated .*`; protoc "Generated by the protocol buffer compiler.  DO NOT EDIT!" in first 3 lines; JNI header "DO NOT EDIT THIS FILE - it is machine generated"; Dart `generated code\W{2,3}do not modify`.
- Linguist has **no generic `@generated` or "auto-generated" marker** (the tool reported none). Our R1 marker list (`@generated`, `DO NOT EDIT`, `Code generated`, `auto-generated`) goes beyond linguist. That is fine, but limit the scan to the first ~10-40 lines, as linguist does.
- `.gitattributes`: `path linguist-vendored`, `linguist-generated`, `linguist-documentation`, `-linguist-vendored` to un-flag (overrides.md).

Compact generic set worth porting (path-only, no per-language parsers):

| Class | Regex or rule | Source |
|---|---|---|
| vendored dirs | `(^\|/)node_modules/` · `(^\|/)vendors?/` · `(3rd\|[Tt]hird)[-_]?[Pp]arty/` · `(^\|/)[Ee]xtern(als?)?/` · `^deps/` · `(^\|/)cache/` · `^[Dd]ependencies/` | vendor.yml |
| bundled libs | `(\.\|-)min\.(js\|css)$` · `(^\|/)jquery([^.]*)\.js$` | vendor.yml |
| lockfiles | name set above plus `yarn.lock`, `Gemfile.lock`, `go.sum`, `pubspec.lock`, `Podfile.lock` | generated.rb + scc |
| generated by header | first 40 lines: `Code generated .* DO NOT EDIT`, `DO NOT EDIT`, `@generated`, `auto-generated`/`automatically generated` | generated.rb (subset) + scc |
| minified | `.js/.css`, mean line length > 110 (linguist) or > 255 (scc) | generated.rb, scc |
| source maps | `\.(js\|css)\.map$` | generated.rb |
| wrappers | `gradlew`, `mvnw` (linguist has `gradle_wrapper?`, `maven_wrapper?`) | generated.rb |
| documentation (not ownership-relevant for code share) | `^[Dd]ocs?/`, `CHANGELOG`, `LICENSE`, `README` | documentation.yml |

Loss class: vendored/copied/generated/lockfile (yes). Not identity, not moves.
Cost: no dependency, regex on path, plus a header read of the first N lines per file (one `git show` per candidate; restrict to files in the blame set).
Generalisation risk: low for name lists. Medium for `vendors?/`, `extern`, `cache/`, `deps/`, `dist/`: a project can own a directory with such a name (for example, a project whose own source lives in `cache/`). Mitigation: R1 already states what was dropped and offers `--keep-generated`. Honour `-linguist-vendored` un-flags too. Mean line length rule misfires on legit minified-like data files; apply only to `.js/.css`.
Recommendation: **adopt** (path regex set, lockfile set, header markers, `.gitattributes` flags). **Reject** per-language protobuf/thrift parsers (low value, large surface). Do not vendor linguist's Ruby; port the strings with attribution (MIT permits).

### 2. Other tools' lockfile/generated lists

| Tool | Finding | Licence | URL (opened) |
|---|---|---|---|
| scc | `--exclude-file` default `[package-lock.json,Cargo.lock,yarn.lock,pubspec.lock,Podfile.lock,pnpm-lock.yaml]`, described as a non-removable baseline. `--generated-markers` default `[do not edit,<auto-generated />]`. Minified: average line length default 255. Default `--exclude-dir` only `.git,.hg,.svn` (no vendor default). Reads `.gitignore`, `.ignore`, `.sccignore`. Page text was 125,841 chars; I read the first 100,000. | MIT | https://github.com/boyter/scc |
| git-quick-stats | Excludes via `_GIT_PATHSPEC` env, example `:!package-lock.json`; `_GIT_IGNORE_AUTHORS` env. Whether it uses mailmap: not stated on the page. | MIT | https://github.com/git-quick-stats/git-quick-stats |
| git-who | Git pathspec exclusion (`':!*.c'`); reads `.git-blame-ignore-revs` at repo root (not `blame.ignoreRevsFile`). No built-in lockfile list reported. | MIT | https://github.com/sinclairtarget/git-who |
| git-fame | `--excl` / `--incl`; README warns `--excl` may need to be "significantly extended" when counting historical files. No default lockfile list reported. | not named on page | https://github.com/casperdcl/git-fame |
| Truck-Factor (Avelino) | Optional linguist run (`linguist_script.sh`) "to automatically discard files like documentation and third-party libraries", plus manual `filtered-files.txt`. | MIT | https://github.com/aserg-ufmg/Truck-Factor |
| tokei | `languages.rs` shows no lockfile handling (partial read). | n/a | https://raw.githubusercontent.com/XAMPPRocky/tokei/master/src/language/languages.rs |
| gitinspector | Page 404 (URL guessed wrong). **unverified**. | | |
| cloc, ripgrep, CodeQL, Sonar | not opened. **unverified**. | | |

Takeaway: the lockfile name list is small and stable. The union of linguist and scc gives about 25 names. Peer tools (scc, Truck-Factor) already treat dropping vendor/generated files as the default or a documented step; that supports R1.
Recommendation: **adopt** the union list. The scc `--min-gen`-style flag split (separate switches for minified and generated) is **idea only**; R1 uses one flag.

### 3. `git blame -M` / `-C` details

Source (opened): https://git-scm.com/docs/git-blame. Quotes are as returned by the fetch tool.
- `-M[<num>]`: detect moved or copied lines within a file; `<num>` = lower bound of alphanumeric characters, **default 20**.
- `-C[<num>]`: "In addition to `-M`, detect lines moved or copied from other files that were modified in the same commit." Given **twice**: "additionally looks for copies from other files in the commit that creates the file." Given **three times**: "additionally looks for copies from other files in any commit." `<num>` default **40**; with several `-C`, the last `<num>` wins.
- The page has **no performance warning and no `-w` caveat** (the fetch tool confirmed absence). My earlier assumption of a default of 30 is wrong.
- Local docs: `diff.renameLimit` page (https://git-scm.com/docs/diff-config, opened) gives only "number of files to consider when performing the copy/rename detection; equivalent to `-l`", with no default and no overflow behaviour stated. Whether `blame -C` obeys `diff.renameLimit`: **unverified**; I did not find it stated.
- Slowness evidence, weaker sources: a 2008 git commit "Add options to control the search for copies in blame" (https://github.molgen.mpg.de/git-mirror/git/commit/57cae87b77c93e8bdfd11293f11f140ff827269a, opened; page shows the subject only, not the text). A search snippet attributes to it the sentence that `-C -C` "can be way too slow to be unconditionally enabled" on huge repositories: **unverified text**. A 2017 mailing-list report (public-inbox, 502 on open, **unverified**) said a 124 kB single-commit file took over ten minutes with `-C -C`.
- git-fame's README (opened) says `-w`, `-M`, `-C` "can increase accuracy, but take longer to compute". No competitor tool I read describes move handling beyond passing flags. git-who's README (opened): "If a file is renamed, it will count twice", i.e. it does not follow content moves. git-quick-stats: page does not mention moves.
- GitHub's web blame move handling: not opened. **unverified**.
- Git version differences: not established. `--ignore-rev`, `--ignore-revs-file`, `blame.markIgnoredLines` exist in the current doc; the version that introduced them (I believe 2.23) is **unverified**.

Loss class: moved/copied attribution (H3). Cost: `-C -C` can be minutes on a large tree. R3 in the repo already gates it at 2000 text files. A cheaper variant: run `-C -C` only on the files being reported (top N by lines, or the explicit file for the reviewers view), not on the whole tree. Failure modes of `-C`: min-length thresholds (20/40 alphanumerics) mean small moved blocks are not followed; boilerplate copied between files (licence headers, imports) can be attributed to whichever file had it first; `-C -C` also credits the original author of a copied snippet, so a vendored-code drop (R1) must happen first or the copy credits the vendor's committer.
Recommendation: **adopt** `-w -M -C -C` with the size gate and a visible "copy detection off" line; **idea only**: a per-file time budget with fallback to `-w -M`; **reject** `-C -C -C` (any commit) for default use.

### 4. Identity merging

### GitHub noreply formats (opened: https://docs.github.com/en/account-and-profile/reference/email-addresses-reference)
- Accounts created after 2017-07-18: `ID+USERNAME@users.noreply.github.com`.
- Older accounts that kept their email private before that date: `USERNAME@users.noreply.github.com`.
- A numeric id is a strong key: the same `ID` with different `USERNAME` after a rename is the same account. The same `USERNAME` without id as an older address is probably the same account, but usernames can be reused after deletion (this last point is my inference, **unverified** from docs).
- Rule candidate (high precision): treat `ID+x@users.noreply...` and `x@users.noreply...` with identical username as one person; merge on identical numeric `ID`.

### gambit (Gote and Zingg), the best concrete rule set found
Paper: arXiv 2103.05666 (opened via https://ar5iv.labs.arxiv.org/html/2103.05666), "gambit – An Open Source Name Disambiguation Tool for Version Control Systems". Code: https://github.com/gotec/gambit (opened), **AGPL-3.0**, Python, needs `python-Levenshtein` (C). **Licence: ideas only; do not copy code.**
Rules as reported by the fetch tool:
- Normalise: ASCII-fold, split delimiters and camelCase, lowercase, drop time-zone names and generic strings such as "admin".
- Name vs name: full-name similarity/equality, first/last/penultimate name comparisons, inversion handled.
- Name vs email base (before `@`): first initial + last name, first name + last initial, or both names present.
- Similarity: normalised Levenshtein; strings shorter than 3 characters count as different; match when the average of the top two similarities is at least t; recommended **t = 0.95** (range tested 0.5 to 1). Transitive closure.
- Reported: F1 **0.985** on a GNOME GTK ground truth of 2161 ambiguities, one project, manual labels (kappa 0.994). Bird et al. has slightly higher recall but more false positives, especially when email bases are common first names. Exact per-threshold precision/recall are in a figure only, not in the text I read.
- Stated risks: identical names are merged automatically although they need not be the same person; short strings are unstable (authors manually checked matches under 6 characters); Jaro-Winkler inflates scores; generalisation untested.

### Large-scale: Mockus 2026 (opened: https://arxiv.org/abs/2607.06920; CC BY 4.0 for the paper; code/data licence not stated)
- "The central problem is over-merge, not missed merges." Bridge identities (bots, role accounts, placeholder emails, multi-author commit fields) join unrelated clusters; the largest cluster drops from 170,431 (predecessor 3.0M) to under 7,000 after gating by node information score, project spread and degree plus a betweenness cut.
- Per-edge classifier AUC 0.99 on human-adjudicated pairs, trained on 2.6M labels mined from GitHub noreply ids; end-to-end gold recall 0.44 to 0.70 "at increasing precision". Name/email features not given in the excerpt I read.
- Relevance to us: scale (107M strings) is not our case, but the lesson is direct: never take the transitive closure blindly; exclude bots, role addresses (`root@`, `admin@`, `noreply@`, `localhost`, `unknown@`) and placeholder emails before comparing.

### Other sources
- Kouters, Vasilescu, Serebrenik, van den Brand, ICSM 2012 ERA, LSA-based merging, GNOME (search snippet via https://research.tue.nl/nl/publications/whos-who-in-gnome-using-lsa-to-merge-software-repository-identiti/ , listed in results, **not opened**). Reported (snippet): improves precision and recall over existing algorithms on worst-case input. LSA needs a corpus and a library: **reject**.
- Bird et al. 2006 and Goeminne 2013: described only second-hand in a snippet (rule-based; baseline; false positives when email bases are common first names). **unverified**.
- GrimoireLab SortingHat: my fetch of `matcher.py` returned 404; the repo layout I guessed is wrong. **unverified**; licence GPL per your brief; ideas only.
- Truck-Factor (opened): aliases are **manual** (`alias.txt`), no automatic similarity. So the original truck-factor paper does not give a merge algorithm.
- git-who (opened): only applies `.mailmap`. git-fame (opened): suggests adding `.mailmap`. gitinspector, hercules, PyDriller: not read. **unverified**.
- `.mailmap` format (opened: https://git-scm.com/docs/gitmailmap): four line forms; name and email matching is case-insensitive; forms are `Proper <p@x> Commit <c@x>` for the two-address case.

### Concrete tiers for our "possible same person" suggestion

| Tier | Rule | Expected precision | Action |
|---|---|---|---|
| A | same numeric noreply ID; or `ID+u@` and `u@` noreply same u | very high | could auto-merge, but R2 says suggest only |
| B | same normalised full name (lowercase, ASCII-fold, collapse spaces), different address, neither is a bot/role/placeholder | high but not certain (common names) | suggest with evidence |
| C | name vs email local part: initial+surname, first+last-initial, `first.last`, `flast`, with the other identity's full name | medium; a short or common local part raises false merges | suggest, require ≥ 2 name tokens and local part ≥ 5 characters |
| D | normalised Levenshtein ≥ 0.95 on names of ≥ 6 characters (typo, accent) | medium | suggest |
| E | anything lower, any single-token name, any identity with a role or bot pattern | low | never suggest |

Add a co-evidence check where cheap: both identities touch the same files in overlapping periods, or one stops committing when the other starts (the gate idea from Mockus's project-spread/degree features, applied locally). I have no measured value for this check; it is my proposal.
Loss class: split identities. Cost: O(n²) over authors only (n is typically under a few thousand; cap at 2000 with a note). No dependency needed; a 20-line Levenshtein is enough.
False-merge risks: common given names as email bases (`john@`), shared team mailboxes, pair-programming/Co-authored-by, CI/bot identities, two real people with the same name in one org, identity reuse after account deletion.
Recommendation: **adopt** tiers A-D as suggestions only (matches R2: no automatic merge); **idea only** for gambit's top-two averaging; **reject** LSA, ML edge classifiers, transitive closure, and auto-merge on name alone.

### 5. Hugging Face and arXiv

- Truck factor: Avelino, Passos, Hora, Valente, ICPC 2016, arXiv:1604.06766 (https://arxiv.org/abs/1604.06766v1 and https://alphaxiv.org/abs/1604.06766 appeared in search; **not opened**). Per search snippet: 133 popular GitHub projects, 65% have TF ≤ 2, 84% of valid developer answers agree or partly agree. Tool: aserg-ufmg/Truck-Factor (opened, MIT; manual aliases, optional linguist filter). Comparison paper Ferreira et al. (SBCARS 2016, https://sol.sbc.org.br/index.php/sbcars/article/view/28983, in search results, **not opened**).
- Code authorship attribution (stylometry) datasets exist (FSE 2021 "Authorship Attribution of Source Code: A Language-Agnostic Approach...", https://2021.esec-fse.org/details/fse-2021-papers/75/Authorship-Attribution-of-Source-Code-A-Language-Agnostic-Approach-and-Applicability, in results, **not opened**). They solve "who wrote this snippet from style", which is not our problem (git already records authors). Reject.
- Hugging Face: one web search found **nothing** specific to HF datasets or models for identity disambiguation, ownership, truck factor, or vendored-code detection. I did not browse huggingface.co directly. Say: nothing useful found; **not exhaustively checked**.
- Mockus 2026 (section 4) says its method is on World of Code; no released model or data location was visible in the excerpt.
Recommendation: **idea only** (gambit rules, Mockus gating); **reject** stylometry and any ML model.

### 6. Mailmap generation and checking tools

- Atlassian blog (search result https://www.atlassian.com/blog/developers/aliasing-authors-in-git, **not opened**): `git shortlog -se` piped to a starter `.mailmap`; argues `.mailmap` avoids history rewrite. Snippet only.
- U-Boot `scripts/mailmapper` (search result https://android.googlesource.com/platform/external/u-boot/+/c7f85c5f75f95dbbd3cedcc3a399eee6dbb59cdc/scripts/mailmapper, **not opened**; licence **unverified**): per the snippet, finds names spelled differently under the same email, picks the name with the most commits as canonical, adds only authors above a commit threshold (50), merges into an existing `.mailmap`. This is the same-address rule we already have.
- npm/PyPI/GitHub "mailmap generator" packages: the search returned **none**; I did not search npm or PyPI directly. Say: nothing found; **not exhaustively checked**.
- `git shortlog -sne` itself applies `.mailmap` (git-shortlog man page, in search results, not opened).
Recommendation: **idea only**. Canonical-name choice = most commits, as in mailmapper, for the printed `.mailmap` line.

### Ranked shortlist (loss class solved × low cost × low false-positive risk)

| # | Technique | Class | Verdict | Reason |
|---|---|---|---|---|
| 1 | Lockfile name list (linguist + scc union, adding `yarn.lock`, `Gemfile.lock`, `go.sum`) | vendored/lockfile | adopt | Exact filename match, zero false positives on ownership, two independent tools agree. |
| 2 | Vendored directory regexes (`node_modules`, `vendor(s)`, `third[-_]party`, `extern(al)`, `Pods`, `bower_components`) | vendored/copied | adopt | Cheap path test; report dropped counts and honour `-linguist-vendored` to limit false drops. |
| 3 | Generated header markers in first ~40 lines, plus `.min.*`/`.map` and `linguist-generated` attribute | generated | adopt | Linguist and scc both use headers; bounded read; attribute gives the owner an override. |
| 4 | `blame -w -M -C -C` with size gate and visible "off" note | moved code (H3) | adopt | Documented behaviour covers moves into new files; cost bounded by the 2000-file gate. Apply after item 1-3 drops so vendor copies do not move credit. |
| 5 | GitHub noreply ID match (same `ID`, or `ID+u@` ≈ `u@`) | split identities | adopt (suggest tier A) | Platform-defined key, near-zero false merges. |
| 6 | Same normalised full name, different address, excluding bots/role/placeholder addresses | split identities | adopt (suggest tier B) | Covers the "differ in both name and address" case when the name is consistent; show evidence. |
| 7 | Name vs email-local-part rules (initial+surname, first.last) and Levenshtein ≥ 0.95 | split identities | idea only, suggest with evidence | gambit reports F1 0.985 on one project (AGPL, ideas only); medium false risk, so suggestion only. |
| 8 | Per-file `-C -C` budget (run only on reported files, fallback to `-w -M` on timeout) | moved code at scale | idea only | Would remove the all-or-nothing size gate; untested here. |

### What NOT to do

- Do not auto-merge any suggestion (R2 holds). Mockus 2026: over-merge is the main failure; a few false merges join large unrelated clusters.
- Do not take transitive closure of fuzzy matches (A~B and B~C does not imply A~C).
- Do not merge on name alone when the name is a single token, shorter than 6 characters, or common; do not merge on email local part alone (`john@`, `dev@`, `admin@`, `root@`).
- Do not compare bots, `noreply`, role accounts, `localhost`/`unknown` placeholders, or `Co-authored-by` trailers as people.
- Do not copy gambit or SortingHat code (AGPL / GPL). Re-derive rules.
- Do not drop directories by name when the user's own `.gitattributes` says `-linguist-vendored`; always print what was dropped.
- Do not enable `-C -C -C` or `-C -C` on large trees by default (minutes per file reported in a 2017 thread, **unverified**).
- Do not treat linguist's Ruby as a dependency; port the strings and credit linguist (MIT).
