# Capability table: code-ownership, bus-factor and blame tools read from source (2026-10-24)

Scope: every user-facing capability in the rivals below that surviving-lines (sl) lacks or does worse, found by reading source, not READMEs alone. Read-only: nothing under /Users/efe was run; sl `--help` was run in /private/tmp/r13/deep/scratch. No `claude` run, no benchmark.

Marks used: **(verified)** read in source or run; **(memory)** from my own knowledge, not confirmed on a fetched page; **(not verified)** not read or not executed. "sl" = surviving-lines at the snapshot of 2026-10-24 (`--orphans` and `--without` are in `--help` and were treated as "being added", so they are not counted as missing, but gaps inside them are listed).

## 0. Rivals read

| Rival | Version read (clone date) | Stars (2026-10-24) | Licence (file read) | Copyright line (exact) | What I read |
|---|---|---|---|---|---|
| pp = project-pilot | /private/tmp/r13/rivals/pp | n/a | MIT (LICENSE) | `Copyright (c) 2026 Project Pilot Contributors` | all 12 commands, 8 agents, 13 skills, references, hooks.json |
| hist = mcp-git-historian | /private/tmp/r13/rivals/hist-clone, hist-plugin | 3 | MIT | `Copyright (c) 2026 Alejandro Brito` | core.py (all 1254 lines), server.py, report.py (40-210); cli.py only by function list |
| bf = k41n/busfactor | /private/tmp/r13/rivals/bf-clone, bf-plugin | 0 | MIT | `Copyright (c) 2026 k41n` | scripts/ownership.mjs (all 640 lines), SKILL.md, README.md 1-60 |
| git-fame | commit 2026-09-07 | 827 | MPL-2.0 (LICENCE; GitHub API says NOASSERTION) | source: `Copyright (c) 2016-2026 Casper da Costa-Luis` (_gitfame.py:91-95) | gitfame/_gitfame.py (all 548 lines) |
| git-who | commit 2026-05-27 | 2,675 | MIT | `Copyright (c) 2025 Sinclair Target` | README (all), main.go flags, internal/tally/tree.go, bucket.go, subcommands/tree.go |
| hercules (src-d) | commit 2022-11-29 | 2,811 | Apache-2.0 (LICENSE.md; GitHub API NOASSERTION) | stock appendix only (LICENSE.md:182); no Go file header found | README, leaves/burndown.go (matrix, ownership), couples.go, devs.go, shotness.go headers |
| git-of-theseus | commit 2023-11-25 | 2,973 | Apache-2.0 | `Copyright 2016 Erik Bernhardsson` (file headers, analyze.py:3) | analyze.py (all), survival_plot.py (all) |
| gitinspector | commit 2026-10-21 | 2,513 | GPL-3.0 | `Copyright (c) 2012-2026 Ejwa Hosting AB` | help.py, blame.py, timeline.py, filtering.py, metrics.py, responsibilities.py |
| git-quick-stats | commit 2026-04-18 | 7,008 | MIT | `Copyright (c) 2024 git-quick-stats.sh` | usage text, suggestReviewers, newContributors*, commitsPerAuthor, detailedGitStats (first 90 lines) |
| git-extras | commit 2026-10-08 | 18,124 | MIT | `Copyright (c) 2010 TJ Holowaychuk <address> and Contributors` | bin/git-summary, bin/git-effort (all) |
| Truck-Factor (aserg-ufmg/mtov) | commit 2024-03-13 | 242 | MIT | `Copyright (c) 2017 Applied Software Engineering Research Group` | GreedyTruckFactor.java, PrunedGreedyTruckFactor.java (1-60), AuthorshipInfo.java (28-77), DOACalculator.java (90-170), config.properties |
| checkOwners (smusali/checkowners, v0.6.0) | commit 2026-10-19 | 1 | MIT | `Copyright (c) 2026 Samir Musali` | docs/METHODOLOGY.md (all), USAGE.md (236-540), limitations.md, README, busfactor.py (208-396), onboard.py, topology.py |
| code-maat | commit 2025-07-03 | 2,643 | GPL-3.0 (README:30; no LICENSE file) | `Copyright (C) 2013 Adam Tornhill` (source headers) | logical_coupling.clj, effort.clj, code_age.clj (ideas only) |
| GitVital (bugsNburgers) | commit 2026-10-12 | 34 | MIT | `Copyright (c) 2026 Suprateek Yawagal` | metrics/busFactor.ts (all), riskFlags.ts (headers). Hosted GitHub-API service: commit-count bus factor only |
| git-archaeologist (SushantVerma7969) | commit 2026-06-30 | 11 | MIT | `Copyright (c) 2026 Sushant Verma` | DESIGN.md, pr-risk-core.ts, ownership-core.ts, risk/scopeRisk.ts, churn.ts, evolution.ts, mcp/server.ts head, botFilter.ts |
| lowendinsight (gtri) | commit 2023-01-17 | 15 | BSD-3-Clause | `Copyright (c) 2020, Georgia Tech Research Institute (GTRI)` | README metrics section, risk_logic.ex (120-175) |

Search note: GitHub searches for "bus factor", "truck factor", "code ownership", "git blame statistics" (sorted by stars) found nothing above 100 stars outside the list above except zats/github_bus_factor (105, MIT, last push 2016, Ruby; GitHub-API based, not read) and rubyatscale/code_ownership (118, MIT; declared-ownership gem, not git history, not read). The two "additional" tools with real activity are GitVital and git-archaeologist; both have few stars. Not read: Bus Factor Explorer, CodeScene (proprietary), cregit, TFEstimator, HelgeCPH/truckfactor (GPL-3.0), JetBrains Knowledge Islands.

## 1. Capability table

Columns: Rival(s) and file:line evidence; How the rival does it; sl has it (yes / partly / no); where the rival is better and why; licence; verdict. "Native" = implement from the written spec, no rival code read at implementation time. "Adapt" is only offered for MIT / Apache-2.0 / BSD and names the exact copyright line.

### 1.1 Attribution and counting

| ID | Capability | Rival(s), evidence | How the rival does it | sl | Where the rival is better | Licence | Verdict |
|---|---|---|---|---|---|---|---|
| C01 | Inserted and deleted lines per author beside surviving lines; survival ratio | git-fame `--loc ins,del` `_gitfame.py:319-326, 404-406, 475-479`; gitinspector "stability" `blame.py:188-192` (100 * blamed lines / author insertions, 100 if no insertions); git-who `-l` (README "table" section) | git-fame runs `git log --numstat --format=aN%aN aE%aE at%at H%H` once and sums insertions (and deletions) per author for files still in the tree. gitinspector divides blamed lines by insertions. | no | One table shows kept versus replaced per author; the line-share minus commit-share gap in sl only hints at it. Caveat: git-fame line 403 passes the replacement string `r'\\2'` to `RE_RENAME.sub`, which looks like a literal backslash plus 2, so renamed files may drop out of its ins/del totals (not executed, not verified). | git-fame MPL-2.0; gitinspector GPL-3.0; git-who MIT | Native. See top-12 #10. Apply sl's existing file drops, bot drops and set-aside commits to the numstat pass, or the ratio is wrong. |
| C02 | Blame restricted to a date window (lines last changed since/until) | git-fame `_gitfame.py:320` (`git blame --since/--until`) and `372-375` (`RE_BLAME_BOUNDS` strips boundary lines so the commit nearest the cut does not inherit all older lines); gitinspector `blame.py:95` (`blamechunk_is_prior and since -> skip`) | git marks lines older than `--since` as `boundary`; both tools drop those lines. | partly: `--since/--until` limit the commit column only (README:171-173; help text) | Answers "whose code from the last 6 months is still here". | MPL-2.0; GPL-3.0 | Native, using `author-time` from the porcelain we already read instead of git's `--since` (which limits by committer date; difference to be stated in the output). Top-12 #10. |
| C03 | Ignore commits by author regex, email, message regex, revision | git-fame `--ignore-author` `_gitfame.py:285-291, 321-322, 466-468` (author regex -> `git log --author` -> each sha passed as `--ignore-rev`); gitinspector `-x` with prefixes `file:`, `author:`, `email:`, `revision:`, `message:` `filtering.py:20-49`; git-quick-stats `_GIT_IGNORE_AUTHORS` (usage text) | The author filter is turned into a revision list and handed to blame, so the lines go back to the previous author (they do not vanish). gitinspector drops the author's lines from the totals instead. | partly: bots only; `--ignore-rev` one sha at a time | Lets a user say "ignore the migration account" or "ignore commits matching ^Merge|^chore:" without listing shas; lines go to earlier authors, which is the right semantics for a reformat-like account. | MPL-2.0; GPL-3.0; MIT | Native: `--ignore-author <regex>` and `--ignore-message <regex>`, resolved to shas, passed through a temp `--ignore-revs-file` (argv length). Not top-12. |
| C04 | Files per author, files as main owner, three-way distribution | git-fame `fils` column and `distribution` lines/commits/files `_gitfame.py:186-194`; hist `knowledge_risk` authors `files_as_main_owner`, `lines_percent` `core.py:1085-1110`; git-who `-f` | Counts distinct files where the author has a line (git-fame) or is the top owner (hist). | no (per-file view `--files` exists; no per-author file counts) | Breadth versus depth per person in one row; "main owner of 22 files" is what a reviewer-routing question needs. | MPL-2.0; MIT; MIT | Native: two columns, `files` (>=1 surviving line) and `top of` (files where the author is top owner). Fold into the table when `--files-columns` or in `--owned-by` (top-12 #2). |
| C05 | More sort and filter keys | git-fame `--min`, `--sort files|hours|months`, `--enum` `_gitfame.py:210-214`; git-who `-m` last edit, `-c` first edit, `-f` files, `-n` rows `main.go:132-141` | Sorts the same table by other columns. | partly (`--sort lines|commits|gap`, `--top`) | Sorting by last commit puts the people to ask first. | MPL-2.0; MIT | Native, low: `--sort last|first|files`. |
| C06 | Trailer keys read for credit | git-fame `Co-authored-by`, `Assisted-by`, `Generated-by` `_gitfame.py:270-271`; `--auth first|share` `:268-282` | `git log` `%(trailers:key=...)`; mailmap applied by `git check-mailmap` on trailer identities. | partly (sl reads `Co-authored-by` and `Assisted-by`; `Generated-by`: 0 matches in bin/surviving-lines.js) | Covers `Generated-by` trailers (assistant output marker). `--auth first` credits only the first trailer. | MPL-2.0 | Native, trivial: add `Generated-by` to the AI trailer names (value of the key is not an address). `first` mode: skip. |
| C07 | Several repositories in one run | git-fame `run()` `_gitfame.py:433-496` (`<gitdir>...`, `-R` recursive discovery); gitinspector multi-repo and `REPOSITORY:BRANCH` `help.py:25-31`; hercules `combine` (README "Merging") | Runs per repo and merges author stats by author string. | no | Org-level "who is everywhere" view. Risk: merging by name or email string across repos needs the identity rules sl already has. | MPL-2.0; GPL-3.0; Apache-2.0 | Native, low priority: repeated `--cwd`, per-repo blocks plus one merged table by identity. |
| C08 | Cost / hours estimate | git-fame `--cost` COCOMO `3.2 * (loc/1e3)**1.05` `_gitfame.py:200`; hours from commit gaps `:131-140` (120-minute gap, 120 minutes added for the first commit; derived from git-hours) | Formula on lines or on author commit times. | no | n/a | MPL-2.0 | Skip: not ownership; assistants quote it as fact; LIT.md reached the same verdict. |
| C09 | Output formats yaml, tsv, svg, tabulate styles | git-fame `tabulate()` `_gitfame.py:179-261` | Format switch; svg built from the text table. | partly (text, json, csv, markdown) | None for assistants. | MPL-2.0 | Skip. |
| C10 | Analyse another branch without checkout | gitinspector `help.py:25-28` | `REPOSITORY:BRANCH` | yes (`--ref`) | - | - | Have. |
| C11 | Language-only default filter ("code, not docs or data") | git-of-theseus `analyze.py:30-48` (pygments file types minus `*.json *.md *.ps *.eps *.txt *.xml *.xsl *.rss *.xslt *.xsd *.wsdl *.wsf *.yaml *.yml`), `--all-filetypes`; gitinspector default extension list `extensions.py` (README line: java,c,cc,cpp,h,hh,hpp,php,py,glsl,rb,js,sql,go,swift,ts,tsx,rs,groovy) | Whitelist by extension. | partly (`--include`, `--group-by ext`; sl counts every text file except generated/vendored/lock/binary) | "Who owns the code" is not inflated by docs, JSON fixtures, translations. G9 in docs/BEST-RIVAL-r13.md shows the model has to remember to pass `--include`. | Apache-2.0 (git-of-theseus); GPL-3.0 | Native: `--code-only` preset (static extension list, no dependency). The git-of-theseus list shape can be reused as an idea; the extension list itself should be written from scratch. Not top-12 but cheap and high value. |

### 1.2 Concentration, bus factor, truck factor

| ID | Capability | Rival(s), evidence | How the rival does it | sl | Where the rival is better | Licence | Verdict |
|---|---|---|---|---|---|---|---|
| C12 | Concentration measures: top share, HHI, effective owners (1/HHI), entropy, truck_factor_50/75/90, major contributors (p>=5%), minor share; fragmentation | checkOwners `METHODOLOGY.md:122-153`; code-maat fragmentation `effort.clj` `as-fractal-value` (1 - sum((author_revs/total_revs)^2)); lowendinsight functional contributors (share >= 1/N) `README.md:976` with risk tiers 2/3/5 (`risk_logic.ex:128-160`); Bird et al. minor contributors (LIT.md #17) | Shares p_i over per-author mass; HHI = sum p_i^2; effective_owners = 1/HHI (one owner 1.00, even split of two 2.00); entropy in nats; truck_factor_q = smallest k whose largest shares sum >= q; major when p_i >= 0.05 (fixed); functional when share >= 1/N. | partly (bus factor at 50% and 80%; `--files` summary line) | A single "how concentrated" number that is not just the first k that crosses 50%; effective owners reads well ("effectively 1.3 people"). | MIT (checkOwners); GPL-3.0 (code-maat); BSD-3-Clause (lowendinsight) | Native. One summary line under the table: `concentration: top 41.0%, effective owners 3.2 (HHI 0.31), 4 of 29 authors hold at least their fair share (1/29), 6 major (>=5%), minor authors hold 7.1%`. Over lines, not scores. Formulas above are all verified. Caveat from LIT.md #18: concentration is not a defect predictor; print no quality claim. |
| C13 | File-count truck factor (Avelino): greedy removal until fewer than 50% of files have an author | Truck-Factor `GreedyTruckFactor.java:26-43, 62-85`; DOA formula and threshold `AuthorshipInfo.java:35-60`; pruned variant `PrunedGreedyTruckFactor.java:20-60`; `config.properties` (`normalizedDOA=0.75`, `absoluteDOA=3.293`, `tfCoverage=0.5`, `minPercentage=0.1`) | DOA = 3.293 + 1.098*FA + 0.164*DL - 0.321*ln(1+AC) (verified, `AuthorshipInfo.java:46`); an author of a file when DOA/best-DOA of the file > 0.75 and (DOA >= 3.293 or first/secondary author) (`:35-41`). Greedy: while covered-files fraction >= 0.5, remove the developer with the most authored files, factor++. Pruned: drop from the TF list developers whose authored files / top developer's authored files < 0.1 (`PrunedGreedyTruckFactor.java:56`). | partly (line-share bus factor; `--files` counts files with one owner above 80%) | What the literature calls truck factor; an assistant asked "truck factor" expects this definition. Pruning removes tiny contributors from the reported list. | MIT | Native variant only: `--bus-factor-by files`. Owner of a file = authors with >= 25% of its surviving lines (or top author if none); greedy removal as above; print next to the line-based number, labelled. DOA itself: skip (needs deliveries and acceptances, coefficients fit on one study; LIT.md "do not adopt"). |
| C14 | Minimum evidence before a directory counts as a headline risk | git-archaeologist `risk/scopeRisk.ts` (HIGH needs bus factor 1, concentration >= 80 and >= 15 touches; trivial scope < 10 touches and < 4 files is LOW); hist silo needs >= 3 commits `core.py:47-48, 713-715` | Floors on size so a 3-file helper dir is not "bus factor 1, high risk". | no (every group block prints its bus factor; thin groups not marked) | Cuts noise in per-directory risk lists. Constants are the authors' own tuning (DESIGN.md says so). | MIT | Native: mark a group `thin` when it has < 4 sampled files and < 200 lines (sl's own numbers, state them) and leave thin groups out of any "riskiest" list. |
| C15 | Tie rule at the bus-factor threshold | GitVital `busFactor.ts:88-96` (include every author tied with the last one added) | Look-ahead on equal commit counts. | yes (deterministic: lines then address; multiplied-out comparison, bin/surviving-lines.js:1234-1243) | Rival rule changes the number depending on tie; ours is stable and documented. | MIT | Skip. |
| C16 | Bus factor among active authors only | bf `ownership.mjs:250-274` (cumulative share of the **active** weight >= 0.5, `busFactor` null when nobody is active), reported separately from `orphaned` (activeShare < 0.25) | Computes both numbers per zone; verdicts are never merged. | no (sl prints bus factor over all authors; `--orphans` is a different question) | If the top two authors left a year ago, "bus factor 2" overstates resilience; the active-only number says 0 or 1. | MIT | Native. Top-12 #6. |

### 1.3 Activity, orphans, history quality

| ID | Capability | Rival(s), evidence | How the rival does it | sl | Where the rival is better | Licence | Verdict |
|---|---|---|---|---|---|---|---|
| C17 | Orphaned files ranked, with per-author and per-directory roll-ups | hist `knowledge_risk` `core.py:996-1143`: inactive_after default "6 months ago", `ORPHAN_PERCENT = 50` (core.py:49), file orphaned when inactive authors hold > 50% of its lines (`:1066-1068`), sort by inactive% then top owner's lines (`:1098`), roll-ups: per author lines, files_as_main_owner (`:1100-1110`), per directory inactive_lines and orphaned_files (`:1111-1120`), truncation to the `max_files=200` most-changed files with a note (`:1035-1039, 1132-1135`) | One blame per file in a thread pool; activity from the author's last commit anywhere, merges included (`_author_activity` `:957-973`). | partly (`--orphans` being added: top owner inactive and nobody active holds 20%) | (a) per-directory roll-up of inactive lines; (b) per-author "files you are the main owner of" next to active flag; (c) explicit truncation note. Definitions differ: hist counts inactive share of lines, sl looks at the top owner. State which. | MIT | Native additions to `--orphans`: a `directories` roll-up and an `authors` roll-up. Not top-12 (it is an add-on to an item in progress). |
| C18 | Contributor turnover per directory | git-archaeologist `risk/churn.ts:5-70` (share of the people who ever touched a scope with no commit in 12 months: HIGH >= 50%, MEDIUM >= 25%), `buildAbandonedScopes :79-120` (concentration >= 50, owner inactive > 365 days, churn >= 50 -> HIGH; >= 40, > 180 days, >= 25 -> MEDIUM) | Counts distinct contributors by directory and their last activity. | no | "Most of the people who built this area are gone" is a distinct fact from "its top owner is gone". | MIT | Native, low: one column in `--group-by dir`: `people who left: 5 of 8`. Thresholds are the rival's tuning; print counts, no tier. |
| C19 | History-quality caveats: imported root commit, young history | bf `ownership.mjs:583-600` (`rootCommitFiles / tracked.size > 0.25` -> `bulkFirstCommit`; span < 550 days -> `shallowHistory`), SKILL.md:115-126; CodeScene "inconclusive" (LIT.md #16) | The oldest non-merge commit's file count against files at HEAD. | no (`imported`, `root commit`: 0 matches; sl only refuses shallow clones) | Prevents "these people did not write this code" being claimed for an imported repo, and "history was imported" being claimed for a young repo. | MIT | Native. Top-12 #5. |
| C20 | Merge-strategy detection (merge / squash / rebase) | checkOwners `limitations.md:56-66`: >= 5% of commits with two or more parents -> merge; else >= half of the remaining subjects end in `(#<number>)` -> squash; else rebase; squash: other authors recovered only from `Co-authored-by` | Heuristic on the window's commits. | partly (committer note G12, co-authors) | Tells the assistant that authorship in this repo is the PR author or the squasher, and that reviewers and co-developers are invisible. | MIT | Native. Top-12 #5. |
| C21 | Activity summary: repo age, last active, active days, uncommitted, per-author commit percent, `--dedup-by-email` | git-extras `bin/git-summary` (`repository_age :159`, `active_days :77`, `dedup_by_email :102`, output styles oneline/tabular) | Shell over `git log` and `git shortlog`. | partly (activity line being added; `--identities`) | Nothing the assistant needs beyond what sl prints; "active on N days" is a better recency fact than last-commit date alone for a repo that commits in bursts. | MIT | Skip except: add `active days` (distinct commit dates) to the activity line if cheap. |
| C22 | Months-with-commits sparkline, last 12 months | hist `repo_summary` `core.py:469-520`; `report.py:18-24, 136-145` | Count of non-merge commits per calendar month, eight-level block chars. | no | One line shows "dormant since March". | MIT | Native, low: optional, only in the activity line. |
| C23 | Three-tier activity (<=30 d active, 30-90 d recent, >90 d inactive) | pp `contributor-analyzer.md:93-96` | Fixed day cutoffs | partly (`--active-days`, default 365, one cutoff) | A quiet tier avoids calling a person who committed 100 days ago "inactive". | MIT | Skip as tiers; keep one configurable cutoff, but make the output print the cutoff (it does). |
| C24 | Off-hours / burnout indicators, commits by weekday/hour/timezone | pp `sprint-health.md:62,71`, `contributor-analyzer.md:41-42`; git-quick-stats `commitsByHour :1446`, `commitsByTimezone :1487` | Histograms of commit times. | no | n/a | MIT | Skip: monitoring people, not ownership (checkOwners principle 9, `METHODOLOGY.md:400`). |
| C25 | New contributors since a date or a tag | git-quick-stats `newContributors :1170-1188`, `newContributorsSinceTag :1190-1224` | For each author email, first commit time >= cutoff (tag date from `git log -n 1 --format=%ai <tag>`). | no | "Who joined since v2.0" for onboarding and mentoring questions. | MIT | Native, low-medium: `--new-since <date|tag>` printing first commit date per identity (after mailmap, bots out). |

### 1.4 Views and slices

| ID | Capability | Rival(s), evidence | How the rival does it | sl | Where the rival is better | Licence | Verdict |
|---|---|---|---|---|---|---|---|
| C26 | Directory tree annotated with the top owner | git-who `tree` (`subcommands/tree.go:195-300`; elision of single-child chains `:214-231`; annotate only where the owner differs from the parent, directories always `:262-263`; directories first then alphabetical `:277-286`; depth `-d`, `-a` all); tally merge up the tree `tally/tree.go:67-93` | Commits (or lines changed) per author per path, summed bottom-up, best author per node. | partly (`--group-by dir:n` blocks; `--files` flat list) | A single tree shows the whole ownership map and where it changes; an assistant reads one block instead of many. git-who uses commits or lines changed, not surviving lines. | MIT | Native with surviving lines. Top-12 #7. |
| C27 | Ownership timeline: winning author per year/month, with share | git-who `hist` (`tally/bucket.go:78-90`, resolution rule `:146-185`: span > 5 years yearly, > 60 days monthly, else daily); git-archaeologist ownership transitions `risk/evolution.ts:9-95` (dominant author per year per scope, transition when it changes, severity by new share >= 80 / >= 50); hercules ownership stack plot (README "Code ownership"); git-of-theseus `authors.json` | Buckets commits by author date; per bucket the author with the most commits and that author's share of the bucket. | no (`--history` lists people oldest first, no time buckets) | "Who owned this before X took over" and "when did it change hands" are common questions. | MIT; MIT; Apache-2.0 | Native. Top-12 #12. |
| C28 | Revision ranges as the commit window | git-who `git who v3.10.9..v3.11.9` (README "table" section); git-quick-stats tag cutoff | Any commit-ish or range accepted. | partly (`--since/--until` take dates) | Release-scoped questions ("who contributed to 3.2") need no date lookup. | MIT | Native: `--range <a..b>` for the commit column (and for `--timeline`). |
| C29 | Filter the whole view by author | git-who `--author/--nauthor` `main.go:455-470`; checkOwners `explain --owner`, `owners`; gitinspector `responsibilities.py:25-36` (files per author) | Author filter on commits; for gitinspector the files an author is responsible for. | no (`--without` removes people; nothing lists what a person owns) | "What does Alice own?" is one of the first questions asked. | MIT; MIT; GPL-3.0 | Native. Top-12 #2. |
| C30 | Why is person X not an owner of path P | checkOwners `explain --why-not` (`USAGE.md` "Explain and owners"; `METHODOLOGY.md:78-84`): concrete numbers and the threshold missed; "a contributor below threshold and one who never touched the path produce different reasons" | Same score tuple as `analyze`; compares to `analysis.confidence_threshold`. | no | Directly answers a question assistants get and otherwise answer by guessing. | MIT | Native. Top-12 #3. |
| C31 | Cohort table: lines surviving by year written | git-of-theseus `analyze.py:297-316, 108` (cohort = `committed_date` formatted `%Y`; also `ext`, `author`, `dir`, `domain`, `sha` curves per snapshot); hercules burndown bands (README "Project burndown") | Blame at snapshots, cohort of each line from its commit date. | no | "How old is the code that is left" per author or directory. | Apache-2.0 | Native, single snapshot only: author-time year of the blamed commit (git-of-theseus uses committer date; sl should use author date and say so). Add `median age of lines` per author (gitinspector averages age in weeks/months `blame.py:108-111`, constant `AVG_DAYS_PER_MONTH = 30.4167`). Medium. |
| C32 | Survival curve and half-life | git-of-theseus `survival_plot.py:31-110` (product-limit style `P *= 1 + delta_k / total_n`, exponential fit, "half-life = ln2/k" at `:108`); hercules burndown | Needs a blame snapshot every N days across history (`--interval` default one week, `analyze.py:241, 321`). | no | Gives a lifetime number for a repo's lines. | Apache-2.0 | Skip: needs K full blame passes; sl's questions are about who, not how long. If wanted later, derive from the `--at` series (C45). |
| C33 | Ownership by e-mail domain (company) | git-of-theseus `analyze.py:108, 314` (`("domain", author_email.split("@")[-1])`) | Per-domain curve. | no (`--group-by` has dir and ext) | Single-vendor concentration in open source ("62% of surviving lines come from one company's domain") is a due-diligence question. | Apache-2.0 | Native: `--group-by domain`. Domains of public mailbox providers (gmail.com, users.noreply.github.com, outlook.com ...) shown as `personal/private`, never as a company. Medium. |
| C34 | Overwrites matrix: whose lines were replaced by whom | hercules `leaves/burndown.go:1189-1209` (`updateMatrix`: row = original author, column = deleting author, diagonal bucket for self; README "Overwrites matrix") | Incremental line-tracking tree (not blame). | no | Reveals who rewrites whom. Exact only with a line history engine. | Apache-2.0 | Native but bounded and later: `--overwrites <path>` with at most 500 commits, blame of the parent at each deleted hunk. Cost high. See LIT.md #5. |
| C35 | Developer co-change and team clusters | hercules couples `couples.go:46-56` (`PeopleMatrix`, `FilesMatrix`); checkOwners `topology.py` (connected components over co-owners; `_cluster`) | Co-occurrence matrices; components. | no | Mostly exploratory. Connected components over "co-owns any path" probably collapse into one cluster in an active repo (my inference, not measured). | Apache-2.0; MIT | Skip. |
| C36 | File change coupling | hist `change_coupling` `core.py:863-954` (window 1 year, merges skipped, commits with > 30 files skipped, rename tracker `:363-380`, `min_shared` 3, degree = shared / min(revs), jaccard `:920-927`); code-maat `logical_coupling.clj:24-50` (degree = shared / **average** revs, as a percent); git-archaeologist `pr-risk-core.ts:7,69-98` (needs >= 3 commits, partners with >= 20% of the file's commits, blast radius > 5 -> +10, > 10 -> +20); pp `impact.md` (co-change partners as a section) | Pair counting inside commits; skip mass commits. | no | "Also check these files, and these people". Formulas differ (min vs average); pick one and name it. | MIT; GPL-3.0; MIT; MIT | Native. Top-12 #9. |
| C37 | Hotspots and an attention list (churn x ownership risk) | hist `hotspots` `core.py:523-579` (commits per file in window, mid-rank percentile, hotspot when >= 3 commits and top decile, `_percentile_ranks :382-395`); `report.py:49-90` (`attention_list`: orphaned weight 3, single owner >= 80% weight 1, strong coupling degree >= 0.5 weight 1, ranked by weight then commits); git-extras `git effort` (commits and active days per file, `--above`); git-archaeologist curse score (`DESIGN.md`: `changes * log2(authors+1) * exp(-0.5*age_years) * log2(churn_rate+2) * acceleration`, constants "judgment calls", validated on future bug-fixes in RESEARCH.md, not read) | Join of churn with ownership. | no | Ownership alone says nothing about which risky file is also changing weekly; the join answers "what should I worry about first". | MIT; MIT; MIT | Native, using hist's attention rule (weights are the authors' own choices; print the reasons, not a score). Curse score: skip (five hand-set constants). Top-12 #8. |
| C38 | PR risk and reviewers for the files of a diff | git-archaeologist `pr-risk-core.ts:36-124` (per-file risk 0-100; **headline is the worst file, not the mean** `:16-17, 115`; levels 75/40); git-quick-stats `suggestReviewers :1513` (authors of the last 100 commits touching the pathspec); checkOwners `suggest`; sl's Action comments a whole-repo table | Per changed file: curse score, bus-factor-1 module, blast radius. | no (`--reviewers <path>` takes one path) | A PR is a set of files and hunks. Who owns the lines being replaced is a stronger reviewer signal than who owns the file. | MIT; MIT; MIT | Native. Top-12 #1. |
| C39 | Stale files (months since last change) | code-maat `code_age.clj` (months between a file's last modification and "now"); git-extras effort active days | Last commit date per file. | no | A file nobody has touched for 3 years differs from an orphan: nothing changed, so nothing was abandoned. | GPL-3.0 | Native, low: `age of last change` column in `--files`. |
| C40 | Pickaxe, commit search, commit details | hist `find_change` `core.py:814-860` (`git log -S`, or `-G` with regex, `--follow` for a file), `search_commits :760-811`, `commit_details :1172-1254` (branches and tags containing the commit, first tag) | Wrappers over git. | no | Answers "when did this function appear and who added it" after the code is gone; blame cannot. | MIT | Skip: no ownership arithmetic; the assistant has `git log -S`. The skill can say so in one sentence. |
| C41 | Comment-line share and code metrics (cyclomatic, cognitive) | gitinspector `blame.py:92-106`, `comment.py`, `metrics.py` (thresholds: cyclomatic 50, density 0.75, cognitive 45) | Language-specific comment syntax per extension. | no | n/a | GPL-3.0 | Skip: language-specific, GPL, not ownership. |
| C42 | Timeline of insertions/deletions per author per month | gitinspector `timeline.py:25-86`; git-who `hist -l` | Activity volume, not ownership. | no | n/a | GPL-3.0; MIT | Skip (covered by C27 for ownership). |
| C43 | Structural (function-level) churn | hercules `shotness.go:49` (XPath `//uast:FunctionGroup`, needs Babelfish) | AST units | no | n/a | Apache-2.0 | Skip: needs a parser; Babelfish is abandoned (hercules README roadmap). |
| C44 | Sentiment of comments; DTW commit-series clustering | hercules README "Sentiment", "Aligned commit series" | TensorFlow models, FastDTW | no | n/a | Apache-2.0 | Skip. |
| C45 | Ownership and bus factor at past dates (trend) | checkOwners `trends.py` + `USAGE.md:379-388` (one snapshot per period from git log; `historical_activity_confidence` and avg qualified owner count; explicitly **not** comparable to the ownership score); hercules/git-of-theseus snapshots | Commit-based per period. | partly (`--ref` runs one past ref) | "Did the bus factor get worse this year" in one call. | MIT | Native with real blame: `--at <date>[,<date>...]` or `--every year`. Cost K passes; use `--sample`. Rank just below top-12 (see §2 tail). |
| C46 | Result cache keyed by commit | git-who (`internal/cache`, `GIT_WHO_DISABLE_CACHE`, README "Caching"); checkOwners per-repo state keyed by HEAD and config hash with `--max-age`, `--allow-stale` (`METHODOLOGY.md:100`, `USAGE.md:407`); hercules repo cache | Stores parsed history or the ownership map under `XDG_CACHE_HOME` / `~/.checkowners`. | no | An assistant runs several views of one repo in a row (`--files`, `--reviewers`, `--without`); each re-blames everything. | MIT; MIT | Native. Key = (commit sha, path, blame flags, ignore-revs content hash, git version); entries are immutable because history at a sha is. Opt-out flag. Not in top-12 only because it does not change answers. |
| C47 | Commit-graph write to speed log | git-of-theseus `--opt` runs `git commit-graph write --changed-paths` (`analyze.py:~290-298`) | Writes into `.git/objects/info`. | no | Faster. | Apache-2.0 | Skip: sl never writes to the repository. |

### 1.5 Identity

| ID | Capability | Rival(s), evidence | How the rival does it | sl | Where the rival is better | Licence | Verdict |
|---|---|---|---|---|---|---|---|
| C48 | "Never merge these" override | git-archaeologist `.git-arch-identities` with `merge:` and `split:` lines (`.git-arch-identities.example`); DESIGN.md:121-130 ("a false split is visible and recoverable while a false merge silently corrupts") | Plain text file read from the repo root. | no (`.mailmap` can merge; there is no way to say "these two stay apart" against `--merge-identities`) | Shared mailboxes and role accounts. | MIT | Native, small: `--keep-separate <address>` (repeatable) and a `.surviving-lines-identities` file with `split:` lines. |
| C49 | Aliases file / people dict | hercules `--people-dict` (lines "emails and names separated by `|`", README "People"); Truck-Factor `alias.txt` (`<repo>;<alias1>;<alias2>`) | Manual merge file. | partly (`.mailmap`) | None: `.mailmap` is the standard. | Apache-2.0; MIT | Skip. |
| C50 | Login resolution through the GitHub API with a shared cache | bf `ownership.mjs:352-402` (`gh api repos/<slug>/commits/<sha> --jq .author.login`; cache `~/.cache/codeowners/authors.json`; unresolved list asked of the user once) | One API call per unresolved email. | no, and it needs network | Resolves `@login` for CODEOWNERS where noreply parsing cannot. | MIT | Skip (network, token). Keep sl's offline noreply parsing; list unresolved addresses in the CODEOWNERS output. |

### 1.6 CODEOWNERS

| ID | Capability | Rival(s), evidence | How the rival does it | sl | Where the rival is better | Licence | Verdict |
|---|---|---|---|---|---|---|---|
| C51 | Drift between an existing CODEOWNERS and the evidence | checkOwners `drift.py:119-260` (`_find_missing :154`, `_find_stale :177`, `_find_changed :200`), semantics `METHODOLOGY.md:405-415`, `USAGE.md:512-536`; pathologies `knowledge-vacuum`, `phantom-ownership`, `shadow-maintainer`, `ownership-review-divergence` (`METHODOLOGY.md:197-204`) | Match every tracked file to the last matching rule; compare declared owners to inferred owners. Owner-less rules count as intentional. Raw email vs `@handle` and `@org/team` are "not comparable": a note instead of false positives. | no (sl only suggests) | The question "is our CODEOWNERS right" is the most direct policy-versus-reality question. | MIT | Native (spec in top-12 #4). Test vectors: checkOwners `corpus/compatibility.jsonl` (2,518 cases, MIT) can be reused with the notice `Copyright (c) 2026 Samir Musali`; adapt of `patterns.py` (186 lines Python) possible under the same notice, but a JS port from the written rules is simpler. |
| C52 | Which rule owns this path (rule chain) | checkOwners `explain-path` (README table; USAGE.md "Generated CODEOWNERS" section, around line 463: every matching rule in file order, last wins) | Prints matching rules. | no | The glob rules are subtle (`dir/*` direct children only; trailing `/`; interior `/` anchors). | MIT | Native, part of C51. |
| C53 | CODEOWNERS generation that stays valid | checkOwners `generate.py` / `USAGE.md:451-461` (collapse identical-owner subtrees to one `dir/` rule; **re-resolve every contributing path with the drift matcher and fail if owners differ**; warn at 2 MB, refuse above 2,500,000 bytes; GitHub ignores lines with `[...]`; manual block markers `# checkowners:manual:start/end`); bf `ownership.mjs:299-337, 469-531` | See top-12 #11. | partly (`--group-by dir --suggest-codeowners`: one owner, only when >= 50%, no activity check; root files skipped; renderCodeowners bin/surviving-lines.js:4476-4494) | bf never names an inactive person and comments orphaned zones; adaptive depth gives tens of lines; several owners per zone; fallback `*`. sl can name a departed person as the sole owner of a directory. | MIT | Native. Top-12 #11. |
| C54 | Baseline file and expiring suppressions for CI | checkOwners `baseline.py`, `USAGE.md:236-272` (finding id = rule + path + owners; stale baseline rows reported; suppression needs reason, optional expiry, expired -> failure) | JSON snapshot. | no, by design ("Nothing fails because of a share", README Action text) | CI policy only. | MIT | Skip. |
| C55 | Sync via pull request | checkOwners `sync` (branch `checkowners/reconcile-codeowners`, `--dry-run`, `--commit`) | Needs a token. | no | n/a | MIT | Skip (writes, network). |
| C56 | Criticality map (weight paths) | checkOwners `risk.criticality` globs, first match wins, default weight 1.0 (`METHODOLOGY.md:165-171`); defaults 0.8 for deploy/manifest paths (`:190`) | User-supplied weights. | partly (`--include` scopes a run to a glob) | Weighted "knowledge at risk" over critical paths. | MIT | Skip weighting; document `--include '<glob>'` for "bus factor of the critical paths". |
| C57 | Importance by import count | pp `bus-factor.md:45-54` (`grep -rl "<filename>"` over a few extensions) | Substring grep. | no | n/a | MIT | Skip: noisy and language-specific; change coupling (C36) is the deterministic substitute. |

### 1.7 Simulation, backup, onboarding, scoring

| ID | Capability | Rival(s), evidence | How the rival does it | sl | Where the rival is better | Licence | Verdict |
|---|---|---|---|---|---|---|---|
| C58 | Departure simulation extras | checkOwners `busfactor.py:321-396`: files losing their only author, files dropping to **exactly one** author, directories fully orphaned (collapsed to the highest all-orphan directory), repo truck factor before/after, suggested transfers (`_residual`), `--remove-file` (one identity per line, `#` comments), unknown identity -> error | Set arithmetic over per-path author sets. | partly (`--without`: lines, files they own, files nobody remaining would know, bus factor, who inherits most) | Adds "files left with one author" (the next failure), "directories fully orphaned", and a file of identities. | MIT | Native additions to `--without`: `files left with one author: N`, `directories with no remaining author: a/, b/ (n files)`, `--without-file <f>`, unknown author error lists the 5 nearest names. |
| C59 | Backup / second expert per area | checkOwners `busfactor.py:208-269` (candidates from paths sharing a leading directory with at least the confidence threshold and not already owners; else repo-wide top owners excluding the path's own; top 3); pp onboard "Who to Ask" table `onboard.md:186-194` | Adjacent-directory heuristic. | partly (`--reviewers` names a second reviewer in the skill prose, per path) | A repo-wide table "area / primary (active) / backup" answers "who covers payments if Ada is out" without one call per directory. | MIT | Native. Table under `--group-by dir`: add `primary active` and `backup` columns. Backup = active author with most lines in the group excluding the primary; if none, say `none`. |
| C60 | Onboarding path | checkOwners `onboard.py:55-131` (order paths from most to fewest qualified owners; reviewer per step avoiding repeats `:_pick_reviewer`; complexity easy/medium/hard by position and owner count `_complexity_for :113-121`) | Sort and tier. | no | Nice output, arbitrary tiers. | MIT | Skip the tiers; the "area / primary / backup" table (C59) serves the question. |
| C61 | Composite risk score 0-100 | checkOwners `METHODOLOGY.md:175-195` (geometric mean of five factors; tiers 75/50/25); pp `risk-scoring.md:5-72` (severity x likelihood x age x centrality / 64 -> 1-10); pp `dashboard.md:65-76` health-score weights; GitVital healthScore | Weighted formulas. | no | Single sortable number. | MIT; MIT; MIT | Skip: checkOwners itself says the score "is not a calibrated probability" (`METHODOLOGY.md:32-33, 380-388`); pp's inputs (severity, likelihood) are model guesses. sl's literal-output rule argues against. |
| C62 | Evidence quality / completeness number | checkOwners `METHODOLOGY.md:56-84` (signal_quality, analysis_completeness) | Fraction of configured evidence collected. | partly (scope notes) | The idea that missing evidence lowers confidence, not the score. | MIT | Skip the number; keep the list of gaps (sample, shallow, copy detection off, no mailmap, identity guesses) in one `limits:` line. |
| C63 | Reviewer load balance | checkOwners `balance.py`, `USAGE.md:421-449` (GitHub reviews; when only commits are available it prints `git_authorship_proxy` and **recommends nobody**) | GitHub API sample of 200 PRs. | no | Load-aware routing. | MIT | Skip (network, token). The "recommend nobody when the signal is a proxy" behaviour is worth copying as a prompt rule (§3 P18). |
| C64 | Adaptive recency (half-life from a path's own commit gaps) | checkOwners `analyze.py:1190-1197` (`_cadence_days`: median gap between unique commit times), `effective_half_life` used at `:653`; bf fixed half-life 365 d `ownership.mjs:166-167` | Exponential decay of commit weight. | no (sl orders by lines, activity is information only) | Avoids calling the owner of an 18-month-cadence file "inactive" (checkOwners golden case "Stable cadence", `METHODOLOGY.md:356-358`; note that checkOwners itself fails this case today). | MIT | Skip as a score. Take the idea for the activity flag only if needed: show `path cadence: median gap 71 days` next to an inactive owner on a path. Low. |
| C65 | MCP server surface | hist `server.py` (11 tools, read-only annotations `:63-65`, instructions `:41-56`); git-archaeologist `mcp/server.ts` (5 tools) | stdio MCP | no (CLI, skill, hook, Action) | Structured tool calls for assistants without shell access. | MIT; MIT | Not verified that it raises answer quality. If built, hand-rolled JSON-RPC over stdio to keep "no dependencies"; wrap `--json` outputs 1:1. Defer. |

## 2. Top 12, ranked, with specs

Ranking criterion: how often an assistant is asked the question, how wrong the assistant is today without it (it either guesses or runs many commands), and how cheap it is on top of data sl already holds. Items already under construction (`--orphans`, `--without`) are not ranked; their gaps are in C17 and C58.

### Ranked titles

1. Reviewers for a change (`--for-diff <base>..<head>`)
2. What does this person own (`--owned-by <author>`)
3. Why is this person not an owner here (`--why-not <author> -- <path>`)
4. CODEOWNERS check against the evidence (`--check-codeowners`)
5. History-quality and workflow caveats (imported root, young history, merge strategy)
6. Bus factor among active authors, separate from orphaned
7. Ownership tree (`--tree [depth]`)
8. Attention list: files that change often and are orphaned, single-owner or coupled
9. Change coupling for a path (`--coupled <path>`)
10. Recent-code ownership and survival ratio (`--written-since`, inserted/deleted)
11. Adaptive CODEOWNERS generation (active owners only, several owners, orphan comments)
12. Ownership timeline and handovers (`--timeline`)

Just below the cut: `--code-only` (C11), `--at` series (C45), domain grouping (C33), concentration line (C12), new contributors (C25), cache (C46).

---

### #1 `--for-diff <base>..<head>`: who should review this change

Rival evidence: git-archaeologist `pr-risk-core.ts:36-124` (per changed file, worst file is the headline `:16-17, 115`); git-quick-stats `suggestReviewers` (`git-quick-stats:1513-1524`, last 100 commits touching a pathspec); checkOwners `suggest`; sl's own Action posts a whole-repo table.

Inputs: a revision range `A..B` (pre-image = A), `A...B` (pre-image = `git merge-base A B`), or `A` alone (= `A..HEAD`). Same filters as the main run (`--exclude`, `--include`, generated/vendored/lock drop, bots, `.mailmap`, `--merge-identities`, ignore-revs file, `--active-days`).

Algorithm:
1. `git diff --numstat -z -M <pre> <post>`; collect changed files with old and new path. Skip binary (`-\t-`). Apply the generated/vendored/lock drop and print how many files were left out.
2. For each file with a pre-image: `git diff -U0 -M <pre> <post> -- <old> <new>`; parse each `@@ -a,b +c,d @@`. Pre-image touched range = a..a+b-1 when b >= 1 (b = 0 is a pure insertion: nothing replaced; a omitted count means b = 1).
3. `git blame -w -M -C --line-porcelain <pre> -L a,a+b-1 [-L ...] -- <old>` with the same ignore-revs and reformat set-aside as the main pass. Split `-L` into chunks of 100 ranges per process. Count touched lines per identity. Also use the file's whole-file owner counts at `<pre>` (one more blame per file, or reuse the main pass when `<pre>` is the analysed ref).
4. Change authors = `git log --format=%aN%x00%aE <pre>..<post>` after mailmap; listed on their own line and excluded from the suggestion (do not suggest the author as the reviewer).
5. Reviewer table: identity | touched lines they own (share of all touched lines) | files where they own most touched lines | whole-file lines they hold in these files | last commit anywhere | active/inactive. Order: touched lines desc, then whole-file lines desc, then address.
6. Per-file flags (one line each, in this priority): `all touched lines belong to inactive authors` (names them); `no active author holds 20% of the file` (same rule as `--orphans`); `single owner holds >= 80% of the file`; `new file`, `deleted`, `renamed from <old>`; `touched lines owned by the change author only`.
7. Headline = the worst file by flag priority, never an average.

Output (text):
```
change main..feature: 14 files, 212 lines replaced or deleted, 63 lines added, 3 new files; 2 files left out (generated)
change authors: Ben Ng
suggested reviewers (by lines this change replaces, 212 lines):
  Ada Lovelace <ada@x>   120 (56.6%)  9 files  active (last commit 2026-10-02)
  Cy Dunn <cy@x>          61 (28.8%)  3 files  inactive (last commit 2025-04-11, last anywhere 2025-04-11)
worst file: src/pay/ledger.ts: all 31 touched lines belong to Cy Dunn (inactive); no active author holds 20% of the file
```
Flags: `--for-diff` is a path-style view (cannot combine with `--group-by`, `--csv`, `--markdown`, `--identities`, `--files`); `--json` allowed; `--top` limits reviewer rows.

Edge cases: merge commits inside the range are ignored (endpoint diff only); shallow clone refused as elsewhere (a boundary pre-image gives every line to one commit); rename with edits blames the old path; mode-only change has no hunks (0 touched lines, listed); empty diff -> exit 0 with "no changed files"; more than 300 changed files -> blame only the 300 with the most touched lines and say so (mirrors hist's truncation note, `core.py:1132-1135`); a file whose pre-image blame fails (submodule) is listed as `not blamed`; ties deterministic by address.

Caveat line to print: "lines being replaced, not who understands the change".

### #2 `--owned-by <author>[,<author>...]`

Rival evidence: git-who `--author` (`main.go:455-470`); checkOwners `owners`, `explain --owner`; gitinspector `responsibilities.py:25-36`; hist per-author `files_as_main_owner` (`core.py:1085-1110`).

Inputs: one or more author selectors, name or address, resolved exactly like `--without` (after `.mailmap` and `--merge-identities`). Optional `-- <path>` scope.

Algorithm: reuse per-file per-author counts held for `--files`. For each selected identity:
- lines held (non-blank, and with-blank when both bases are shown), share of all counted lines;
- files with >= 1 surviving line; files where they are the top owner; files where they hold >= 50%; files where they are the only author with lines ("only this person has written");
- per top-level directory (or `dir:n` with `--group-by`): lines, share of that directory, whether top owner;
- last commit anywhere and active flag (`--active-days`); commits and commit share.
Output:
```
Ada Lovelace <ada@x> holds 1,204 non-blank lines (14.2% of 8,470; 1,310 counting blank lines), in 61 of 480 files
  top owner of 22 files, half or more of 15, the only author with lines in 6
  by directory: src/engine/ 640 (74% of it, top owner), src/api/ 301 (31%, 2nd), docs/ 12 (3%)
  files only Ada has written: src/engine/a.ts, src/engine/b.ts, ... (6)
  last commit 2026-09-02, active (365-day window)
```
Edge cases: unknown author -> exit 1 with the 5 closest names by edit distance on name and address local part; author is a bot (excluded from counts) -> say "bot, not counted; use --include-bots"; author with commits but 0 surviving lines -> print commits, first and last commit date, and "none of their lines survive" (and point to `--why-not`); several selectors -> one block each; JSON `owned: [{identity, lines, files, topOfFiles, halfOrMoreFiles, soleAuthorFiles:[...], byDirectory:[...]}]`. `--top n` caps file lists (default 10) and says how many more.

### #3 `--why-not <author> -- <path>`

Rival evidence: checkOwners `explain --why-not` (`USAGE.md` section "Explain and owners"; `METHODOLOGY.md:78-84`). Both flags use the same numbers as the main view, so the answer cannot disagree with the table.

Inputs: author selector (as #2), path (file or directory).

Algorithm: compute the `--reviewers` table for the path. Then classify, first match wins:
1. `unknown identity`: not found after mailmap/merge -> list 5 nearest names and the `identity hint` if two addresses might be the person.
2. `never touched`: no commit at the path in the whole history (use `git log --follow` for a file) -> "no commit by <x> touches <path>".
3. `no surviving lines`: has commits (print count, first and last date) but 0 lines -> "all lines of theirs here were replaced or removed"; name the largest current owner of the files they last edited if cheaply known (optional, `git log -1 --format=%h -- <path>` author). 
4. `below the listing cut`: has lines but not in the printed list -> "ranked k of m with n lines (x%); the third place holds y lines, so the cut is y lines" (the reviewers view lists people with >= 10 lines or 3%; print the numbers it used).
5. `listed but inactive`: ranked inside the cut; show last commit at the path and anywhere, and the cutoff date.
6. `split identity`: if the identity hint links another address with lines, print "also appears as <addr> with z lines; counted together they would rank r".
Output: `Cy Dunn is not a suggested reviewer of src/pay/: 88 lines (4.1%), ranked 5th of 9; the third place holds 190 lines. Last commit at the path 2025-04-11; no commit anywhere since (inactive under the 365-day window).` Always print the numbers that decided it.

Edge cases: path is a directory with no files in the sample (say so); sampled runs (`--sample`) - print "sample 1 in 5"; exit code 0 always when classification succeeds.

### #4 `--check-codeowners [<file>]`

Rival evidence: checkOwners `drift.py:119-260`, `patterns.py`, `METHODOLOGY.md:197-204, 405-415`, `USAGE.md:512-536`; LIT.md #6 (same idea, not read then).

Inputs: path to a CODEOWNERS file (default: first existing of `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS` (memory: GitHub's lookup order)); `--ref`; the ownership data of the run.

Algorithm:
1. Parse: strip comments (`#` to end of line unless escaped `\#`), split on unescaped whitespace; first token the pattern, rest owners (`@user`, `@org/team`, email). Lines with `!` negation or `[...]` ranges are reported as `not supported by GitHub (line n)` and skipped (checkOwners `patterns.py:80-96`, `METHODOLOGY.md:413`; GitHub behaviour (memory)).
2. Matching (verified from METHODOLOGY.md:407-413): last matching rule wins; `*` stays inside one segment, `**` crosses; leading `/` anchors to root; an interior `/` also anchors; a bare name floats to any directory; `dir/*` matches direct children only; trailing `/` matches files inside, not a sibling sharing a prefix. Owner-less rule = intentionally unowned (counts as covered).
3. For every tracked file (same drops as the run) find the last matching rule.
4. Findings:
   - `missing`: files no rule covers (group by top directory; count).
   - `stale`: rules matching no tracked file (line number).
   - `changed`: per rule, over the files it covers, the observed owners = authors with >= 20% of the covered surviving lines (max 3); if the declared set and observed set share nobody, report "owners diverge"; show declared, observed with shares.
   - `phantom`: a declared owner mapped to an identity with 0 surviving lines in the covered files and no commit there in 12 months (checkOwners `phantom-ownership`).
   - `shadow`: a declared owner exists and an observed author holds >= 50% of the covered lines and is not declared (`shadow-maintainer`).
   - `inactive declared`: a declared owner mapped to an identity with no commit in `--active-days` anywhere.
   - `not comparable`: `@org/team` handles and handles/emails that cannot be mapped to an identity offline. Never counted as drift (checkOwners `drift.py:261` `identities_incomparable`; `USAGE.md` drift section says it emits a note instead of false positives).
   Mapping a declared handle to an identity: noreply address `<id>+<login>@users.noreply.github.com` or `<login>@users.noreply.github.com` -> `login` (sl already has `githubLogin()`); email equality; case-insensitive owner compare.
5. Output counts and the worst 10 of each kind with line numbers; no severity number.
Output sample: `CODEOWNERS (.github/CODEOWNERS, 14 rules): 31 of 480 files have no rule (src/tools/ 18, scripts/ 13); 2 rules match no file (lines 9, 12); line 4 "/src/pay/ @cy": @cy holds 0 lines there and has no commit since 2025-04-11; Ada holds 74% and is not listed; 3 rules name teams (@org/payments), not comparable offline.`
Edge cases: no CODEOWNERS -> exit 1 with the locations tried; patterns with spaces need `\ `; very large file (> 3 MB: GitHub refuses it (memory; checkOwners `USAGE.md:134, 457` warns at 2 MB and refuses at 2,500,000 bytes)); JSON `codeowners: {file, rules, missing, stale, changed, phantom, shadow, notComparable}`. Tests: reuse checkOwners `corpus/compatibility.jsonl` (2,518 cases; MIT; keep `Copyright (c) 2026 Samir Musali` in THIRD-PARTY-NOTICES.md).

### #5 History-quality and workflow caveats

Rival evidence: bf `ownership.mjs:583-600`, `SKILL.md:115-126`; checkOwners `limitations.md:56-66`; CodeScene "inconclusive" (LIT.md #16).

Inputs: none (always on; one to three lines under the header, also in JSON `history`).

Algorithm:
1. Oldest root: `git rev-list --max-parents=0 <ref>`; if several, use the oldest by author date and print the number of roots.
2. `rootFiles` = files added by that commit (`git diff-tree --no-commit-id --name-only -r --root <sha>`); `tracked` = files at the ref. `importLikely` = `tracked > 0 and rootFiles / tracked > 0.25` (rival constant; sl should print the ratio, not just the boolean).
3. `youngHistory` = days between the root commit author date and the ref commit date < 550 (rival constant) and not `importLikely`. Report both causes separately; never say "imported" for a young repo (bf `SKILL.md:124-126`).
4. Merge strategy from non-merge and merge commits reachable from the ref (apply `--since/--until` if given): `merges = commits with >= 2 parents`; if `merges / all >= 5%` -> `merge`; else among non-merge commits if `>= 50%` have a subject ending in `(#<digits>)` -> `squash`; else `rebase`.
Output:
```
history: begins 2023-04-03 with a commit that adds 812 of 1,040 files (78%); lines older than that are credited to whoever imported them, so the table describes work since the import
history: 214 days old (38 commits); a short window, not an import
workflow: squash merges (71% of subjects end in "(#NNN)"); the table names the squasher or PR author; only Co-authored-by trailers name anyone else
```
Edge cases: root commit that only adds a LICENSE (0.25 rule fine); monorepo subtree merges (several roots) - print root count; `--since` windows apply to the workflow percentage only; shallow clones are refused before this runs; empty history impossible after the shallow check.

### #6 Active bus factor, reported separately from orphaned

Rival evidence: bf `ownership.mjs:250-274` and `SKILL.md:15-25`.

Inputs: existing `--active-days` (default 365, relative to the ref's commit date) and `--bus-factor-threshold`.

Algorithm: active set = identities with a commit in the window (anywhere in the repo, as the activity line already does). Active lines = lines held by active identities. Active bus factor = smallest k such that the k largest active holders reach `threshold%` of the **active** lines (bf `:256-265`: `cumulative / activeWeight >= 0.5`); `none` when no active identity holds a line. Also print `inactive share` = inactive lines / all lines. Print the base explicitly: bf's base is the active lines, which is not the all-lines base of the headline number, and a reader will confuse them.
Output (default view, under the existing bus factor line):
```
bus factor 2 (50% of 8,470 lines): Ada and Cy
active bus factor 1 (50% of the 4,612 lines held by the 5 authors active in the last 365 days): Ada alone; 45.6% of all lines belong to people with no commit in that window
```
In `--group-by` blocks add the same pair per group, and a `verdict` column with two separate labels: `single point` (active bus factor 1) and `orphaned` (from `--orphans` rule). Never fold them into one rank (bf `SKILL.md:79` "do not sort them into one 'risk' ranking").
Edge cases: identity hints (weak/strong) apply as in the main number; with `--merge-identities`, activity is evaluated after the merge (bf merges aliases **before** deciding activity, `ownership.mjs:566-568`); bots excluded; threshold 100.

### #7 `--tree [depth]`

Rival evidence: git-who `subcommands/tree.go:195-300`, `tally/tree.go:67-93`.

Inputs: optional depth (default 2; 0 = unlimited), optional `-- <path>`; uses per-file per-author surviving lines.

Algorithm: build the directory tree of counted files. Node owner = author with the most surviving lines in the subtree; node share = owner lines / subtree lines. Collapse chains: a directory with exactly one child that is a directory is printed on the same line (git-who `tree.go:214-231`, only while depth < max). Print an annotation on a node when it is a directory, or when its owner differs from its parent's owner (`tree.go:262-263`); files with the same owner as their parent get no annotation. Directories first, then files, each alphabetical (`tree.go:277-286`). Mark an owner who is not active with `(inactive)`. Mark a node `no owner above 50%` when the share is < 50%.
Output:
```
src/ ................ Ada Lovelace 41% (of 3,310)
├── engine/ ......... Ada Lovelace 74%
│   └── jit.ts ...... Cy Dunn 91% (inactive)
├── api/ ............ Ben Ng 52%
└── util.ts ......... Ben Ng 100%
```
Flags: `--tree` is a path-style view (not with `--group-by`, csv, markdown); `--json` returns nested nodes `{path, owner, share, lines, children}`. Edge cases: ties broken by address; files with all lines to a bot are shown with "bot"; width limited to 100 columns (truncate the middle of paths); `-- <path>` roots the tree there; depth 0 on a large repo needs `--top` for children per node (default 25, remainder shown as `... 14 more`).

### #8 `--attention`: files that change often and are risky

Rival evidence: hist `report.py:49-90` (`attention_list`), `core.py:523-579` (hotspots), `core.py:1035-1039` (blame only the most-changed files).

Inputs: `--window` (default 12 months, via `--since` if given), minimum commits (3), `--top` (10).

Algorithm:
1. Per file, non-merge commits in the window, rename-aware (replay renames newest to oldest as hist `_RenameTracker core.py:363-380` and bf `ownership.mjs:155-192` do), for files that exist at the ref and pass the sl drops. Skip bots.
2. Keep files with >= 3 commits.
3. For each, reasons (each with a printed number): `orphaned` (sl's `--orphans` rule; weight 3 in hist), `single owner` (top owner >= 80% of the file's surviving lines; weight 1), `coupled` (some partner with coupling degree >= 0.5, from #9; weight 1). Score = sum of weights; rank by score then commits then path (hist `:89`). Files with score 0 are omitted.
4. If the repository is large, blame the 200 most-changed files only and print the truncation note (hist `core.py:1132-1135`); otherwise all kept files.
Output:
```
attention (12 months, files with at least 3 commits):
1. src/pay/ledger.ts: 14 commits; orphaned (Cy Dunn, last commit 2025-04-11, holds 81%); changes with src/pay/rules.ts (degree 0.71)
2. src/engine/jit.ts: 9 commits; single owner (Ada Lovelace 93%)
none: no file with at least 3 commits in the window is orphaned, single-owner or coupled
```
The last line is the required negative result, stating the scope (hist `report.py:157`). Edge cases: young repo (< window) uses the whole history and says so; JSON `attention: [{file, commits, reasons:[...], score}]`.

### #9 `--coupled <path>`

Rival evidence: hist `core.py:863-954`; code-maat `logical_coupling.clj:24-50`; git-archaeologist `pr-risk-core.ts:7, 69-98`.

Inputs: a file; `--since` (default 12 months), `--min-shared` (3), `--max-files-per-commit` (30), `--top` (10).

Algorithm: `git log --no-merges --name-status -M -z --format=%H --since=<d>`; replay renames so old names map to the current path; for each commit with at most 30 touched files (others counted as skipped) take the set of current-tree files; `revisions[f]` = commits touching f; `shared[target, g]` = commits touching both. For each partner g with shared >= 3: `degree = shared / min(revisions[target], revisions[g])` (hist `:920-927`; note code-maat divides by the **average** revisions and gives a percent, so the numbers differ; print which one), `jaccard = shared / (ra + rb - shared)`, and `% of target's commits = shared / revisions[target]`. Sort by degree desc, shared desc, jaccard desc, path (hist `:944`). For the top 5 partners print their top owner (surviving lines) and active flag, and finish with `reviewers across these files`: sum of the top owners' lines in target + top 5 partners.
Output:
```
src/pay/ledger.ts: 14 commits since 2025-10-24; changes together with:
  src/pay/rules.ts    10 shared  degree 0.71  jaccard 0.56  top owner Cy Dunn 81% (inactive)
  test/pay.test.ts     8 shared  degree 0.57  jaccard 0.42  top owner Ada Lovelace 64% (active)
commits skipped for touching more than 30 files: 3
```
Edge cases: target has < 3 commits -> "not enough history for coupling" (git-archaeologist `MIN_COMMITS_FOR_BLAST = 3`: a file born with N others co-changes with all of them, an artifact); the target is a directory: unsupported in v1 (say so); files deleted at HEAD omitted; bots' commits excluded.

### #10 Recent-code ownership and survival ratio

Rival evidence: git-fame `_gitfame.py:320, 372-375, 404-406` (window on blame; ins/del); gitinspector `blame.py:95, 188-192`.

Inputs: `--written-since <date>` (and optional `--written-until <date>`).

Algorithm:
1. From the blame porcelain already read, for each surviving line take `author-time`; count the line for its author when `since <= author-time < until`. (Not git's `--since`: that limits by committer date and marks older lines `boundary`; state that sl uses author date. Lines credited by reapply or set-aside logic keep the author-time of the credited commit.)
2. Inserted lines in the same window: `git log --numstat --no-merges --since --until --format=%H%x00%aN%x00%aE` over the same files (`-M` so renames are not insertions), after mailmap/identity merge, with bots, dropped files and set-aside commits (reformat, boilerplate) removed from the numstat too. Insertions per identity.
3. Per author: `written` (alive, from step 1), `inserted` (step 2), `kept = written / inserted`.
Output: table columns `written-since`, `inserted`, `kept` added to the author table; header line `lines last changed between 2026-04-24 and 2026-10-24: 1,980 of 8,470 (23.4%)`.
Edge cases: with copy detection (`-C`) a line can be credited to an older commit: it is simply not in the window; `kept` can only exceed 100% if numstat was filtered more than blame, so cap display at 100% and flag as `check filters`; a window before the repo's first commit prints zero rows and says so; `--sample` samples both passes by the same file hash; `--co-authors share` is rejected with this flag (fractional lines); empty `inserted` prints `-`. Optional second flag `--churn` adds all-time `inserted` and `deleted` columns (git-fame `--loc ins,del`).

### #11 Adaptive CODEOWNERS generation

Rival evidence: bf `ownership.mjs:24-33, 231-243, 285-337, 469-531`; checkOwners `USAGE.md:451-465`.

Inputs: `--suggest-codeowners adaptive` (needs no `--group-by`); `--owner-coverage` (default 0.70), `--max-owners` (3), `--max-depth` (6), `--orphan-share` (0.25). Weights are surviving lines (not decayed commits as in bf).

Algorithm:
1. Build the directory tree with per-author lines bottom-up (as #7).
2. For a node: `active owners` = smallest set of **active** authors, ordered by lines, whose lines reach `coverage` of the lines held by active authors in the node, capped at `max-owners` (bf `ownerSet :231-243` with `include = isActive`). `activeShare` = active lines / all lines of the node.
3. Orphaned node: `activeShare < 0.25` (bf `:29, 271`).
4. Emit a rule for a node (depth >= 1, depth <= max-depth) only when it is significant (>= 3 files and >= 200 lines; bf uses weight 1.5 and 3 files, `:31-32, 306`, in its own units) and (it is orphaned, or the owners inherited from the parent hold less than `coverage` of the node's active lines; bf `inheritedCovers :285-292, emit :309-310`). Descend with the node's own owners when a rule was emitted, otherwise with the inherited ones.
5. Render: header comment with parameters and "Ownership is inferred, not authoritative" (bf `:478-483`); fallback `* <root active owners>` first; rules ordered by depth then path so the most specific comes last (last match wins; bf `:505-507`); orphaned nodes as a comment `# dir/ - ORPHANED - no active owner (n files). Last worked on by: A, B, C` followed by `/dir/ <fallback owners>` (bf `:514-522`); a `# bus factor 1` comment above single-owner rules.
6. Owner tokens: `@login` from the noreply address (existing `githubLogin`) else the address; list addresses that could not be turned into a login under a trailing comment (sl cannot call the GitHub API).
7. Self-check before printing: resolve every counted file through the matcher from #4 and confirm the rule chosen gives the intended owner set; if not, print an error instead of the file (checkOwners `generate.py` round trip).
Never name an inactive person as an owner (bf `SKILL.md:109-113`); if the root has no active owner, print only comments.
Edge cases: the output is printed, never written (sl rule); root files get the `*` fallback; `[`, `]`, `!` or spaces in a path: skip that rule with a comment (GitHub ignores `[...]` lines (checkOwners `USAGE.md:459`)); output over 2 MB warns (checkOwners numbers; GitHub's 3 MB limit (memory)).

### #12 `--timeline [<path>]`

Rival evidence: git-who `hist` (`tally/bucket.go:78-90, 146-185`); git-archaeologist `risk/evolution.ts:9-95`; hercules "Code ownership"; git-of-theseus `authors.json`.

Inputs: optional path (file follows renames with `--follow`), `--by commits|lines` (default commits; lines = numstat added + removed), `--range`/`--since/--until`.

Algorithm: author date of non-merge commits (after mailmap and merge-identities, bots out) bucketed by a resolution chosen from the span: > 5 years yearly, > 60 days monthly, else daily (git-who `bucket.go:146-185`). For each non-empty bucket: winner (most commits, or most lines), winner count, bucket total, winner share. Handover: between consecutive non-empty buckets the winner changes and the new winner's share is >= 50% -> print `handover`. Empty buckets between the first and last commit print as blank rows (git-who does).
Output:
```
src/engine/ (commits, yearly, 2019-2026)
2019  Ada Lovelace   51 of 60   85%
2020  Ada Lovelace   44 of 71   62%
2021  Cy Dunn        38 of 52   73%   handover: Ada Lovelace -> Cy Dunn
2022  Cy Dunn        12 of 14   86%
2023
2024  Ben Ng          9 of 18   50%   handover: Cy Dunn -> Ben Ng
```
Label: "commits, not surviving lines". Optional `--at <date>[,<date>...]` (the same item's blame mode, C45): for each date resolve `git rev-list -1 --first-parent --before=<date> <ref>` and run the normal pass at that commit (strongly with `--sample`), printing bus factor and the top 3 holders per date.
Edge cases: single author -> one winner per bucket and no handover; path never existed in a bucket; shallow refused; time zones (use author date in author's zone for the bucket label, as hist `%as`); JSON `timeline: [{bucket, winner, count, total, share, handover}]`.

## 3. Prompt, skill and agent behaviours worth adapting (text, not code)

Licences are the rival's. Quoted text is verbatim from the file shown. "Ours" says whether skills/surviving-lines/SKILL.md already has it.

| ID | Behaviour | Exact text worth adapting | File:line | Licence | Ours |
|---|---|---|---|---|---|
| P1 | Two separate verdicts, never one ranking | "An orphaned area is strictly worse, and it is invisible to `git shortlog`: the departed author still shows up as a confident-looking top committer. Always report the two separately. Never present an orphaned zone as merely "low bus factor"." (and the table defining `bus factor 1` versus `orphaned`) | bf `SKILL.md:15-25` | MIT, `Copyright (c) 2026 k41n` | no; add once `--orphans` ships |
| P2 | Ask once, in one batch, before trusting the verdicts; show the roster | "Ask the user, once, in a single batched question - do not ask per person." and "Show the user the authors the script considers *inactive* before you trust the orphan verdicts. A contractor who is still around but has not committed in 13 months will be misclassified." | bf `SKILL.md:56-64` | MIT | partly (skill asks before writing .mailmap; no roster check) |
| P3 | "If X leaves" view as the part the user acts on; verdicts visually distinct | "Concentration by person - for each active author, how many zones name them as sole owner. This is the "if X leaves" view, and it is usually the part the user actually acts on." and "Make the two verdicts visually distinct; do not sort them into one "risk" ranking." | bf `SKILL.md:77-79, 75-76` | MIT | no (add to the `--without` rule when it ships) |
| P4 | Two causes of thin history; do not claim a false past | "Thin history has two causes - do not conflate them." ... "Stating "this repo was re-imported" about a genuinely young repo is a false claim about the codebase's past, and it invites a staffing conclusion the data does not support." | bf `SKILL.md:115-126` | MIT | no (needs #5) |
| P5 | Inferred, not authoritative; proxies named | "The output is inferred, not authoritative. Commit volume is a proxy for knowledge, not a measurement of it. A reviewer who never commits looks like a stranger; someone who ran a mechanical refactor across the tree looks like an expert. Present results as a starting point for the user to correct, and expect hand edits to be lost on the next regeneration - say so when handing over." | bf `SKILL.md:128-132` | MIT | partly ("What the numbers cannot show"); the reviewer-who-never-commits sentence is new |
| P6 | Never name an inactive person as an owner | "Never name an inactive person as an owner. GitHub will request review from someone who cannot give it, blocking every PR touching that path." | bf `SKILL.md:109-113` | MIT | no; and `--suggest-codeowners` can currently do exactly this (bin/surviving-lines.js:4476-4494) |
| P7 | State which direction an error pushes the number | "Skipping this splits someone's weight and makes a bus-factor-1 zone read as bus factor 2 - it under-reports risk, which is the one direction this tool must not err in." | bf `SKILL.md:95-98` | MIT | no. sl's skill says "for weak lead with the unmerged figures"; for a **bus factor** question that leads with the less risk-averse number. Suggested rule: when an identity hint exists, give the bus factor with and without the merge. |
| P8 | Importance cross-check on every single-owner finding | "A bus-factor-1 file that's imported by 20 other files = CRITICAL risk. A bus-factor-1 utility used by 1 file = LOW risk." (its measure, a filename grep, is weak; the instruction is the useful part) | pp `commands/bus-factor.md:53-54` | MIT, `Copyright (c) 2026 Project Pilot Contributors` | no; adapt with change coupling (#9) or `grep -rn` for the module name, and say which was used |
| P9 | Plain-language sentence under the headline number | "> [Explanation: "If [N] specific people left, more than 50% of the codebase would have no knowledgeable maintainer"]" - wrong for sl's line definition; the pattern is useful: one sentence that says what the number means for the reader | pp `commands/bus-factor.md:66-68` | MIT | partly (the bus factor definition is printed); add "If these N left, X% of lines would have no surviving author" |
| P10 | Recommendations in three horizons | "1. **Immediate**: ... 2. **Short-term**: ... 3. **Ongoing**: ..." | pp `commands/bus-factor.md:110-114` | MIT | no; only when the user asks what to do |
| P11 | History answers as narrative, with bad-message handling and a depth cap | "**Construct narratives, not lists.** Connect commits into a story." / "**If commit messages are poor** (e.g., "fix", "update", "wip"), analyze the diff to infer intent and note that the message was unhelpful." / "**Limit depth**: For files with 100+ commits, focus on the 10-15 most significant changes (largest diffs, most references, turning points)." / "**Flag interesting patterns**: Reverts, rapid successive changes (debugging?), long gaps then sudden activity, author changes." | pp `agents/git-archaeologist.md:99-105` | MIT | partly (`--history` rule); the bad-message and depth-cap rules are new. Also `:38-44` (extract issue/PR references `#123`, `JIRA-456`, `fixes #`, `closes #`) |
| P12 | Disambiguate the target before analysing | "If multiple locations found, list them and ask the user to pick one (or analyze all)" | pp `commands/history.md:26` | MIT | no (the skill passes the path given) |
| P13 | Detect and answer in the user's language; trigger words in several languages | "Korean message -> Korean output / English message -> English output"; description lists trigger phrases such as "single point of failure", "key person risk", "who owns this code" | pp `skills/bus-factor/SKILL.md:3, 11-14` | MIT | partly: sl's description already lists many English triggers; add "key person risk", "single point of failure", "lottery factor", "truck factor", "who knows this code" |
| P14 | Tool descriptions state the exact rule and point to the better tool | "A directory with >= 3 commits where one author made more than 80% of them ... For line-level ownership and inactive authors use knowledge_risk." | hist `server.py:150-162` | MIT, `Copyright (c) 2026 Alejandro Brito` | partly; skill could add "commit-based counts (`git shortlog`) answer a different question; for lines use this tool" (it has a similar sentence at the top) |
| P15 | Errors that tell the model how to fix the call | "core.py raises ``ValueError`` with actionable messages ("pass an absolute path...", "limit must be at least 1..."), so every tool converts them into a ``ToolError`` and the model can read the hint and correct its call." Example message: "No commits found for '{file}' in {repo.root} - the path must be relative to the repository root (e.g. 'src/app.py') or absolute inside the repository." | hist `server.py:14-16`; `core.py:626-629` | MIT | mostly yes (errors name the filter that emptied the run); check every error names the fix |
| P16 | Every section prints its rule and how to reproduce it | `_Rule: {hot['hint_rule']}._`, `_Silo rule: ..._`, `_Orphan rule: ..._`, "Reproduce with `mcp-git-historian report <repo> --since ... --inactive-after ...`" | hist `report.py:171, 187, 205-207` | MIT | partly (scope notes); the reproduce command line is not printed (`reproduce`: 1 hit in bin) - print it in the header and JSON |
| P17 | A mandatory "look first" list with an explicit negative result | "Files that change often **and** carry a knowledge or coupling risk:" / "No frequently changed file combines churn with a knowledge or coupling risk." | hist `report.py:150, 157` | MIT | no (needs #8) |
| P18 | Refuse to recommend when the evidence is only a proxy | "`git_authorship_proxy` when it did not. Commit totals stay in JSON ... and they are not review load. The text says so and recommends nobody." | checkOwners `docs/USAGE.md:428` | MIT, `Copyright (c) 2026 Samir Musali` | no; rule for the reviewer answer: if the only data is commits (no lines), say so and name nobody |
| P19 | Words not to use; "Never collapse these" | "Contribution into ownership. / Blame into authority. / Recent activity into expertise. / Co-commit clusters into teams. / Inferred reviewer affinity into organizational accountability. / An uncalibrated score into a probability." and the terminology table ("organizational owner" -> "repository-evidence candidate"; a capped count is not "bus factor") | checkOwners `docs/METHODOLOGY.md:242-266` | MIT | partly ("survivorship is not merit"); adopt the six-line list verbatim as a final check |
| P20 | Principles that bound the answer | "3. **Missing evidence is not negative evidence.** ... 7. **Measure uncertainty.** Thin evidence is not certainty. ... 9. **No employee surveillance.** The project optimizes repository resilience, knowledge continuity, review routing, organizational alignment, and onboarding." | checkOwners `docs/METHODOLOGY.md:392-401` | MIT | partly |
| P21 | Fixed notice on every report | `KNOWLEDGE_RISK_NOTICE = "This is a knowledge-risk tool, not a performance-measurement tool. Using it for individual evaluation is unsupported and harmful."` | checkOwners `checkowners/privacy.py:13-16` | MIT | partly (the skill says "never 'who is the best engineer?'") |
| P22 | Evidence, not authority; what history cannot prove | "CheckOwners infers a ranking from repository evidence. That ranking can be wrong. Observed history is evidence, not authority." and the list "What repository evidence cannot prove": formal team ownership, architectural decision authority, operational ownership, incident responsibility, compliance responsibility, security responsibility, current employment, reviewer availability, business ownership | checkOwners `docs/limitations.md:3-4, 29-41` | MIT | partly |
| P23 | Concentration is never risk on its own | "Concentration alone is never treated as risk; it is always paired with **owner activity** (when that person last committed) to separate active concentration from abandoned concentration" | git-archaeologist `DESIGN.md:97-100` | MIT, `Copyright (c) 2026 Sushant Verma` | partly (activity shown beside lines) |
| P24 | False split versus false merge | "a false *split* (two rows for one person) is visible and recoverable, while a false *merge* silently corrupts every downstream metric" | git-archaeologist `DESIGN.md:121-135` (the sentence sits in the "Identity canonicalization" section; exact line not recorded) | MIT | yes in substance (suggest, never auto-merge); keep P7 beside it because for bus factor a false split hides risk |
| P25 | Signals disclaimer attached to every tool result | `SIGNALS_DISCLAIMER = 'These are investigation signals derived from git commit history, not conclusions about code quality, ownership, or who should be assigned work. Commit authorship is not the same as knowledge ownership.'` | git-archaeologist `src/mcp/server.ts:31-34` | MIT | partly (printed under the table) |
| P26 | Few focused tools, not one per command | "Five focused tools, not one-per-CLI-command. Agents do worse with tool sprawl" (an authors' assertion, no measurement shown; not verified) | git-archaeologist `src/mcp/server.ts:23-25` | MIT | n/a unless an MCP surface is built |
| P27 | Decision framing for dependency risk | "a repo with a single contributor isn't necessarily bad, but it should be considered with some level of risk. Are you or your organization willing to assume ownership (fork) of the repository to resolve issues yourself?" | lowendinsight `README.md:25-29` | BSD-3-Clause, `Copyright (c) 2020, Georgia Tech Research Institute (GTRI)` (keep notice if text is reused) | no; useful when the user asks about a dependency's bus factor |
| P28 | Determinism statement | "'now' is the newest commit's timestamp, not the wall clock - so re-running on an unchanged repo produces identical output, and a diff between runs is meaningful." | bf `SKILL.md:49-51` | MIT | sl is deterministic against the ref's commit date; the skill could say so, so an assistant may re-run and diff |

### What the plugin prompts do not contain (checked)

- pp has no ownership computation; its bus factor is `git log --pretty=%an` counts per file with an 80% rule and a 90-day activity cutoff (`contributor-analyzer.md:59-67, 76-79`); numbers come from the model running commands, which is why its answers vary.
- hist and bf put the judgement rules in the tool (hist) or the skill (bf). Only bf's SKILL.md carries behavioural rules; hist's instructions are usage hints (`server.py:41-56`).

## 4. Not verified / not read

- hercules source was read only for the overwrites matrix (`burndown.go:1189-1209`), the ownership serialisation (`:1000-1040`) and struct headers; no run, no Go header copyright found.
- git-fame bug candidate (`_gitfame.py:403`) not executed.
- gitinspector: only the files listed in section 0 were read; the wiki documentation was not.
- git-archaeologist `RESEARCH.md` (validation of the curse score on future bug fixes) not read; the claim is the author's.
- Bus Factor Explorer, Knowledge Islands, CodeScene: not read (LIT.md has only abstracts).
- GitHub behaviours marked (memory): CODEOWNERS lookup order, 3 MB limit.
- The statement that connected-component clustering would collapse into one cluster (C35) is my inference.
- Stars are from `gh api` on 2026-10-24.
