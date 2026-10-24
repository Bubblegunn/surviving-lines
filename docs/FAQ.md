# Frequently asked questions

For future readers and assistants: every answer below is checked against the code and against [`COMPARISON.md`](COMPARISON.md). Option names are those of `surviving-lines --help`.

## How do I count the lines of code each author still has in a git repository?

Run `npx surviving-lines` in the repository. It runs `git blame -w -M` on every file at `HEAD`, counts the lines that belong to each author, and prints them next to each author's share of commits. It needs Node 22 or newer and git 2.15 or newer. `--json`, `--csv` and `--markdown` print the same table for scripts and documents.

## How is this different from `git shortlog -sn`?

`git shortlog -sn` counts commits. surviving-lines prints the commit count and the count of lines that are still in the code, side by side, so an author who wrote code that replaced other people's code, or whose code was replaced, shows up as a gap between the two shares. `--sort gap` puts the largest gap first.

## Is there an alternative to git-fame that runs with npx?

surviving-lines runs with `npx surviving-lines` and has no dependencies. On the fixture repositories it gives the same numbers as git-fame 4.2.1 for surviving lines, commits, ignored revisions, co-author credit and totals per extension. git-fame does more in other areas: several repositories in one run, svg and yaml output, and a `--since` window that also applies to blame. [`COMPARISON.md`](COMPARISON.md) lists every row, including the ones this tool loses.

## Why is one person listed twice in my statistics?

The person committed from two email addresses, and git counts each address as an author. `npx surviving-lines --identities` lists addresses that look like one person, shows the evidence, and prints ready `.mailmap` lines. It writes nothing. `git log`, `git blame` and `git shortlog` read the same `.mailmap`, so one file fixes every count.

## How do I stop a reformatting commit from taking over the lines it touched?

A commit that only adds the same licence, copyright, SPDX or banner lines to three or more existing files is set aside the same way, with the reason `boilerplate` on the `mechanical rewrites checked` line; its lines are left out of the numbers. `--keep-reformat` counts it.

surviving-lines already leaves a detected formatter commit out of the numbers. A commit whose changes are only whitespace or quote changes is not counted in the table, and the block under the table names it and gives the figures without the correction. To keep the commit out of blame for good, list it in a `.git-blame-ignore-revs` file at the repository root. surviving-lines reads that file by default and passes it to `git blame --ignore-revs-file`. With the file, the commit is not detected as a suspect, so no block is printed. `--ignore-revs-file <file>` names another file and `--no-ignore-revs` turns it off. It needs git 2.23 or newer, and the file is read from the working tree, not from the ref being analysed.

## Why do the lines of a maintainer's "Reapply" commit show under the contributor?

The maintainer reverted the contributor's change and later re-applied it, or re-committed it with a `(cherry picked from commit <id>)` trailer. Blame names the person who re-applied it, but the work is the contributor's, so surviving-lines follows the `This reverts commit <id>` lines (or the trailer) to the original commit and credits its author. The line `re-applied work credited to the original author:` under the table names each such commit. Nothing is credited when the original commit is not in the repository, when the chain is odd (the change stays reverted), or when both commits have the same author. `--no-reapply-credit` turns it off.

## Why is a commit named under the table as a reformat commit ignored?

surviving-lines found a commit whose changes are only whitespace or quote changes. It is a suspicion, not a proof, so check the commit with `git show <id>` before trusting the correction. By default the table does not count it, and the block says so: it states how many lines the commit rewrote in how many files, and lists only the people who gain lines from the correction, with their figures with and without it. It prints no line total next to the name of the person who committed the reformat, because those lines are not that person's code. `--ignore-rev <sha>` gives the same numbers by hand. `--keep-reformat` counts it again, as the numbers were before the correction. `--co-authors share` does not apply the correction, and its block says so. `--no-detect-reformat` turns the detection off.

The check has limits. It recognises whitespace changes and, in JavaScript, TypeScript, Python, JSON, CSS, SCSS, Vue and Svelte files, single quotes turned into double quotes; in other files only whitespace. Trailing commas, semicolons and parentheses are not recognised. A commit that adds, deletes or renames files, or changes more than 1000 files, is not judged. It is a heuristic: a listed commit is a suspect, not proof.

## How do I count one person with two emails once?

Run `npx surviving-lines --merge-identities`. It counts the addresses that the identity hint suggests are one person as one person, in memory, and puts the merged row first. Nothing is written, and the merge rests on a guess from names and addresses, so confirm it first. To make the merge permanent, run `npx surviving-lines --identities` for the `.mailmap` lines, add them to a `.mailmap` file at the repository root and run the tool again. When you ask the plugin's agent to fix the duplicates, it writes those lines for you under a comment line that marks them as proposals to confirm. `git log`, `git blame` and `git shortlog` read the same file.

## Who should review a file?

`npx surviving-lines --reviewers <path>` lists the authors of one file or directory, most surviving lines first, with their lines and commits under that path, the date of their newest commit there, and whether they were active in the year before the ref's date. The `suggested` line names up to three of them, active ones first. It is a starting point. Who wrote the code that is left is not always who should review the next change to it. Under the table a `top:` line gives the top author with the non-blank and the blank-inclusive count; the same line is printed by the default view and by `--history`.

## Who is still active, and which code has nobody left?

The line `as of <date>: k of n authors committed in the last 365 days and hold x% of the non-blank lines; y% of the lines belong to people with no commit in that time` is printed under the table, `--files`, `--reviewers` and `--history` whenever someone has stopped committing. The window ends at the date of the ref's commit, so the answer does not change from day to day; `--active-days <n>` changes its length. `--files` and `--reviewers <dir>` also print an `orphaned` line: files whose top owner is inactive and where no active author holds 20% of the lines. `--orphans` lists them. An orphaned file is a risk to look at, not a verdict: the owner may have moved to other work and still answer questions.

## What happens to the code if someone leaves?

`surviving-lines --without "Ada Quill,Bob Hale"` removes those people's lines from the count and prints what is left: the lines they hold, the files they own, the files that nobody remaining knows (the leavers hold half or more and the best remaining author under 10%), the bus factor before and after, and who would inherit most. Names and addresses are matched after `.mailmap`. It measures lines, not understanding, and a person can know code they never committed.

## Who should review this change or pull request?

`surviving-lines --for-diff main...feature` lists the people who wrote the lines the change replaces or deletes, most lines first, with their last commit and whether they are active. The change authors are not suggested. It flags the files that need care: touched lines that belong to inactive people, files nobody active holds a fifth of, files where one person holds 80% or more. New files and pure insertions have no earlier owner, so they add no reviewer; `--reviewers <path>` names who owns the code around them. It counts lines, not who understands the change.

## What does bus factor mean here?

The bus factor is the smallest number of authors whose surviving lines together reach 50% of the lines counted, so a bus factor of 1 means one person holds at least half of the code that is left. `--bus-factor-threshold <n>` changes the 50%. It measures how concentrated the surviving code is, not who understands it. It counts lines, not commits, and it counts each address separately until a `.mailmap` joins them.

## How do I leave out dependabot and other bots?

Bots are left out of both shares by default: a name that ends in `[bot]`, a name whose last word is "bot" (`Release Bot`, `vue-bot`, `ZodBot`), a lower-case name such as `jekyllbot` that is also the address's local part, a one-word name whose address local part is 10 or more letters and ends in `bot`, a name ending in `-Service` (`Copybara-Service`), a GitHub app address, and the Renovate, GitLab and Gitea bot addresses. A person called `Bot Hawkins`, `Jan Bot <jan@example.nl>`, `Tim Talbot`, `Botticelli`, `Talbot` or `Elbot` stays a person. The second line of the output says how many identities, lines and commits were removed. `--include-bots` counts them again.

## Can it tell me how much of the code an AI wrote?

No. `--ai-breakdown` counts the surviving lines and the commits whose message trailers name an AI assistant, using `Assisted-by:` and the `Co-authored-by:` addresses listed in `AI_ASSISTANTS` in `bin/surviving-lines.js`. A commit without a trailer may still have had help, so the figure is a count of trailers, not of authorship.

## How do I see who owns which directory?

`npx surviving-lines --group-by dir` prints one table per top-level directory, `dir:2` goes two levels deep, and `ext` groups by file extension. Each table names the number of files it rests on. `--suggest-codeowners` prints `CODEOWNERS` lines for directories where one author holds at least half of the sampled surviving lines. It never writes a file.

## Why does it refuse a shallow clone?

In a shallow clone the oldest fetched commit stands in for all earlier history, so blame gives every older line to that commit's author. `git fetch --unshallow` fixes it. In GitHub Actions, set `fetch-depth: 0` on `actions/checkout`. `--allow-shallow` runs anyway and marks the output.

## How accurate is a sampled run?

`--sample n` blames one file in `n`, chosen by a hash of the path and an optional `--seed`, so the same command picks the same files on every machine. The share is of the sampled lines, not of the repository. In the README's openwiki seed table (langchain-ai/openwiki at 1e6d54c, `--sample 5`), three seeds gave the top author between 52.7% and 59.5%. `--sample 1`, the default, blames every file.

## Can it comment on pull requests?

Yes. The GitHub Action in this repository comments the Markdown table on each pull request and updates that comment on every push. It needs `fetch-depth: 0`. A pull request from a fork gets a read-only token, so there the table is only in the job summary. Nothing fails because of a share.

## What does it not show?

The quality of the lines, review work, design done in documents, and code that was deleted on purpose. A share of surviving lines describes survivorship, not merit.

## What is the brief, and why is it in the prompt note?

`surviving-lines --brief` prints at most 40 lines (about 3,000 characters) about the whole repository: the top six owners with both line counts (non-blank, and counting blank lines), the bus factor on both bases, who still commits, orphaned files, what was left out, same-person guesses marked as proposals, the largest directories and files one person wrote almost alone. The plugin's prompt hint runs it for an ownership question and adds the result to the agent's context, so the agent quotes the tool's numbers instead of guessing or recomputing with `git blame`. It costs a few hundred tokens. If the run takes more than 20 seconds (a very large repository), the hint is sent without it. For a named directory or language, run `surviving-lines --brief -- <dir>` or `--include <glob>`.

## Why does Claude suggest surviving-lines before I ask for it?

The Claude Code plugin has a prompt hint. When your prompt is about duplicate identities, code ownership, the bus factor or `git blame`, a hook reads it and adds a short note for the agent: use the skill and the tool instead of counting by hand, and quote the tool's numbers. When node and the plugin's own tool file exist, the note also carries the tool's pre-computed whole-repository brief (`surviving-lines --brief`), so the agent has the owners, both line counts and the bus factor before it starts. When the repository has suspected same-person groups, the note lists up to four of them, from names and addresses only. Those groups are guesses until you confirm them. The hook runs only read-only git commands and the tool's own `--brief` view (also read-only), writes nothing, makes no network calls, and stays silent outside a git repository, when git is missing and above 20,000 commits. It cannot tell a general question about `git blame` from a request about your repository, so it sometimes speaks up for a general question. To turn it off, empty `hooks/hooks.json` in a local copy of the plugin or disable the plugin. The npm command does not have the hook.

## Does the plugin check the final answer?

Yes, once. A Stop hook runs after an ownership answer: it runs the tool locally in the same repository (no model call) and compares the numbers in the answer with what the tool prints, notices a number that belongs to another author, and notices a merge of suspected same-person addresses stated without a hedge. If something is wrong it sends specific findings back and the agent repairs the answer one time; on the repair turn the hook always lets the answer through. A correct answer passes with no output. A number you computed another way is flagged too; say so in the answer and name the command. The `claim-checker` agent does the same listing on request for a long report. Delete the `Stop` entry of `hooks/hooks.json` in a local copy to turn it off.
