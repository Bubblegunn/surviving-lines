# surviving-lines

English | [Türkçe](README.tr.md)

<p>
  <img src="https://img.shields.io/npm/v/surviving-lines?style=flat-square&color=111111&label=npm" alt="npm">
  <img src="https://img.shields.io/npm/dm/surviving-lines?style=flat-square&color=111111" alt="npm downloads">
  <img src="https://img.shields.io/github/actions/workflow/status/Bubblegunn/surviving-lines/ci.yml?style=flat-square&color=111111&label=ci" alt="ci">
  <img src="https://img.shields.io/bundlephobia/minzip/surviving-lines?style=flat-square&color=111111" alt="minzipped size">
  <img src="https://img.shields.io/github/stars/Bubblegunn/surviving-lines?style=flat-square&color=111111" alt="stars">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT">
</p>

Measure who wrote the code that is still alive in a git ref, next to who committed.

Commit counts measure activity. `git blame` measures what survived every later refactor.
The two numbers disagree more often than people expect, and the gap is usually the
interesting part: an author whose blame share is above their commit share wrote code
that replaced other people's; one whose blame share is below wrote code that was
replaced.

One file, no dependencies, Node 20 or newer, any repository `git` can read.

```
npx surviving-lines --sample 5 --include '**/*.ts' --exclude '**/*.test.ts'
```

```
ref HEAD  ·  files 50/203 sampled (1 in 5)  ·  14,722 of 59,049 lines attributed
git blame -w -M  ·  commits 339, merges excluded

author            lines   share  commits   share
------------------------------------------------
Colin Francis     7,718   52.4%       61   18.0%
Brace Sproul      3,314   22.5%       61   18.0%
Greg Land           356    2.4%        9    2.7%
…

What this cannot show: quality of the lines, review work, design done in documents,
or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit.
```

That run is [langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) at `1e6d54c`
(4 September 2026) and took 0.3 seconds. Two authors with the same commit share hold
very different shares of the code that is still there.

## Why sample

`git blame` is slow on large repositories because it walks history for every file. A
deterministic sample makes the run cheap and, more importantly, reproducible: the file
set is chosen by hashing each path (FNV-1a) with an optional seed, so anyone with the
repository and the same command gets the same files and the same numbers. Change the
seed to draw a different sample and check that the shares hold.

`--sample 1` (the default) blames every file. On a 60k-line TypeScript repository that
is still well under a minute.

## How the sample is chosen

Every path is hashed, and the file is in the sample when the hash divides evenly by `n`:

```
h    = FNV-1a-32( seed + "\0" + path )      # 32-bit, over UTF-16 code units
in   = (h mod n) == 0                        # --sample n; n = 1 keeps every file
```

The separator is a NUL byte, so a seed cannot collide with a path prefix. FNV-1a is
integer arithmetic (`Math.imul`, unsigned shift), no randomness, no file contents, no
timestamps, and git paths always use forward slashes, so the same command picks the same
files on Node 20, 22 or 24 on any operating system. The expected sample is one file in
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

| seed | files | lines attributed | Colin Francis | Brace Sproul |
|---|---|---|---|---|
| (none) | 50/203 | 14,722 of 59,049 | 52.4% | 22.5% |
| `second` | 45/203 | 12,609 of 59,049 | 59.5% | 24.4% |
| `third` | 47/203 | 13,071 of 59,049 | 56.1% | 22.5% |

That spread, about seven points for the top author, is what a 1-in-5 sample of this
repository is worth: the ranking and the gap to commit share (18.0% for both) hold on every
seed, the second decimal does not. A share is of the sampled lines, not of the repository,
and the sample is by file, so one large file can move it. When a single number matters,
run `--sample 1`; when you quote a sampled one, quote `sample.every`, `sample.seed`,
`filesSampled` and `linesAttributed` from `--json` next to it, which is what the first
line of the table prints.

## What it counts

- The `lines` column counts lines in the sampled files whose last change, as
  `git blame -w -M` sees it, belongs to the author. `-w` ignores whitespace-only changes and `-M` follows lines
  moved within a file, so reformatting and relocation do not steal authorship. Add
  `--copies` for `-C`, which also follows lines copied from other files; it is slower.
- The `commits` column counts non-merge commits reachable from the ref, optionally
  inside a `--since` / `--until` window. Scope the window to a person's tenure when comparing
  people who joined at different times.
- Binary files are skipped. Identities follow the repository's `.mailmap`; add one to
  merge an author's several addresses. When two rows share a name the table shows the
  address so they are not confused.

## Options

```
--ref <rev>          revision to analyse (default: HEAD)
--sample <n>         deterministic 1-in-n file sample, n >= 1 (default: 1, every file)
--seed <text>        salt for the sample hash; change it to draw a different sample
--include <glob>     only files matching the glob (repeatable; ** and * supported)
--exclude <glob>     skip files matching the glob (repeatable)
--since <date>       commit-share window start (passed to git log)
--until <date>       commit-share window end
--copies             pass -C to git blame as well as -w -M (slower, follows copies)
--jobs <n>           parallel blame processes (default: 4)
--top <k>            rows to print (default: 10)
--json               print JSON instead of a table
--csv                print CSV (author,mail,lines,line_share,commits,commit_share)
--markdown           print a Markdown table
--cwd <dir>          repository directory (default: current directory)
```

Paths after `--` are passed to git as pathspecs, so `-- src packages/core` restricts both
the blame and the commit count to those directories. A glob without a slash matches
basenames, so `--exclude '*.test.ts'` works at any depth.

`--json` prints everything the table is built from, including the sample parameters, so
a number can be quoted together with the exact command that produced it. `--csv` prints one
row per author for spreadsheets. `--markdown` prints the same table as Markdown:

```sh
npx surviving-lines --markdown
# ref HEAD  ·  files 3/3 sampled (1 in 1)  ·  21 of 21 lines attributed
# | author | lines | line share | commits | commit share |
# | --- | ---: | ---: | ---: | ---: |
# | Ada | 11 | 52.4% | 1 | 33.3% |
```

## Compared with git shortlog and git-fame

`git shortlog -sn` counts commits, which is the activity number this tool prints in its last
two columns and nothing more. `git fame` (the Python tool) also blames every file and reports
lines per author, and it is the closest relative; the differences are that surviving-lines
samples files deterministically so a run on a large repository finishes in seconds and can be
reproduced by someone else with the same seed, prints commit share next to line share so the
gap is visible, follows `.mailmap` and disambiguates duplicate names, and has no dependencies.
If you want per-file detail or survival over time, git fame or a custom `git log -L` is the
better tool.

## What it cannot show

The tool prints this under every table because the number is easy to misuse:

- It says nothing about the quality of the lines, or whether they should exist.
- Review comments, design documents, pairing and mentoring leave no lines behind.
- Code that was deleted on purpose counts for nobody, even when deleting it was the
  best contribution that month.
- Generated files and vendored code inflate whoever committed them. Exclude them.
- A high blame share in a file nobody else touches is not the same as a high blame
  share in a file everybody touches. The tool does not weight by contention.

Use it to answer "whose code is still here?", not "who is the best engineer?".

## Where it came from

I needed to describe my own share of two private codebases in a way that another person
could check without trusting me. Commit counts were the obvious number and also the
wrong one: on one codebase my blame share was higher than my commit share, on another
it was lower, and both facts mattered more than either count. The method is written up
in [How to show engineering ownership when the repositories are private](https://efe-genc-portfolio.vercel.app/writing/showing-ownership-private-repositories/);
this is the script, cleaned up so it runs anywhere.

## Development

```
npm test        # node:test, builds a throwaway repository with two authors, a rewrite, a rename and a binary
npm run lint    # node --check
```

MIT.
