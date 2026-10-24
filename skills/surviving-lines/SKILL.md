---
name: surviving-lines
license: MIT
description: Use when asked who owns, wrote or maintains code in a git repository, whose code is still here, the history of a file or directory, what one person owns (`--owned-by`), who owns each directory (`--tree`), what changes with a file (`--coupled`), which files are risky (`--attention`), why one person is not suggested (`--why-not`), whether a CODEOWNERS file is still right (`--check-codeowners`), who should review a change or pull request (`--for-diff`), the bus factor, who is still active, what if one person leaves (`--without`), which code has nobody left (orphaned files), or when commit counts look misleading. Also for one person under more than one name or email, duplicate authors, count each person once, .mailmap, a formatter or reformat commit taking over ownership, CODEOWNERS suggestions, per directory ownership, and git-fame style per-author line totals. Runs surviving-lines, which counts surviving lines with git blame instead of estimating by hand.
---

# surviving-lines

Counts the lines each author still has at a git ref, using `git blame -w -M -C`, and prints them next to each author's share of commits. Commit counts show who was busy. Surviving lines show whose code is still there. Do not estimate this by hand, with `git shortlog`, or by sampling a few files. Run the tool.

Requirements: Node 22 or newer, git 2.15 or newer (2.23 for `--ignore-rev`). No other dependencies.

## How to run it

Pick the command once, in this order, and call it `<sl>` below:

1. `node "${CLAUDE_PLUGIN_ROOT}/bin/surviving-lines.js"` when that file exists (`[ -f "${CLAUDE_PLUGIN_ROOT}/bin/surviving-lines.js" ]`). It is the same version as this skill and starts at once.
2. `surviving-lines`, when `command -v surviving-lines` finds it.
3. `npx --yes surviving-lines`.

Run it from the repository root, or pass `--cwd <dir>`. Start with `<sl>` and read the whole output, including the lines under the table.

## What to do with each part of the output

- A `reformat commit ignored` block means the tool found a commit that only changed whitespace or quotes and has already left it out of the table above; the block says what the commit rewrote (lines and files) and gives the before and after figures of the people who gain lines from the correction. Confirm it with `git show --stat <sha>`, name the commit in your answer, and say the figures leave it out. `--keep-reformat` shows the plain count instead, and `--no-detect-reformat` turns the check off. A `reformat suspected` block (printed with `--keep-reformat` or `--co-authors share`) means the numbers above still include the commit: run `<sl> --ignore-rev <sha>` and report both sets of numbers. If the repository keeps a `.git-blame-ignore-revs` file the tool reads it by itself.
- An `identity hint` line means one person may be counted under two addresses. It states the strength and the figure to lead with: for `strong`, the merged figure; for `weak`, the unmerged figures, with the merged one as a possibility. A `weak addition` is one more address linked to the person only weakly: it has its own line count and is not in the merged figure. It is a guess until the user confirms it. When the user asks who owns the code, or asks to count each person once, also run `<sl> --merge-identities`: it merges the strong identity groups in memory (nothing is written; weak groups and weak additions stay on their own rows), puts the merged figure first and lists the unmerged figures under the table. Give the merged figure as the headline only for a strong group; for a weak group lead with the unmerged figures. Say that the merge rests on a guess from names and addresses, and give the other figure next to it. To make the merge permanent: run `<sl> --identities`, then write the suggested lines to the repository's `.mailmap` whenever the user asked you to fix or count each person once (that request is the go-ahead; do not stop to ask first). Write only the lines of the `strong` groups. The lines under "Weakly linked" are different: lead with the unmerged figures and ask the user before writing them. Put a comment line above the new lines, such as `# proposed by surviving-lines, confirm before relying on them`, then run `<sl>` again. If the user only asked a question, show the lines and do not write the file. Always re-run after writing the file, report the new top author from that run with its basis (surviving lines or commits), and keep calling the mapping a guess until the user has confirmed it.
- The `bus factor` line is line based: the smallest number of authors whose surviving lines together reach 50% of the lines counted. State that definition and unit when you give the number. `--bus-factor-threshold 80` changes the percentage. Give the bus factor per directory with `<sl> --group-by dir`, or for one path with `-- <path>`.
- A large gap between an author's line share and commit share (line share more than 5 times the commit share) is a prompt to look. If no reformat block was printed, run `git log -3 --stat --author=<name>` for that author, look for a mass change, and if you find one run again with `--ignore-rev <sha>` and show both results.

## Per directory, per file type, windows and CODEOWNERS

- For a question per file type, run `<sl> --group-by ext --merge-identities` and take every count from that output (for example the `.js` block); do not rebuild the counts by hand. For a question per directory, run `<sl> --group-by dir --merge-identities`. Give the merged figure first and the unmerged figure next to it, and say the merge is a guess.
- For CODEOWNERS lines, run `<sl> --group-by dir --suggest-codeowners --merge-identities`. Only people with a commit in the `--active-days` window are named; a rule lists up to three owners (a fifth of the directory each). Copy the comment lines too: `# <dir>: <Name> wrote 71% of the lines but has no commit since <date>` means the main writer left, and `# orphaned: nobody active holds 20% of <dir>` means nobody should be named. A directory where the top active author holds less than half gets a comment saying so, and the root files are skipped. Do not add an owner line for a commented directory.
- For "who committed in the last N days and how much of their code is still here": `--since` and `--until` limit the commit column only; the lines column is always for the ref. Run `<sl> --since <date> --until <date> --merge-identities`, read commits in the window from the commit column and surviving lines from the lines column, and set aside a reformat commit the tool names.
- A note from the surviving-lines prompt hint that lists suspected same-person groups is a set of guesses from names and addresses. Say so and show the groups. If the user asked you to fix the duplicates, write them to `.mailmap` under a comment line that marks them as proposals to confirm, re-run `<sl>`, and say in the answer that the merges are guesses until the user confirms them. Copy each `.mailmap` line exactly as the hint or `<sl> --identities` prints it, including the two-address line for one address under two names (`Full Name <a> login <a>`); do not write a line of your own.
- When the output lists a `possible same person` suggestion, it carries a strength. For `strong`, lead with the merged figure ("counting X and Y as one person because <evidence>"), give the unmerged figures next to it, and give the `.mailmap` line that would make it permanent. For `weak`, lead with the unmerged figure and give the merged one as a possibility. Both are unconfirmed. Nothing is merged without a `.mailmap`.
- State what the output says was left out: lockfiles, generated files, vendored code and binary files, with the one-line reason. State the reformat commits that were ignored. `--keep-generated` counts the dropped files.
- When the output has a `moved or copied here` line, state it. Do not recommend the person who only moved the code. Recommend the authors who wrote it.
- Say which copy detection setting the figures use: the header shows `git blame -w -M -C` by default and `-C -C` with `--copies deep`. When the `copy detection` note names a person whose share moved by more than 2 points, give both figures, with and without copy detection.
- Say that mechanical rewrites were checked, and name each commit of the `mechanical rewrites checked` line as set aside or kept. When the line says "the N largest of M commits", say the check was partial; do not call it complete. Never write "none found" while that line lists candidates. Inspect a candidate with `git show --stat <sha>`; when it is mechanical, re-run with `--ignore-rev <sha>` and report both results.
- Describe a set-aside commit by what it rewrote (lines, files), as the block does: "the commit <sha> rewrote N lines in M files". The block lists the before and after figures only for the people who gain lines, and prints no total next to the committer's name. Do not attach a line total to the committer's name as if it were that person's holding.

## Rules for every ownership answer

- Counts, shares, bus factor, activity and ownership claims come from SL output. Do not compute them with `git blame` or `git shortlog` by hand. A number SL did not print is your own computation: label it so and name the command you ran. Quote both line counts (non-blank, and counting blank lines). Identity merges are proposals unless the user asked you to apply them.
- When the prompt note carries a `Pre-computed ownership brief` (the output of `<sl> --brief`, computed by the tool for that commit), its numbers are the tool's: quote them and do not recount. They cover the whole repository. For a named directory or language, re-run with `<sl> --brief -- <dir>` or `<sl> --brief --include '<glob>'`.
- For each person you name, give the share in percent next to the line count.
- State what the output says was left out and why: dropped files (lockfiles, generated files, vendored code, binary files), bots excluded, and the reformat commits ignored, by their short ids.
- State the identities merged by `.mailmap`, naming the file and the lines they add. These are already in the numbers.
- Give every bus factor figure the tool prints, each with its scope (whole repository, path or group): `bus factor` and `to reach 80%`, the non-blank base and the `counting blank lines` base, and the merged and unmerged figures when an identity hint exists. Say which figure the headline is: leading with only the higher one understates the risk. Give the `active bus factor` line next to it and say it is counted on the lines of the active people, not on all lines.
- A single point of failure (active bus factor 1; `single point` in `--group-by` blocks) and orphaned code (`orphaned`) are two separate verdicts. A group can have both, one or neither. Never fold them into one risk rank.
- Who to ask: name the top owner (most surviving lines in the scope) first, as the main source of knowledge, with the share. Say plainly if that person has no commit in the activity window. Then name the most active owner as the practical contact. Never call an inactive person reachable; never omit the top owner.
- When a `history:` line says the history is an import, young or starts late, say the table describes the work since that start, and that older lines go to whoever imported them. Quote the `workflow:` line too: it says who the table names under squash or merge workflows.
- Do not merge what the tool reports separately (people, files, periods, the two line bases, merged and unmerged figures) without saying so and naming the parts.
- For a `possible same person` suggestion or an `identity hint`, follow its strength: `strong` leads with the merged figure, `weak` leads with the unmerged figure; the other is stated next to it. A `weak addition` is stated separately with its own lines.
- Order people by surviving lines. Activity is information only.
- When the question names files and also asks about the package, the repository or a directory ("in the package", "in the repo", "under lib/"), also run the tool on that wider scope and give its shares. Per-file tables alone do not answer it.
- When the header says `(non-blank; N with blank lines)`, the shares count non-blank lines. When you state the size of the code, give both numbers (for example "2,941 non-blank lines, 3,322 with blank lines").
- When the table has `with blank` and `share` columns, two bases are printed: give both for each person you name and for the total, and give the bus factor on both bases when the `bus factor` line adds `counting blank lines`.
- The default view, `--history` and `--reviewers` print a `top: <author> holds <n> non-blank lines (<share>), <m> counting blank lines (<share>)` line under the table. Quote that line whole: it carries both counts, and a reader who counts blank lines needs the second one. `--reviewers`, `--history`, `--group-by` and `--files` show `with blank` columns under the same rule as the main table.
- For a concentration or ownership question about a directory or package, run `--files` once and give the rows where no owner holds half or one owner holds everything, next to the table shares.
- `--reviewers <dir>` and `--history <dir>` print a `files in <dir> by owner` block under the table: for each person with at least 10 lines or 3% of the directory (the smaller counts them in), the files where they hold half or more, and a `files only one person has written` line. When you name a reviewer for a directory, name the files that person owns from that block, and say which files nobody else has written.
- For "who is still active", "what if X leaves" and "which code has nobody left": the line `as of <date>: k of n authors committed in the last 365 days and hold x% ...; y% of the lines belong to people with no commit in that time` is printed under the table, `--files`, `--reviewers` and `--history`; quote it whole, with its as-of date (the ref's commit date, not today). Absent line = everyone is active. `--files` and `--reviewers <dir>` print an `orphaned (top owner inactive, nobody active holds 20%+)` line and `--orphans` lists the files; say these are risks to check, not proof that nobody knows the code. `<sl> --without "<name or address>[,<name>...]"` answers "what if X leaves": give the lines they hold, the files they own, the files nobody remaining would know, the bus factor before and after (state that the second is counted on the remaining lines) and who would inherit most, and say it counts lines, not understanding. `--active-days <n>` changes the window.
- For "what does X own": `<sl> --owned-by "<name or address>"` prints their lines on both bases, the files they own most of, half of or alone, and their lines per directory. Quote both line counts. A bot or a person with no surviving line is answered as such: say so, and give the dates it prints.
- For "who owns which directory": `<sl> --tree [depth]` prints each directory's top owner and share; quote them with the `(inactive)` and `(no owner above 50%)` marks.
- For "which files are risky" or "hotspots": `<sl> --attention` lists files with the commits and reasons (orphaned, single owner, coupled) it prints; quote the window, and say so if it prints `none:`.
- For "what changes together with <file>": `<sl> --coupled <file>` lists partners with shared commits, degree and top owner, and reviewers; one file only.
- For "how much recent code survives": `<sl> --written-since <date>` (author date, written / inserted per person).
- For "who owned this over time" or handovers: `<sl> --timeline [path]` (commits, not surviving lines).
- For "is our CODEOWNERS file right" or "who is missing from CODEOWNERS": `<sl> --check-codeowners` (or `--check-codeowners <file>`). It prints, with CODEOWNERS line numbers, files with no rule, rules that match no file, rules whose declared owners and the observed owners (20% or more of the covered lines) share nobody, declared owners with no line and no commit there for a year, undeclared people who hold half, and declared owners inactive for `--active-days`. Rules naming `@org/team` or an unmapped handle are "not comparable": say so, never call them wrong. Quote the counts; it does not say who should own the code.
- For "why is X not suggested for <path>": `<sl> --why-not "<name or address>" -- <path>` prints one sentence with the numbers that decided it (rank, lines, the third place's lines, last commits, the cutoff date). Quote it whole; do not add a reason it does not give.
- For "who should review this change/PR": `<sl> --for-diff <base>...<head>` (or `<base>..<head>`; a lone `<base>` means `<base>..HEAD`). It lists the people who wrote the lines the change replaces or deletes, without the change authors; give the touched lines, the active or inactive mark and the `worst file:` headline, and say that new files and pure insertions have no earlier owner. State it counts lines being replaced, not who understands the change.
- A `re-applied work credited to the original author:` line means the commit re-applied a reverted change or copied another author's commit, and its lines are already counted under the original author. Say who wrote the work and who re-applied it; do not give the re-applier the credit. `--no-reapply-credit` turns the credit off.
- A `credited to the author:` line means the commit was committed by someone other than its author. The lines belong to the author; name the committer only as the person who committed it, never as the writer.
- When the output has a `whitespace-only commits` line, name each commit with its author and file, say that author holds no line of it, and give the figure for who holds the file now.
- When the output has a `placeholder identities` line, say that those lines (give the count and the share) cannot be attributed to a person, and never name those identities as someone to ask.
- Name the bots the `bots excluded` line lists and say their lines are not credited. When the `mechanical rewrites checked` line says `rewrites looked through`, say those commits were looked through and their lines went back to the earlier authors; for a commit marked `boilerplate` (a licence or banner header added to several files), say its lines were left out of the numbers because no earlier author wrote them.
- When the output has a `one address, several names, counted as one` line, name those people and their names in the answer. Never write "no duplicates" or "no one appears twice" while that line is printed.
- For a question about which people wrote the code, list every row the table shows and state the tail line (`N more authors hold X% together; largest: <name>`). The default table shows every author with at least 1% of the lines, 10 to 25 rows, and a `last commit` column; `--top <k>` shows exactly k rows and no `last commit` column.
- In the default view a name that appears only in a `Co-authored-by` trailer carries no lines. Trailer names get lines only with `--co-authors share`; say so when a trailer-only name is asked about.
- When the output has a `deep copy detection` line (`--copies deep`), state that it can credit lines to a commit that was later reverted, and compare with the default (`-C`) figures.
- The scope notes are the same in every view, including `--reviewers`, `--history` (with or without a path), `--identities` and `--json`. Read them in whichever view you used.

## Who shaped a path, and who should review it

`<sl> --history <path>` takes a file or directory and lists the people who changed it, oldest first, with their first and last commit, their commits and the lines of theirs that survive today. Commits that only reformatted the path are listed as set aside. Use it for "explain the history of this file" and say who made the first commit and who holds the most lines now. When the headline names a person with a strong identity suggestion, lead with the merged figure ("counting X and Y as one person because <evidence>") and state the unmerged figures next to it; for a weak suggestion lead with the unmerged figure. Read the headline's figure as the one to lead with.

`<sl> --reviewers <path>` takes a file or directory. It prints the owners of that path by surviving lines, the commits and the last commit date of each, and a `suggested by surviving lines:` line of the three people with the most lines. Each person has a last commit date and an `active` or `inactive` marker; these are information and never change the order. Name the people in line order, give their lines and share, and say what the marker says about each. Do not drop a top-three owner or call a larger owner less relevant because of the marker. When an `active only` line is printed, give the line-ranked list first and the active-only list next to it. The `last commit` column is the newest commit at the path; `last anywhere` is the newest commit in the whole repository. A person who is `inactive` at the path with a recent `last anywhere` has left the path, not the project; say which. For a single file, commits before a rename are counted.

To name a second reviewer, do not read the `active only` line alone. Recommend the person who owns the most lines of the scope among those active in the last 12 months, give the files that person owns from the `files in <path> by owner` block, and say who else owns files nobody else has written (the `files only one person has written` line), because that person is the only one who can answer for those files. Same-name addresses are merged for the suggestion only; the identity hint rule above still applies.

## Other options

- `--brief` prints at most 40 lines about the whole repository (owners with both line counts, bus factors, activity, orphans, what was left out, identity proposals, top directories, single-owner files); `--json` gives a small object; `--time-budget <seconds>` prints nothing when the run is slower. It combines with `--include`, `--exclude`, `-- <paths>`, `--since`, `--merge-identities` and `--active-days`, not with the other views.
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

- For a long ownership report with many named claims, ask the `claim-checker` agent (it ships with the plugin) to check the draft against `<sl> --brief` before you finish. A Stop hook also checks the numbers, names and merges of the final answer once, with no model call.
