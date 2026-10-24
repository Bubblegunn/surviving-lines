# Changelog

## 0.4.0

**What you get in 0.4.0.** The tool is measured against other Claude Code plugins and plain Claude, and the Claude Code plugin changed to make the answers right (round 13 result: [`bench/head-to-head/results/round13-claude-sonnet-5-5/`](bench/head-to-head/results/round13-claude-sonnet-5-5/)).

- **Runs on more real repositories.** A sweep over 57 public repositories fixed a crash on git submodules and symbolic links, binary-like files counted as code (files with a NUL byte), very slow copy detection on long histories (it is now off by default when files times commits is large), bots that were counted as people, and blank-only authors that broke the totals.
- **Fewer wrong credits.** Formatter runs (also when the commit adds a formatter config file, and for Lua and Dart quotes), boilerplate commits (a licence header added to many files), machine-written files by name (`*.generated.*`, `*.pb.go`, Xcode `project.pbxproj`, snapshots and more) and compiled output next to its source are left out. A re-applied or cherry-picked change is credited to its original author. A commit whose author differs from its committer is named.
- **Both line counts everywhere.** Non-blank lines and lines counting blanks are printed together, with a `top:` line you can quote, in the default view, `--reviewers`, `--history` and `--files`.
- **New views.** `--brief` (the whole repository in at most 40 lines), `--for-diff` (who should review a change), `--owned-by`, `--why-not`, `--without` (what leaves with a person), `--orphans`, `--check-codeowners` and an adaptive `--suggest-codeowners` that names only active people, `--tree`, `--attention`, `--coupled`, `--written-since`, `--timeline`, an activity line, an active bus factor, and history-quality notes (imported root commit, young history, merge workflow).
- **The Claude Code plugin answers more carefully.** The prompt hook adds a pre-computed brief of the repository, a Stop hook checks the numbers and merge claims of an ownership answer once before the agent finishes (it never blocks twice), and a `claim-checker` agent can list unbacked claims in a long report. The skill now names the top owner first and says when that person has stopped committing.
- **Per-directory ownership in the reviewer view.** Files each reviewer owns and single-owner files are listed under the directory table.

Details of each change follow, newest first.

- Round 13 (sweep, gate): generated files by name. `classifyPath` has a case-insensitive name rule list (`GENERATED_NAME_RULES`) for the generated class: `.generated.` or `.gen.` before the extension, `*.g.dart`, `*.freezed.dart`, `*.pb.go`, `*.pb.cc`, `*.pb.h`, `*_pb2.py`, `*_pb2_grpc.py`, `*.designer.cs`, `*.g.cs`, `*_generated.go`, `*_generated.rs`, `*.generated.swift`, Xcode `project.pbxproj`, files inside `*.xcodeproj/` or `*.xcworkspace/`, and `*.snap`. They are dropped unless `--keep-generated` and listed in the `dropped:` line. Plain `.json`, `.csproj` and `.sln` are not matched. Tests: `test/round13-generated-names.test.mjs`.
- Round 13 (gate): the Stop hook is precise. Development gate: 30 of 66 first answers were blocked and the repair turn answered with only a list of corrections, often for false positives. The block reason now ends with `Reply with your COMPLETE corrected final answer (the whole answer again, every part, not only the corrections). Do not mention this check.` The allowed numbers now include the plain-text `--brief` of the same repository (a third run within the existing budget), every tool result of the turn (not only commands naming the tool) and text a hook injected (attachments, meta messages, system reminders). Only three findings can block: a number on a line with exactly one known author that matches no figure of that author and is in no global set, a swap (the number belongs only to another author), and an unhedged identity merge. The generic unverified-number finding and the totals findings are removed; lines with total, together, combined, sum, about, roughly or `~` are skipped. Tests in `test/stop-hook.test.mjs` were updated (an unattached number is now silent; tool results of any command count).
- Round 13 (rival #12): `--timeline [<path>]`, ownership timeline and handovers. Non-merge commits of the files of the run (renames followed by the `--coupled` replay, bots and set-aside commits out, `.mailmap` and `--merge-identities` applied) are bucketed by author date in the author's zone: yearly above 5 years of span, monthly above 60 days, else daily. Each non-empty bucket prints its winner (most commits, or with `--by lines` the most lines added plus removed; ties to the name that sorts first), the count, the total and the share; a winner who changes between consecutive non-empty buckets with a share of 50% or more prints `handover: A -> B`; empty buckets between the first and the last print blank. `--at <date>[,...]` runs the normal pass at the last first-parent commit before each date and prints the bus factor and the top three holders. Own view, `--json` only; JSON key `timeline` (null unless asked; `buckets` holds the spec's `bucket, winner, count, total, share, handover`).
- Round 13 (rival #10): `--written-since <date>` (with `--written-until`, `--churn`), ownership of recent code. Per person: `written` (surviving lines whose blamed author time is in the window, read from the blame pass already done; a re-applied commit keeps the author time of the commit it is credited to), `inserted` (lines added in the window by `git log --raw --numstat -M`, renames replayed, same sampled files, bots, dropped files and set-aside commits out) and `kept` = written / inserted (not capped in JSON; `checkFilters` is true above 1 and the table prints `100%*`); header `lines last changed between A and B: x of y (z%)`. `--churn` adds all-time `inserted`, `deleted` and the survival ratio. The author date is used, not git's committer date; a plain date is 00:00 UTC. A window that ends before the first commit prints no rows and says so. Own view, `--json` only; `--co-authors share` is refused; JSON key `writtenSince`.
- Round 13 (sweep): copy detection (`-C`) is also off by default when the non-binary lines to blame times the commits is above 400,000,000 (`COPY_DETECTION_MAX_LINE_WORK`; the lines are the `--numstat` counts of the blamed files). A repository with 526 files and 1,684 commits was under the files x commits limit but took over 240 s with `-C` (18 s without). The note says `N lines times M commits is more than 400,000,000`. `copyDetectionDefault(files, commits, limit, lines, lineLimit)` takes the lines as a fourth argument. `--copies` still forces it on.
- Round 13 (rival #9): `--coupled <path>`, the files that change together with one file. It uses the commits of `--attention` (one reader, `changeSetsOf`: window `--since` or 12 months before the ref's commit date, renames followed, merges, bots and set-aside commits out) and the same index (`changeIndexOf`). For each partner with at least `--min-shared` (3) shared commits: shared commits, degree (shared over the smaller commit count of the two files, counted over commits that touched at most `--max-files-per-commit` (30) files; code-maat divides by the average and prints a percent, so its numbers differ, and the output says which one this is), jaccard, share of the target's commits; sorted by degree, shared commits, jaccard, path; `--top` caps them (10). The five best get their top owner and active mark, and the reviewers line names up to three people with the most lines across the file and those five. The commits skipped for size that touched the file are counted; fewer than 3 commits gives "not enough history for coupling"; a directory or a file the run does not count is an error that says so. Own view, `--json` only (refused with `--sample` and with pathspecs after `--`). JSON: new key `coupled` (null unless asked; schema updated). `--min-shared` and `--max-files-per-commit` now apply to both views.
- Round 13 (rival #8): `--attention`, files that change often and are risky. Window: `--since`, or 12 months before the ref's commit date (never today); `git log --no-merges --topo-order --name-status -M`, replayed from the newest commit so renames are followed and an add ends the history of a name; bot commits (unless `--include-bots`) and the commits the run sets aside or the user ignores (`--ignore-rev`, `.git-blame-ignore-revs`) are not counted; only files of the run (present at the ref, passing the drops, `--include`, `--exclude`, `-- <path>`) are kept. A file needs `--min-commits` commits (default 3). Reasons with their numbers: orphaned (the `--orphans` rule through `isOrphanFile`, weight 3), single owner (top owner 80% or more, the `--for-diff` threshold, weight 1), coupled (a partner at degree 0.5 or more, weight 1; degree = shared commits over the smaller commit count of the two, over commits touching at most `--max-files-per-commit` files (30), with at least `--min-shared` shared commits (3)). Ranked by score, commits, path; files with score 0 left out; `--top` caps the list (default 10); a `none:` line states the scope when nothing qualifies. The 200 files with the most commits are assessed (blame is still the run's own, whole-repository, so every owner figure is the one the other views print); a note says so when more qualify, and another when the history is younger than the window. Own view, `--json` only (refused with `--sample`). JSON: new key `attention` (null unless asked, an object with `window`, thresholds, `items`, `total`, `more`; schema updated).
- Round 13 (rival #7): `--tree [depth]`, the ownership tree. From the per-file blame counts of the run (non-blank lines, bots out, people folded by name, `.mailmap` and `--merge-identities` applied): every directory and file has the person with the most lines in its subtree (equal lines go to the name that sorts first) and their share. Depth counts levels of nodes (default 2, `0` = all); a directory whose only child is a directory prints on one line and counts as one level; directories first, then files, each alphabetical; a file is annotated only when its owner differs from its directory's; `(of N)` on top-level directories; `(inactive)` for an owner with no commit in the `--active-days` window (the activity rule of the table); `(no owner above 50%)` below half. `--top` caps the children per node (default 25, the largest kept, the rest one `... n more` line), `-- <path>` scopes it, lines stay within 100 columns (names cut in the middle). A bot-only file is listed as `bot` and adds nothing. Own view, `--json` only. JSON: new key `tree` (null unless asked; schema updated, with a `treeNode` definition; the schema checker now follows local `$ref`).
- Round 13 (rival #6): the active bus factor is printed next to the bus factor of all lines. `active bus factor 1 (50% of the 4,612 lines held by the 5 authors active in the last 365 days): Ada alone; 45.6% of all lines belong to people with no commit in that window`, on its own base (the lines of the active people), `none` when no active person holds a line. One function (`activeBusFactorOf`) gives the number to the default view, `--brief` (its `active people only` figure), the `--group-by` blocks and `--json` (`activeBusFactor`, additive), so they cannot disagree. Each group block gets a `verdict` with two separate labels, `single point` and `orphaned` (JSON array `verdict`), never one risk rank.
- Round 13 (rival #5): history-quality and workflow caveats, always on. The oldest root commit (the oldest by author date when there are several; the count is printed) is an import when it adds more than 25% of the files at the ref; a history under 550 days old that is not an import is young; the merge workflow is `merge` (5% or more merge commits), `squash` (half or more of the non-merge subjects end in `(#N)`) or `rebase`. One to two lines under the header of the default view, `--reviewers` and `--history`, one short line in `--brief`, and the JSON key `historyQuality` (the key `history` already holds the `--history` view).
- Round 13 (#11): `--suggest-codeowners` never names a person who has no commit in the `--active-days` window (counted back from the ref's commit date) as an owner. When the top author of a directory has left, the active authors who hold at least 20% are named and a comment `# /dir/: <Name> wrote 71% of the lines but has no commit since <date>` goes above the rule; a rule lists up to 3 owners (the top author and every other active author with at least 20% of the directory); when nobody active holds 20% the directory gets `# orphaned: nobody active holds 20% of /dir/` and no owner line. The header gains a third comment line that states the window. Changed on purpose: `test/group-by.test.mjs` pinned the old output (a single owner per rule, the two-line header), so its expectations changed with it. Tests: `test/round13-codeowners-adaptive.test.mjs`.
- Round 13 (rival #4): `--check-codeowners [<file>]`, a CODEOWNERS file compared with the evidence of the run. The file is the explicit argument (the working tree first, then the ref) or the first of `.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS` at `--ref`; without one the run fails with exit status 1 and the locations tried. Matching follows GitHub: the last matching rule wins, `*` stays inside a segment, `**` crosses segments, a leading `/` or an interior `/` anchors, a bare name floats to any depth, `dir/*` covers direct children only, a trailing `/` covers the files inside, `\ ` and `\#` escape; `!` negation and `[...]` ranges are reported (`unsupported`) and not applied. Six findings with line numbers: `missing` (files no rule covers, by top directory), `stale` (rules that match no file), `changed` (declared and observed owners, people with at least 20% of the covered lines and at most three, share nobody), `phantom` (a declared owner with no line in the covered files and no commit there for 365 days), `shadow` (an undeclared person holds at least half), `inactiveDeclared` (no commit anywhere in `--active-days`). Team handles (`@org/team`), handles with no noreply address in the history and addresses nobody committed with are `notComparable`: listed, never counted as drift, and a rule that names one skips the `changed` and `shadow` checks. A rule without owners is intentional. The text view prints the counts and the worst 10 of each kind; a file of 2 MB or more gets a warning and one above 3 MB says GitHub does not read it. Own view, `--json` only. JSON: new key `codeownersCheck` (null unless asked; schema updated). Tests: `test/round13-check-codeowners.test.mjs`.
- Round 13 (rival #3): `--why-not <author> -- <path>`, why a person is not among the suggested reviewers of a path. It builds the reviewers view for the path (now `rankReviewers`, shared) and classifies, first match wins: unknown identity (closest names), bot, never touched (no commit at the path in the history up to the ref), no surviving lines (commit count, first and last date, largest current owner), below the cut (rank, lines, share, the third place's lines, last commit at the path and anywhere), listed but inactive (both dates, the cutoff date), listed and active. When the identity suggestions link another address that holds lines and the two together would rank inside the cut, the class is `splitIdentity`. Always prints the deciding numbers; a sampled run says `sample 1 in n`; exit 0 when the classification succeeds. Own view, `--json` only. JSON: new key `whyNot` (null unless asked; schema updated).
- Round 13 (rival #2): `--owned-by <author>[,<author>...]`, what one person owns. From the per-file blame counts of the run (non-blank lines, bots out, people folded by name): lines on both bases and shares, files with a line, files where the person is the top owner, files where they hold half or more, files where nobody else has a line, lines per directory (`--group-by dir:<n>` sets the depth) with share and rank, commits and commit share, first and last commit and the active mark (`--active-days`). Authors are resolved as `--without` resolves them (one resolver now, `resolveAuthorSelectors`): name or address after `.mailmap` and `--merge-identities`, comma lists, repeatable, an unknown author is an error with the closest names. A bot is answered as not counted, an author with commits and no surviving line with their commit dates. Own view, `--json` only; `-- <path>` scopes it; `--top` caps the lists (default 10). JSON: new key `ownedBy` (null unless asked; schema updated).
- Round 13 (rival #1): `--for-diff <base>..<head>` (also `<base>...<head>` from the merge base, and a lone `<base>` for `<base>..HEAD`), who should review a change. The pre-image lines the change replaces or deletes (hunks of `git diff -U0 -M`) are blamed at the base commit with the run's own blame arguments, set-aside commits, re-applied credit, `.mailmap`, identity merge and bot rule, 100 ranges per process. The table lists the people who own touched lines, the change authors (everyone who committed in the range) left out, with touched lines and share, files, lines they hold in the changed files, last commit anywhere and active mark (counted back from the head commit). Per-file flags in priority order: all touched lines belong to inactive authors, no active author holds 20% of the file (the `--orphans` rule, now one function), one owner holds 80% or more, touched lines owned by the change author only, new file, deleted, renamed. The headline is the worst file. Files left out of the table (lockfile, generated, vendored, binary) are left out and counted; more than 300 changed files blame the 300 with the most replaced lines. Own view, `--json` only (refused with `--sample`, `--ref` and the other views). JSON: new key `forDiff` (null unless asked; schema updated).
- Round 13 (B1, B3): a Stop hook, `hooks/surviving-lines-check.mjs`, checks an ownership answer before the agent finishes. Gate: the turn's user prompt matches the topic phrases of `surviving-lines-hint.sh` (one list in the script, a test compares it with the shell patterns) and the working directory is a git work tree within the same commit cap. It runs `--json -q` (25 s; also `--merge-identities` when the answer mentions merging) and checks numbers with `%`, `lines`, `commits`, `files` or `authors` against the report and against numbers the tool printed in Bash results of the same turn, swapped author/number pairs on single-author lines, and unhedged identity merges. At most six findings; one block per turn (`stop_hook_active` always allows); silent on any error. `hooks/hooks.json` gets a `Stop` entry (timeout 40); the hooks.json test in `test/hint-hook.test.mjs` was updated for the second event. New agent `agents/claim-checker.md` (haiku) and one sentence in SKILL.md. Tests: `test/stop-hook.test.mjs`.

- Round 13 (B4): `--brief`, one compact plain-text view of the whole repository (at most 40 lines, about 3,000 characters) built from the same analysis objects as the other views: header with ref, commit id and date; top six owners with both line counts, shares and commits; bus factor on both bases and for the people who still commit; activity; orphans; what was left out; same-person guesses as proposals; five first-level directories with their top owner; single-owner files; committed-by-others and re-applied-credit notes; the quote rule. `--brief --json` is a small object (schema: `$defs.brief`). `--time-budget <seconds>` (with `--brief` only) prints nothing and exits 0 when the run is too slow; it stops the git processes it started. The prompt hint adds the brief to its context after the intro (label: `Pre-computed ownership brief for this repository at <sha7> ...`) when node and the plugin's own `bin/surviving-lines.js` exist, cut to 3,500 characters and made JSON-safe; the hook timeout is 30 seconds. The 1,200-character budget of the hint without the brief is kept: the intro sentence was rewritten (B2: counts, shares, bus factor, activity and ownership claims come from SL output; a number SL does not print is the model's own computation and must name its command; quote both line counts; identity merges are proposals) and the closing sentence for same-person groups was shortened, so existing hook tests were updated deliberately: `test/hint-hook.test.mjs` (the closing sentence regex, the length checks that now measure the context without the brief, the ASCII check that allows the brief's line breaks, and the hooks.json timeout), `test/round9.test.mjs` (the 1,200-character check measures the note without the brief) and `test/round8.test.mjs` (the hook no longer carries the `Answer rules: the skill section ...` pointer line; it carries the steering sentences instead).

- Round 13 (G11a): an activity line under the table, `--files`, `--reviewers` and `--history`: `as of <date>: k of n authors committed in the last 365 days and hold x% of the non-blank lines; y% of the lines belong to people with no commit in that time`. The window ends at the ref's commit date, so the line is reproducible; `--active-days <n>` changes it; the line is left out when everyone is active. JSON: new key `activity`. Existing reviewers tests that asserted the text "top owner" appears nowhere were narrowed to a line that starts with it.

- Round 13 (G11b): orphaned files (top owner inactive, no active author holds 20% of the file). `--files` and `--reviewers <dir>` print `orphaned (...): N files, x% of the lines; largest: ...` (five paths); `--orphans` lists up to 30 files with owner, lines and the owner's last commit. JSON: new key `orphans`.

- Round 13 (G11c): `--without <author>[,<author>...]`, a what-if on lines: lines the leavers hold, files whose top owner is a leaver, files where the leavers together hold half or more and the best remaining author holds under 10%, bus factor before and after, and who would inherit most. Names and addresses match after `.mailmap` and `--merge-identities`; an unknown author is an error that lists the closest names. JSON: new key `without`.

- Round 13 (G14): a re-applied change is credited to its original author. A commit that reverts a revert (an even chain of `This reverts commit <id>` messages, two or more, ending at a commit that is not a revert) or a commit with a `(cherry picked from commit <id>)` trailer whose source is in the repository and has another author has its surviving lines counted under the original author, in every view and in the JSON. Every view prints up to five `re-applied work credited to the original author: ...` lines and a count of the rest; JSON: new top-level key `reappliedCredit`, schema updated. An unresolved chain changes nothing. `--no-reapply-credit` turns it off.

- Round 13 (G7): `--reviewers <dir>` and `--history <dir>` print a `files in <dir> by owner` block under the table: each person with at least 10 lines or 3% of the scope (the smaller counts them in) and the files where they hold half or more of the file (five per person, then `and N more`), and a `files only one person has written` line (90% of at least 20 lines, eight at most). JSON: new key `fileOwners` on `reviewers` and `history`; schema updated. SKILL.md tells the model to name a second reviewer with the files that person owns and not to derive it from the `active only` line alone.

- Round 13 (G13): `--reviewers <file>` and `--history <file>` follow the file across renames. The reviewers table gets a `last anywhere` column (newest commit in the whole repository; JSON `lastAnywhere` on each reviewers author) next to the path-scoped `last commit`. Existing tests that matched the old header were updated.

- Round 13 (G12): when the committer of a blamed commit is not its author (after `.mailmap` and identity merging) and the commit holds at least five surviving lines, every view prints up to five `credited to the author: ...` lines and a count of the rest. JSON: new top-level key `committedByOthers`; schema updated. The test fixtures now commit as the author unless a test names a committer (they used a fixed `CI` committer, which would have triggered the note everywhere).

- Round 13 (G6): a boilerplate commit is set aside by default, like a reformat. It touches at least three existing files, deletes only blank lines, and either adds the same non-blank lines to at least three files (every other file adding licence text only) or adds only licence, copyright, SPDX, all-rights-reserved or banner text. A commit that adds files is never boilerplate. It is listed under `mechanical rewrites checked` with reason `boilerplate` (JSON `mechanicalCheck.setAsideCommits[].reason`, schema enum extended); because ignoring a pure insertion in git blame cannot hand the lines to anyone, they are left out of the counts. `--keep-reformat` and `--co-authors share` keep the commit counted.

- Round 13 (G4): generated files are recognised by more headers and by their source. The marker search ignores case and adds "generated by", "generated file", "generated code", "autogenerated", "automatically generated", "do not edit/modify/change", "this file was generated", "produced by" and "compiled from"; the new phrases count only on a comment line, inside a block comment, or on a line that holds both "generated" and "do not", so code that merely uses the word keeps its file. A `.js`, `.lua`, `.css` or `.c` file with a `.ts`/`.tsx`/`.coffee`, `.tl`, `.scss`/`.sass`/`.less` or `.pyx` source beside it (or in a mirroring `src` directory) is dropped as generated, and the `dropped:` line says "compiled output of <source>". `--keep-generated` counts them.

- Round 13 (G3): a commit whose changed lines equal their parent lines after layout and quote folding is set aside by default when its subject names a formatter (widened vocabulary: `mix format`, `dart format`, `stylua`, `ktlint`, `spotless`, `dotnet format`, `lint --fix`, `autofix`, `format code`, `fix style`, `line_length` and more), it touches 10 files, or the proof covers 50 changed lines; a proved commit that meets none of these is listed with `reason: "content"`. Formatter configuration files (`.prettierrc`, `stylua.toml`, `rustfmt.toml`, `.editorconfig`, `pyproject.toml` and others) no longer break the proof. Lua and Dart quote changes count as layout. In a run scoped to paths (`-- <paths>`, `--reviewers`, `--history`, `--files`) any commit holding one surviving line in scope is judged; the 20-line / 5% floor stays for whole-repository runs. A subject without a passing proof is still only listed.

- Round 10: (R10-1) when blank lines were dropped from the counted lines, the author table gets `with blank` and `share` columns (text, Markdown, CSV `lines_with_blank,line_share_with_blank`), and the `bus factor` line states both bases and `counting blank lines: bus factor N` when it differs; JSON authors gain `linesWithBlank` and `shareWithBlank`, `busFactor` gains `withBlank`. With no dropped blank line the table and the bus factor line are unchanged; JSON still gains the new keys, and the new `whitespace-only commits` line (R10-3) appears whenever such a commit exists. (R10-2) `--files [n]` prints one row per file with top owner, share and the next two owners, and a summary line; JSON `files` and `filesSummary`. (R10-3) a `whitespace-only commits` line in every view that prints the scope notes, and JSON `whitespaceOnlyCommits` and `whitespaceOnlySkipped`; it changes no number and stops after 20 seconds. (R10-4) three skill rules for the new output. (R10-5) every git call also passes `core.quotepath=off`, `log.showSignature=false` and `color.ui=never`.

- Round 8: the default blame is now `-w -M -C`; `--copies deep` gives the former `-C -C` default, and `--no-copies` and the 2000-file switch-off stay. When copy detection moves lines to another author, every view and the JSON (`blame.copyEffect`) carries one note naming the three people whose share changed most, with the figure with and without it. Every view and the JSON (`mechanicalCheck`) also carries one line that says how many commits holding surviving lines were examined, how many were set aside, and which commits look mechanical (at least 10 files with equal small changes, or a formatter, lint fix, codemod or rename tool in the subject) and were not set aside; the tool never sets one aside from this line. The identity hint line and the `--history` headline state the strength and lead with the merged figure for a strong suggestion and the unmerged figure for a weak one. Strength is now decided per pair: the strongly linked addresses form one strong group, a weakly linked extra address is a separate `weakAdditions` entry with its own lines, and `--merge-identities` merges the strong groups only. Skill rules updated to match; the hook keeps its pointer to the skill rules.

- Round 7: every view (table, groups, Markdown, `--reviewers`, `--history`, `--identities`) prints the same scope notes from one function. New note and JSON field `mailmap`: the identities a `.mailmap` merged and the lines they add. `--reviewers` orders by surviving lines, prints each person's last commit and an active or inactive marker for information only, and prints the active-only cut as a second line (JSON `suggestedActiveOnly`). The old "prefer the active authors" line is gone.

- Lockfiles, generated files and vendored directories leave every number by default (`dropped:` line, JSON `dropped`; `--keep-generated` counts them). Blame follows moves and copies (`-w -M -C -C`; `--no-copies` turns it off; off above 2000 files). `possible same person` suggestions are never merged. `--reviewers`/`--history` print a `moved or copied here` line (`movedIn`). The bus factor line adds `to reach 80%: N authors`.

**Added: prompt hint.** A Claude Code hook (`hooks/hooks.json` and `hooks/surviving-lines-hint.sh`) reads each prompt. When the prompt is about duplicate identities or code ownership, it adds a short note that points the agent at the skill and the tool, and lists up to four suspected same-person groups with the rule that suggested each. It runs read-only git, is silent outside a repository and above 20,000 commits, and adds at most 1,200 characters. `SURVIVING_LINES_HINT_CAP` changes the cap. It works only in the plugin, not in the npm command. To remove it, empty `hooks/hooks.json` in a local copy of the plugin or disable the plugin.

**Changed: the skill rules for per-type, per-directory, CODEOWNERS and window questions.** The skill now names the command for each: `--group-by ext` for a file type, `--group-by dir` for a directory, `--suggest-codeowners` for CODEOWNERS lines (an owner is named only where one person holds at least half of the surviving lines), and `--since` with `--until` for a window, which limits the commit column only. Those answers merge suggested identities and say the merge is a guess.

**Changed: a detected reformat commit is left out of the numbers by default.** A commit whose changes are only
whitespace or quote changes used to stay in the table, with a note under it. Now the table does not count it, and
the block under the table says so, names the commit, and gives the figures without the correction for the authors it
would move most. This changes the numbers of any run on a repository with a detected formatter commit: the table, the
groups view, the CSV output, the reviewers suggestion and the AI breakdown. To get the old numbers, pass
`--keep-reformat`, which counts the commit again and says so in the block. `--co-authors share` does not apply the
correction, and its block says that too. `--no-detect-reformat` still turns the detection off.

**Added: `--merge-identities`.** Counts the addresses that the identity hint suggests are one person as one person,
for that run only. Nothing is written. The merged row comes first, the table names each merge, and the bus factor
uses the merged rows. A `.mailmap` file is still the way to make a merge permanent.

**Reformat suspects name their files.** Each suspect in the `--json` `reformat.suspects` list now carries a `files`
list, the files the commit changed, so a suspect can be matched to a path. The `--history` view uses it to set commits
aside.

**Added: `--history <path>`.** Lists the people who changed one file or directory, oldest first, with their first and
last commit there, their commits there, and the lines they still hold. Commits that only reformatted the path are set
aside and are not counted. `--since` and `--until` do not change the dates or commit counts of this view, though they
can drop a person who has no surviving lines and no commit in the window.

**Reformatting commits, first listing (round 1).** The table was followed by a list of suspected reformat commits. The
current behaviour is in the Changed entry above, and `--ignore-rev <rev>` still skips one commit when blaming
(repeatable; git 2.23 or newer), the same way `.git-blame-ignore-revs` does.

**Who should review a file.** `--reviewers <path>` lists the authors of one file or directory, most surviving
lines first, with their lines and commits under that path, their newest commit there, and whether they were
active in the year before the ref's author date. The `suggested` line names up to three people.

**Bus factor.** The table is followed by a bus factor line: the smallest number of authors whose surviving lines
together reach 50% of the lines counted. `--bus-factor-threshold <n>` changes the share.

**Identity hint.** When one person appears on two addresses, one `identity hint:` line under the table names them
and points at `--identities`. Its last sentence gives the figure that person would have if the addresses were one,
for example `810 lines (40.8%)`, so the table figure and the merged figure can both be reported. The JSON `identityHints`
people carry `lines` and `lineShare` for that. It is printed once per run, also with `--group-by`.

**One-time star hint.** The first time a person at a terminal reads a table, groups or reviewers view, one line
asks for a star on GitHub. `SURVIVING_LINES_NO_STAR_HINT=1` turns it off for good, and `--quiet` skips it for one
run. It is never printed in CI, when `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CODEX_SANDBOX` or `AI_AGENT` is set, or with `--json`, `--csv`, `--markdown` or `--identities`.

**Head-to-head comparison.** `docs/HEAD-TO-HEAD.md` fixes eleven public tasks before the round runs, and
`bench/head-to-head/` runs them. The round 0 and round 1 results are recorded there and published. The round 1 gate failed (our total 46.00 against 42.67 on the blind grading, the rule needs 20% more), and the independent re-grade has not been done.

**Faster reformat check.** Looking for reformat commits no longer costs several git calls per candidate commit. A default run on a repository with no suspect now takes about the same time as `--no-detect-reformat` instead of about seven times as long. The limit on files per commit rose from 300 to 1000. In shell scripts and other files outside the JavaScript, Python, JSON and CSS families, a quote change is no longer treated as layout. The `suggested:` line now shows lines as well as shares.

**Changed.** The default output now includes the reformat block when a suspect exists, and the identity hint when
a split exists. The bus factor line is printed by default. The Claude Code skill was rewritten: it runs the
plugin's own binary and uses `--reviewers`, the bus factor and the reformat follow-up.

## 0.3.0 (2026-10-20)

**A reformatting commit can be left out of blame.** `--ignore-revs-file <file>` passes a file of revisions to
`git blame --ignore-revs-file`, the same name `workproof` uses, and a repository's own `.git-blame-ignore-revs` at
its root is read by default. `--no-ignore-revs` turns that off. The file that was used is part of the first-line
summary (`git blame -w -M --ignore-revs-file ...`) and of `--json` (`blame.ignoreRevsFile`, `null` when none).
The file sample does not depend on it. It needs git 2.23 or newer, and a run that would use it on an older git
stops and says so instead of ignoring the file.

**Bots are left out of both shares.** An identity whose name ends in `[bot]`, or whose address is a GitHub app
(`<id>+<name>[bot]@users.noreply.github.com`), `bot@renovateapp.com`, `gitlab-bot@gitlab.com` or `teabot@gitea.io`
(the patterns `workproof` uses), no longer appears as an author, and neither its lines nor its commits are in
the denominators, so the line share and the commit share still describe the same people. The second line of the
table says how many identities, lines and commits were left out, and `--json` lists them under `bots.excluded`.
`--include-bots` counts them again. A person whose name only resembles a bot's (`Bot Hawkins`, `Botticelli`) is
counted.

**Who owns which part.** `--group-by dir` prints one block per top-level directory, `dir:<n>` goes `n` levels deep
and `ext` groups by file extension. Each block has its own line shares and the number of sampled files it rests
on, so a group that depends on one file says so; `--json` nests the groups under `grouping`. Bots are left out of a
group's shares like everywhere else. `--suggest-codeowners` (with `--group-by dir`) prints CODEOWNERS lines for the
directories where one author holds at least half of the sampled surviving lines, and a comment for the rest. It
never writes a file.

**Co-authors and AI assistants, from trailers only.** `--co-authors share` splits each surviving line and each
commit equally between its author and the identities in its `Co-authored-by:` trailers, the way `git fame
--auth share` does; `.mailmap` applies to the trailer identities, and the second line of the output says the mode
is on. The default is unchanged. `--ai-breakdown` adds a block with the surviving lines and the commits whose
trailers name an AI assistant: a `Co-authored-by:` address listed in `AI_ASSISTANTS` (each entry cites where the
tool documents it) or an `Assisted-by:` trailer. It counts trailers, not authorship, and says so. With
`--co-authors share`, `lines` and `commits` in `--json` can be fractions, so the schema types them `number`;
`coAuthors` and `aiAssisted` are new keys and `schemaVersion` stays 1. `--co-authors share` cannot be combined with
`--group-by`. With a bot among the co-authors, the AI figures use the same split and bot exclusion as the table, so
the shares stay at or below 100%; `--sort gap` works in share mode.

**A GitHub Action that comments the table on a pull request.** `Bubblegunn/surviving-lines` runs the tool with
`--markdown` on the full history, writes the table to the job summary, and posts it as a pull request comment that
the next push updates instead of adding a second one. It refuses a shallow clone with the `fetch-depth: 0` fix, and
a token that may not comment (a pull request from a fork) is a warning, not a failed build. The table covers the whole
repository at the merge commit, not only the files the pull request changes, and the default sample is 1 in 5 files, printed in the
comment. It is not a gate: nothing fails because of a share.

**The README opens with the problem, one command and a recording.** The first screen is now the problem in a
user's words, the category sentence, `npx surviving-lines`, a terminal recording made with `vhs`
(`docs/demo.tape`, `docs/demo.gif`) and a "How this differs" table whose rows are only the ties and wins in
`docs/COMPARISON.md`. The stars, downloads and bundle-size badges are gone. The package description and keywords
use the same category sentence and the search phrases people type. New files: `docs/FAQ.md` (questions in the
form developers search for), `docs/GEO-PROMPTS.md` (five fixed prompts for measuring whether assistants name this
tool), `docs/LISTINGS.md` (text for npm, the GitHub repository, GitHub Marketplace and Terminal Trove) and a
rewritten `llms.txt`. The Action's `description` is shorter, to fit the Marketplace limit.

**Corrections to claims that git-fame 4.2.1 had made false.** The comparison section said this tool prints commit
share next to line share, as if git-fame did not. git-fame prints a `distribution`
column with both shares, so the section was rewritten against git-fame 4.2.1 and now lists what git-fame does
that this tool does not. "Appears to be unpublished" now says that we did not find a published measurement of the
gap, and that git-fame prints both shares. The timing claims (0.4 seconds, "well
under a minute") had no benchmark behind them and are removed; the comparison document reports wall time on one
fixture. The example output was regenerated, because bots are now left out: on `langchain-ai/openwiki` at
`1e6d54c` the commit count went from 339 to 275 and the top author's commit share from 18.0% to 22.2%. The README example now runs on this repository at `1e37ea6`, so it shows no author addresses. The Turkish
README had the same stale figures and a different timing; it was corrected the same way. The comparison now says
that git-fame groups authors by name, so it merges one name on two addresses without telling you, and the
`--since` window that also applies to blame is listed as a stated loss.

## 0.2.4 (2026-10-16)

**An empty run names the filter that emptied it.** A pathspec after `--` that matches nothing now stops with
`no files matched the pathspec after --: <paths>`, and an `--exclude` that removes every file with
`every one of the <n> files at ref "<ref>" was excluded by --exclude <patterns>`. Both used to print
`no files found in <cwd> at ref "<ref>"`, which describes an ordinary repository as an empty one. Exit code 1 and
an empty stdout are unchanged, and so is the `--include` message from #40. Contributed by
[@Enard52](https://github.com/Enard52) ([#45](https://github.com/Bubblegunn/surviving-lines/pull/45)).

**Turkish README.** The options block lists `--markdown` and `--identities`, and the notes list the empty-run
exits. Both were missing; @Enard52 pointed this out in #45.

## 0.2.3 (2026-10-15)

**Run it as `git surviving-lines`.** Global installation now exposes `git-surviving-lines` as a second name for the existing CLI. The tarball smoke test checks both names with `--help` and `--version`, and fails when a declared bin target is missing. Contributed by [@Aaqibhafeezkhan](https://github.com/Aaqibhafeezkhan) (issue [#29](https://github.com/Bubblegunn/surviving-lines/issues/29)).

**Progress while blaming.** An interactive run now shows `blamed k/n files` on stderr, updated in place, so a
`--sample 1` run on a large repository no longer prints nothing for minutes. Nothing is written when stderr is not
a terminal, and `-q`/`--quiet` turns it off, so piped `--json` and `--csv` output is unchanged. Contributed by
[@Enard52](https://github.com/Enard52) (issue [#31](https://github.com/Bubblegunn/surviving-lines/issues/31), [#42](https://github.com/Bubblegunn/surviving-lines/pull/42)).

**Sort by lines, commits, or share gap.** `--sort gap` orders authors by the absolute percentage-point
difference between line share and commit share, with the previous ordering as the tie-breaker. JSON
records the selected `sort` key, which is required by the version 1 schema. Contributed by
[@Aaqibhafeezkhan](https://github.com/Aaqibhafeezkhan) (issue [#30](https://github.com/Bubblegunn/surviving-lines/issues/30)).

## 0.2.2 (2026-10-14)

**An empty sample is an error, not a result.** `--sample 100000 --seed x` on a repository of 46 files sampled
none and printed a table of 0.0% shares with exit code 0, so a script could not tell it from a real answer;
`--include` patterns that matched nothing did the same. Both now stop with a message on stderr naming the
sample rate and seed, or the patterns, and exit 1, and `--help` lists the exit codes. Written by
[@Enard52](https://github.com/Enard52) ([#40](https://github.com/Bubblegunn/surviving-lines/pull/40), closes
[#28](https://github.com/Bubblegunn/surviving-lines/issues/28)); each of the two checks has a test that fails
without it.

## 0.2.1 (2026-10-14)

**`--markdown` escapes backslashes in names and addresses.** Only `|` was escaped, so a name
containing `\|` came out as `\\|`, which Markdown reads as an escaped backslash followed by a cell
separator, and the row gained a column. Backslashes are now escaped before pipes. Output for names
without a backslash is unchanged: the `--markdown` table for this repository is byte-identical
before and after.

## 0.2.0 (2026-10-14)

**Breaking: Node 22 or newer is required.** Node 20 reached end of life on 2026-04-30 and no longer
receives security fixes. `engines.node` is now `>=22`, and CI tests Node 22 and 24. The floor moves
because a runtime without security fixes is not one this package should keep promising to support,
not because the code changed.

**A shallow clone is refused.** In a `git clone --depth 1` the oldest fetched commit stands in for
all history before it, so blame gave every line to the HEAD author and the run exited 0 looking like
any other: on this repository, 6,069 of 6,069 lines and 1 of 1 commits to one person, against 5,973
lines and 41 of 48 commits on a full clone. `actions/checkout` fetches one commit by default, so a CI
run was the likeliest place to get this. The run now exits 1 with a message naming
`git fetch --unshallow`. `--allow-shallow` runs anyway and marks the output: `shallow clone` on the
first line of the table, the Markdown and `--identities`, `"shallow": true` in `--json`, and a line
on stderr for `--csv`, whose only header is the column names that parsers read. `--json` now always
carries `shallow`, `false` in a full clone.

**`--json` says which layout it is.** Every `--json` document now starts with `schemaVersion` (1)
and `tool: { name, version }`, and `schema/surviving-lines.schema.json` describes the layout and
ships in the package. A script that reads the output can refuse a layout it does not know instead of
reading a renamed key as missing. A test checks a real run against the schema without a dependency
and fails when a required key is missing or an unlisted key appears; CONTRIBUTING says that removing
or renaming a key raises `schemaVersion` and needs at least a minor release.

**git 2.15 or newer is required, and an older one is told so.** The shallow-clone check uses
`git rev-parse --is-shallow-repository`, which arrived in git 2.15.0, and a git that does not know a
`rev-parse` flag prints it back and exits 0, so an older git would have read every shallow clone as a
full one. The run now starts with `git --version` and stops with `git 2.15 or newer is required` and
exit code 1 below that. The other features used are older by git's release notes (`blame
--line-porcelain` 1.7.6, `git -c` 1.7.2, `core.precomposeunicode` 1.7.12). CI still runs only the git
each runner image ships; 2.15 itself is not tested.

CI measures test coverage of `bin/` with Node's built-in `--experimental-test-coverage`, no
dependency, on one leg (`npm run coverage`), and fails below lines 98%, branches 82% and functions
96%, the floor of the 98.48%, 82.80% and 96.43% measured when the thresholds were set. Skipping the
`renderIdentities` test drops line coverage to 95.45% and fails the job.

## 0.1.8 (2026-10-14)

**The release gate died on npm 12 and forbade the entry you are reading.** `npm pack --dry-run
--json` returns an array on npm 11 and an object keyed by package name on npm 12, and the gate read
`packed[0].files`. And its CHANGELOG check required the top entry to carry the package's current
version, while `release.mjs` refuses to release until an entry for the new version exists, so a
contributor's credit could only ever be written at release time.

Both fixes are [@shivam-070208](https://github.com/shivam-070208)'s, written on workproof
([#35](https://github.com/Bubblegunn/workproof/pull/35) and
[#29](https://github.com/Bubblegunn/workproof/pull/29)) and ported here with his four tests. Each
port was checked by re-running the mutation that ignores the requested package name, which fails
exactly its own test. Nothing in the published package changes; this is the tooling that decides
whether a release may happen at all.

## 0.1.7 (2026-09-05)

Two people who were counted as two are now counted as one. `Weiß` and `WEISS` never met, because JavaScript's `toLowerCase` is Unicode's simple case fold and leaves ß alone, while the full fold maps it to ss; the same name typed in fullwidth Latin letters, which is what a Japanese or Korean keyboard produces without switching modes, never matched the ASCII spelling either. Matching now folds both, along with the ﬁ ligature and the compatibility ideographs, and that changes counts rather than columns. The fold is still only for matching: the table prints what git holds.

An Arabic or Hebrew author name no longer reorders the row it sits in. Names carrying strong right-to-left characters are wrapped in the U+2068 and U+2069 isolates that UAX #9 provides, which are invisible and cost no column; rows in other scripts are byte-for-byte what they were.

Column widths now come from the Unicode Character Database instead of a hand-written list. The list this replaced disagreed with the standard on 8,645 assigned code points, calling most emoji one column wide, and on 231 in the other direction. `scripts/gen-width-table.mjs` regenerates the table against a newer Unicode release.

`--identities` and `--help` now say what git can and cannot do with a `.mailmap` name: git matches those names ignoring case for ASCII letters only, verified on git 2.50.1, so a name mapped by name alone has to match the commit's own spelling of its accents and non-Latin letters. The README, in both languages, adds a section on names in every script and states the three choices that are deliberate: fixed `en-US` number formatting, the standard's width for text-presentation emoji, and mapping by address wherever possible.

## 0.1.6 (2026-09-05)

A first measurement of the question this tool exists to ask, in [`research/`](research/): does an author's commit share predict their share of the surviving code? Twelve repositories, three seeds each, 2,748 author rows, with the harness and the raw table committed so the sample can grow and the analysis can be disagreed with. The same person tops both measures in 25 of 36 runs, so the claim that commit counts are worthless is not what this found and is not made; but among authors holding at least 5% of either measure the two shares differ by a median of 7.5 percentage points, and by ten points or more in a third of cases. The document states what twelve repositories cannot support, reports that the top survivor's share moves by up to 17.4 points across seeds at `--sample 5`, and notes that one repository's top committer is a bot, which this tool does not exclude.

The README now places the tool in the line-survival literature it sits beside rather than competing with: Spinellis, Louridas and Kechagia (PeerJ CS 7:e372, 2021) and Gurov (arXiv 2606.04993, 2026). Both measure lines; neither measures people.

No behaviour changed.

## 0.1.5 (2026-09-05)

`--identities` lists the addresses in a repository that look like one person and prints the `.mailmap` lines that merge them. Someone who has committed from a laptop and a work machine is in their own history twice, every count here splits them, and nothing says so. Three signals produce a suggestion: the same name on two addresses, the same address name on two domains, and a GitHub noreply address whose login appears as the name or the address on another row. Role addresses such as `dev@` and bot addresses are ignored. Comparison uses the case fold that makes a Turkish name match itself and a decomposed accent match a precomposed one. Nothing is written, and the tool cannot know whether two identities are one person, so it prints the evidence and stops. On langchain-ai/openwiki at `1e6d54c` it finds two, one of them the duplicate row already visible in this README's own example.

## 0.1.4 (2026-09-05)

A repository whose paths are stored decomposed now produces a report instead of failing. Git precomposes command-line arguments on macOS, so a path read out of the tree and handed back to `git blame` came back as a different string and matched nothing, ending the run with `fatal: no such path café.ts in HEAD` and no output. Every call now pins `core.precomposeunicode=false`, so the path sent is the path git stored. A checkout authored on Linux carrying Korean, French, Turkish, Vietnamese, Portuguese or Spanish filenames was affected; ASCII repositories produce byte-identical output.

The plain table is padded by terminal columns rather than UTF-16 code units. East Asian characters are drawn two columns wide and combining marks none at all, so a Chinese, Japanese or Korean name pushed the numbers right and a decomposed Latin name pulled them left, and no column lined up. The ranges are the Wide and Fullwidth classes of Unicode Annex #11 plus the emoji blocks terminals draw double width. The Markdown, JSON and CSV outputs never padded and are unchanged.

## 0.1.3 (2026-09-05)

`--markdown` prints the table as a Markdown table for pasting into issues and README files, mutually exclusive with `--json` and `--csv`, with pipes escaped in author labels. Contributed by @shivam-070208 (#6, closes #1).

`bin/surviving-lines.js` held a literal NUL byte inside the sampling hash separator, so git classified the file as binary and no diff on it was readable, on GitHub or locally. The byte is now the `\u0000` escape: the same string, the same sample, and a file people can review. Output verified byte-identical at three sample rates before and after.

`--version` has a test, because the release workflow's smoke job calls it on three operating systems and nothing else covered it.

The README examples are a fresh run of the current code on openwiki at `1e6d54c`; the previous plain-table block predated the address suffix that separates two identities with the same name.

README section on how the sample is chosen: the hash, the NUL separator, why it is deterministic across machines, a worked example on openwiki and what a 1-in-5 sample is worth across three seeds (#2).

`npm run release` now moves the `v0` major tag to every release, and the release workflow starts on full version tags only, so the moving tag cannot start a second publish.

## 0.1.2 (2026-09-05)

`--csv` output; README comparison with git shortlog and git fame; Turkish README; contributing guide, issue templates, roadmap and a provenance release workflow.

## 0.1.1 (2026-09-05)

Plain errors outside a repository and for a ref that is not a commit.

## 0.1.0 (2026-09-05)

First release.
