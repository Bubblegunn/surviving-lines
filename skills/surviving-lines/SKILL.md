---
name: surviving-lines
description: Use when asked who owns, wrote or maintains code in a git repository, whose code is still here, the history of a file or directory, who should review it, what the bus factor is, how much of the code one person holds, or when commit counts look misleading. Also when someone shows up in the history under more than one name or email, for duplicate authors, the same person counted twice, count each person once, .mailmap, a formatter or reformat commit taking over ownership, CODEOWNERS suggestions, per file type or per directory ownership, and git-fame style per-author line totals. Runs surviving-lines, which counts surviving lines with git blame instead of estimating by hand.
---

# surviving-lines

Counts the lines each author still has at a git ref, using `git blame -w -M`, and prints them next to each author's share of commits. Commit counts show who was busy. Surviving lines show whose code is still there. Do not estimate this by hand, with `git shortlog`, or by sampling a few files. Run the tool.

Requirements: Node 22 or newer, git 2.15 or newer (2.23 for `--ignore-rev`). No other dependencies.

## How to run it

Pick the command once, in this order, and call it `<sl>` below:

1. `node "${CLAUDE_PLUGIN_ROOT}/bin/surviving-lines.js"` when that file exists (`[ -f "${CLAUDE_PLUGIN_ROOT}/bin/surviving-lines.js" ]`). It is the same version as this skill and starts at once.
2. `surviving-lines`, when `command -v surviving-lines` finds it.
3. `npx --yes surviving-lines`.

Run it from the repository root, or pass `--cwd <dir>`. Start with `<sl>` and read the whole output, including the lines under the table.

## What to do with each part of the output

- A `reformat commit ignored` block means the tool found a commit that only changed whitespace or quotes and has already left it out of the table above; the block gives the plain figures for comparison. Confirm it with `git show --stat <sha>`, name the commit in your answer, and say the figures leave it out. `--keep-reformat` shows the plain count instead, and `--no-detect-reformat` turns the check off. A `reformat suspected` block (printed with `--keep-reformat` or `--co-authors share`) means the numbers above still include the commit: run `<sl> --ignore-rev <sha>` and report both sets of numbers. If the repository keeps a `.git-blame-ignore-revs` file the tool reads it by itself.
- An `identity hint` line means one person may be counted under two addresses, and it prints the figure that person would have if the addresses were one. It is a guess until the user confirms it. When the user asks who owns the code, or asks to count each person once, also run `<sl> --merge-identities`: it merges the suggested addresses in memory (nothing is written), puts the merged figure first and lists the unmerged figures under the table. Give the merged figure as the headline, say that it rests on a guess from names and addresses, and give the unmerged figure next to it. To make the merge permanent: run `<sl> --identities`, then write the suggested lines to the repository's `.mailmap` whenever the user asked you to fix or count each person once (that request is the go-ahead; do not stop to ask first). Put a comment line above the new lines, such as `# proposed by surviving-lines, confirm before relying on them`, then run `<sl>` again. If the user only asked a question, show the lines and do not write the file. Always re-run after writing the file, report the new top author from that run with its basis (surviving lines or commits), and keep calling the mapping a guess until the user has confirmed it.
- The `bus factor` line is line based: the smallest number of authors whose surviving lines together reach 50% of the lines counted. State that definition and unit when you give the number. `--bus-factor-threshold 80` changes the percentage. Give the bus factor per directory with `<sl> --group-by dir`, or for one path with `-- <path>`.
- A large gap between an author's line share and commit share (line share more than 5 times the commit share) is a prompt to look. If no reformat block was printed, run `git log -3 --stat --author=<name>` for that author, look for a mass change, and if you find one run again with `--ignore-rev <sha>` and show both results.

## Per directory, per file type, windows and CODEOWNERS

- For a question per file type, run `<sl> --group-by ext --merge-identities` and take every count from that output (for example the `.js` block); do not rebuild the counts by hand. For a question per directory, run `<sl> --group-by dir --merge-identities`. Give the merged figure first and the unmerged figure next to it, and say the merge is a guess.
- For CODEOWNERS lines, run `<sl> --group-by dir --suggest-codeowners --merge-identities`. An owner is named only where one person holds at least half of the surviving lines; for every other directory, and for the root files, say that nobody holds half. Do not add an owner line for those.
- For "who committed in the last N days and how much of their code is still here": `--since` and `--until` limit the commit column only; the lines column is always for the ref. Run `<sl> --since <date> --until <date> --merge-identities`, read commits in the window from the commit column and surviving lines from the lines column, and set aside a reformat commit the tool names.
- A note from the surviving-lines prompt hint that lists suspected same-person groups is a set of guesses from names and addresses. Say so and show the groups. If the user asked you to fix the duplicates, write them to `.mailmap` under a comment line that marks them as proposals to confirm, re-run `<sl>`, and say in the answer that the merges are guesses until the user confirms them. Copy each `.mailmap` line exactly as the hint or `<sl> --identities` prints it, including the two-address line for one address under two names (`Full Name <a> login <a>`); do not write a line of your own.
- When the output lists a `possible same person` suggestion, report the unmerged headline. Next to it, give the figure "if one person" with the evidence, and label it unconfirmed. Give the `.mailmap` line. Nothing is merged without a `.mailmap`.
- State what the output says was left out: lockfiles, generated files and vendored code, with the one-line reason. State the reformat commits that were ignored. `--keep-generated` counts the dropped files.
- When the output has a `moved or copied here` line, state it. Do not recommend the person who only moved the code. Recommend the authors who wrote it.
- Give both bus factor numbers (`bus factor` and `to reach 80%`) with the scope they were computed on: the whole repository, a path, or a group.

## Who shaped a path, and who should review it

`<sl> --history <path>` takes a file or directory and lists the people who changed it, oldest first, with their first and last commit, their commits and the lines of theirs that survive today. Commits that only reformatted the path are listed as set aside. Use it for "explain the history of this file" and say who made the first commit and who holds the most lines now.

`<sl> --reviewers <path>` takes a file or directory. It prints the owners of that path by surviving lines, the commits and the last commit date of each, and a `suggested:` line of up to three people, active ones first. People with no commit in the year before the ref are marked. Name the first suggested person, give their lines and share, name a second reviewer, and say whether the top owner is still active. Same-name addresses are merged for the suggestion only; the identity hint rule above still applies.

## Other options

- `--sort gap` puts first the authors whose line share and commit share differ most.
- `--group-by dir`, `dir:2` or `ext` gives one block per directory or file type. `--suggest-codeowners` with `--group-by dir` prints CODEOWNERS lines for the user to review.
- `--since 2025-01-01 --until 2025-12-31` limits the commit share to a window. The line share is always for the ref.
- `--json`, `--csv` or `--markdown` change the format. `--top <k>`, `--include <glob>` and `--exclude <glob>` change the rows and files. `--co-authors share` splits credit with `Co-authored-by` trailers. `--ai-breakdown` counts assistant trailers.
- For a large repository add `--sample 5` (one file in five, deterministic) and say it is a sample.
- `--no-detect-reformat` turns the reformat check off, `--keep-reformat` counts a detected reformat commit anyway, and `--merge-identities` counts suggested same-person addresses as one (in memory).

Bots are left out of both columns by default. The bots line under the header says how much was removed. `--include-bots` counts them.

## Shallow clones

A shallow clone (`git clone --depth`, most CI checkouts) is refused with exit code 1, because blame gives every line older than the cut to the commit at the cut. Run `git fetch --unshallow` first. `--allow-shallow` runs anyway and marks the output wrong. Do not use it for an answer.

## How to read the output

- `lines` and its share: lines alive at the ref whose last change belongs to that author. Whitespace-only changes and moves inside a file do not take authorship. A `.git-blame-ignore-revs` file at the repository root is honoured.
- `commits` and its share: non-merge commits reachable from the ref.
- The header says how many files were sampled and how many lines were attributed. Report that with the numbers.

## What the numbers cannot show

The tool prints this under every table. Pass it on:

- Nothing about the quality of the lines or whether they should exist.
- Review, design documents, pairing and mentoring leave no lines behind.
- Code deleted on purpose counts for nobody.
- Generated files and vendored code inflate whoever committed them. Exclude them with `--exclude`.
- It does not weight by contention: a high share in a file nobody else touches is not the same as a high share in a file everybody touches.
- The reformat check is a heuristic: it lists suspects, it does not prove them.

Use it to answer "whose code is still here?", never "who is the best engineer?". It counts AI-assistant trailers but does not detect AI-written code.
