# surviving-lines

English | [Türkçe](README.tr.md)

I want to know who wrote the code that is still in this repo, but commit counts only show who was busy, and my own blame scripts credit formatter commits and bots and list one person twice.

surviving-lines is a command-line tool that counts the lines of code each author still has in a git repository, using git blame, and shows them next to each author's share of commits.

```
npx surviving-lines
```

![Terminal recording of surviving-lines: the author table, a per-directory table, and the .mailmap lines it suggests for one person with two addresses](docs/demo.gif)

The recording is a real run of this repository's `bin/surviving-lines.js`, scripted in [`docs/demo.tape`](docs/demo.tape).

## How this differs

Measured with git-fame 4.2.1, git-who v1.3 and git-extras 7.5.0 on the same fixture repositories. Each row below is a `tie` or `ours only` row of [`docs/COMPARISON.md`](docs/COMPARISON.md), which `npm run compare` generates.

| What | Result | Rows |
| --- | --- | --- |
| Surviving lines and commits per author | Same numbers as git-fame, git-who (commits) and git-extras `git summary --line` (lines). | P01, P02, P03, P04 |
| `.git-blame-ignore-revs` | Read by default. Same numbers as git-fame with `--ignore-revs-file`. | P06 |
| Bots | Left out of both shares by default. git-fame 4.2.1 has no option for that. | P07 |
| `Co-authored-by:` credit | Equal split. Same numbers as git-fame `--auth share`. | P08 |
| An `Assisted-by:` trailer with no address | The run finishes. git-fame 4.2.1 stops with an AttributeError. | P09 |
| AI assistants | Surviving lines and commits whose trailers name one, counted separately. git-fame has no such option. | P10 |
| Totals per file extension | Same totals as git-fame `--bytype`. | P11 |
| Sampling | The same seed picks the same files and gives the same numbers. git-fame has no sampling. | P15 |
| One person on two addresses | Prints the evidence and ready `.mailmap` lines. git-fame prints no suggestions and groups authors by name only. | P16 |
| A reformat commit that no ignore file names | Left out of the table by default, and the block under the table says so and gives the plain figures. git-fame 4.2.1 has no such list, and its plain numbers credit the formatter. | P21 |

git-fame is ahead on other rows of the same file: several repositories in one run (P13), svg and yaml output (P14), and a `--since` window that also applies to blame (P05). It also installs through pip and conda, and it estimates cost. Questions people ask are answered in [`docs/FAQ.md`](docs/FAQ.md).

<p>
  <img src="https://img.shields.io/npm/v/surviving-lines?style=flat-square&color=111111&label=npm" alt="npm">
  <img src="https://img.shields.io/github/actions/workflow/status/Bubblegunn/surviving-lines/ci.yml?style=flat-square&color=111111&label=ci" alt="ci">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT">
  <a href="https://doi.org/10.5281/zenodo.22394614"><img src="https://img.shields.io/badge/DOI-10.5281%2Fzenodo.22394614-111111?style=flat-square" alt="DOI"></a>
</p>

Commit counts measure activity. `git blame` measures what survived every later refactor.
The two numbers disagree more often than people expect, and the gap is usually the
interesting part: an author whose blame share is above their commit share wrote code
that replaced other people's; one whose blame share is below wrote code that was
replaced.

One file, no dependencies, Node 22 or newer, git 2.15 or newer, any repository `git` can read.

Three ways to run it:

- `npx surviving-lines` runs it once, without an install.
- `/plugin install surviving-lines --marketplace Bubblegunn/surviving-lines` adds the Claude Code plugin; see [As a Claude Code plugin](#as-a-claude-code-plugin) below for the minimum Claude Code version.
- `npx skills add Bubblegunn/surviving-lines` adds the agent skill through the skills CLI.

Install globally to use it through Git as well:

```
npm install --global surviving-lines
git surviving-lines --version
```

### As a Claude Code plugin

```
/plugin install surviving-lines --marketplace Bubblegunn/surviving-lines
```

That one-step form works on Claude Code 2.1.275 or newer. On an older version, use two steps:

```
/plugin marketplace add Bubblegunn/surviving-lines
/plugin install surviving-lines@surviving-lines
```

The plugin adds one skill. When you ask the agent the question this tool answers, it runs the tool itself, from the plugin's own folder (falling back to the installed command, then to `npx`), instead of estimating. The skill covers who owns or wrote code, who should review a path, the history of a file or directory, the bus factor, formatter commits that take over ownership, duplicate authors and per-author line totals.

The plugin also adds a prompt hint. When a prompt is about duplicate identities or code ownership, a hook reads the prompt and the working directory and adds a short note for the agent. The note says to use the skill and the tool instead of counting by hand. When the repository has suspected same-person groups, the note lists up to four of them, each with the rule that suggested it (one name on two addresses, one address under two names, one name before the `@` on two domains, or a GitHub noreply login equal to another name or address name) and each address's commit count. The note always says the groups are guesses until you confirm them, and when you ask for the duplicates to be fixed it tells the agent to write them to `.mailmap` under a comment line that marks them as proposals.

The hook runs only read-only git commands (`rev-parse`, `rev-list --count` and `shortlog -sne --no-merges`) and, when node and the plugin's own `bin/surviving-lines.js` exist, the tool's `--brief` view (see below), which itself only reads. It writes nothing and makes no network calls. It stays silent outside a git repository, when git is missing, and above 20,000 commits; `SURVIVING_LINES_HINT_CAP` changes that cap and is mainly for tests. The note itself adds at most 1,200 characters; the brief comes on top of that. It works only in the Claude Code plugin, not in the npm command.

Measured on a generated repository of 10,000 commits by 60 authors, a prompt that matches took about 149 ms and one that does not took about 22 ms (on a busy machine, so read these as orders of magnitude). None of 20 unrelated test prompts triggered it. Of 10 borderline prompts, 5 triggered, for example a general question about what `git blame` does, because the hook cannot tell a general question from a request about your repository.

The plugin also has a Stop hook (`hooks/surviving-lines-check.mjs`, node, no dependencies). After an answer to an ownership question it runs the tool once in the same repository (`--json`, stopped after 25 s; a second run with `--merge-identities` only when the answer talks about merging) and compares the answer with it. It looks at numbers followed by `%`, `lines`, `commits`, `files` or `authors` (counts below 10, ranges, dates, versions and git ids are skipped) and judges only a line that names exactly one known author, for two things: a number that matches no figure the tool has for that author (lines, lines with blanks, commits, shares within 0.1 point) and is in no global set, and a swap, a number that belongs only to another author. The global set holds the numbers of the JSON report, of the plain-text `--brief` of the same repository, of every tool result of the turn (any command) and of text a hook injected. Lines with total, together, combined, sum, about, roughly or `~` are not judged, and there is no finding for totals or for a number with no author on its line. A sentence that says people are merged or counted once, names members of a suspected same-person group, has no hedge word (proposal, likely, guess and so on) and comes from a run without `--merge-identities` is reported too. Findings (six at most, each with the tool's value) go back to the agent once, with the instruction to reply with the complete corrected answer, not only the corrections, and not to mention the check; the hook never blocks twice, because on the repair turn Claude Code marks `stop_hook_active` and the hook then stays silent. A right answer costs one local run of the tool and no model call; the hook is silent on any error, outside a git repository, above the same 20,000-commit cap, and for prompts that do not match the ownership phrases of the prompt hint. It cannot tell a wrong number from one you computed by another method, so the finding says to name the command if it is your own. Table cells without a unit are not read. The plugin also ships a `claim-checker` agent (haiku) that lists the unbacked claims of a draft on request.

To remove the hook, delete `hooks/hooks.json` in a local copy of the plugin (or empty it), or disable the plugin.

## Example

```
npx surviving-lines --ref 1e37ea6 --top 3
```

```
ref 1e37ea6  ·  files 71/71 sampled (1 in 1)  ·  9,823 of 9,835 lines attributed
git blame -w -M  ·  commits 73, merges excluded
bots excluded: 1 identity, 12 lines, 7 commits (--include-bots counts them)

author                lines   share  commits   share
----------------------------------------------------
Efe Genc              9,335   95.0%       67   91.8%
Aaqibhafeez Khan        221    2.2%        2    2.7%
Ensar                   182    1.9%        3    4.1%
… 1 more author

What this cannot show: quality of the lines, review work, design done in documents,
or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit.
```

That run is this repository at `1e37ea6` (20 October 2026), run from a checkout of it. Bots are left
out, so the commit count excludes the 7 commits of dependabot. The top author holds 95.0% of the
surviving lines and 91.8% of the commits; the gap is small here and larger in the research in
[`research/`](research/README.md).

## Why sample

`git blame` walks history for every file it reads. A deterministic sample reads fewer
files and, more importantly, makes the run reproducible: the file set is chosen by
hashing each path (FNV-1a) with an optional seed, so anyone with the repository and the same command gets the same files and the same numbers. Change the
seed to draw a different sample and check that the shares hold.

`--sample 1` (the default) blames every file. [`docs/COMPARISON.md`](docs/COMPARISON.md) reports wall time for both
modes on one fixture (row P17); it makes no claim about large repositories, and issue #35 asks for a benchmark.

## How the sample is chosen

Every path is hashed, and the file is in the sample when the hash divides evenly by `n`:

```
h    = FNV-1a-32( seed + "\0" + path )      # 32-bit, over UTF-16 code units
in   = (h mod n) == 0                        # --sample n; n = 1 keeps every file
```

The separator is a NUL byte, so a seed cannot collide with a path prefix. FNV-1a is
integer arithmetic (`Math.imul`, unsigned shift), no randomness, no file contents, no
timestamps, and git paths always use forward slashes, so the same command picks the same
files on Node 22 or 24 on any operating system. The expected sample is one file in
`n`; the exact count depends on the paths, which is why the run prints `files 50/203
sampled` rather than assuming 40.

Worked example, [langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) at
`1e6d54c` with `--sample 5 --include '**/*.ts' --exclude '**/*.test.ts'` (203 files after
the filters):

| path | FNV-1a of `"\0" + path` | mod 5 | in the sample |
|---|---|---|---|
| `evals/ledger/benchmark/benchmark.ts` | 1128513045 | 0 | yes |
| `src/index.ts` | 1807104411 | 1 | no |

With `--seed second` the first path hashes to 646834445, still 0 mod 5, and a different
45 files are chosen overall. Three seeds on the same commit:

| seed | files | lines attributed | top author | second author |
|---|---|---|---|---|
| (none) | 50/203 | 14,638 of 59,049 | 52.7% | 22.6% |
| `second` | 45/203 | 12,607 of 59,049 | 59.5% | 24.4% |
| `third` | 47/203 | 12,851 of 59,049 | 57.1% | 22.9% |

That spread, about seven points for the top author, is what a 1-in-5 sample of this
repository is worth: the ranking and the gap to commit share (22.2% for both) hold on every
seed, the second decimal does not. A share is of the sampled lines, not of the repository,
and the sample is by file, so one large file can move it. When a single number matters,
run `--sample 1`; when you quote a sampled one, quote `sample.every`, `sample.seed`,
`filesSampled` and `linesAttributed` from `--json` next to it, which is what the first
line of the table prints.

## What it counts

- The `lines` column counts lines in the sampled files whose last change, as
  `git blame -w -M` sees it, belongs to the author. `-w` ignores whitespace-only changes and `-M` follows lines
  moved within a file, so reformatting and relocation do not steal authorship. Add
  `--copies` for `-C`, which also follows lines copied from other files.
- The `commits` column counts non-merge commits reachable from the ref, optionally
  inside a `--since` / `--until` window. Scope the window to a person's tenure when comparing
  people who joined at different times.
- A repository's `.git-blame-ignore-revs` is read by default and passed to `git blame --ignore-revs-file`, so a
  reformatting commit listed there does not take the lines it touched. The file used is named on the second
  line of the output and in `--json`; `--no-ignore-revs` ignores it and `--ignore-revs-file <f>` names another.
  Which revisions belong in the file is the repository's decision, not this tool's. The file is read from the working
  tree at the repository root, not from the ref being analysed. It needs git 2.23 or newer.
- Bots are left out of both columns: a name ending in `[bot]` or with "bot" as its last word
  (`Release Bot`, `vue-bot`, `ZodBot`, `jekyllbot`; a person named `Jan Bot` whose address starts with `jan` is not one), a name ending in `-Service`, a
  one-word name whose address local part ends in `bot` (10 or more letters), or a GitHub app, Renovate, GitLab or Gitea bot address. The second line of the output says how many identities, lines and commits that removed, so a
  busy bot cannot shrink every person's commit share without it showing. `--include-bots` counts them.
- Binary files are skipped. Identities follow the repository's `.mailmap`; add one to
  merge an author's several addresses. When two rows share a name the table shows the
  address so they are not confused.
- A sample that contains no file, or `--include` patterns that match nothing, stop with exit code 1
  and say which, rather than printing a table of 0.0% shares. Contributed by
  [@Enard52](https://github.com/Enard52) ([#40](https://github.com/Bubblegunn/surviving-lines/pull/40)).
- An `--exclude` that removes every file, and pathspecs after `--` that match nothing, stop with exit
  code 1 too and name the filter that emptied the run. They used to say `no files found in <cwd> at
  ref "HEAD"`, which reports an ordinary repository as an empty one. Contributed by
  [@Enard52](https://github.com/Enard52) ([#45](https://github.com/Bubblegunn/surviving-lines/pull/45)).
- A shallow clone is refused with exit code 1 and a message naming `git fetch --unshallow`.
  In a shallow clone the oldest fetched commit stands in for all history before it, so blame
  gives every older line to that commit's author: on a `git clone --depth 1` of this
  repository the HEAD author held 6,069 of 6,069 lines and 1 of 1 commits, against 5,973
  lines and 41 of 48 commits on a full clone (measured on 2026-10-14). `actions/checkout`
  fetches one commit unless `fetch-depth: 0` is set. `--allow-shallow` runs anyway and marks
  the output: `shallow clone` on the first line of the table, the Markdown and
  `--identities`, `"shallow": true` in `--json`, and a line on stderr for `--csv`, whose only
  header is the column names.
- git 2.15 or newer is required, and an older git stops the run with `git 2.15 or newer is
  required` and exit code 1. The shallow-clone check sets that floor: `git rev-parse
  --is-shallow-repository` arrived in 2.15.0, and a git that does not know a `rev-parse` flag
  prints it back and exits 0 (checked on 2.50.1 with a made-up flag), so an older git would
  read every shallow clone as a full one. The other features used are older, by git's release
  notes: `blame --line-porcelain` 1.7.6, `git -c` 1.7.2, `core.precomposeunicode` 1.7.12. CI
  runs only the git each runner image ships, so 2.15 itself is not tested.

## Options

```
--ref <rev>          revision to analyse (default: HEAD)
--sample <n>         deterministic 1-in-n file sample, n >= 1 (default: 1, every file)
--seed <text>        salt for the sample hash; change it to draw a different sample
--include <glob>     only files matching the glob (repeatable; ** and * supported)
--exclude <glob>     skip files matching the glob (repeatable)
--since <date>       commit-share window start (passed to git log)
--until <date>       commit-share window end
--copies [deep]      follow copies even above 2000 files or 2,000,000 files x commits or 400,000,000 lines x commits (default: -w -M -C below that; deep: -C -C)
--no-copies          blame with -w -M only
--keep-generated     count lockfiles, generated files, vendored code and binary files
--jobs <n>           parallel blame processes (default: 4)
--top <k>            rows to print (default: 10)
--sort <key>         lines (default), commits, or gap (absolute share difference)
-q, --quiet          suppress progress output on stderr
--json               print JSON instead of a table
--csv                print CSV (author,mail,lines,line_share,commits,commit_share)
--markdown           print a Markdown table
--identities         list addresses that look like one person, with .mailmap lines
--co-authors <mode>  none (default) or share: split each line and commit equally between the author
                     and the Co-authored-by trailer identities (.mailmap applies to them);
                     cannot be combined with --group-by
--ai-breakdown       also print surviving lines and commits whose message trailers name an AI assistant
--group-by <key>     one block per group of files: dir (top-level directories), dir:<n> (n levels deep), or ext
--suggest-codeowners print CODEOWNERS lines for the groups, from the surviving lines (needs --group-by dir; never written); names only people active in the --active-days window, up to 3 per rule
--include-bots       count bot identities as authors (default: leave them out of both shares)
--ignore-revs-file <f>  skip the revisions listed in <f> when blaming (git 2.23 or newer);
                       default: .git-blame-ignore-revs at the repository root, when it exists
--no-ignore-revs     do not read .git-blame-ignore-revs
--ignore-rev <rev>   skip one commit when blaming (repeatable; git 2.23 or newer)
--no-detect-reformat turn off the reformat heuristic (on by default): it finds suspected whitespace or quote
                     commits and, unless --keep-reformat, leaves them out of the numbers
--keep-reformat      count the suspected reformat commits in the numbers, as before the correction; the block
                     still lists them. Not applied under --co-authors share
--no-reapply-credit  do not credit a re-applied change to its original author (on by default): a commit that
                     reverts a revert, or a copy made by someone else with a "cherry picked from" trailer, has its
                     lines credited to the author of the original commit when that commit is in the repository
--merge-identities   count the suggested same-person addresses as one, in memory (nothing written)
--bus-factor-threshold <n>  percent of the lines counted that the bus factor must reach (default: 50)
--active-days <n>    an author is active with a commit in the n days before the ref's commit date (default: 365)
--orphans            list up to 30 orphaned files: top owner inactive and nobody active holds 20% of the file
--without <author>[,<author>...]  what if these people left (name or address; repeatable; own view, --json only)
--check-codeowners [<file>]  compare a CODEOWNERS file with the evidence: files no rule covers, rules that match no file, declared and observed owners that differ, phantom, shadow and inactive declared owners (own view, --json only)
--why-not <author> -- <path>  why this person is not among the suggested reviewers of the path, with the numbers that decided it (own view, --json only)
--owned-by <author>[,<author>...]  what these people own: lines on both bases, files, files they own most or half of, files only they wrote, lines per directory (own view, --json only)
--tree [depth]       the ownership tree: the owner and share of every directory and file, with marks for inactive owners and for nodes where nobody holds half (default 2 levels, 0 = all; own view, --json only)
--attention          files that change often and are risky: orphaned, single-owner or coupled files with at least 3 commits in the window, each with its numbers (own view, --json only)
--min-commits <n>, --min-shared <n>, --max-files-per-commit <n>  thresholds of --attention and --coupled (3, 3, 30; --min-commits is for --attention only)
--coupled <path>     the files that change together with one file: shared commits, degree and jaccard per partner, top owners, reviewers (own view, --json only)
--written-since <date>  ownership of recent code: surviving lines written since the date, lines inserted since, and the share kept (`--written-until`, `--churn`; own view, --json only)
--timeline [<path>]  who made most of the changes in each year, month or day, with handovers (`--by commits|lines`, `--at <date>,...`; own view, --json only)
--for-diff <base>..<head>  who should review a change: the owners of the lines it replaces or deletes (own view, --json only)
--brief              one compact plain-text view of the whole repository (at most 40 lines, about 3,000 characters; own view, --json only)
--time-budget <s>    with --brief: after s seconds print nothing and exit 0
--reviewers <path>   list who should review a file or directory
--history <path>     list who changed a file or directory, oldest first: first and last commit, commits, lines now
                       --since and --until do not narrow its dates or commit counts (they can drop a person with no lines left)
--allow-shallow      run in a shallow clone anyway; every output is marked "shallow clone"
--cwd <dir>          repository directory (default: current directory)
```

While blaming, an interactive run shows `blamed k/n files` on stderr, updated in place. Nothing is
written when stderr is not a terminal, or with `--quiet`, so piped `--json` and `--csv` output stays
clean. Contributed by [@Enard52](https://github.com/Enard52) ([#42](https://github.com/Bubblegunn/surviving-lines/pull/42)).

The first time a person at a terminal reads a table, the groups view or the reviewers view, one line on stderr asks for a star on GitHub. A marker file then stops it from printing again for that user. `SURVIVING_LINES_NO_STAR_HINT=1` turns it off, and `-q` or `--quiet` skips it for one run. It is never printed in CI (when `CI` is set), when one of the variables `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CODEX_SANDBOX` or `AI_AGENT` is set, or with `--json`, `--csv`, `--markdown` or `--identities`.

Paths after `--` are passed to git as pathspecs, so `-- src packages/core` restricts both
the blame and the commit count to those directories. A glob without a slash matches
basenames, so `--exclude '*.test.ts'` works at any depth.

`--json` prints everything the table is built from, including the sample parameters, so
a number can be quoted together with the exact command that produced it. It starts with
`schemaVersion` and `tool: { name, version }`; the layout is described by
[`schema/surviving-lines.schema.json`](schema/surviving-lines.schema.json), which ships in the
package, and `schemaVersion` changes whenever a key is removed, renamed or changes type. `--csv` prints one
row per author for spreadsheets. `--sort gap` puts the largest absolute difference between
line share and commit share first; ties retain the existing lines, commits, then address order.
JSON records the chosen key in `sort` and the schema describes it. The feature was contributed by
[@Aaqibhafeezkhan](https://github.com/Aaqibhafeezkhan) for [issue #30](https://github.com/Bubblegunn/surviving-lines/issues/30).
`--markdown`, contributed by
[@shivam-070208](https://github.com/shivam-070208) in [#6](https://github.com/Bubblegunn/surviving-lines/pull/6),
prints the same table as Markdown:

```sh
npx surviving-lines --markdown --ref 1e37ea6 --top 3
```

```
ref 1e37ea6  ·  files 71/71 sampled (1 in 1)  ·  9,823 of 9,835 lines attributed
git blame -w -M  ·  commits 73, merges excluded
bots excluded: 1 identity, 12 lines, 7 commits (--include-bots counts them)

| author | lines | line share | commits | commit share |
| --- | ---: | ---: | ---: | ---: |
| Efe Genc | 9,335 | 95.0% | 67 | 91.8% |
| Aaqibhafeez Khan | 221 | 2.2% | 2 | 2.7% |
| Ensar | 182 | 1.9% | 3 | 4.1% |

… 1 more author

What this cannot show: quality of the lines, review work, design done in documents,
or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit.
```

## On a pull request

```yaml
on: pull_request
permissions: { contents: read, pull-requests: write }
jobs:
  lines:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - uses: Bubblegunn/surviving-lines@v0
```

It comments the Markdown table for the whole repository at the merge commit and updates that comment on every push.
`sample` (default 5), `top`, `args` (more options) and `comment` are inputs. Pin the actions to commits in your own
workflow. A pull request from a fork gets a read-only token, so there the table is only in the job summary. Nothing
fails because of a share.

## Co-authors and AI assistants

Pairing and AI-assisted commits carry `Co-authored-by:` trailers, and by default the co-author gets nothing.
`--co-authors share` splits each line and each commit equally between the author and every trailer identity,
after `.mailmap` has been applied to them. Only trailers in the last paragraph of a message count, so a sentence
that happens to start with the same words does not.
`--co-authors share` cannot be combined with `--group-by`. An AI assistant identity credited as a co-author
(for example `Claude <noreply@anthropic.com>`) appears as its own row in the table in share mode.

`--ai-breakdown` prints how many surviving lines and commits come from commits whose trailers name an AI
assistant. The recognised trailers are `Assisted-by:` (as the Linux kernel documents it) and the
`Co-authored-by:` addresses listed in `AI_ASSISTANTS` in `bin/surviving-lines.js`, each with the page that
documents it. This counts trailers. It does not detect AI-written code, and a commit with no trailer may still
have had help.

## Who owns which part

`--group-by dir` splits the same measurement by top-level directory, `dir:2` by two levels, `ext` by file
extension. Every block names the files it was sampled from, because a directory that rests on one file is a
weak statement about a team. Commit share stays a whole-repository number and is not repeated per block.

`--group-by dir --suggest-codeowners` also prints a `CODEOWNERS` line for each directory where the top author is
active and holds at least half of the sampled surviving lines, and a comment for the others. Nothing is written.
Only people with a commit in the `--active-days` window (365 days by default, counted back from the ref's own commit
date) are named. A rule lists up to three owners: the top author and every other active author who holds at least
a fifth of the directory. When the top author has no commit in the window, the active owners are named and a comment
above the rule says so (`# /lib/: Gus Roth wrote 71% of the lines but has no commit since 2024-03-01`). When nobody
active holds a fifth, the directory gets `# orphaned: nobody active holds 20% of /old/` and no owner line. Who wrote
the code that is left is not the same as who should review changes to it; treat the lines as a starting point.

## Who should review a file

`--reviewers <path>` lists the authors of one file or directory, most surviving lines first. For each one it shows the lines under that path, their commits there, the date of their newest commit there, and whether they are active. Active means they committed at that path in the year before the as-of date. The as-of date is the author date of the ref's commit, not the clock, so the answer does not change with the day you run it.

```sh
npx surviving-lines --reviewers lib
```

The `suggested` line names up to three people, active ones first. It reads the same rows as the table, so a reformat commit that is left out by default is already left out of the suggestion. It is a starting point: who wrote the code that is left is not always who should review the next change to it.

Under the table a `top:` line gives the top author with both counts in one sentence (`top: Ann holds 6 non-blank lines (37.5%), 8 counting blank lines (16.7%)`), so a quoted line is right under either way of counting. When blank lines were dropped, the table also gets `with blank` and `share` columns, and each `suggested` person shows the blank-inclusive figure.

Under the table, `files in <path> by owner` names each person who holds at least 10 lines or 3% of the path (the smaller counts them in) with the files where they hold half or more of the file (name, lines and share; five files per person, then `and N more`), and `files only one person has written` lists files where one person holds at least 90% of at least 20 lines (eight at most). `--history <dir>` prints the same block, and the JSON carries it as `fileOwners` on `reviewers` and `history`. The block lets a reader tie a second reviewer to files instead of to a line count alone.

When the path is a single file, `--reviewers` and `--history` follow it across renames (`git log --follow`), so a rename does not zero its history; a directory is read as it is. The reviewers table has a `last commit` column (the newest commit at the path) and a `last anywhere` column (the newest commit in the whole repository, `lastAnywhere` in the JSON), so a reader can tell a person who has left the project from one who has not touched this path.

Rows are ordered by surviving lines. The last commit date and the `active` or `inactive` marker are printed for information; they never reorder the list or remove a top-three owner. When the active-only cut differs, it is printed as a second line next to the line-ranked one. Every view prints the same scope notes (dropped files, bots excluded, reformat commits ignored, identities merged by `.mailmap`, possible same-person suggestions, moved-in lines), and `--json` carries them as `dropped`, `bots`, `reformat`, `mailmap`, `identityHints` and `possibleSamePerson`. Blame credits the author of a line. When the committer of a blamed commit is someone else (after `.mailmap` and identity merging) and the commit holds at least five surviving lines, up to five lines say so (`credited to the author: 20 lines of 1a2b3c4 "subject" are credited to <author>, committed by <committer>`), then a count of the rest; the JSON key is `committedByOthers`.

`--reviewers` and the bus factor count two addresses of one person separately until a `.mailmap` joins them. The `suggested` line is the one exception: it merges addresses that share a name, and nothing else.

## Who shaped a path

`--history <path>` takes a file or a directory and lists the people who changed it, oldest first. Each row gives the first and last commit at that path, the commits there, and the lines that person still holds at the ref. A commit that only reformatted the path is set aside: it is not counted, and a person whose only commit there was a formatting change has no row. The table has the `share` of each person, and `with blank` and `share` columns when blank lines were dropped. Under the list, a `top:` line gives the top author with the non-blank and the blank-inclusive count, and the line after it names who made the first commit and who holds the most lines now.

```sh
npx surviving-lines --history lib/index.js
```

`--since` and `--until` do not narrow the dates or the commit counts of this view, which always covers the whole ref. They can still drop a row, because a person with no surviving lines and no commit inside the window is left out. A person whose lines were all overwritten later still shows, with 0 lines, in a run without a window.

`--history` prints its own view, so it can be combined only with `--json`. It cannot be combined with `--reviewers`, `--csv`, `--markdown`, `--identities`, `--group-by`, `--suggest-codeowners` or pathspecs after `--`.

## How far the history can be trusted

The default view, `--reviewers` and `--history` print one to two lines under the header about the shape of the history, `--brief` prints one short line, and `--json` has the key `historyQuality` (the key `history` is the `--history` view). The first line says where the history begins. If the oldest commit (the oldest root by author date when there are several, and the count is printed) adds more than 25% of the files at the ref, it reads `history: begins 2023-04-03 with a commit that adds 812 of 1,040 files (78%); lines older than that are credited to whoever imported them, so the table describes work since the import`. If the history is under 550 days old and not an import, it reads `history: 214 days old (38 commits); a short window, not an import`. These are two separate causes; a young repository is never called imported. The second line is the merge workflow, read from the commits of the ref (limited by `--since` and `--until`): at least 5% merge commits is `merge`, otherwise at least half of the non-merge subjects ending in `(#123)` is `squash`, otherwise `rebase`. Under squash the table names the person who squashed, or the pull request author; only a `Co-authored-by` trailer names anyone else.

## Reformatting commits

`git blame -w` ignores whitespace, but not a quote change. A formatter run that switches single quotes to double quotes therefore takes every line it rewrote, even though the code did not change. surviving-lines looks for such commits by default and leaves them out of the numbers. A commit whose changes are only whitespace or quote changes is a detected reformat commit. The table does not count the lines it holds, and the block under the table names it, gives the surviving lines it holds, and gives the figures without the correction for up to five authors whose lines it would move most, plus the bus factor without the correction.

The detection is a suspicion, not a proof. Read the commit with `git show <id>` before trusting the correction. The correction applies to the table, the groups view, the reviewers suggestion, the CSV output and the `--history` view, and `--ai-breakdown` reads the corrected pass.

- `--keep-reformat` counts the commit in the numbers, as before the correction. The block still lists it, and says that the numbers include it.
- `--co-authors share` does not apply the correction. Its block says so, and the numbers include the commit.
- Adding the commit's id to `.git-blame-ignore-revs` at the repository root, which is read by default, or passing `--ignore-rev <rev>` for one run (repeatable; git 2.23 or newer), ignores it in blame. The detection then finds no suspect, and no block is printed.

`--no-detect-reformat` turns the detection off. It needs git 2.23 or newer, like the ignore file.

A maintainer sometimes reverts a contributor's change and later re-applies it, or re-commits it with a `(cherry picked from commit <id>)` trailer. Blame then names the maintainer. surviving-lines follows the `This reverts commit <id>` lines: a commit that reverts a revert brings back the change of the original commit, so its surviving lines are credited to the original author, in the table, the JSON and every other view, and a `re-applied work credited to the original author:` line under the table names up to five such commits. Nothing changes when the original commit is not in the repository or has the same author. `--no-reapply-credit` turns this off.

Boilerplate commits are set aside the same way and are named on the `mechanical rewrites checked` line with the reason `boilerplate`. A commit counts as boilerplate when it touches at least three existing files, deletes nothing but blank lines, and either adds the same lines to at least three files (the others adding licence text only) or adds only licence, copyright, SPDX or banner text. A commit that adds new files is never boilerplate, because a new file's header is part of the file. Its lines are left out of the numbers, since no earlier author wrote them. `--keep-reformat` counts it again.

What the check does not recognise:

- It looks at whitespace changes and, in JavaScript, TypeScript, Python, JSON, CSS, SCSS, Vue and Svelte files (extensions js, jsx, mjs, cjs, ts, tsx, py, json, css, scss, vue, svelte), at single quotes turned into double quotes. In other files only whitespace is folded, because a quote change can change a program there (a shell script, for one).
- Trailing commas, semicolons and parentheses are not recognised. A commit that adds or removes them is not listed.
- A commit that adds, deletes or renames files, or changes more than 1000 files, is not judged.
- It is a heuristic. A listed commit is a suspect, not proof; read it with `git show <id>` before ignoring it.

## Who is still active, and what if someone leaves

Under the table (and under `--files`, `--reviewers` and `--history`) one line says how much of the code belongs to people who have stopped committing: `as of 2026-03-10: 2 of 3 authors committed in the last 365 days and hold 40.0% of the non-blank lines; 60.0% of the lines belong to people with no commit in that time`. The window is counted back from the date of the ref's commit, not from today, so the same repository gives the same answer on any day. A commit anywhere in the repository counts, under the name and address `.mailmap` gives it; bots are left out. `--active-days <n>` changes the window. The line is not printed when everyone is active. JSON: `activity`.

The default view prints the active bus factor on the line under the bus factor: `active bus factor 1 (50% of the 4,612 lines held by the 5 authors active in the last 365 days): Ada alone; 45.6% of all lines belong to people with no commit in that window`. It is the smallest number of active people whose lines reach the threshold of the lines the active people hold, so its base is not the base of the line above; the sentence names its own. `none` means nobody who holds lines committed in the window. The window is `--active-days`, counted from the ref's commit date; with `--merge-identities` activity is judged after the merge. `--brief` and `--json` (`activeBusFactor`) give the same numbers. Each `--group-by` block gets the same line and a `verdict` with up to two separate labels, `single point` (active bus factor 1) and `orphaned` (the block's top owner has no commit in the window and nobody active holds 20% of its lines); they are separate findings and are never folded into one risk rank. In `--json` the labels are the array `verdict`.

A file is orphaned when its top owner is inactive and no active author holds at least 20% of its non-blank lines. `--files` and `--reviewers <dir>` print one line (`orphaned (top owner inactive, nobody active holds 20%+): 12 files, 8.4% of the lines; largest: ...`, five paths at most); `--orphans` lists up to 30 files with the owner, the lines and the owner's last commit. JSON: `orphans`.

`--without Ada,Bob` answers "what if they left" on the lines: the lines they hold, the files whose top owner is one of them, the files where they together hold half or more and the best remaining author holds under 10% (nobody left would know those), the bus factor before and after (the second counted on the lines the remaining authors hold), and who would inherit most. A name or an address matches after `.mailmap` and `--merge-identities`; an unknown author is an error that lists the closest names. It prints its own view and can be combined with `--json` only (key `without`). It counts lines, not understanding.

`--for-diff main..feature` answers "who should review this change". It takes the lines the change replaces or deletes, blames them at the base commit with the blame rules of the rest of the run (copy detection, ignore-revs, set-aside reformat commits, `.mailmap`, `--merge-identities`, bots left out) and counts them per person: touched lines, the share of all touched lines, the changed files they own most of, the lines they hold in those files, their last commit anywhere and whether they are active. `main...feature` starts at the merge base of the two, and a lone `main` means `main..HEAD`. The people who committed in the range are listed on their own line and are not suggested. A pure insertion and a new file replace nothing, so they have no earlier owner. Each changed file can carry flags, most serious first: all touched lines belong to inactive authors, no active author holds 20% of the file (the `--orphans` rule), one owner holds 80% or more, touched lines owned by the change author only, then new, deleted or renamed. The headline names the worst file, never an average. Files the table leaves out (lockfiles, generated files, vendored code, binary files) are left out here and counted; `--keep-generated` counts them. With more than 300 changed files only the 300 that replace the most lines are blamed, and the output says so. `--top` limits the reviewer rows. It prints its own view and can be combined with `--json` only (key `forDiff`). It counts the lines being replaced, not who understands the change.

`--owned-by "Ada Quill"` answers "what does Ada own". For each person it prints the non-blank lines they hold with their share (and the figure counting blank lines when it differs), the files they hold a line in, the files where they are the top owner, the files where they hold half or more, the files where nobody else has a line, the lines per top-level directory with their share of it and their rank there (`--group-by dir:<n>` sets the depth), their commits and share of commits, and the date of their last commit with the active mark (`--active-days`). An author is a name or an address, matched after `.mailmap` and `--merge-identities` as `--without` does; the values may be repeated or comma-separated, one block each. An unknown author is an error that lists the closest names; a bot is said to be a bot, not counted (`--include-bots` counts it); an author with commits and no surviving line gets their commit count and dates. `-- <path>` limits the scope, `--top` limits the file and directory lists (default 10). It prints its own view and can be combined with `--json` only (key `ownedBy`). It counts surviving lines, not understanding.

`--check-codeowners` answers "is our CODEOWNERS file right". It reads `.github/CODEOWNERS`, `CODEOWNERS` or `docs/CODEOWNERS` at `--ref` (the first that exists), or the file you name (`--check-codeowners path/to/file`, looked up in the working tree and then at the ref), and matches every file of the run with GitHub's rules: the last matching rule wins, `*` stays inside one directory level, `**` crosses levels, a leading or an inner `/` anchors the pattern, a name without a slash matches at any depth, `dir/*` covers direct children only, `dir/` covers the files inside. Lines with `!` negation or `[...]` ranges are reported and not applied, as GitHub ignores them. It prints the counts and the worst 10 of each kind with the CODEOWNERS line number: files no rule covers (by top directory); rules that match no file; rules whose declared owners and observed owners (people with 20% or more of the lines the rule covers, at most three) share nobody; declared owners with no line in the covered files and no commit there for 365 days; an undeclared person who holds half or more; declared owners with no commit anywhere in `--active-days`. A declared owner is mapped to a person by address equality or by the login in a `users.noreply.github.com` address. `@org/team` handles, handles with no noreply address in the history and addresses nobody committed with cannot be mapped offline: they are listed as not comparable and never counted as drift, and a rule that names one is not checked for changed or shadow. A rule without owners is taken as intentional. A file of 2 MB or more gets a warning (GitHub does not read one above 3 MB). With `--sample` only the sampled files are compared. `--json` adds `codeownersCheck`. It compares the file with surviving lines and commit dates; it does not say who should own the code.

`--why-not "Cy Dunn" -- src/pay/` explains why a person is not among the three reviewers `--reviewers src/pay/` suggests, using the same numbers as that view, so the two cannot disagree. The first fitting answer wins: the name or address is unknown (the closest names are listed), the identity is a bot, the person has no commit at the path in the whole history, they have commits but no surviving line (count, first and last date, the largest current owner), they hold lines but rank below the third place (rank, lines, share, the third place's lines, and the last commit at the path and anywhere), they are inside the cut but marked inactive (both last-commit dates and the cutoff date), or they are listed and active. When another address of the same person, as the identity hint finds it, holds lines and the two together would rank inside the cut, the answer is `split identity` and says so; otherwise the same address list is added as a note. A sampled run says `sample 1 in n`. It prints its own view and can be combined with `--json` only (key `whyNot`); the path goes after `--`, once. It counts surviving lines, not understanding.

`--tree` answers "who owns what, at a glance". It prints a tree of directories and files; each directory line gives the person with the most surviving non-blank lines in its subtree and their share of it, and the top level also gives the lines in the subtree. A file is annotated only when its owner differs from its directory's. An owner with no commit in the `--active-days` window is marked `(inactive)`, and a node where the largest holder has less than half is marked `(no owner above 50%)`. The depth counts levels of nodes (default 2; `--tree 1` is the top level, `--tree 0` every level); a directory whose only child is a directory is printed on one line and counts as one level; directories come first, then files, each alphabetical. `--top` caps the children per node (default 25; the largest by lines are kept, the rest is one `... n more` line), `-- <path>` scopes it, and no line is wider than 100 columns (long names are cut in the middle). A file whose every counted line belongs to a bot is listed as `bot` and adds nothing to its directory; equal lines go to the name that sorts first. It prints its own view and can be combined with `--json` only (key `tree`, nested nodes `{name, path, kind, owner, share, lines, active, bot, children, more, below}`).

`--attention` answers "which files are changing and need an owner". It looks at the commits of the window (`--since`; by default 12 months before the ref's commit date, never today; merges, bot commits and the commits set aside as reformats or mechanical rewrites are left out; renames are followed) and keeps the files with at least 3 commits (`--min-commits`). Each kept file gets reasons, each with its number: orphaned (the `--orphans` rule, weight 3), single owner (the top owner holds 80% or more of its lines, weight 1) and coupled (another file changes with it at degree 0.5 or more, weight 1). The degree of two files is the commits that touched both over the smaller commit count of the two, counted over commits that touched at most 30 files (`--max-files-per-commit`), with at least 3 shared commits (`--min-shared`). Files are ranked by score, then commits, then path, and files with no reason are not listed; `--top` caps the list (default 10). When no file qualifies the last line says so ("none: no file with at least 3 commits in the window is orphaned, single-owner or coupled"). Only the 200 files with the most commits are assessed, and a note says so; when the history is younger than the window, all of it is used and the note says that too. It prints its own view and can be combined with `--json` only (key `attention`; `--sample` is refused).

`--coupled src/pay/ledger.ts` answers "what else changes when this file changes". For one file (not a directory) it reads the same commits as `--attention` (window `--since`, default 12 months before the ref's commit date; merges, bots and set-aside commits out; renames followed) and lists the files that share at least 3 commits with it (`--min-shared`), best first: shared commits, degree (shared commits over the smaller commit count of the two files; code-maat divides by the average and prints a percent, so its numbers differ), jaccard (shared over commits that touched either) and, for the five best partners, their top owner with the active mark. Commits that touched more than 30 files (`--max-files-per-commit`) are skipped for the degree, and the number skipped for this file is printed. The last line names up to three reviewers: the people with the most surviving lines across the file and its five best partners. A file with fewer than 3 commits gets "not enough history for coupling" (a file added together with others looks coupled to all of them). `--top` caps the partners (default 10). It prints its own view and can be combined with `--json` only (key `coupled`; `--sample` and pathspecs after `--` are refused).

`--written-since 2026-04-24` answers "how much of the code written recently is still here, and whose is it". Per person it prints the surviving lines whose author date is on or after the date (`written-since`), the lines that person inserted in the same window (`inserted`, from `git log --numstat -M` over the same files, so files deleted since are not counted, without bots and the commits the run sets aside) and `kept`, written over inserted. The line under the header gives the window's share of all lines (`1,980 of 8,470 (23.4%)`). It uses the author date, not the committer date that `git log --since` reads; a date is 00:00 UTC. `--written-until` ends the window (exclusive). `--churn` adds all-time inserted and deleted lines and the survival ratio. A `kept` above 100% prints as `100%*` with a "check filters" line. It prints its own view and can be combined with `--json` only (key `writtenSince`); `--co-authors share` is refused.

`--timeline src/engine/` answers "who made most of the changes in each period, and when did that change". Commits (or, with `--by lines`, lines added plus removed) are bucketed by author date: yearly when the span is over five years, monthly over 60 days, else daily. Each non-empty bucket names its winner, the count, the bucket total and the share; when the winner changes and the new winner holds at least half of the bucket, the row says `handover: Ada -> Cy`. Empty buckets between the first and the last are listed without a winner. The path is optional (a file follows renames). `--at 2024-01-01,2025-01-01` adds the bus factor and the three largest holders by blame at the last commit before each date; use `--sample` on a large repository. It counts commits, not surviving lines. Own view, `--json` only (key `timeline`).

## Pre-computed brief

`surviving-lines --brief` prints one compact plain-text view of the whole repository: at most 40 lines and about 3,000 characters, built from the same analysis as every other view (nothing is counted a second time with other rules). It has the ref, the commit id and the date; the six people with the most lines, each with both line counts (non-blank, and counting blank lines) and their shares, and their commits; the bus factor on both bases and for the people who still commit; the activity line; the orphaned-file summary; what was left out (bots, lockfiles, generated, vendored and binary files, set-aside reformat and boilerplate commits with their short ids and subjects); the same-person guesses, marked as proposals that were not applied; the five largest first-level directories with their top owner; up to five files that one person wrote almost alone; and the notes about commits committed by someone else and re-applied credit. The last line is the quote rule: quote both line counts; identity merges are proposals; for a named directory or language re-run with `-- <dir>` or `--include`.

It works with `--include`, `--exclude`, paths after `--`, `--since`, `--merge-identities` and `--active-days`. With `--json` it prints a small object (the `brief` definition in the schema). `--time-budget <seconds>` stops the run after that time, prints nothing and exits 0, so a script or hook can bound it. It cannot be combined with the other views (`--files`, `--reviewers`, `--group-by` and so on).

In the Claude Code plugin the prompt hint runs `--brief --quiet --time-budget 20` for an ownership question and puts the result in the agent's context, labelled as computed by the tool for that commit, so the agent quotes the tool's numbers instead of recounting with `git blame`. On a repository the tool cannot finish in 20 seconds, or when node is missing, the hint is the same as without it. The hook timeout is 30 seconds.

## Bus factor

The bus factor is the smallest number of authors whose surviving lines together reach a share of the lines counted. The default share is 50%. `--bus-factor-threshold <n>` changes it, to any value above 0 and at most 100. The line is printed under the table:

```
bus factor 2: Troy Goode <troy@work.example> and Douglas Christopher Wilson together hold 56.5% of 1,985 surviving lines
```

When blank lines were dropped from the counted lines (the header says `non-blank; N with blank lines`), the author table gets two more columns, `with blank` and `share`, the `bus factor` line states both bases (`... of 2,941 non-blank lines (76.9% of 3,322 lines with blank lines)`, and `counting blank lines: bus factor N` when it differs), and `--json` gives `linesWithBlank`, `shareWithBlank` and `busFactor.withBlank`. Rows stay ordered by non-blank lines. The default view, `--reviewers` and `--history` print one `top:` line under the table: `top: <author> holds <n> non-blank lines (<share>), <m> counting blank lines (<share>)`. The same columns appear in `--reviewers`, `--history` and the `--group-by` blocks (`--json` adds `linesWithBlank` and `shareWithBlank` to their rows), `--files` adds a `with blank` size column, and `--identities` adds the blank-inclusive count to an address line when it differs.

`--files [n]` prints one row per file, largest first (25 rows by default): lines, top owner and share, the next two owners, then `files: K; one owner above 80% in M; no owner above 50% in P`. It cannot be combined with `--group-by`, `--csv`, `--markdown`, `--identities`, `--reviewers`, `--history` or `--co-authors share`.

A commit that rewrote at least 20 lines of a file and changed nothing `git blame -w` can see (line endings, indentation) owns no line, so no table shows it. Every view names up to five of them in a `whitespace-only commits` line, with the author, the file and who holds the file now. It changes no number.

It follows the lines, not the commit counts. It measures how concentrated the code that is left is, not who understands it.

## What the new lines look like

On the head-to-head test repository (a copy of `expressjs/cors` with three synthetic commits, described in [`docs/HEAD-TO-HEAD.md`](docs/HEAD-TO-HEAD.md)), the code in this repository (`node bin/surviving-lines.js`, and `npx surviving-lines` after the next release) prints these lines under the table by default. The only change is that one real address is replaced by `troy@work.example`:

```
identity hint: 1 person may be counted twice (Troy Goode: troy@laptop.example, troy@work.example). The table counts each address separately. Run --identities for the .mailmap lines; only you can confirm it is one person. If they are one person, Troy Goode holds 810 lines (40.8%).

bus factor 2: Troy Goode <troy@work.example> and Douglas Christopher Wilson together hold 70.1% of 1,985 surviving lines
bus factor = the smallest number of authors whose surviving lines together reach 50% of the lines counted (change with --bus-factor-threshold). It measures how concentrated the code that is left is, not who understands it.
```

When the reformat commit is left out, a block names it and says what it rewrote. It prints no line total next to the name of the person who committed it, because those lines are not that person's code. It lists only the people who gain lines from the correction, with their figures with and without it. This is the block on a synthetic repository (`scripts/fixtures.mjs`, fixture `quotes`), where Bob changed every quote in Ada's file:

```
reformat commit ignored (looks like whitespace and quote changes only): 1 commit
  commit a5a4525 "style: switch app.js to double quotes" rewrote 30 lines in 1 file (formatting only)
  The table above does not count it. Authors who gain lines from this: Ada 35 (100.0%) with the correction, 5 (14.3%) without. --keep-reformat counts it; --ignore-rev a5a4525 (or an entry in .git-blame-ignore-revs) sets it aside by hand.
  bus factor without the correction: 1 (Bob alone leads the plain count)
```

With `--keep-reformat` the formatter's commit is counted, the block says so, and the identity hint's last sentence reads `... If they are one person, Troy Goode holds 715 lines (36.0%).`

## Who is one person

A person who has committed from two addresses is in the table twice, and every count splits them in
half. This is the most common way these numbers go wrong, and it is invisible until someone points at it.
In this synthetic repository (`scripts/fixtures.mjs`, fixture `split`), Ada committed from two addresses:

```
ref HEAD  ·  files 3/3 sampled (1 in 1)  ·  30 of 30 lines attributed
git blame -w -M  ·  commits 3, merges excluded

author                            lines   share  commits   share
----------------------------------------------------------------
Ada <ada@example.com>                12   40.0%        1   33.3%
Bob                                  10   33.3%        1   33.3%
Ada <ada@laptop.example.org>          8   26.7%        1   33.3%

What this cannot show: quality of the lines, review work, design done in documents,
or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit.
```

`--identities` points at it:

```sh
npx surviving-lines --identities
```

```
1 identity looks split across more than one address.

Ada
  keep ada@example.com  1 commit, 12 lines
  map  ada@laptop.example.org  1 commit, 8 lines
  because the same name, "Ada", on two addresses
  because the same address name, "ada", on two domains

Add these to a .mailmap file at the repository root:

Ada <ada@example.com> <ada@laptop.example.org>

These are guesses from names and addresses in this repository's own history; only you
can tell whether two of them are really one person. Nothing was written. git log, git
blame, git shortlog and this tool all read .mailmap, so one file fixes every count.

The address lines above are the reliable ones. git matches a .mailmap name ignoring
case for ASCII letters only, so a name mapped by name alone must be written with its
accents and its non-Latin letters exactly as the commit spells them.
```

That is a real run on the synthetic fixture above; the addresses are the reserved example.com and example.org. Paste those
lines into a `.mailmap` at the repository root and every one of these counts changes, along with
`git log`, `git blame` and `git shortlog`, because they all read the same file. Most people who
have committed from a laptop and a work machine are in their own history twice and have never
been told.

Three signals produce a suggestion: the same name on two addresses, the same address name on two
domains, and a GitHub noreply address whose login appears as the name or the address on another
row. Role addresses like `dev@` or `info@` are ignored, because sharing one proves nothing, and
so are bot addresses. Names and addresses are compared with the case fold that makes a Turkish
name match itself and a decomposed accent match a precomposed one.

Nothing is written, and the tool cannot know whether two identities are really one person. It
shows the evidence and stops there.

`--merge-identities` counts the suggested addresses as one person for that run only. The merged row comes first and the table names each merge under it. The bus factor and the reformat comparison use the merged rows as well. On the head-to-head test repository, with the default reformat correction:

```
ref HEAD  ·  files 18/18 sampled (1 in 1)  ·  1,985 of 1,995 lines attributed
git blame -w -M --ignore-rev 62628c0 (auto)  ·  commits 315, merges excluded
bots excluded: 1 identity, 10 lines, 11 commits (--include-bots counts them)

author                          lines   share  commits   share
--------------------------------------------------------------
Troy Goode (2 addresses)          810   40.8%       95   30.2%
Douglas Christopher Wilson        629   31.7%      143   45.4%
Íñigo Marquínez Prado              95    4.8%        2    0.6%
Jon Church                         72    3.6%        3    1.0%
Sebastian Beltran                  67    3.4%        2    0.6%
Ulises Gascón                      52    2.6%        3    1.0%
Ignacio Mangas                     44    2.2%        2    0.6%
alex94puchades                     34    1.7%        5    1.6%
Linus Unnebäck                     26    1.3%        1    0.3%
Ollie Buck                         17    0.9%        1    0.3%
… 52 more authors
identities merged in memory (nothing written): Troy Goode = troy@work.example 762 lines 93 commits, troy@laptop.example 48 lines 2 commits; this is a guess from names and addresses; leave out --merge-identities for the unmerged table.

bus factor 2: Troy Goode (2 addresses) and Douglas Christopher Wilson together hold 72.5% of 1,985 surviving lines
bus factor = the smallest number of authors whose surviving lines together reach 50% of the lines counted (change with --bus-factor-threshold). It measures how concentrated the code that is left is, not who understands it.
```


When a suggestion exists, the table is followed by one `identity hint:` line. It names the person and the addresses and points at `--identities`. Its last sentence gives the figure that person would have if the addresses were one, so both the table figure and the merged figure can be reported. It is printed once per run, also with `--group-by`.

## Names in every script

A name is not ASCII, and getting that wrong shows up in two different ways. One is a column that
does not line up, which is annoying. The other is a person counted twice, which is a wrong number.

Two of these were wrong until Unicode 17.0 settled them, and both changed counts rather than
columns:

- `Weiß` and `WEISS` are one person. `toLowerCase` is Unicode's simple case fold and leaves ß
  alone, so the two spellings never met. The full fold maps ß to ss
  ([CaseFolding.txt](https://www.unicode.org/Public/UCD/latest/ucd/CaseFolding.txt), status `F`),
  and this tool now does the same before comparing.
- A name typed in fullwidth Latin letters, which is what a Japanese or Korean keyboard produces
  without switching modes, is the same name typed in ASCII. Matching normalises to NFKC, so the
  two forms meet, together with the ﬁ ligature and the compatibility ideographs.

Turkish dotted and dotless i, and decomposed against precomposed accents, were already folded.
The fold is used for matching only. What the table prints is always the spelling git holds.

Display is the other half:

- An Arabic or Hebrew name used to reorder the whole row around itself: the name moved to the
  right edge, the four numbers after it reversed, and each percent sign landed before its number.
  Names carrying strong right-to-left characters are now wrapped in U+2068 and U+2069, the
  isolates [UAX #9](https://www.unicode.org/reports/tr9/) provides for exactly this. They are
  invisible, they cost no column, and rows in other scripts are byte-for-byte what they were.
- Column widths come from the Unicode Character Database now, not from a hand-written list. The
  list this replaced disagreed with the standard on 8,645 assigned code points, calling most
  emoji one column wide, and on 231 in the other direction. Run
  `node scripts/gen-width-table.mjs` to rebuild the table against a newer Unicode release.

Three things are deliberate and are not going to change:

- Numbers stay in the `en-US` format, so `12,345` is twelve thousand whoever runs it. A
  report whose thousands separator follows the reader's machine cannot be compared with the same
  report run somewhere else, and comparing two runs is what this output is for.
- Emoji with text presentation count as one column, which is what the standard says and what
  some terminals disagree with. There is no answer that is right in every terminal, so the
  standard's own width wins.
- The `.mailmap` names are matched by git, not by this tool. git compares those names ignoring
  case for ASCII letters only, verified on git 2.50.1: an entry written `josÉ Álvarez` matches a
  commit by `JOSÉ ÁLVAREZ`, and one written `josé álvarez` does not. Map by address wherever you
  can, and if you map by name, spell it exactly as the commits spell it.

## Compared with git shortlog and git-fame

`git shortlog -sn` counts commits and nothing else. git-fame (a Python tool, version 4.2.1 when this was
written) also blames every file and prints surviving lines, commits and files per author. It is the closest
tool, it prints line share next to commit share in its `distribution` column, and in several ways it does
more: several repositories in one run, a `--since` and `--until` window that also applies to blame,
svg and yaml output, installation through pip, conda, snap and docker, and cost estimates.

[`docs/COMPARISON.md`](docs/COMPARISON.md) runs both on the same fixture repositories and lists every
result, including the ones this tool loses. The two give the same numbers for surviving lines, commits,
ignored revisions, co-author credit and totals per extension. Only this tool samples files by a seeded hash,
leaves bots out of both shares by default, suggests `.mailmap` lines for one person on two addresses, finishes
on an `Assisted-by:` trailer that has no address, and breaks out AI-assistant trailers, and lists reformatting commits that no ignore file names. Use git-fame when you
need something from its list above; use this one when you need a reproducible sample, or the identity
and bot handling.

[`docs/HEAD-TO-HEAD.md`](docs/HEAD-TO-HEAD.md) describes a second comparison: this tool, the Claude Code plugins project-pilot (with and without its command), mcp-git-historian and k41n/busfactor, and plain Claude, answering the same ownership questions about the same fixture repositories.

Round 13 result, measured on 2026-10-24 with Claude Sonnet 5.5 (Claude Code 2.1.308), three runs per arm and task, every cell new, graded by five independent model votes per criterion:

- **Sealed set z, 5 tasks (25 criteria)**, written by an author who never saw this code: this tool 9.67, best other arm (project-pilot with its command) 7.33; 95% interval of the difference +0.33 to +4.33.
- **Public set, 11 tasks (55 criteria)**, which the development used: this tool 47.67, best other arm (plain Claude) 41.00; 95% interval of the difference +5.00 to +8.33.

The per-task rule (ahead of every other arm on every task) is not met on set z. Every cell, the departures from the plan and a recompute step (`python3 -I score.py --check`) are in [`bench/head-to-head/results/round13-claude-sonnet-5-5/`](bench/head-to-head/results/round13-claude-sonnet-5-5/). The result covers these tasks, this model and this date; it is not a claim about other tasks.

## What it cannot show

The tool prints this under every table because the number is easy to misuse:

- It says nothing about the quality of the lines, or whether they should exist.
- Review comments, design documents, pairing and mentoring leave no lines behind.
- Code that was deleted on purpose counts for nobody, even when deleting it was the
  best contribution that month.
- Generated files and vendored code inflate whoever committed them. Exclude them. By default the tool leaves out lockfiles, vendor directories, files marked `linguist-generated`, files with a generator's name (`.generated.` or `.gen.` before the extension, `*.g.dart`, `*.freezed.dart`, `*.pb.go`, `*.pb.cc`, `*.pb.h`, `*_pb2.py`, `*_pb2_grpc.py`, `*.designer.cs`, `*.g.cs`, `*_generated.go`, `*_generated.rs`, Xcode `project.pbxproj` and anything inside `*.xcodeproj/` or `*.xcworkspace/`, test snapshots `*.snap`; plain `.json`, `.csproj` and `.sln` names are not matched), files whose first lines say a tool wrote them ("generated by", "auto-generated", "do not edit" and similar, on a comment line) and a `.js`, `.lua`, `.css` or `.c` file that sits beside, or in a `src` directory over, its `.ts`, `.tsx`, `.coffee`, `.tl`, `.scss`, `.sass`, `.less` or `.pyx` source. The `dropped:` line names what was left out; `--keep-generated` counts it.
- A high blame share in a file nobody else touches is not the same as a high blame
  share in a file everybody touches. The tool does not weight by contention.

Use it to answer "whose code is still here?", not "who is the best engineer?".

## What is already known, and what this measures

How long a line of code lives is well studied. Spinellis, Louridas and Kechagia tracked 3.3
billion lifetime events across 89 repositories and put the median lifespan at about 2.4
years, with young lines the most likely to die ([PeerJ CS 7:e372,
2021](https://doi.org/10.7717/peerj-cs.372)); Gurov modelled 32.5 million line births in 120
TypeScript repositories and found over half of all lines are never deleted ([arXiv
2606.04993, 2026](https://arxiv.org/abs/2606.04993)).

Both measure lines. Neither measures people. git-fame prints commit share and surviving-line share side by side,
but we did not find a published measurement of how far the two shares differ across repositories. This tool prints both numbers, so [`research/`](research/) contains a
first measurement over twelve repositories: the same person tops both in 25 of 36 runs, while among
substantial contributors the two shares differ by a median of 7.5 percentage points and by ten points or
more in a third of cases. The sample is twelve repositories and the document says what that cannot support.

## Where it came from

I needed to describe my own share of two private codebases in a way that another person
could check without trusting me. Commit counts were the obvious number and also the
wrong one: on one codebase my blame share was higher than my commit share, on another
it was lower, and both facts mattered more than either count. The method is written up
in [How to show engineering ownership when the repositories are private](https://efe-genc-portfolio.vercel.app/writing/showing-ownership-private-repositories/);
this is the script, cleaned up so it runs anywhere.

## Thanks

[@shivam-070208](https://github.com/shivam-070208) wrote `--markdown`
([#6](https://github.com/Bubblegunn/surviving-lines/pull/6)), the first outside pull request to
this repository, and shipped in 0.1.3. Reviewing it found something worth more than the feature:
the only source file here held a literal NUL byte, so git had been calling it binary and no diff
on it was readable, which is why the contributor could not see their own change on GitHub.

[@Aaqibhafeezkhan](https://github.com/Aaqibhafeezkhan) added the `git surviving-lines` subcommand alias (issue [#29](https://github.com/Bubblegunn/surviving-lines/issues/29)).

## Cite this

Every release is archived on Zenodo with a DOI, so a paper or a report can point at the
exact code it ran.

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22394614.svg)](https://doi.org/10.5281/zenodo.22394614)

That is the **concept** DOI: it always resolves to the newest version. To cite the exact
version you ran, open that page, pick the version in the sidebar, and use the DOI shown
there. `CITATION.cff` in this repository carries the same identifier, so GitHub's "Cite this
repository" button produces correct BibTeX and APA without any copying by hand.

## Development

```
npm test        # node:test, builds a throwaway repository with two authors, a rewrite, a rename and a binary
npm run lint    # node --check
npm run coverage  # the tests with Node's built-in coverage of bin/; CI fails below the thresholds in package.json
```

If this helped, a star on GitHub helps others find it.

MIT.
