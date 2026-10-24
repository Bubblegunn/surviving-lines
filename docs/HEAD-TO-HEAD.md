# Head-to-head: surviving-lines against other Claude Code plugins and plain Claude

This page fixes the public tasks before the improvement work starts, so the tasks cannot be changed to suit the result. The harness that runs and grades them is in [`bench/head-to-head/`](../bench/head-to-head/), and anyone can run it.

Frozen on 2026-10-21, before any change to `bin/surviving-lines.js` in this round. The task list is `bench/head-to-head/tasks.json`; this page and that file must agree.

## What is compared

Four arms, each run on the same tasks with the model `claude-sonnet-5-5`:

| Arm | What it is |
| --- | --- |
| ours | this repository loaded with `claude --plugin-dir` |
| project-pilot | project-pilot 1.0.0 (MIT), the only one found on 2026-10-21 in Anthropic's directory that does code ownership and bus factor, loaded with `--plugin-dir` from a clone, with the prompt the task gives |
| project-pilot invoked | the same plugin, with the prompt that names its bus-factor command (`ppInvokedPrompt` in `tasks.json`). Run only on tasks that have that prompt |
| no plugin | Claude Code with an empty plugin that only has a name |

Every arm, the no-plugin arm included, still loads three built-in plugins (cc-plugin-telemetry, cc-plugin-plugin-authoring and cc-plugin-agents-md), so "no plugin" means no code-ownership plugin, not an empty session.

Each task runs 3 times per arm, each time on a fresh copy of the fixture. Our arm and the no-plugin arm get the natural prompt, which never names a tool. The invoked project-pilot arm gets a prompt that names project-pilot's own command, as its README instructs, so the competitor is also measured at its best.

## Fixture

The fixture is a real repository, `expressjs/cors` at commit `5317ebe` (351 commits, 17 files, 2 people carry most of the code, one bot). The harness adds three commits with fixed dates. They are synthetic and exist only in the local copy; they are not part of expressjs/cors, and the invented second address and the invented formatter author do not belong to real people.

1. test/vary.js (36 lines), committed as Troy Goode under a second address, `troy@laptop.example`. His other address is the one already in the history.
2. A `// checked` comment appended to 12 function lines of lib/index.js, also as Troy Goode on the second address.
3. A formatter pass by an invented author, Fiona Formatter: indentation doubled and single quotes turned into double quotes in lib/index.js and three test files. 1,016 lines added and 1,016 removed. This is the trap: a plain blame gives that author about 214 of the 238 lines of lib/index.js.

Two variants:

- `noignore`: the three commits above. Nothing in the repository says commit 3 is a reformat. Most real repositories look like this.
- `ignore`: the same, plus a fourth commit that adds `.git-blame-ignore-revs` naming commit 3.

`bench/head-to-head/build-fixture.sh` builds either variant and writes the id of the reformat commit to `reformat-sha.txt`. Run it twice and the commit ids are identical.

## Ground truth

`bench/head-to-head/truth.py` computes it with `git blame -w -M --line-porcelain`, the reformat commit ignored, bots left out and Troy Goode's two addresses merged. It does not use surviving-lines. Its output also has the sections the extra tasks need: surviving lines by extension and by top-level directory, commits by author date in the window from 2026-03-29 to 2026-04-12, and the authors of `lib/index.js` in order of first change, with the lines each still holds. The whole-repository, lib/ and test/ tables give the same Troy Goode, Douglas Christopher Wilson and bus factor figures in both variants (the whole-repository line total differs by the two lines of the ignore file, as its row shows). The root-directory and no-extension sections differ by the two lines of the ignore file:

| Scope | Troy Goode | Douglas Christopher Wilson | Bus factor (fewest people holding half the lines) |
| --- | --- | --- | --- |
| whole repository (1,985 lines in `noignore`, 1,987 in `ignore`, which adds the two-line blame-ignore file) | 810 (40.8%) | 629 (31.7%) | 2 |
| lib/ (238 lines) | 159 (66.8%) | 22 (9.2%) | 1 |
| test/ (966 lines) | 517 (53.5%) | 374 (38.7%) | 1 |

A plain blame of lib/index.js, with no ignore, gives the reformatter 214 of 238 lines.

## The eleven public tasks: six core tasks and five extra tasks

The six core tasks are below. The five extra tasks, E1 to E5, are in [Extra tasks](#extra-tasks-from-competitor-and-category-examples), after this table.

Each task has 5 criteria. A run scores the number of criteria it passes, out of 5. Where a criterion can be checked by a script (a number in a range, a name present, a `.mailmap` file written) the grader is also given the facts to check against.

| Id | Fixture | Prompt |
| --- | --- | --- |
| T1 | noignore | Who actually owns the code in this repo? I want to know whose code is still here today, not who has made the most commits. |
| T2 | noignore | What is the bus factor of the lib directory? If people leave, how many does it take before nobody understands it? |
| T3 | noignore | Does anyone show up in this repo's history under more than one name or email? If so, fix it so each person is counted once, then tell me the new top author. |
| T4 | noignore | I'm about to change lib/index.js. Who should review it? |
| T1i | ignore | the T1 prompt |
| T4i | ignore | the T4 prompt |

Criteria:

**T1 and T1i, ownership**
1. Names Troy Goode as top owner by surviving lines with a count between 780 and 840 (both addresses counted as one person).
2. Names Douglas Christopher Wilson second with a count between 600 and 660.
3. The reformatter (Fiona Formatter) is not shown with more than 100 lines.
4. dependabot is not ranked as an author (absent, or stated as excluded).
5. The number comes from a line-level command on the repository (git blame or a tool that wraps it), not from shortlog or commit counts alone.

**T2, bus factor of lib/**
1. States a bus factor of 1 for lib/, or says one person, Troy Goode, holds the majority.
2. Troy Goode's share of lib/ is between 60% and 72%, or between 150 and 170 lines of about 238.
3. The reformatter is not named as the dominant owner of lib/.
4. States how the figure was computed (the definition, and the unit: lines or commits).
5. The numbers are reproducible: a command is shown or the run used a script, not a guess over a few sampled files.

**T3, duplicate identities**
1. Finds that Troy Goode appears under two addresses: troy@laptop.example and the one that comes from the upstream history.
2. Writes a correct `.mailmap` in the repository: Troy Goode's second address mapped to Troy Goode, and no two different people merged. Unifying the two spellings of one person who uses a single address (Alejandro Caravaca Puchades and alex94puchades, five commits on one address between 2015-05-26 and 2015-05-28) is correct and allowed.
3. Re-runs a count after the fix and names a top author with the basis stated: Troy Goode if counted by surviving lines, Douglas Christopher Wilson if counted by commits. A top author with no stated basis fails.
4. Does not claim a merge for Douglas Wilson or any unrelated pair.
5. States that the mapping is a guess or an assumption, or asks for confirmation (any hedging sentence).

**T4 and T4i, who should review lib/index.js**
1. Names Troy Goode first, or as the main reviewer.
2. Gives evidence with numbers for him (surviving lines or share), not only commit counts.
3. Does not name Fiona Formatter as the main owner, and does not name dependabot as a reviewer.
4. Counts Troy's two addresses as one person (a Troy figure above 150 lines, or a share above 60%).
5. Names at least one second reviewer.

## Extra tasks from competitor and category examples

Five extra tasks, E1 to E5, were added on 2026-10-21 under fairness rule F8: every example that a competitor shows in its own README becomes a task, and so does each public benchmark of the category. The task list is `bench/head-to-head/tasks.json`. Each extra task was frozen in the commit that added it to that file, before any round 1 run, and the criteria below are copied from that file word for word. The outcome or process label of each criterion comes from the same independent auditor as the core tasks.

| Id | Source | Prompt |
| --- | --- | --- |
| E1 | project-pilot README and commands/bus-factor.md: the bus factor report | Run a bus factor analysis of this project. Which parts of the codebase depend on a single contributor, and who is that person? |
| E2 | project-pilot README: sprint-health --team, the per-contributor breakdown | Give me a per-contributor breakdown of activity for the 14 days up to the latest commit in this repo (the latest commit is dated 2026-04-12). How many commits did each person make? |
| E3 | git-fame --bytype, docs/COMPARISON.md row P11 | For each file type in this repo (by extension), who owns the most surviving lines? |
| E4 | git-who tree and git-fame, docs/COMPARISON.md row P12 and the CODEOWNERS suggestion | Who owns each top-level directory of this repo? Suggest CODEOWNERS lines. |
| E5 | project-pilot README and commands/history.md: the code history of a file | Explain the history of lib/index.js: who shaped it, and whose code is still in it today? |

The criteria of each task:

**E1**

1. Names Troy Goode as the single contributor that lib/ depends on, with a share between 60% and 72% or between 150 and 170 lines.
2. Reports the result per directory or module (at least lib/ and test/), not only one number for the whole repository.
3. Does not name the formatter (Fiona Formatter) or a bot as an owner of lib/ or test/.
4. States the definition and the unit of the bus factor it reports (lines or commits, and the threshold or rule).
5. Does not rank dependabot as a person who holds knowledge of the code.

**E2**

1. Reports 2 commits for Troy Goode in the window.
2. Reports 1 commit for Vansh Sharma in the window.
3. Reports 1 commit for Fiona Formatter in the window.
4. Lists no other person with commits in the window (no dependabot, nobody else).
5. States the date window it used.

**E3**

1. Names Troy Goode as the top owner of .js files with a count between 640 and 700 lines.
2. Names Douglas Christopher Wilson as the top owner of .yml files.
3. Names Troy Goode as the top owner of .md files.
4. Does not name the formatter (Fiona Formatter) or a bot as the top owner of any file type.
5. The numbers come from a line-level command on the repository (git blame or a tool that wraps it).

**E4**

1. Names Troy Goode as the owner of lib/.
2. Names Troy Goode as the owner of test/.
3. For .github/ names Douglas Christopher Wilson as the largest owner, or says that no single person holds a majority.
4. Does not name the formatter (Fiona Formatter) or a bot as the owner of lib/ or test/.
5. Gives CODEOWNERS-syntax lines (a path followed by an owner) for at least lib/ and test/.

**E5**

1. Names Troy Goode as the main author of the code still in lib/index.js, with a count between 150 and 170 lines.
2. Names Douglas Christopher Wilson as the second contributor to the code still in lib/index.js, with a count between 15 and 30 lines.
3. Says that one commit only reformatted the file (style, indentation or quotes) and does not credit its author with the code.
4. Does not credit Fiona Formatter with more than 30 lines of lib/index.js.
5. Names at least three different people who changed lib/index.js over time.

E1, E2 and E5 also have an invoked prompt (`ppInvokedPrompt` in `tasks.json`), which names project-pilot's own command, as F2 requires. E3 and E4 have none.

Not tasks: project-pilot has more examples outside the ownership domain (analyze, debt, release-notes, adr, deps, impact, breaking-changes, onboard, dashboard). They are different jobs, so they are not tasks here, and nothing on this page claims a result for them.

**Round 2 change to the task set (frozen before any round 2 code change).** E2 scored 5 of 5 on every arm in round 1, so it is retired and replaced by E2h, a harder variant of the same pain. E2 and its round 1 results stay in this page and in the results folder.

E2h prompt: "Give me a per-contributor breakdown of the real work done in the 14 days up to the latest commit in this repo (the latest commit is dated 2026-04-12). Set aside formatting-only commits and bots, count each person once, and tell me which commit you set aside and why." Fixture: noignore. The invoked project-pilot prompt names its `sprint-health --team` command.

E2h criteria:
1. Reports 2 commits for Troy Goode in the window.
2. Reports 1 commit for Vansh Sharma in the window.
3. Does not list Fiona Formatter as a contributor of real work (her commit is set aside).
4. Names the set-aside commit as a formatting-only commit (the style reformat commit by Fiona Formatter, by its subject or short hash) and gives the reason (whitespace, indentation and quote changes only).
5. Lists no other person with commits in the window and no bot, and states the date window it used.

All five are outcome criteria (labelled by a fresh auditor). **Round 2 grading method.** Every criterion that states a number, a name, a range or a file is now checked by a script on the final answer (`checks` in `tasks.json`, run by `grade.py`, no model call). The script rules are lenient on purpose: a number counts when it appears next to the name in the same line or sentence, even as a hedged alternative. Only the criteria a script cannot decide go to the model grader, which judges each such cell three times; the majority is kept and the agreement rate is reported.

Stated loss, not tested in this round: git-fame's `--since` and `--until` window works on the blame side (row P05 in [`docs/COMPARISON.md`](COMPARISON.md)). E2 asks a different question, the number of commits per person by author date, so the blame-side window is not measured here and no result on this page covers it.

## How a run is graded

1. `run.sh` runs one task for one arm in a fresh copy of the fixture and keeps the full stream of tool calls and the final answer. It also keeps any `.mailmap` the run wrote.
2. `grade.py` puts the answers of all arms for one task and one run number into one text, with the arms labelled A, B, C and D in a shuffled order (the seed and the label map are written to a separate file), without the header lines that would reveal the arm and with plugin names, `plugin:skill` ids and plugin directories in the command lines replaced by neutral placeholders (`<plugin>`, `tool:skill`, `<tool>`), plus the criteria and the ground truth. Each criterion is decided in one of two ways. A criterion with a script check in `tasks.json` is decided by a script on the arm's final answer, with no model: the script looks for a number of the right unit near a name (a number with a `%` is a percentage, one without is a plain count; a number counts when it appears on the same line as the name, on a line longer than 240 characters within 140 characters of the name, even as a hedged alternative), for the order in which names first appear, for names that appear anywhere in the answer, and for a name and a file type that share a line, for a file or phrase pattern, and for the `.mailmap` the run wrote (a line that does not name the person passes only when all its addresses are one address, where the task allows a same-address unification; any other line that merges two people fails). A hedged mention counts. Every other criterion goes to a model: a separate `claude -p` call with the model `claude-sonnet-5-5` and no plugins marks it pass or fail with a one-line reason. Each model-judged cell is graded by three separate calls, and a criterion keeps the majority of the three votes (two of three). A call that fails or does not parse gives no vote. A criterion with fewer than two votes is an error and is left out of the counts. Our own tool is never the judge. This blinding covers names, ids and paths only. The numbers and wording that a tool prints in a command's output can still reveal which arm ran, and nothing hides them.
3. Every criterion is labelled `outcome` (what the user receives: correct numbers, names, facts, files) or `process` (which method or command the run used). The labels were written by a separate Sonnet auditor that had read only the prompts and criteria, never the tool's code, and are committed before the runs they apply to (`criteria-labels.json`, `criteriaKinds` in `tasks.json`).
4. `RESULTS.md` reports, for every task and arm, the score of each run, the mean, the minimum and maximum and n. The outcome-only table is the one the win rule uses. The full table and the process criteria are reported next to it.
5. `RESULTS.md` also reports the grading method and the agreement: how many criteria the scripts decided, how many the model decided, and how often the three model votes were unanimous. The scripted rules are lenient on purpose. A script pass does not prove that a careful reader would pass the answer.

## Win rule

From the plugin leadership spec, applied to the outcome criteria of the public tasks (and later to held-out tasks that an agent wrote without reading this code or these tasks):

- On every task, our mean is strictly higher than the mean of every other arm. For project-pilot the comparison uses the better of its two arms (natural prompt and invoked prompt) on that task.
- Our total (the sum over tasks of the outcome means) is at least 20% above the best other arm's total, where project-pilot's total is the sum over tasks of its better arm.
- A task on which every arm scores full marks does not discriminate. It is replaced by a harder variant of the same user pain, and the replacement is logged here.
- A competitor that cannot be run, or whose plugin never loaded, is listed as "not run, with the reason". It is never counted as a win for us.

## Fairness rules

The results are published and anyone can re-run them, including the authors of the other tools. These rules apply:

- F1, outcome and process: an auditor that has not read our code labels every criterion as outcome or process. The gate counts outcome criteria only. Process criteria are reported separately. The labels are committed before the runs they apply to.
- F2, competitor at its best: every competitor also runs in an invoked arm, where the prompt calls its skill or command by name as its README instructs. The gate compares us with the better of its two arms. Our arm keeps the natural prompt that does not name our tool.
- F3, set-up: a competitor is set up as its README says (dependencies, environment variables, plugin root). A competitor that cannot run is listed as "not run" with the reason and is never counted as a win. Competitors are loaded with `--plugin-dir` only, never with an installer, and a guard checks the hooks and MCP servers of the real Claude configuration before and after every competitor run (`GUARD_CMD`).
- F4, everything published: prompts, fixtures, criteria with the commit that froze them before the runs, every transcript, the grader prompts, the label maps, the scripts and a one-command re-run are in `bench/head-to-head/`. Email addresses in published transcripts are redacted; the graders saw the original text.
- F5, honest numbers: per-run scores, the mean, the minimum and maximum and n are reported. Claims are scoped to these tasks, this model and this date. The words "best" and "beats every tool" are not used.
- F6, audit: before a head-to-head is published, an independent auditor with fresh context re-runs and re-grades a random 10% of the cells. A disagreement of more than one point on any cell sends the grading back for repair.
- F7, no claim before the gate: nothing is published as a head-to-head claim until the repository has passed the gate on public and held-out tasks. A loss found before launch is fixed, not published.
- F8, the competitor's home ground: every example a competitor shows in its README, and any benchmark it publishes, becomes an extra task (see the extra tasks section), plus public benchmarks of the category. We must win or reach the ceiling there too.
- F9, model robustness: the final gate runs on `claude-sonnet-5-5` (3 runs per task) and also on Haiku and Opus (1 run per task each), through the `MODEL` setting. No task may be lost on any model.

## Run it yourself

```
git clone https://github.com/Bubblegunn/surviving-lines
cd surviving-lines
OURS_DIR="$PWD" PP_DIR=/path/to/project-pilot-clone bash bench/head-to-head/rerun.sh /tmp/h2h-sonnet 3
```

`rerun.sh` builds the fixtures, runs every task on every arm three times, grades the runs blind, and prints the path of `RESULTS.md`. `PP_DIR` is a local clone of project-pilot, which must contain `.claude-plugin/plugin.json`. Each task runs on the arms `ours`, `pp` and `base`, and on `ppi` when the task has an invoked prompt.

Needs `claude` (Claude Code), `git` 2.23 or later and `python3`. The model is `claude-sonnet-5-5` unless `MODEL` says otherwise: `MODEL=haiku` or `MODEL=opus` runs another model, and each model takes its own output folder, for example `/tmp/h2h-haiku`. To publish a round with redacted transcripts:

```
bash bench/head-to-head/publish-results.sh /tmp/h2h-sonnet round1-sonnet
```

The head-to-head claims in this page cover the tasks, the model and the date of the table they sit beside. See `bench/head-to-head/README.md` for each script and environment variable.

## Round 3: rulings and task changes (frozen before any round 3 change to the tool)

Rulings recorded on 2026-10-22, after round 2:

1. T3 firing: the plugin gets a `UserPromptSubmit` hook (read-only git, no network, no writes, bounded time) that adds the suspected same-person groups, and always says the mapping is a guess until confirmed, when a prompt is about duplicate names, duplicate emails or ownership. The skill description gains the words users type. False triggers are measured on 20 unrelated prompts and the time on a 10,000-commit repository.
2. T3 criterion 2 (the `.mailmap`): revised, with evidence below.
3. E2h and E4 scored 5.00 on every arm in round 2, so they are retired and replaced by E2k and E4h.
4. E3: the `.js` count must come from the tool's group output in every run (a skill rule, not a change to the criterion).
5. Commit hygiene before any push: the "Sade dil" blocks of four commit messages are corrected, with every tree hash verified unchanged.

**T3 criterion 2, with evidence.** In round 2 every arm failed this check in every run, because every run also unified the two spellings of one person. The fixture history shows that this is one person: the five commits authored as "Alejandro Caravaca Puchades" (4) and "alex94puchades" (1) carry one and the same author address, are dated 2015-05-26 to 2015-05-28 and belong to one pull request. The old rule counted a correct fix as a wrong merge. The new text allows unifying spellings that share one address and still fails any merge of two different people. `truth.py` now credits the lines of "alex94puchades" to "Alejandro Caravaca Puchades". The old text and check are kept in `tasks.json` under `revisions` and in git history.

New criterion 2 of T3: "Writes a correct .mailmap in the repository: Troy Goode's second address mapped to Troy Goode, and no two different people merged. Unifying the two spellings of one person who uses a single address (Alejandro Caravaca Puchades and alex94puchades, five commits on one address between 2015-05-26 and 2015-05-28) is correct and allowed."

**E2k** (replaces E2h; fixture noignore). Prompt: "Which people committed in the 14 days up to the latest commit in this repo (the latest commit is dated 2026-04-12)? For each person give their commits in that window and how many lines of theirs are still in the code today. Set aside formatting-only commits and bots, and count each person once." Criteria:
1. Reports 2 commits in the window for Troy Goode.
2. Reports between 780 and 840 lines of Troy Goode that are still in the code today (both of his addresses counted as one person).
3. Reports Vansh Sharma with 1 commit in the window and 1 line still in the code today.
4. Does not list Fiona Formatter as a contributor of real work, and names her commit as a formatting-only commit that was set aside, with the reason (whitespace, indentation and quote changes only).
5. Lists no other person or bot as having committed in the window, and states the date window it used.

**E4h** (replaces E4; fixture noignore). Prompt: "Suggest CODEOWNERS lines for this repo's top-level directories (lib, test, .github) and the root files. Only name an owner where one person holds at least half of the surviving lines; ignore bots and formatting-only commits and count each person once. Where nobody holds half, say so." Criteria:
1. Assigns lib/ to Troy Goode.
2. Assigns test/ to Troy Goode (his two addresses together hold just over half; one address alone is under half).
3. Gives .github/ no owner and says that nobody holds half of its lines.
4. Gives the root files no owner and says that nobody holds half of their lines.
5. Writes CODEOWNERS-syntax lines (a path followed by an owner) for lib/ and test/.

All ten new criteria are outcome criteria (labelled by a fresh auditor). Ground truth for both, from `truth.py`: Troy Goode 810 lines and Vansh Sharma 1 line; lib/ Troy 159 of 238 (66.8%), test/ Troy 517 of 966 (53.5%, and 481 or 49.8% on one address alone), .github/ Douglas Christopher Wilson 118 of 366 (32.2%), root files Troy 134 of 415 (32.3%).

## Round 0: before any improvement (2026-10-21, single run per cell)

Score is criteria passed out of 5. Same prompts and criteria as above, with two differences: the older T3 wording on criterion 3 asked for Troy Goode with no stated basis, and the invented formatter author in round 0 carried the name of a real contributor of expressjs/cors, which this round replaced with an invented name. The formatter's name changes no number.

| Task | ours (0.3.0) | project-pilot | no plugin |
| --- | --- | --- | --- |
| T1 ownership, noignore | 2 | 5 | 4 |
| T2 bus factor, noignore | 4 | 5 | 4 |
| T4 reviewer, noignore | 4 | 3 | 3 |
| T1i ownership, ignore | 5 | 4 | 5 |
| T4i reviewer, ignore | 5 | 4 | 5 |
| T3 identities, ignore | 4 | 4 | 4 |

Our loss was one thing: with no ignore file, 0.3.0 credited the formatter with a large share of the code and said nothing. Round 1 changes that, among other things. Project-pilot's skills loaded but were not called in any of 7 runs, so its arm behaved like plain Claude. Differences of one criterion in a single run are noise.

## Results, round 1

Run on 2026-10-21 with the model `claude-sonnet-5-5`, 3 runs per task and arm, on the code at commit `226b85f` (the tool and the skill; later commits changed the speed and some wording of the output, not any number). Every transcript, grader input, grader output, label map and score is in [`bench/head-to-head/results/round1-claude-sonnet-5-5/`](../bench/head-to-head/results/round1-claude-sonnet-5-5/), with a `MANIFEST.txt` that records the versions and hashes. The full per-run table is in its `grade/RESULTS.md`. Email addresses in the published transcripts are redacted; the graders saw the original text. These numbers describe these 11 tasks, this model and this date, and nothing else.

**Status.** Not audited: the independent re-grade of 10% of the cells (rule F6) has not been done. The held-out tasks and the Haiku and Opus runs have not been run. No claim in this section is a launch claim; rule F7 applies before anything here is quoted elsewhere.

Two things to know about how this round was run:

- A final change to the tool (the merged figure on the identity hint) was made after a smoke run on the public task T1, before the round. The round ran a version of the output that the smoke run had not seen.
- A re-run has no guard unless you supply `GUARD_CMD`. The guard script used in this round is the owner's own and is not in the repository, so `rerun.sh` does not check the Claude configuration before and after the competitor runs by default.

### Grading was done twice

The same 123 transcripts were graded twice by separate `claude-sonnet-5-5` calls. The first grading showed the grader the tool and plugin names in the command lines, so it was not blind; it gave ours 48.00 outcome points against 42.00 for project-pilot's better arm. After the harness was changed to neutralise those names, skill ids and paths, the transcripts were graded again, and that second grading is the one published here and in the results folder: 46.00 against 42.67. Two gradings of the same text differ by up to 2 points on a total, which is the size of the noise in a one-call grader; some of its reasons even say a criterion is satisfied and then mark it failed. This is why rule F6 (an independent re-grade of a random 10% of the cells) matters and why no single cell should be read as exact.

### Did each plugin load and get used

| Arm | Status | Runs with plugin loaded | Runs with a skill or command invoked | Runs |
| --- | --- | --- | --- | --- |
| ours | run | 33 | 27 | 33 |
| pp | run | 33 | 3 | 33 |
| ppi | run | 24 | 24 | 24 |
| base | run | 33 | 0 | 33 |

Project-pilot's own skills were invoked in only 3 of 33 runs with the natural prompt, which is why the invoked arm exists. The invoked arm names its bus-factor command and ran on the 8 tasks that have a matching command.

### Outcome criteria only (the gate counts these)

Each cell is the mean number of outcome criteria passed, with min, max and number of runs.

| Task | Outcome criteria | ours | pp | ppi | base |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | mean 3.33 (min 3, max 4, runs 3) | mean 3.33 (min 3, max 4, runs 3) | mean 1.67 (min 1, max 2, runs 3) | mean 3.00 (min 2, max 4, runs 3) |
| T2 | 4 | mean 4.00 (min 4, max 4, runs 3) | mean 3.33 (min 3, max 4, runs 3) | mean 2.33 (min 2, max 3, runs 3) | mean 3.67 (min 3, max 4, runs 3) |
| T3 | 5 | mean 4.00 (min 2, max 5, runs 3) | mean 4.00 (min 4, max 4, runs 3) | not in task | mean 4.33 (min 4, max 5, runs 3) |
| T4 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) |
| T1i | 4 | mean 3.00 (min 3, max 3, runs 3) | mean 2.67 (min 2, max 4, runs 3) | mean 2.00 (min 2, max 2, runs 3) | mean 4.00 (min 4, max 4, runs 3) |
| T4i | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 2.67 (min 2, max 3, runs 3) |
| E1 | 5 | mean 4.67 (min 4, max 5, runs 3) | mean 3.00 (min 2, max 4, runs 3) | mean 3.00 (min 2, max 4, runs 3) | mean 3.00 (min 2, max 4, runs 3) |
| E2 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) |
| E3 | 4 | mean 3.33 (min 3, max 4, runs 3) | mean 3.00 (min 3, max 3, runs 3) | not in task | mean 3.00 (min 3, max 3, runs 3) |
| E4 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 4.33 (min 3, max 5, runs 3) | not in task | mean 5.00 (min 5, max 5, runs 3) |
| E5 | 5 | mean 3.67 (min 3, max 4, runs 3) | mean 3.67 (min 2, max 5, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 4.33 (min 3, max 5, runs 3) |

### All criteria (outcome and process)

| Task | All criteria | ours | pp | ppi | base |
| --- | --- | --- | --- | --- | --- |
| T1 | 5 | mean 4.33 (min 4, max 5, runs 3) | mean 4.33 (min 4, max 5, runs 3) | mean 2.67 (min 2, max 3, runs 3) | mean 4.00 (min 3, max 5, runs 3) |
| T2 | 5 | mean 4.67 (min 4, max 5, runs 3) | mean 4.33 (min 4, max 5, runs 3) | mean 3.33 (min 3, max 4, runs 3) | mean 4.67 (min 4, max 5, runs 3) |
| T3 | 5 | mean 4.00 (min 2, max 5, runs 3) | mean 4.00 (min 4, max 4, runs 3) | not in task | mean 4.33 (min 4, max 5, runs 3) |
| T4 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) |
| T1i | 5 | mean 4.00 (min 4, max 4, runs 3) | mean 3.67 (min 3, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) | mean 5.00 (min 5, max 5, runs 3) |
| T4i | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 2.67 (min 2, max 3, runs 3) |
| E1 | 5 | mean 4.67 (min 4, max 5, runs 3) | mean 3.00 (min 2, max 4, runs 3) | mean 3.00 (min 2, max 4, runs 3) | mean 3.00 (min 2, max 4, runs 3) |
| E2 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) |
| E3 | 5 | mean 4.33 (min 4, max 5, runs 3) | mean 4.00 (min 4, max 4, runs 3) | not in task | mean 4.00 (min 4, max 4, runs 3) |
| E4 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 4.33 (min 3, max 5, runs 3) | not in task | mean 5.00 (min 5, max 5, runs 3) |
| E5 | 5 | mean 3.67 (min 3, max 4, runs 3) | mean 3.67 (min 2, max 5, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 4.33 (min 3, max 5, runs 3) |

The process criteria (which method was used) are listed in the results folder. Every arm passed all of them in the first grading; see `grade/RESULTS.md` for the second.

### Gate

- T1: ours 3.33 against project-pilot (pp) 3.33, base 3.00: no
- T2: ours 4.00 against project-pilot (pp) 3.33, base 3.67: yes
- T3: ours 4.00 against project-pilot (pp) 4.00, base 4.33: no
- T4: ours 5.00 against project-pilot (ppi) 4.67, base 3.00: yes
- T1i: ours 3.00 against project-pilot (pp) 2.67, base 4.00: no
- T4i: ours 5.00 against project-pilot (ppi) 4.67, base 2.67: yes
- E1: ours 4.67 against project-pilot (pp) 3.00, base 3.00: yes
- E2: ours 5.00 against project-pilot (pp) 5.00, base 5.00: no
- E3: ours 3.33 against project-pilot (pp) 3.00, base 3.00: yes
- E4: ours 5.00 against project-pilot (pp) 4.33, base 5.00: no
- E5: ours 3.67 against project-pilot (ppi) 4.67, base 4.33: no
- Total: ours 46.00, higher other total 42.67 (project-pilot), needs at least 51.20: no
- Overall: no

Project-pilot is represented on each task by the higher of its pp and ppi outcome means. An arm whose plugin never loaded is not an opponent.

**The gate fails.** Our total of 46.00 outcome points is 7.8% above project-pilot's 42.67 (its better arm on each task), and the rule needs 20%. We are strictly ahead of every other arm on 5 of 11 tasks (T2, T4, T4i, E1, E3) and not on six:

- T1 (ownership): ours 3.33 and project-pilot 3.33, a tie.
- T3 (duplicate identities): no plugin 4.33 against ours 4.00. In one of three runs we named a top author by commit count without re-running a count after writing the `.mailmap`, and did not say the mapping was a guess.
- T1i (ownership, with an ignore file): no plugin 4.00 against ours 3.00. In all three runs the headline figure for Troy Goode was 762 (his two addresses counted separately) and 810 appeared only as a hedged alternative.
- E2 (activity per contributor over two weeks): every arm scores 5 of 5. The task is at the ceiling and does not discriminate, so under the ruling it is replaced by a harder variant of the same pain before the final gate.
- E4 (owner of each directory, CODEOWNERS lines): ours 5.00 and no plugin 5.00, a tie.
- E5 (history of lib/index.js): project-pilot invoked 4.67 and no plugin 4.33 against ours 3.67.

### Why we lost points, from the grader's reasons for our failed criteria

- Identity guess shown as a footnote, not as the headline. In T1, T1i, E3 and E5 the answer put the unmerged figure first (Troy Goode at 762, 628 or 147 lines) and gave the merged figure only as "if they are one person", so the range criteria failed. The hedge is correct behaviour. The cost is that the tool has no way to show a hedged merge and a reformat-corrected count in one table.
- The formatter is still visible in the raw view. In T1 run 1 and in all three E5 runs the answer showed Fiona Formatter's 291 or 32 lines in a table next to the corrected column.
- `--group-by ext` and `--group-by dir` do not apply the reformat correction. E3 runs 2 and 3 reported 628 and 533 lines for `.js` instead of 676.
- T3 run 1 offered a recount instead of running it, and did not say the mapping was a guess. T2 run 3 used the tool through placeholder paths and showed no reproducible command.

### What round 2 would change

1. A `--merge-identities` flag that applies the suggested merges in memory (nothing written) and prints which addresses it merged, so one table can carry both the reformat correction and the hedged merge.
2. Apply the reformat correction to `--group-by` blocks, so per directory and per extension figures stop including the formatter.
3. Hide the suspected formatter's lines from the table when `--ignore-rev` is given, and say so in one line, so the headline table is the corrected one.
4. A file history view for `lib/index.js` style questions: who changed the path over time next to who still owns lines (E5).
5. Skill text: re-run the count after writing a `.mailmap` and say it is a guess (T3); report the merged figure as the headline when the user asked to count each person once; show the exact command in the answer.
6. Replace E2 with a harder variant, run the independent re-grade (F6), then re-run all tasks; run the held-out tasks and the Haiku and Opus runs only after the public gate passes.

### Round 2: the changes and the pending run

Round 2 was prepared after round 1, before its run. The tool changes it tests are:

- A detected reformat commit is left out of the table by default, and the block under the table says so. `--keep-reformat` counts it again.
- The groups view and the CSV output apply the same reformat correction.
- `--merge-identities` counts the suggested same-person addresses as one, in memory, and the table names each merge.
- `--history <path>` lists who changed a file or directory, oldest first.
- The skill re-runs the count after writing a `.mailmap`, and labels the mapping a guess until the user confirms it.

The task set changes in one place: E2 did not discriminate in round 1, so it is replaced by E2h, a harder variant of the same user pain, as the win rule requires. The E2 entry stays in `tasks.json` with its round 1 note.

Grading is scripted where a script can decide a criterion, and a three-call majority decides the rest. The agreement rate between the three calls is reported with the results.

### Round 2 results

Run on 2026-10-21 and 22 with the model `claude-sonnet-5-5`, 3 runs per task and arm (123 task runs, two at a time, the configuration guard read OK before and after every competitor run, no run failed), with the tool and skill at commit `d04349e`, run from a git archive of that commit. Everything is in [`bench/head-to-head/results/round2-claude-sonnet-5-5/`](../bench/head-to-head/results/round2-claude-sonnet-5-5/); email addresses and local paths are redacted there. These numbers describe these 11 tasks, this model and this date only. Not audited under F6, no held-out tasks and no Haiku or Opus runs yet.

**Incident, recorded for honesty.** The first complete pass of round 2 was discarded. At 00:41 on 2026-10-22 the working tree of this repository was overwritten, by something other than the benchmark, with the contents of `bin/surviving-lines.js` and `schema/surviving-lines.schema.json` from the older commit `cfb9ced` (before `--merge-identities` and `--history`). The runs began at 00:48 from the working tree, so the 33 `ours` transcripts of that pass ran the older tool: 12 of them show `unknown option` errors from the flags the skill told the agent to use. I found it when the repository showed those two files as modified. The 33 `ours` transcripts were deleted from the run and replaced by 33 new runs from an immutable `git archive` of `d04349e`; the 90 transcripts of the other arms do not use the tool and were kept; every cell was graded again from scratch. None of the subagents used to build this branch was running at that time (their last activity was before 00:20), so the cause is outside them, probably another session working in the same folder; it is not known. From now on `OURS_DIR` points at an archive, not at the working tree.

How the plugins ran:

| Arm | Status | Runs with plugin loaded | Runs with a skill or command invoked | Runs |
| --- | --- | --- | --- | --- |
| ours | run | 33 | 28 | 33 |
| pp | run | 33 | 5 | 33 |
| ppi | run | 24 | 24 | 24 |
| base | run | 33 | 0 | 33 |

Outcome criteria only (mean criteria passed, min and max, runs):

| Task | Outcome criteria | ours | pp | ppi | base |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | mean 4.00 (min 4, max 4, runs 3) | mean 2.67 (min 2, max 3, runs 3) | mean 2.00 (min 2, max 2, runs 3) | mean 3.33 (min 3, max 4, runs 3) |
| T2 | 4 | mean 4.00 (min 4, max 4, runs 3) | mean 3.33 (min 3, max 4, runs 3) | mean 3.67 (min 3, max 4, runs 3) | mean 3.00 (min 2, max 4, runs 3) |
| T3 | 5 | mean 3.67 (min 3, max 5, runs 3) | mean 3.33 (min 3, max 4, runs 3) | not in task | mean 3.67 (min 3, max 4, runs 3) |
| T4 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) | mean 3.33 (min 2, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) |
| T1i | 4 | mean 4.00 (min 4, max 4, runs 3) | mean 2.67 (min 2, max 3, runs 3) | mean 2.33 (min 2, max 3, runs 3) | mean 3.33 (min 2, max 4, runs 3) |
| T4i | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 3.67 (min 3, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | mean 3.00 (min 3, max 3, runs 3) |
| E1 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 3.67 (min 2, max 5, runs 3) | mean 2.33 (min 2, max 3, runs 3) | mean 4.00 (min 3, max 5, runs 3) |
| E2h | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) |
| E3 | 4 | mean 3.67 (min 3, max 4, runs 3) | mean 3.00 (min 3, max 3, runs 3) | not in task | mean 3.00 (min 3, max 3, runs 3) |
| E4 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 5.00 (min 5, max 5, runs 3) | not in task | mean 5.00 (min 5, max 5, runs 3) |
| E5 | 5 | mean 5.00 (min 5, max 5, runs 3) | mean 4.67 (min 4, max 5, runs 3) | mean 4.00 (min 3, max 5, runs 3) | mean 4.67 (min 4, max 5, runs 3) |

Gate (outcome criteria only; project-pilot counted by its better arm on each task):

- T1: ours 4.00 against project-pilot (pp) 2.67, base 3.33: yes
- T2: ours 4.00 against project-pilot (ppi) 3.67, base 3.00: yes
- T3: ours 3.67 against project-pilot (pp) 3.33, base 3.67: no
- T4: ours 5.00 against project-pilot (ppi) 3.33, base 3.00: yes
- T1i: ours 4.00 against project-pilot (pp) 2.67, base 3.33: yes
- T4i: ours 5.00 against project-pilot (ppi) 5.00, base 3.00: no
- E1: ours 5.00 against project-pilot (pp) 3.67, base 4.00: yes
- E2h: ours 5.00 against project-pilot (pp) 5.00, base 5.00: no
- E3: ours 3.67 against project-pilot (pp) 3.00, base 3.00: yes
- E4: ours 5.00 against project-pilot (pp) 5.00, base 5.00: no
- E5: ours 5.00 against project-pilot (pp) 4.67, base 4.67: yes
- Total: ours 49.33, higher other total 42.00 (project-pilot), needs at least 50.40: no
- Overall: no

Project-pilot is represented on each task by the higher of its pp and ppi outcome means. An arm whose plugin never loaded is not an opponent.

**The gate fails again, narrowly.** Ours is 49.33 against 42.00 for project-pilot's better arm, 17.5% above, and the rule needs 20% (50.40 of a possible 51). We are strictly ahead of every other arm on 7 of 11 tasks (T1, T2, T4, T1i, E1, E3, E5). Not ahead: T3 (a tie with the no-plugin arm at 3.67), T4i (a tie with project-pilot invoked at 5.00), and E2h and E4, where every arm scores 5.00. Those two are at the ceiling for all arms, so nobody can be strictly ahead; under the ruling for saturated tasks they must be replaced by harder variants before a gate can be passed.

Where we lost points:

- T3 (duplicate identities). The skill ran in one of three runs; in the other two the agent used `git shortlog` and wrote a `.mailmap` without the tool, and gave no hedge, so the scripted hedge criterion failed. The skill description needs the words users type for this question.
- The `.mailmap` criterion of T3 failed for every arm in every run, because each run also merged a second, probably genuine, pair (Alejandro Caravaca Puchades and his handle). The frozen rule counts that as merging someone besides Troy Goode. That is a flaw in the criterion, not a difference between arms; it is a decision for the owner.
- E3, run 1: no `.js` count in the 640 to 700 range appeared in the answer.
- Process criteria such as T2 criterion 5 (a reproducible command is shown) do not count in the gate.

Grading reliability. 27 of the 55 criteria are decided by script, 47.8% of the scored (cell, criterion) pairs, and are exactly reproducible. The other 28 are judged by the model three times with the majority kept: 297 of 321 pairs (92.5%) had three identical votes. Per task:

| Task | Script-checked criteria | Model-judged criteria | Pairs decided by script | Pairs judged by model | Unanimous model pairs |
| --- | --- | --- | --- | --- | --- |
| T1 | 2 | 3 | 24 | 36 | 31 of 36 (86.1%) |
| T2 | 1 | 4 | 12 | 48 | 46 of 48 (95.8%) |
| T3 | 3 | 2 | 27 | 18 | 17 of 18 (94.4%) |
| T4 | 3 | 2 | 36 | 24 | 21 of 24 (87.5%) |
| T1i | 2 | 3 | 24 | 36 | 32 of 36 (88.9%) |
| T4i | 3 | 2 | 36 | 24 | 23 of 24 (95.8%) |
| E1 | 1 | 4 | 12 | 48 | 42 of 48 (87.5%) |
| E2h | 2 | 3 | 24 | 36 | 36 of 36 (100.0%) |
| E3 | 3 | 2 | 27 | 18 | 17 of 18 (94.4%) |
| E4 | 4 | 1 | 36 | 9 | 9 of 9 (100.0%) |
| E5 | 3 | 2 | 36 | 24 | 23 of 24 (95.8%) |
| Overall | 27 | 28 | 294 | 321 | 297 of 321 (92.5%) |

Pairs decided by script: 47.8% of the scored (cell, criterion) pairs. Model-judged pairs with three unanimous votes: 297 of 321 (92.5%).

What a round 3 would change: replace E2h and E4 (and watch T4i) with harder variants and re-freeze them; make the skill fire on duplicate-name and duplicate-email prompts and keep the hedge in its answer; decide, with the owner, whether the `.mailmap` criterion should accept the Alejandro merge.


### Round 3 results

Run on 2026-10-22 with the model `claude-sonnet-5-5`, 3 runs per task and arm (123 task runs, two at a time, the configuration guard read OK before and after the competitor runs, no run failed, no rate-limited cell was graded), with the tool, skill and hook at commit `479ebc7`, run from a git archive of that commit. The tasks are the frozen round 3 tasks above (E2k and E4h replace E2h and E4). Published files: `bench/head-to-head/results/round3-claude-sonnet-5-5/`.

How the plugins ran:

| Arm | Status | Runs with plugin loaded | Runs with a skill or command invoked | Runs |
| --- | --- | --- | --- | --- |
| ours | run | 33 | 33 | 33 |
| pp | run | 33 | 4 | 33 |
| ppi | run | 24 | 24 | 24 |
| base | run | 33 | 0 | 33 |

The skill was invoked in 33 of 33 runs (28 of 33 in round 2), including all three T3 runs. No ours run hit an unknown option. The `UserPromptSubmit` hook fires in `claude -p` (checked with `--include-hook-events`: a `hook_started` and a `hook_response` carrying the added context).

Outcome criteria only (mean criteria passed, runs 3 per cell):

| Task | Criteria | ours | pp | ppi | base |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | 3.67 | 3.33 | 1.67 | 3.00 |
| T2 | 4 | 4.00 | 3.67 | 3.00 | 3.33 |
| T3 | 5 | 4.00 | 3.33 | not in task | 4.00 |
| T4 | 5 | 5.00 | 3.00 | 4.00 | 3.00 |
| T1i | 4 | 4.00 | 3.67 | 2.00 | 3.67 |
| T4i | 5 | 5.00 | 4.00 | 4.33 | 3.00 |
| E1 | 5 | 5.00 | 3.00 | 3.00 | 3.00 |
| E2k | 5 | 4.33 | 3.00 | 4.00 | 2.67 |
| E3 | 4 | 4.00 | 2.67 | not in task | 3.00 |
| E4h | 5 | 5.00 | 5.00 | not in task | 3.33 |
| E5 | 5 | 5.00 | 4.33 | 4.00 | 5.00 |
| Total | 51 | 49.00 | 41.33 (best of pp and ppi per task) | | |

Gate: ours is strictly above every other arm on 8 of 11 tasks (T1, T2, T4, T1i, T4i, E1, E2k, E3). It is level with base on T3 (4.00) and E5 (5.00) and level with project-pilot on E4h (5.00). The total is 49.00 against 41.33 for project-pilot's better arm, which is 18.5% above. The rule needs 20%, which is 49.60. **The gate fails, by 0.60 criteria.** The 20% rule is applied as written.

Where ours lost points:

- T3, criterion 2 (a correct `.mailmap` written in the repository), 3 of 3 runs. The skill ran, the tool found Troy Goode's two addresses and the Alejandro Caravaca Puchades handle, and the answer said these are guesses and asked for confirmation before writing a `.mailmap`. No `.mailmap` was written, so the scripted check found no file. The criterion asks for the file; the skill's hedge rule asks for confirmation first. Both are defensible, and the criterion decides.
- T1, run 3, criterion 3 (model-judged, 3 of 3 votes): the answer said that counting the reformat commit would give Fiona Formatter 291 lines, a figure the grader read as listing her above 100 lines.
- E2k, run 3: no line count of the right unit near a name (script), and the answer listed only Troy Goode and omitted Vansh Sharma, who committed in the window (model-judged, 3 of 3 votes).
- Process criteria do not count in the gate.

Grading reliability: 27 of the 55 criteria are decided by script, which is 48.3% of the scored (cell, criterion) pairs, and these are exactly reproducible. The other pairs are judged by the model three times with the majority kept: 294 of 318 pairs (92.5%) had three identical votes. No grading errors.

Not done for this round: the F6 audit by a fresh auditor of the published transcripts, the held-out tasks, and runs with other models (F9). No claim from this round is final until those pass. Results stay on the branch `plugin-leadership`; nothing is pushed.

#### Round 3 under the revised gate (recorded 2026-10-22)

The owner changed rule A: our lost points must be at most 80% of the best other arm's lost points, where lost points are the possible outcome criteria minus the mean passed. The ceiling rule still applies: if another arm is at the maximum on a task, we pass that task only at the maximum. The round 3 numbers above are unchanged; only the verdict is re-evaluated.

- Rule A: ours lost 51 minus 49.00 = 2.00 points. The best other arm (project-pilot, best of pp and ppi per task) lost 51 minus 41.33 = 9.67. The limit is 0.8 x 9.67 = 7.73. 2.00 is below it: **rule A passes**.
- Rule B (per task, strictly above every other arm, or at the maximum when another arm is at the maximum): passes on every task except T3. On T3 ours (4.00) is tied with base (4.00) and below the maximum of 5. On E4h (project-pilot at 5.00) and E5 (base at 5.00) ours is at the maximum, so both pass. **Rule B fails on T3 alone.**
- Overall: the gate does not pass yet, because of T3. Round 4 addresses T3 only.

### Round 4 results

Run on 2026-10-22 in a Claude Code cloud session with the model `claude-sonnet-5-5`, 3 runs per task and arm, 123 task runs, two at a time. The tool, skill and hook ran from a `git archive` of commit `747031f`. Project-pilot is 1.0.0 at commit `bf6eabe`, the source the Anthropic plugin directory lists for it. The configuration guard read the same hash before and after every competitor run. No run failed and no run hit a rate limit. Published: `bench/head-to-head/results/round4-claude-sonnet-5-5/` (the results table and the manifest; the transcripts are not committed).

One departure from the plan: the round 3 transcripts were never committed, so they could not be copied in for the other tasks. Every arm therefore ran every task again, and round 4 is a complete round on its own, not round 3 with T3 swapped in.

How the plugins ran: ours loaded in 33 of 33 runs and its skill ran in 33 of 33. Project-pilot loaded in 33 of 33 runs with the natural prompt, and its skills ran in 6 of them. The invoked arm ran its command in 24 of 24 runs. No plugin ran in the base arm.

Outcome criteria only (mean criteria passed, 3 runs per cell):

| Task | Criteria | ours | pp | ppi | base |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | 4.00 | 2.67 | 2.00 | 2.67 |
| T2 | 4 | 4.00 | 2.67 | 2.33 | 3.67 |
| T3 | 5 | 4.33 | 3.67 | not in task | 4.33 |
| T4 | 5 | 5.00 | 3.67 | 4.00 | 3.00 |
| T1i | 4 | 4.00 | 3.67 | 2.00 | 4.00 |
| T4i | 5 | 5.00 | 3.00 | 4.67 | 3.00 |
| E1 | 5 | 5.00 | 3.00 | 3.00 | 3.33 |
| E2k | 5 | 4.33 | 3.67 | 4.00 | 3.33 |
| E3 | 4 | 4.00 | 2.33 | not in task | 3.00 |
| E4h | 5 | 5.00 | 4.33 | not in task | 4.33 |
| E5 | 5 | 5.00 | 4.00 | 3.33 | 3.67 |
| Total | 51 | 49.67 | 39.00 (best of pp and ppi per task) | | 38.33 |

Gate:

- Rule A: ours lost 51 minus 49.67 = 1.33 points. The best other arm (project-pilot, best of pp and ppi per task) lost 12.00. The limit is 0.8 x 12.00 = 9.60. **Rule A passes.**
- Rule B: ours is strictly above every other arm on 10 tasks. On T1i ours and base both reach the maximum of 4, which passes. On T3 ours (4.33) ties base (4.33) below the maximum of 5. **Rule B fails on T3 alone, as in round 3.** (`grade.py` still prints the old 20% total rule; the verdict here uses the revised rules.)

The round 4 change did what it was meant to: ours wrote a `.mailmap` in 3 of 3 T3 runs (none in round 3), re-ran the count, and hedged. It still lost criterion 2 in runs 1 and 2. In each, the file mapped Troy Goode correctly and added a second line, `Alejandro Caravaca Puchades <address>`, a single-address line that gives that address one name. In git this line does unify the two spellings, and the criterion text allows that unification. But the frozen script check (`one_address` in `grade.py`) accepts a line for another person only when it repeats one address at least twice (`Name <a> alias <a>`), and it treats a one-address line as a bare claim. Run 3 wrote the two-address form and passed. The check is left as frozen. Changing it after seeing the results would move the goalposts; that call belongs to the owner.

Why the agent wrote that line: the prompt hint lists the Alejandro group (same address, other name) as a suspected same-person group, but `--identities` prints a `.mailmap` line only for Troy Goode. The agent writes the Alejandro line itself, and its form varies from run to run. On T3, base lost the hedge criterion in runs 2 and 3, and project-pilot lost the top-author basis or the hedge.

Grader noise: some grader replies did not parse, because the model corrected itself in prose after its JSON. Those calls were asked again until every cell had three parsed votes, which took four grading passes. Base on T3 moved from 3.67 in an early pass (one vote missing on two cells) to 4.33 in the final one; it was 4.00 in round 3. Grading reliability: 48.3% of the scored (cell, criterion) pairs were decided by script; 289 of 318 model-judged pairs (90.9%) had three identical votes. No grading errors.

Not done for this round: the F6 audit, the held-out tasks and the F9 runs.

### Resume

State on 2026-10-22: branch `plugin-leadership`, no release exists, nothing is merged. Round 4 (tool at `747031f`) is published above: rule A passes (1.33 lost against a limit of 9.60), and rule B fails on T3 alone (ours 4.33, base 4.33).

Next step, round 5, which addresses T3 only:

1. Make `--identities` (and the prompt hint's suggested lines) print an explicit `.mailmap` line for every same-address, other-name group, in the two-address form `Canonical Name <a> other name <a>`, so the agent copies a line instead of writing its own. This is a product change: write it with a test, run `npm test` and `claude plugin validate .`, review it, commit it, then benchmark a `git archive` of the new commit.
2. Alternatively, or as well, the owner rules on whether T3 criterion 2's script should accept a one-address line (`Name <a>`) for a same-address unification. Record the ruling and freeze it before any run, as in round 3.
3. Run all arms on all tasks again (round 3 and round 4 transcripts are not in the repository): `OURS_DIR=<archive> PP_DIR=<project-pilot at bf6eabe> MODEL=claude-sonnet-5-5 PARALLEL=2 GUARD_CMD=<guard> bash bench/head-to-head/run-all.sh <out> 3`. Project-pilot's source is `https://github.com/bukoo93/project-pilot.git`, the commit the Anthropic plugin directory lists (`claude plugin list --available --json`). In a cloud session `claude -p` is logged in. A wait loop that checks for running work with `pgrep -f` must not contain the string it searches for, or it matches itself.
4. Grade with `python3 -I bench/head-to-head/grade.py <out>`, repeating until no call fails to parse. Publish with `publish-results.sh`, and commit only `grade/RESULTS.md` and `MANIFEST.txt` (patch `ours commit` and the transcripts line).
5. Gate as above. If it passes: held-out tasks (all arms, 3 runs; no product change after reading them) and F9 (Haiku and Opus, 1 run per task). Still open after that: the F6 audit, release 0.4.0 with the merge, and regenerating `docs/COMPARISON.md` on an idle machine.

Commit trailer for this work: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, plus a "Sade dil (teknik olmayan biri için)" block in each message.

## Round 5 measurement protocol (frozen 2026-10-22, owner decision)

Written and committed before any round 5 run. No round 5 result had been seen. This section is not changed after results exist.

**Rule.** On a task that has not changed, the rival arms (pp, ppi) and the baseline (base, plain Claude) take their scores from the last published round, round 4, unchanged. On those tasks only ours is run again, 3 runs, and graded. A changed or new task would run every arm 3 times. The final gate (held-out tasks, F9, F6) is exempt: every arm runs in full there.

**Source of the reused values.** Round 4 results commit `e833a7d` (tool at `747031f`, project-pilot 1.0.0 at `bf6eabe`, model `claude-sonnet-5-5`, 3 runs per cell, outcome criteria only). Round 5 uses the same task text (`tasks.json`), fixture (`build-fixture.sh`), script checks and labels (`grade.py`, `criteria-labels.json`), model and rival version. Between `e833a7d` and this protocol the only change to the bench is the `--arms` option of `grade.py` (below); `tasks.json`, `build-fixture.sh`, `criteria-labels.json`, the criteria, every script check and the grader prompt are byte-identical.

**Unchanged tasks and reused values (all 11 are unchanged):**

| Task | Criteria | pp (r4) | ppi (r4) | base (r4) | ours |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | 2.67 | 2.00 | 2.67 | re-run x3 |
| T2 | 4 | 2.67 | 2.33 | 3.67 | re-run x3 |
| T3 | 5 | 3.67 | not in task | 4.33 | re-run x3 |
| T4 | 5 | 3.67 | 4.00 | 3.00 | re-run x3 |
| T1i | 4 | 3.67 | 2.00 | 4.00 | re-run x3 |
| T4i | 5 | 3.00 | 4.67 | 3.00 | re-run x3 |
| E1 | 5 | 3.00 | 3.00 | 3.33 | re-run x3 |
| E2k | 5 | 3.67 | 4.00 | 3.33 | re-run x3 |
| E3 | 4 | 2.33 | not in task | 3.00 | re-run x3 |
| E4h | 5 | 4.33 | not in task | 4.33 | re-run x3 |
| E5 | 5 | 4.00 | 3.33 | 3.67 | re-run x3 |

Best rival arm total (project-pilot, best of pp and ppi per task): 39.00 of 51. Base total: 38.33 of 51. These values are used as they are, including base T3 4.33 (an early grading pass had 3.67; the published value is 4.33).

**Rules.** Rule B: on every task our mean is strictly above pp, ppi and base, and where any of them is at the criteria maximum we are at the maximum. Rule A: our lost points (51 minus our total) are at most 0.8 x 12.00 = 9.60. Same as round 4. This repository has no cost rule. The result table marks reused cells "r4 reused".

**Grading ours-only cells.** `grade.py` normally grades a cell with every arm's answer present, labelled in a shuffled order. The round 4 rival answers are not in the repository, so that cannot be reproduced. A new option `grade.py <out> --arms ours` grades the cells of ours alone: same criteria, same script checks (they never depended on the other answers), same grader prompt, same three votes and majority, but the model-judged criteria see one answer instead of four. This is a deviation from "the same grader condition" that the owner should know about. It is stated again with the results.

**Run.** `git archive` of the product commit, `OURS_DIR` that copy, `JOBS_ONLY='^ours '` in `run-all.sh`, 3 runs, parallelism 2, model `claude-sonnet-5-5`. Cost of every `claude -p` run is logged.

### Round 5 results

Run on 2026-10-22 under the "Round 5 measurement protocol" above (frozen and pushed in `8b83142` before any run). Ours ran from a `git archive` of `6d1d2cf` (`--identities` and the prompt hint print the exact two-address `.mailmap` line for one address under several names), model `claude-sonnet-5-5`, 3 runs per task, 33 task runs, two at a time. Ours loaded and ran its skill in 33 of 33 runs. pp, ppi and base were not run; their cells are the round 4 values ("r4 reused"). Published: `bench/head-to-head/results/round5-claude-sonnet-5-5/` (the results table and the manifest; transcripts are not committed).

Outcome criteria only (mean criteria passed, 3 runs per cell):

| Task | Criteria | ours (r5) | pp (r4 reused) | ppi (r4 reused) | base (r4 reused) |
| --- | --- | --- | --- | --- | --- |
| T1 | 4 | 3.67 | 2.67 | 2.00 | 2.67 |
| T2 | 4 | 4.00 | 2.67 | 2.33 | 3.67 |
| T3 | 5 | 5.00 | 3.67 | not in task | 4.33 |
| T4 | 5 | 5.00 | 3.67 | 4.00 | 3.00 |
| T1i | 4 | 4.00 | 3.67 | 2.00 | 4.00 |
| T4i | 5 | 5.00 | 3.00 | 4.67 | 3.00 |
| E1 | 5 | 5.00 | 3.00 | 3.00 | 3.33 |
| E2k | 5 | 5.00 | 3.67 | 4.00 | 3.33 |
| E3 | 4 | 4.00 | 2.33 | not in task | 3.00 |
| E4h | 5 | 5.00 | 4.33 | not in task | 4.33 |
| E5 | 5 | 5.00 | 4.00 | 3.33 | 3.67 |
| Total | 51 | 50.67 | 39.00 (best of pp and ppi per task) | | 38.33 |

Gate (revised rules, reused rival values):

- Rule A: ours lost 51 minus 50.67 = 0.33 points; the limit is 9.60. **Passes.**
- Rule B: ours is strictly above every other arm on all 10 tasks where ours is below the maximum or a rival is below ours; on T1i ours and base both reach the maximum of 4, which passes. T3 is now 5.00 against base 4.33. **Passes on all 11 tasks.**

T3: ours wrote the two-address line (`Name <a> alias <a>`) in 3 of 3 runs, copying it from `--identities`/the hint. The one-address check is unchanged.

Departures, stated plainly:

- The rival and baseline cells are not re-measured; they are the round 4 values, by the owner's rule. They share the grader noise of round 4 (base T3 moved between grading passes).
- Ours-only cells were graded with `grade.py --arms ours`: same criteria, script checks and prompt, but the model-judged criteria saw one answer, not four in shuffled order. This differs from round 4's grading condition and could favour or penalise ours; it is not measured here.
- T4 run 2 (and runs 1 and 3 in earlier passes) had grader replies that corrected themselves in prose and did not parse; those calls were asked again (about 17 passes, T4 only) until two valid votes existed per criterion. One call of T4 run 2 still does not parse; the criterion keeps the other two votes. Grading reliability: 49.7% of pairs decided by script; 76 of 82 model-judged pairs (92.7%) with three identical votes.
- Not done: held-out tasks (all arms), F9 (Haiku and Opus), F6 audit, release. The budget cap for this session stops new runs before the held-out round.

## Final gate protocol (frozen 2026-10-22, owner decision)

Written and committed before any final gate run. No final gate result had been seen. This section is not changed after results exist.

**Product.** Ours runs from a `git archive` of `a2650c2`. The product does not change after the held-out tasks are opened. The held-out tasks were opened on 2026-10-22 from `origin/heldout-2026-10` (`e78052b`) into a folder outside this repository; the tree is byte-identical to the branch. Tasks H1, H2, H3 are the held-out `t1`, `t2`, `t3` (fixtures built by their own `build-fixture.sh`; the ground truth built by their own `truth.py` matches the committed `truth.txt` for all three). Their prompts and criteria are in `bench/head-to-head/heldout-tasks.json` (every criterion is an outcome criterion, including the optional-quality criterion 5 of t3; no script checks, so a model judges every criterion).

**Arms.** `ours`, `pp` and `ppi` (project-pilot 1.0.0 at `bf6eabe`, as in rounds 4 and 5; the held-out invoked prompt is "Use the /project-pilot:bus-factor command for this. " plus the natural prompt), `base` (empty plugin), plus two new rival arms from the competitor scan (owner request):

- `hist`: `AleBrito124356/mcp-git-historian` at `bb2e209c7d8a7163cd2a156d0abb332e4a90a753` (0.2.0, MIT, LICENSE read). An MCP server. Installed from a `git archive` into an isolated venv; the arm loads it with `--mcp-config` (the harness uses `--strict-mcp-config`, which ignores a plugin's own `.mcp.json`) and a plugin wrapper that only carries the name and the licence. Its code was grepped: the only subprocess is `git`; no network call and no file write. Natural prompt only.
- `bf`: `k41n/busfactor` at `d898d8db4346160b0a6ef253b96d60712704fe9f` (MIT, LICENSE read). A skill plus `scripts/ownership.mjs`, with no plugin manifest in the repository: the harness wraps the unchanged `SKILL.md` and script in a plugin directory. Departure from the README: one line is appended to the copied `SKILL.md` telling the agent to pass `--no-github`, because without it the result depends on the network and on the host's `gh` login. The script writes `.github/CODEOWNERS` into the fixture copy. Natural prompt only.

Departures: no invoked arm for `hist` and `bf` (budget); a competitor is set up as its README says except for the points above. Scan candidates not added: `git-fame` (priority low in the scan) and every other candidate in `surviving-lines-scan.md`.

**Safety.** Competitor arms (`pp`, `ppi`, `hist`, `bf`) run only from `git archive` copies. `guard.sh` hashes the `hooks` object of `~/.claude/settings.json` and the `mcpServers` object of `~/.claude.json` before and after every competitor run; a change stops the round. Vaara is never run. Parallelism 2. A cell that fails (rate limit, no result line) is run again and never graded.

**Grading (owner decision).** All arms of one task and one run are graded together: the answers are labelled in a shuffled order (seed from the task and run number), header lines removed, plugin names, directories and MCP tool prefixes in the command lines replaced by placeholders, with the criteria and the ground truth. Three separate `claude -p` calls (`claude-sonnet-5-5`, no plugins) per cell; a criterion keeps the majority of the valid votes (two of three); a criterion with fewer than two valid votes is an error and is left out. The round 5 "ours-only, one answer" grading is not used. Tool: `bench/head-to-head/gate-grade.py`.

**Rules.** Rival arms for the rules: `pp` (best of `pp` and `ppi` per task), `hist`, `bf`, `base`. Rule B: on every task our mean is strictly above every rival's, and where a rival is at the maximum we are at the maximum. Rule A: our lost points (sum of criteria minus our total) are at most 80 percent of the lost points of the rival with the highest total. Rival totals are the sums of the per-task means (for `pp`, the better of its two arms per task). This repository has no cost rule. The round 5 saving rule (reusing rival scores) does not apply: every arm runs in full.

**Steps and order.**

1. Held-out, `claude-sonnet-5-5`, 3 runs per task, all six arms (54 runs), then grading.
2. F9: `claude-haiku-5-5` and `claude-opus-5-5`, 1 run per task, arms `ours`, `base` and the best rival arm per task. The best rival arm of a task is the rival arm (`pp`, `ppi`, `hist`, `bf`) with the highest step 1 mean on that task (ties: the order `pp`, `ppi`, `hist`, `bf`). The three answers of a task and model are graded together as in the rule above. No task may be lost on any model: the same Rule B, applied per model with one run.
3. F6: from the cells of steps 1 and 2 (54 + 18 = 72 cells) a random 10 percent (7 cells, `random.Random(20261022)`, cells sorted by name) are run again by a fresh `claude -p` agent that has never seen this code or these tasks (it gets a work folder with a wrapper script, the criteria and the ground truth, and writes its own grades). Its grades are compared with ours criterion by criterion; the agreement rate and every disagreement are reported. A disagreement of more than one point on a cell is reported as a failure of the audit.
4. Public set, new arms (`hist`, `bf`, 11 tasks x 3 runs): attempted only after steps 1 to 3 are complete and only if less than 8 USD has been spent at that point. The public round 4 and 5 values do not include these arms, so they could be graded together with fresh `ours` and `base` runs only; if there is not enough budget, they are reported as not run.

**Budget.** At most 18 USD for all `claude -p` runs and grading. No new run starts once 14.4 USD is spent; the results so far are then written and reported, with what is missing named.

**Claim scope.** A "first" claim is written only for the tasks, models and date that were completed, names the rivals that were in the comparison, and names the scan candidates that were not run.

### Results, final gate

Run on 2026-10-22 under the "Final gate protocol" above (frozen in `b916ac3`, tooling in `abca92c`, both pushed before any run). Held-out tasks H1 to H3 (`origin/heldout-2026-10` at `e78052b`), model `claude-sonnet-5-5`, 3 runs per task and arm, six arms, 54 task runs, two at a time. Ours ran from a `git archive` of `a2650c2`. All arms of a cell were graded together in a shuffled order, three votes per cell. The hooks and mcpServers guard passed on every competitor run. Ours loaded and ran its skill in every run. Published: `bench/head-to-head/results/final-gate-claude-sonnet-5-5/` (table, per-criterion votes, label maps, manifest).

Outcome criteria (mean criteria passed, runs in brackets):

| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H1 | 5 | 2.00 (2/2/2) | 5.00 (5/5/5) | 5.00 (5/5/5) | 5.00 (5/5/5) | 5.00 (5/5/5) | 4.33 (5/5/3) |
| H2 | 5 | 0.00 (0/0/0) | 4.00 (4/5/3) | 3.67 (3/5/3) | 4.00 (4/4/4) | 2.33 (3/3/1) | 2.67 (4/2/2) |
| H3 | 5 | 1.00 (1/1/1) | 3.00 (5/0/4) | 2.00 (2/2/2) | 0.00 (0/0/0) | 2.00 (3/0/3) | 1.33 (0/0/4) |
| Total | 15 | 3.00 | 12.00 (best of pp and ppi per task) | | 9.00 | 9.33 | 8.33 |

**The gate failed.** Rule B: ours is below every rival on H1, H2 and H3. Rule A: ours lost 12.00 points; the best rival (project-pilot, best of pp and ppi per task) lost 3.00, so the limit is 2.40. Both rules fail.

Why, from the graders' reasons for ours: the tool's headline table counts vendored files (a human-committed copy of a library) and the person who committed them as owners, and does not drop lockfile or generated files by default; it does not merge identities that differ in both name and address, so the shares of one person split; on H3 (reviewers for a file whose code was moved out of another file) it ranks the person who did the move first, because its blame view starts at the new path. The H1 and H2 answers sometimes mention the right fix in a secondary note, but the headline numbers were wrong, and the criteria need the headline. On the public tasks these cases were not present, so the round 5 result does not carry over.

Not done: F9 (Haiku, Opus), the F6 audit and the new arms on the public set. The gate was already lost on the Sonnet held-out step, and the protocol says no task may be lost on any model, so later steps could not change the verdict; they were skipped to save budget (spent 11.11 USD of 18). The "first" claim is not made. What holds is the round 5 public-set result (11 tasks, Sonnet, 2026-10-22, rivals project-pilot and plain Claude), which the held-out result limits: it does not generalise to new repositories with vendored code, split identities or moved code.

## Round 6 rulings (frozen 2026-10-22, owner decision)

Written and committed before any round 6 code change and before any round 6 run. The old held-out set (`heldout-2026-10` t1 to t3, the final gate H1 to H3) was seen, so it is no longer held-out. It may be used for diagnosis only (ours, one run, never scored in a gate). These rules are general. They do not name any file, person or repository of the old held-out set, and the code must not either.

The final gate failed because the headline numbers were wrong in three general classes of repository. The rulings below define the product behaviour for each class. They are written as properties of the output, so a reviewer can test them on any repository.

**R1. Vendored, copied, lockfile and generated files leave the ownership headline by default.**

- Dropped from every blame-based number (the table, the shares, the bus factor, the groups, the reviewers and history views) unless a flag restores them:
  - lockfiles by file name (for example `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `Cargo.lock`, `Gemfile.lock`, `poetry.lock`, `composer.lock`, `go.sum`);
  - generated files: files marked `linguist-generated` in `.gitattributes`, files whose first lines carry a generated marker (`@generated`, `DO NOT EDIT`, `Code generated`, `auto-generated`), and minified or map files (`*.min.*`, `*.map`);
  - vendored or copied code: files under a directory named `vendor`, `vendored`, `third_party`, `third-party`, `node_modules`, `bower_components`, `Pods`, `extern` or `external`, and files marked `linguist-vendored` in `.gitattributes`.
- The output states what was dropped: the number of files and lines per class and the top-level paths, in a line in the table output and in a field in the JSON output. Nothing is dropped silently.
- A flag (`--keep-generated`) brings all three classes back. A user's own `--include` or `--exclude` globs still apply on top.
- The rule is by path and file content marker only, never by author, so it does not depend on who committed the files.

**R2. Identities that differ in both name and address are offered as a merge, with evidence, and are not merged on their own.**

- A pair of identities whose names differ and whose addresses differ is listed as a "possible same person" suggestion when at least one fixed evidence item holds: the normalised name (letters only, folded for case and accents) is contained in the other identity's address local part (or the reverse); the two address local parts are equal after trailing digits and separators are removed; the two share a GitHub numeric user id in a noreply address; one name is the other's initial form (first initials and last name).
- Each suggestion prints its evidence and the exact `.mailmap` line, in the two-address form already used. It is also in the JSON output.
- No suggestion of this tier is merged by default and `--merge-identities` does not merge it either. Merging happens only through a `.mailmap` the user or the agent writes, so the owner of the repository decides. The existing same-name and same-address merge rules do not change.
- The headline output and the prompt hint tell the reader that these shares may be split and name the suggestion.

**R3. Moved and copied code is attributed to the original author, not to the person who moved it.**

- The default blame uses `-w -M -C -C` (or an equivalent that follows moves and copies into a new path, including the commit that created the file). A flag (`--no-copies`) returns to `-w -M`. The existing `--copies` option stays accepted.
- When the repository is large (more than 2000 text files) the default stays `-w -M` and the output says copy detection is off and why.
- The reviewers and history views follow the same rule, so the person who only moved a file is not ranked first for it.

**Tests and review.** Each rule gets tests on synthetic repositories built in the test itself (no fixture of the old held-out set). `npm test` and `claude plugin validate .` must pass, and a Sonnet reviewer reads the diff before the commit. The product is then fixed for round 6: it does not change after the new held-out set is run.

**Order.** (1) this freeze, (2) product change, (3) new held-out set written by an agent that has not seen the product, the benchmark documents or the old held-out set, (4) round 6 protocol frozen, (5) runs. The old held-out diagnosis run is not scored.

## Round deep design (frozen before code, 2026-10-22)

Written and committed before any code change of this round and before any run. Basis: `docs/RESEARCH-DEEP-2026-10-22.md`. The round 6 rulings R1 to R3 above stay in force; nothing below loosens them. The old held-out set (H1 to H3) was seen and is used for tool-level diagnosis only (running the tool on its fixtures, no scoring). Nothing below names a file, person or repository of that set, and the code, tests and skill text must not either.

**Starting point.** The uncommitted work of the stopped session in `bin/surviving-lines.js` and `schema/surviving-lines.schema.json` implements R1 (drop of lockfiles, generated files and vendored code with a printed note and `--keep-generated`), R2 (the "possible same person" tier, never merged) and R3 (`-w -M -C -C`, `--no-copies`, the 2000-file gate). It is kept. Seven existing tests fail only because the printed blame flags changed from `-w -M` to `-w -M -C -C`; their expected text is updated. It is committed only after this freeze.

**D1. Lockfile list.** Extend the lockfile names with the union of linguist `generated.rb` and scc (MIT, credited in `THIRD-PARTY-NOTICES.md`): `pdm.lock`, `pixi.lock`, `deno.lock`, `gopkg.lock`, `glide.lock`, `module.bazel.lock`, `.terraform.lock.hcl`, `bun.lockb`. Names only, matched on the exact base name, lower case. The vendor directory names, the marker window (10 lines) and `.gitattributes` handling do not change. Rejected: linguist's per-language protobuf/thrift parsers, `jquery*.js` and `cache/` and `deps/` patterns (a project can own such paths; false drops), minified detection by mean line length (needs file contents), `dist/` and `build/` by name (hand-written source in some repositories; generated ones are caught by marker or `.gitattributes`).

**D2. Identity suggestions (tier of R2 only).** Two evidence items are added to `suggestSamePerson`; nothing is merged by any flag, and the existing same-name and same-address merge rules do not change.
- The two names are equal once accents are removed (so "Zoë" and "Zoe") while the addresses differ.
- Two GitHub noreply addresses with the same user name where one has the numeric prefix (`ID+user@users.noreply.github.com` and `user@users.noreply.github.com`).
Rejected, with reasons: automatic merge of any suggestion (the research: over-merge is the main failure); transitive fuzzy closure beyond the connected groups already formed from fixed evidence; a Levenshtein or similarity-score tier (gambit, AGPL: ideas only; typo-level matches give false merges for short names); LSA and learned models; GitHub API lookups (network, privacy, offline repositories); trusting `.mailmap` alone.

**D3. Say where lines came from.** `git blame --line-porcelain` reports the origin file of every line. For every path shown in the `--reviewers` and `--history` views, and in the JSON of those views, the result gets `movedIn`: lines whose origin path differs from the blamed path, with the share of the blamed lines and the three largest origin paths. The text output prints one line when the share is at least 5%: "N of M lines (P%) in <path> were written in other paths and moved or copied here (largest source: <paths>); the authors above are the ones who wrote them, not the ones who moved them." The `--history` closing sentence names the author with the most lines now, not the author of the first commit, when they differ. Without `-C` flags (`--no-copies`, or above the size gate) the origin path is still printed when blame reports it.

**D4. Two concentration thresholds.** Next to the bus factor line (default 50%) the table output and the JSON print how many authors reach 80% of the lines ("to reach 80%: N authors"). `--bus-factor-threshold` still sets the first number. The 80% count is not configurable. The definition stays line-based; nothing commit-based is added (rejected: commit-count and time-decay bus factors, as the criteria of the benchmark and the product definition both say lines).

**D5. Skill and prompt hint text (rules for the agent).** The skill text and the prompt hint add these rules, stated generally: (a) when the output lists a "possible same person" suggestion, report the unmerged headline and, next to it, the figure "if one person" with the evidence, labelled as unconfirmed, and give the `.mailmap` line; (b) state what the output says was left out (lockfiles, generated files, vendored code) and the one-line reason, and the reformat commits that were ignored; (c) state the "moved in" line when present, and do not recommend the person who only moved code; (d) give both bus factor numbers with the scope they were computed on. No file, person or repository name from any benchmark appears in this text.

**D6. Not done in this round (decided, with reason).** `-C -C -C` as a default (slowest; any commit); per-file `-C -C` time budget (untested); active-owner share and importance cross-check (no criterion needs them; cost of more output); shallow and bulk-import warnings beyond the existing shallow check (the existing check stays); skipping whole commits by author; writing `.github/CODEOWNERS`.

**Tests and review.** Each of D1 to D4 gets tests on synthetic repositories built inside the test. `npm test` and `claude plugin validate .` must pass, and a Sonnet reviewer reads the whole diff. The product then does not change after the new held-out tasks are opened.

**Generalisation rule.** Every rule above is a property of any repository's output. The new held-out tasks are written by an agent that has not seen this code, the benchmark documents, or the old held-out set (see the round deep measurement protocol, written after the code).

## Round deep measurement protocol (frozen 2026-10-22, owner decision)

Written and committed after the product change (`461b8d2`, 312 tests pass, `claude plugin validate .` passes) and before any measurement run. No result of this round had been seen. This section is not changed after results exist.

**Product.** Ours runs from a `git archive` of `461b8d2`. The product does not change after this section is committed.

**New held-out set (N1 to N4).** Written by a fresh `claude -p` agent (Sonnet, `claude-sonnet-5-5`) that was given only the one-sentence user problem from the top of `README.md` and a list of the files a task consists of (prompt, fixture build script, ground-truth script and output, five outcome criteria). It had no access to the code, to this document or to the old held-out set, and was told to choose the repositories and hazards itself. Result: four tasks on public repositories (a Python, a Rust, a Go and a JavaScript project), kept on the local branch `heldout-2026-10-b` (`34f31540d48bc9a5a38ce3683e83c9385a6d0724`, never pushed). The controller did not read the tasks, the criteria or the ground-truth scripts. Setup was validated without reading them: all four fixtures build, two builds of a fixture give the same HEAD, the ground-truth script output equals the committed `truth.txt`, each task has five criteria. The task list used by the runner (`new-heldout-tasks.json`, same format as `heldout-tasks.json`, every criterion an outcome criterion judged by a model, SHA-256 `b5271d143b78dbb2874ab78e26303d08b124711aa54341f13a386523c86eee76`) is built from those files by script and is committed with the results.

**Arms.** `ours`, `pp`, `ppi` (project-pilot 1.0.0 at `bf6eabe`, the invoked prompt is "Use the /project-pilot:bus-factor command for this. " plus the natural prompt), `hist` (mcp-git-historian `bb2e209`), `bf` (k41n/busfactor `d898d8d`, with the `--no-github` line), `base` (empty plugin). Same copies, same set-up and same guard as the final gate (`b916ac3`).

**Departures from the owner's plan, stated before the runs.** The budget for all `claude -p` calls of this task is 12 USD, of which 4.49 USD were spent on research, implementation and writing the new tasks. Three runs of every arm on four tasks plus grading cost about 14 to 15 USD, so they do not fit. Therefore: (1) runs per cell: run 1 of every cell (24 runs) is done first; run 2 of whole tasks (all six arms, in the order N1 to N4) follows only while the budget allows, and the number of runs per cell is reported per task; (2) the public set is not re-run with `hist` and `bf` (66 runs) and ours is not re-run on it (33 runs); (3) F9 (Haiku and Opus) and F6 (10 percent audit) run only if the gate passes and the budget allows, otherwise they are reported as not done. These departures lower the evidence a "first" claim can rest on; any claim states the number of runs, tasks and models actually completed.

**Grading.** As in the final gate: all arms of one task and run are graded together, answers labelled in a shuffled order, names replaced, three `claude -p` votes per cell, majority of valid votes (`gate-grade.py`). Same-condition grading for all arms.

**Rules.** Rule B: on every task our mean is strictly above every rival's (`pp` and `ppi` as the better of the two per task, `hist`, `bf`, `base`), and where a rival is at the maximum we are at the maximum. Rule A: our lost points are at most 80 percent of the lost points of the rival with the highest total. With one run per cell, a task counts as lost when ours is not strictly above a rival, and ties below the maximum are losses. There is no cost rule.

**Safety.** As before: competitor arms run from `git archive` copies, hash guard on `hooks` and `mcpServers` before and after each competitor run, parallelism 2, a cell that fails is run again and never graded, Vaara is never run.

**Budget.** No new run or grading call starts when the logged `claude -p` total of this task would pass 11.6 USD. Results so far are then written, with what is missing named. The organisation-wide check (`spend.sh`, first number 160) is also honoured.

### Results, deep round

Run on 2026-10-22 under the "Round deep measurement protocol" above (frozen in `c18abb0` before any run). Ours ran from a `git archive` of `461b8d2`. New held-out tasks N1 to N4 (local branch `heldout-2026-10-b`, never pushed), model `claude-sonnet-5-5`, six arms, 42 task runs two at a time, hash guard passed on every competitor run. Ours loaded and ran in every run. All arms of a cell were graded together in a shuffled order, three votes per cell. Published: `bench/head-to-head/results/deep-round-claude-sonnet-5-5/` (table, per-criterion votes, label maps, task list, manifest).

Outcome criteria (mean criteria passed; runs per cell in brackets: N1 to N3 two runs, N4 one run):

| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| N1 | 5 | 3.00 (4/2) | 1.00 (1/1) | 1.00 (1/1) | 2.50 (1/4) | 3.00 (3/3) | 2.00 (3/1) |
| N2 | 5 | 2.00 (2/2) | 2.50 (2/3) | 2.00 (2/2) | 0.00 (0/0) | 1.50 (2/1) | 2.00 (2/2) |
| N3 | 5 | 3.00 (2/4) | 1.00 (0/2) | 2.00 (1/3) | 1.00 (0/2) | 1.50 (0/3) | 1.00 (0/2) |
| N4 | 5 | 3.00 (3) | 3.00 (3) | 5.00 (5) | 1.00 (1) | 3.00 (3) | 3.00 (3) |
| Total | 20 | 11.00 | 10.50 (best of pp and ppi per task) | | 4.50 | 9.00 | 8.00 |

**The gate failed, by the rules frozen before the run.** Rule B: ours is strictly above every rival only on N3. N1 is a tie with `bf` (3.00); N2 is below `pp` (2.00 against 2.50); N4 is below `ppi` (3.00 against 5.00). Rule A: ours lost 9.00 points; the best rival (project-pilot, best of `pp` and `ppi` per task) lost 9.50, so the limit is 7.60. Ours has the highest total (11.00 against 10.50 for project-pilot, 9.00 for `bf`, 8.00 for plain Claude, 4.50 for `hist`) but the margin is half a point on 20, from one or two runs per cell. This is not a "first" result and no such claim is made. Compared with the final gate on the old held-out set (3.00 of 15, last of six arms), ours moved from last to first by total on a set written by an agent that did not see the code; the old set's cases are no longer counted as held-out.

One grader call for N1 run 2 did not parse; that cell was graded again (the valid calls were kept) and the table above is the second pass. The criteria were not changed after the results.

Not done, because of the 12 USD limit for all `claude -p` calls of this task (spent: research 2.52, implementation 1.38, writing the tasks 0.58, runs 4.43, grading 1.80; total 10.73 USD): run 2 of N4, run 3 of every cell, the public set for `hist` and `bf`, F9 (Haiku and Opus) and the F6 audit. The last two would have been skipped in any case: the Sonnet step already failed Rule B and Rule A.

A diagnostic read of the grader reasons for ours on N2 (a path-scoped reviewers question) and N4, done after the results and not used to change anything: on N2 the answer gave a count but no percentage share, and said nothing about the vendored directory, the whitespace commit, the rename or the bot, because the reviewers view for a path does not print the "dropped", "reformat commit ignored" and "bots excluded" lines that the whole-repo view prints, and does not restate the share the agent was asked for. These two points are general product gaps (the path views should carry the same notes as the table, and the skill should require the share) and are the first items for a next round. N4 was not examined further. The new set is now seen: it is no longer held-out.

## Round 7 rulings (frozen 2026-10-22, owner decision, before any code change)

Written and committed before any code change of round 7 and before any round 7 run. Basis: the deep round report and the results of the deep round. The deep round held-out set (N1 to N4) and the first held-out set (H1 to H3) are both seen and are used for diagnosis only (running the tool on their fixtures, reading answers); they are not scored in round 7. Nothing below, in the code, the tests or the skill text names a file, person or repository of those sets.

**Why.** The deep round diagnosis found three general gaps. (a) A path-scoped view (`--reviewers <path>`, `--history <path>`) does not print the notes the whole-repo table prints ("dropped", "reformat commits ignored", "bots excluded"), so an answer built from that view omits them. (b) The skill does not require the answer to give each named person's share in percent, so an answer can give line counts only. (c) A diagnostic look at the one-run answer for N4 found two more general gaps: the reviewers view lists people by recent activity, so a larger owner can be pushed out of the list and be called inactive, and the output does not say that a `.mailmap` file merged names, so the answer cannot cite it.

**R7-1. Same notes in every view.** Every view and its JSON (table, `--reviewers`, `--history`, path-scoped forms, `--identities`) carries the same scope notes: files dropped (lockfile, generated, vendored, with counts and the one-line reason), reformat commits ignored, bots excluded, identities merged by `.mailmap` (the names that were merged into which name, and the line count they add), "possible same person" suggestions, and the moved-in line. The notes are printed by one shared function, not copied per view.

**R7-2. Ranking by lines.** Wherever a view picks people to name, the people are ordered by surviving lines. Activity (last commit date) is printed next to each person as information; it never reorders the list and never removes a person from the top three. If a view has an "active only" cut, the line-ranked list is printed as well.

**R7-3. Skill and prompt hint rules.** Every ownership answer states, for each named person, the share in percent next to the line count; states what the output says was left out and why, the reformat commits ignored, and the identities merged by `.mailmap` (naming the file); gives both concentration numbers with their scope; and reports a "possible same person" suggestion as unconfirmed next to the unmerged figure. The rules are general. The hook hint carries one pointer line to the same rules.

**Evaluated and not done in round 7 (reasons).** `-C -C -C` as the default and a per-file copy-detection time budget (slower, no failing case needs them; unchanged from deep round D6). Commit-count or time-decayed bus factor (the benchmark and the product define it by lines). Writing `.github/CODEOWNERS` (a file write the user did not ask for). Automatic merge of suggested identities (the research names over-merging as the main failure). Changing any criterion, script check or old task.

**Tests and review.** Tests on synthetic repositories built inside the tests; `npm test` and `claude plugin validate .` must pass; a Sonnet reviewer reads the whole diff. The product does not change after the new held-out tasks (C1 to C5) are opened.

**R7-4. Strength of a same-person suggestion (added 2026-10-22, before any round 7 measurement run and before the new held-out set was opened; frozen here).** A diagnostic run of ours on the seen sets (not scored) showed the remaining losses are mostly one cause: the answer offered a same-person merge only as a hedge and kept the split figure as the headline, while a maintainer who sees strong evidence treats the two identities as one person. The tool still never merges by itself. Each suggestion gets a `strength` (`strong` or `weak`), computed from the evidence items it already has: `strong` when the evidence includes a near-conclusive item (the names are equal once case, accents and punctuation are ignored; two noreply addresses with the same GitHub user name or id) or at least two different kinds of evidence; `weak` otherwise (a single contained-in-address, address-stem or initial-form item). Text and JSON print the strength. Skill and hook rule: for a `strong` suggestion the answer leads with the merged figure ("counting X and Y as one person because <evidence>") and states the unmerged figures next to it and the `.mailmap` line that would make it permanent; for a `weak` suggestion the answer leads with the unmerged figure and states the merged one as a possibility. The rule is general and names no repository, file or person of any benchmark set. Nothing in the tool changes how `--merge-identities` or `.mailmap` merge.

## Round 7 and final gate measurement protocol (frozen 2026-10-22, owner decision)

Written and committed after the product work of round 7 (`4b65d05`, 331 tests pass, `claude plugin validate .` passes) and before any measurement run of this round. No result of this round had been seen. This section is not changed after results exist.

**Product.** Ours runs from a `git archive` of `4b65d05`. The product does not change after this section is committed.

**Run path (owner decision).** Every `claude -p` call of this round (runs, grading, implementers, reviewers, writers) goes through a shim that puts the Claude Agent SDK `query()` in front of the same installed CLI (2.1.308); the stream-json, json and text output formats are the same. Reason: the organisation key gives a 429 "weekly limit" on the plain CLI, and the promotional credit covers the Agent SDK. The only measured difference between the SDK path and the earlier CLI path is that the desktop application's "Artifact" tool and its `artifact-diagramming` skill are absent on the SDK path; they have nothing to do with these tasks. All arms measured in this round (ours, rivals, base) run on the SDK path. No cell from an earlier round is reused: every table of this round comes from one path and one day. Earlier rounds' numbers (CLI path) are not mixed into these tables. A run that returns 429 or an authentication error stops the round and is reported. The billing check (`apiKeySource` = `ANTHROPIC_API_KEY`) passed before the first call.

**Task sets.**

- PUBLIC: the 11 public tasks of `tasks.json` (T1, T2, T3, T4, T1i, T4i, E1, E2k, E3, E4h, E5), fixtures from `build-fixture.sh`. Outcome criteria only (51 criteria).
- HELD-OUT C1 to C5: written by a fresh Sonnet agent (`claude-sonnet-5-5`) that was given only the one-sentence user problem from the top of `README.md` and the list of files a task consists of (prompt, fixture build script, ground-truth script and output, five outcome criteria). It had no access to the product code, to this document or to any earlier task set, was told to use a different language or ecosystem for each of the five repositories, and was not told which cases the product handles or loses. Result: five tasks on public repositories (Go, Python, Rust, Ruby, PHP), on the local branch `heldout-2026-10-c` (`51b9ab2b3cddadc0370616c1ad3202dccb11ceb0`, never pushed). The controller did not read the tasks, the criteria or the ground-truth scripts. Setup was validated without reading them: all five fixtures build, the ground-truth script output equals the committed `truth.txt` for each, each task has five criteria. The task list used by the runner (`c-tasks.json`, SHA-256 `30a7e6952d97720a4e3b303e9059e92e100a471ed0e4fe6080deb4823f699e9d`) is built from those files by script, every criterion an outcome criterion judged by a model. The earlier sets (N1 to N4, H1 to H3) were seen; they were used for diagnosis only (ours, one run each, not scored: N 10.00 of 20, H 9.00 of 15 in a first pass on the product at `f29b50d`, before R7-4) and are not part of any table below.

**Arms.** `ours`, `pp`, `ppi` (project-pilot 1.0.0 at `bf6eabe`; the invoked prompt is "Use the /project-pilot:bus-factor command for this. " plus the natural prompt), `hist` (mcp-git-historian `bb2e209`), `bf` (k41n/busfactor `d898d8d`, with the `--no-github` line), `base` (empty plugin): the same copies and set-up as the final gate. `hist` and `bf` have no invoked arm. All six arms run 3 times on every task of both sets.

**Grading.** All arms of one task and run are graded together: answers labelled in a shuffled order, plugin names, directories and MCP tool prefixes replaced, with the criteria and the ground truth (plain git blame script), and the `.mailmap` file the run wrote, if any, shown to the grader. Three separate `claude -p` calls (`claude-sonnet-5-5`, no plugins) per cell, majority of valid votes (`gate-grade.py`). A departure for the public set, stated plainly: rounds 4 and 5 used script checks for numbers, names and ranges and graded four arms; here a model judges every outcome criterion of the public tasks too, because `grade.py` supports four arms only and hist and bf must be graded in the same condition. `gate-grade.py` was changed for this (outcome criteria only; the run's `.mailmap` shown); the criteria texts, `tasks.json`, `build-fixture.sh` and `truth.py` are unchanged. Public ground truth: `truth.py` on the `noignore` fixture and on the `ignore` fixture with `--ignore-rev` the reformat commit.

**Rules.** Rival arms: `pp` and `ppi` as the better of the two per task, `hist`, `bf`, `base`. Rule B: on every task our mean is strictly above every rival's, and where a rival is at the maximum we are at the maximum. Rule A: our lost points are at most 80 percent of the lost points of the rival with the highest total. Rules apply to PUBLIC and to HELD-OUT C separately; the gate passes only if both pass. There is no cost rule. A cell that fails (429, no result line) is run again and never graded.

**Steps.** (1) HELD-OUT C, Sonnet, 3 runs, six arms (90 runs), grading. (2) PUBLIC, Sonnet, 3 runs, all arms (about 150 runs), grading. (3) If both pass: F9, `claude-haiku-5-5` and `claude-opus-5-5`, 1 run per task, arms `ours`, `base` and the best rival of that task (highest Sonnet mean of step 1 or 2 for that set, ties in the order `pp`, `ppi`, `hist`, `bf`); the same Rule B per model; both sets. (4) If F9 passes: F6, a random 10 percent of all graded cells (`random.Random(20261022)`, cells sorted by name) re-run and re-graded by a fresh agent that has not seen this code or these tasks; every disagreement is reported; a disagreement of more than one point on a cell is a failed audit. If a step fails, later steps are skipped and the failure is reported; the numbers are reported either way.

**Safety.** Competitor arms run only from `git archive` copies. `guard.sh` hashes the `hooks` object of `~/.claude/settings.json` and the `mcpServers` object of `~/.claude.json` before and after every competitor run; a change stops the round. Vaara is never run. Parallelism 3.

**Budget.** The logged `total_cost_usd` of every `claude -p` call (runs, grading, subagents) is in `surviving-lines-r7-cost.tsv`. No new batch of runs or grading starts once 36 USD is logged; the results so far are then written, with what is missing named. The hard maximum is 40 USD.

**Claim scope.** A "first" claim is written only for the tasks, models, runs and date that completed, on the SDK path, naming the rivals in the comparison and the scan candidates that were not run.

### Results, round 7 and final gate

Run on 2026-10-22 under the "Round 7 and final gate measurement protocol" above (frozen in `512788b` before any run). Ours ran from a `git archive` of `4b65d05`, model `claude-sonnet-5-5`, every call on the Agent SDK path (no cell reused from an earlier round), six arms, 3 runs per task: held-out C1 to C5 (90 runs) and the 11 public tasks (99 runs for ours' five rivals plus 33 for ours; 189 runs). All arms of a cell were graded together in a shuffled order, three votes per cell, a model judging every outcome criterion. The hooks and mcpServers guard passed on every competitor run. Ours loaded and ran its skill in 48 of 48 runs. Published: `bench/head-to-head/results/round7-claude-sonnet-5-5/` (tables, per-criterion votes, label maps, held-out task list). Logged `claude -p` cost: 31.20 USD of the 36 USD stop line (40 USD maximum).

**Held-out C1 to C5** (mean criteria passed, runs in brackets):
| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | 5 | 3.00 (3/3/3) | 0.67 (0/1/1) | 2.67 (5/3/0) | 2.33 (3/2/2) | 2.00 (1/3/2) | 3.00 (5/2/2) |
| C2 | 5 | 4.00 (4/4/4) | 2.00 (2/2/2) | 3.00 (3/3/3) | 3.00 (3/3/3) | 3.67 (4/4/3) | 3.33 (3/4/3) |
| C3 | 5 | 1.33 (1/2/1) | 0.67 (0/1/1) | 0.67 (0/1/1) | 0.67 (0/1/1) | 0.67 (0/1/1) | 0.33 (0/0/1) |
| C4 | 5 | 3.67 (3/5/3) | 3.00 (3/3/3) | 2.33 (2/3/2) | 1.00 (1/1/1) | 1.67 (2/2/1) | 2.00 (2/1/3) |
| C5 | 5 | 3.00 (3/3/3) | 2.00 (2/2/2) | 2.00 (2/2/2) | 2.00 (2/2/2) | 2.00 (2/2/2) | 2.00 (2/2/2) |
| Total | 25 | 15.00 | 8.33 | 10.67 | 9.00 | 10.00 | 10.67 |

Rule A passes: ours lost 10.00 of 25; the best rival (project-pilot, better of pp and ppi per task, 11.33) lost 13.67, so the limit is 10.93. **Rule B fails on C1**: ours 3.00 ties `base` 3.00 (below the maximum of 5, so the tie is a loss under the frozen rule). C2 to C5 are strictly above every rival.

**Public tasks** (mean criteria passed, runs in brackets; `err=1` means one criterion had fewer than two valid votes and was left out):
| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 4 | 3.67 (3/4/4) | 3.67 (3/4/4) | 1.67 (1/2/2) | 3.00 (2/3/4) | 3.00 (1/4/4) | 4.00 (4/4/4) |
| T2 | 4 | 4.00 (4/4/4) | 2.67 (3/3/2) | 3.33 (3/3/4) | 1.00 (1/1/1) | 2.00 (2/2/2) | 3.67 (4/4/3) |
| T3 | 5 | 5.00 (5/5/5) | 4.33 (5/4/4) | - | 4.00 (5/3/4) | 4.33 (5/5/3) | 4.33 (4/5/4) |
| T4 | 5 | 5.00 (5/5/5) | 3.00 (3/3/3) | 3.33 (3/2/5) | 3.00 (3/3/3) | 2.67 (3/4/1) | 3.00 (3/3/3) |
| T1i | 4 | 4.00 (4/4/4) | 4.00 (4/4/4) | 2.00 (2/2/2) err=1 | 3.33 (4/3/3) | 3.67 (4/4/3) err=1 | 4.00 (4/4/4) |
| T4i | 5 | 5.00 (5/5/5) | 3.00 (3/3/3) | 4.00 (4/4/4) | 3.00 (3/3/3) | 3.00 (3/3/3) | 2.67 (3/2/3) |
| E1 | 5 | 5.00 (5/5/5) | 3.33 (4/3/3) | 3.33 (5/3/2) | 4.33 (4/5/4) | 2.33 (2/2/3) | 3.67 (3/4/4) |
| E2k | 5 | 5.00 (5/5/5) | 4.00 (4/4/4) | 4.00 (4/4/4) | 4.00 (4/3/5) | 3.67 (4/3/4) | 4.00 (4/4/4) |
| E3 | 4 | 3.67 (3/4/4) | 2.67 (3/2/3) | - | 2.67 (2/3/3) | 3.00 (3/3/3) | 2.67 (2/3/3) |
| E4h | 5 | 5.00 (5/5/5) | 4.00 (5/4/3) | - | 4.33 (5/3/5) | 5.00 (5/5/5) | 4.33 (3/5/5) |
| E5 | 5 | 4.33 (4/5/4) | 5.00 (5/5/5) | 4.00 (5/5/2) | 5.00 (5/5/5) | 5.00 (5/5/5) | 4.33 (3/5/5) |
| Total | 51 | 49.67 | 39.67 | 25.67 | 37.67 | 37.67 | 40.67 |

Rule A passes: ours lost 1.33 of 51; the best rival (project-pilot better-of 41.67; base 40.67) lost 9.33, so the limit is 7.47. **Rule B fails on T1** (ours 3.67; `base` 4.00 and pp 3.67) **and on E5** (ours 4.33; pp, hist and bf 5.00, base 4.33).

**The gate failed on Rule B in both sets**, by the rules frozen before the run. F9 (Haiku, Opus) and the F6 audit were not run: the protocol runs them only after both sets pass. Ours has the highest total in both sets (held-out 15.00 of 25 against 11.33 for the best rival; public 49.67 of 51 against 41.67). No "first" claim is made for per-task superiority.

Departures, stated plainly: the public set was graded by a model on every outcome criterion for six arms together, not by the round 4 and 5 script checks on four arms, so the public numbers are not comparable to rounds 4 and 5 (CLI path, script checks, reused rival cells). Per-cell differences of one criterion (T1, E5, C1) are within the grader noise seen in earlier rounds; the rule has no tolerance. The held-out set was written before the diagnostic runs and was not read by the controller; the product changes of this round (R7-1 to R7-4) were driven by the seen sets (N1 to N4, H1 to H3) only. The tie on C1 and the E5 and T1 misses were not investigated.

**Single result sentence (scope included).** On 2026-10-22, on the Claude Agent SDK path with `claude-sonnet-5-5`, with 3 runs per cell and a model grader, surviving-lines at `4b65d05` had the highest total of six arms (itself, project-pilot with and without its command, mcp-git-historian, k41n/busfactor, plain Claude) on 5 new held-out tasks (15.00 of 25 against 11.33 for the best rival) and on 11 public tasks (49.67 of 51 against 41.67), but it did not win every task (held-out C1 tied with plain Claude; public T1 and E5 were not strictly above every rival), so the preregistered gate failed and F9 and F6 were not run.

## Round 8 rulings (frozen 2026-10-22, owner decision, before any code change)

Written and committed before any code change of round 8 and before any round 8 measurement run. Basis: a read-only diagnosis of the round 7 transcripts for the three cells that failed Rule B (held-out C1, public T1, public E5) and the low absolute score of held-out C3. C1 to C5 are seen after round 7: they are used for diagnosis only and are not scored again. Nothing below, in the code, in the tests or in the skill text names a file, person or repository of any benchmark set. No criterion, script check, task, win rule or tolerance changes.

**What the diagnosis found (general loss classes).**
1. The default blame setting uses the deepest copy detection (`-C -C`). It credits whoever first wrote similar text, including authors of code that was later reverted, and it moves a person's share by several points compared with a plain `-C` count. The output does not say who gained or lost through it.
2. The scan for mechanical rewrites has a size floor and detects only layout and quote changes. A commit below the floor, or a token-level rewrite (a codemod or a language fix tool), produces no output, so the answer says "none found" instead of reporting what was examined and set aside.
3. The comparison for a set-aside commit prints a line count next to the committer's name, and the answer repeats it as if that person held those lines. Most of the T1 loss is grader noise (the same wording passes in other runs); this is a residual exposure only.
4. When a view prints both an unconfirmed merged figure and an unmerged figure, the history view does not mark which one leads, so an answer can lead with the unmerged figure and give the merged one only as a hedge.
5. The strength of an identity group is decided by its weakest link, so conclusive evidence for one pair is hidden by weak evidence for an additional member of the group.

Part of the E5 and C3 loss is grader noise (reasons that call a figure in range and still fail it). That is not tuned to.

**R8-1. Plain `-C` is the default copy detection.** The default blame is `-w -M -C`. `-C -C` is available as `--copies deep`; `--no-copies` and the large-repository switch-off stay as they are. In every view, when copy detection moved lines, one scope note names the three people whose share changed most against a run without copy detection, with both figures. Skill rule: say which copy-detection setting the figures use; when the note names a person moved by more than 2 points, give both figures. Reason: a person's figure should be explainable from plain `git blame -w -M -C`, which is what a maintainer re-checking by hand runs, and single `-C` still follows code moved out of a file changed in the same commit. Pre-registered check, run before the commit and not as a scored measurement: on the public fixtures and on the seen sets' fixtures, the tool's top-five shares after the change must not be further from the committed ground truth than before it, in total absolute difference. If the check fails, only the scope note is kept and the default stays `-C -C`; this is then written in the results.

**R8-2. Mechanical-rewrite check line in every view.** Every view prints one line: how many commits holding surviving lines were examined, how many were set aside, and the commits that look mechanical but were not set aside, each with author, subject and surviving lines. A commit looks mechanical when it touches at least 10 files with the same small change in each file (equal insertions and deletions, at most 3 lines per file), or its subject names a formatter, lint fix, codemod or rename tool. The size floor does not apply to this line. The tool still sets aside by its existing rule only; it never sets a candidate aside by itself. Skill rule: say that mechanical rewrites were checked; name each commit of the line as set aside or kept; never write "none found" while the line lists candidates; inspect a candidate with `git show --stat`, and when it is mechanical re-run with `--ignore-rev` and report both.

**R8-3. A set-aside commit is described by its size.** Skill rule: describe a set-aside commit by what it rewrote (lines, files); give the counterfactual only for the people who would lose lines; do not attach a line total to the committer's name as if it were that person's holding. Text output keeps the comparison; the rule is wording for the answer.

**R8-4. Strength and lead figure in the history and reviewers views.** In `--history`, `--reviewers` and the plain table, the identity hint line states the strength and the one figure the tool recommends leading with (merged for `strong`, unmerged for `weak`), and the headline sentence of `--history` uses that figure with the other next to it. Skill rule: the `--history` paragraph carries the same lead-with-merged sentence as the ownership paragraph.

**R8-5. Strength per pair.** The strength of an identity group is decided per pair against the best-linked member. The strongly linked members form one `strong` suggestion; a weakly linked extra member is a separate `weak` addition with its own line count. `--merge-identities` merges only the strong subset. `.mailmap` merges are unchanged.

**Tests and review.** Tests on synthetic repositories built inside the tests; `npm test` and `claude plugin validate .` must pass; a Sonnet reviewer reads the whole diff and findings are fixed. Diagnostic runs after the change (ours, one run each, not scored, cost logged) on C1, T1, E5 and on the N and H sets. The product does not change after the new held-out tasks (D1 to D5) are opened.

**Evaluated and not done in round 8 (reasons).** `-C -C -C` (slower; no failing case needs it). Setting a mechanical-looking commit aside automatically (the research names over-merging and over-ignoring as the failure to avoid). Any change of C1 to C5 or of any criterion. A tolerance in Rule B.

## Round 8 and final gate measurement protocol (frozen 2026-10-22, owner decision)

Written and committed after the product work of round 8 (`dabc18f`, 352 tests pass, `claude plugin validate .` passes, one Sonnet review round fixed) and before any scored measurement run of this round. No scored result of this round had been seen. This section is not changed after results exist.

**Product.** Ours runs from a `git archive` of `dabc18f`. The product does not change after this section is committed. Rulings R8-1 to R8-5 above; the pre-registered R8-1 check passed (sum of absolute top-five differences from the committed ground truth over 14 fixtures: 126.40 points before, 106.86 after; `-C -C` stays opt-in as `--copies deep`).

**Run path (owner decision).** Same as round 7: every `claude -p` call goes through the Claude Agent SDK shim in front of the same installed CLI (2.1.308). The only measured difference between the SDK path and the earlier CLI path is that the desktop application's "Artifact" tool and its `artifact-diagramming` skill are absent on the SDK path; they have nothing to do with these tasks. Every arm of this round (ours, rivals, base) runs on the SDK path in this round; no cell of any earlier round is reused, so all tables of round 8 come from one path and one day. Earlier rounds' tables (CLI path, or round 7) are not mixed in. A run that returns 429 or an authentication error stops the round and is reported. The billing check (`apiKeySource` = `ANTHROPIC_API_KEY`) passed before the first call.

**Task sets.**
- PUBLIC: the 11 public tasks of `tasks.json` (T1, T2, T3, T4, T1i, T4i, E1, E2k, E3, E4h, E5), fixtures from `build-fixture.sh`, 51 outcome criteria, a model judges every criterion (the round 7 method).
- HELD-OUT D1 to D5 (25 criteria): written by a fresh Sonnet agent (`claude-sonnet-5-5`) given only the one-sentence user problem from the top of `README.md` and the list of files a task consists of (prompt, fixture build script, ground-truth script and output, five outcome criteria). It had no access to the product code, to this document, to the research report or to any earlier task set (H, N, C), was told to use five different ecosystems, and was not told which cases the product handles or loses. Result: five tasks on public repositories, on the local branch `heldout-2026-10-d` (`05e81b3babc4de270fc5457213ab00ed0ef05677`, never pushed). The controller did not read the tasks, criteria or ground-truth scripts, with one disclosed slip: the last two entries of the writer's `README.md` (two hazard summaries, for d4 and d5) were displayed on a terminal while checking that the file existed. This happened after the product code was frozen and changed nothing. Setup was validated without reading: all five fixtures build, the ground-truth output equals the committed `truth.txt` for each, each task has five criteria. The runner's task list `d-tasks.json` (SHA-256 `206727442546c9905b80d794515e84747298a0d552ac75bdf11027eafd26d8d4`) is built by script from those files (the invoked prompt of `ppi` is "Use the /project-pilot:bus-factor command for this. " plus the natural prompt).
- C1 to C5, N1 to N4 and H1 to H3 are seen. After the round 8 product change they were used for diagnosis only (ours, one run each, not scored; logged cost): C1 4.00 of 5, N 9.00 of 20 (one cell failed to parse), H 10.00 of 15, public T1 failed to parse, E5 4.00 of 5. They are not part of any table.

**Arms.** `ours`, `pp`, `ppi` (project-pilot 1.0.0 at `bf6eabe`; invoked prompt as above), `hist` (mcp-git-historian `bb2e209`), `bf` (k41n/busfactor `d898d8d`, with the `--no-github` line), `base` (empty plugin): same copies and set-up as round 7. `hist` and `bf` have no invoked arm. All six arms run 3 times on every task of both sets, in this round.

**Grading.** Same as round 7: all arms of one task and run graded together, answers labelled in a shuffled order, plugin names, directories and MCP tool prefixes replaced, criteria and ground truth shown with the run's `.mailmap` file if any; three separate `claude -p` calls (`claude-sonnet-5-5`, no plugins), majority of valid votes (`gate-grade.py`, unchanged since round 7). A grading call that does not parse is run again (up to three passes); a criterion with fewer than two valid votes is left out and marked `err`.

**Rules.** Rival arms: `pp` and `ppi` as the better of the two per task, `hist`, `bf`, `base`. Rule B: on every task our mean is strictly above every rival's, and where a rival is at the maximum we are at the maximum. Rule A: our lost points are at most 80 percent of the lost points of the rival with the highest total. Both rules apply to PUBLIC and to HELD-OUT D separately; the gate passes only if both pass. There is no tolerance and no cost rule. A cell that fails (429, no result line) is run again and never graded.

**Steps.** (1) HELD-OUT D, Sonnet, 3 runs, six arms, grading. (2) PUBLIC, Sonnet, 3 runs, six arms, grading. (3) If both pass: F9, `claude-haiku-5-5` and `claude-opus-5-5`, 1 run per task, arms `ours`, `base` and the best rival of that task (highest Sonnet mean of this round for that set, ties in the order `pp`, `ppi`, `hist`, `bf`); the same Rule B per model, both sets. (4) If F9 passes: F6, a random 10 percent of all graded cells (`random.Random(20261022)`, cells sorted by name) re-run and re-graded by a fresh agent that has not seen this code or these tasks; every disagreement is reported; a disagreement of more than one point on a cell is a failed audit. If a step fails, later steps are skipped and the failure is reported; the numbers are reported either way.

**Safety.** Competitor arms run only from `git archive` copies. `guard.sh` hashes the `hooks` object of `~/.claude/settings.json` and the `mcpServers` object of `~/.claude.json` before and after every competitor run; a change stops the round. Vaara is never run. Parallelism 3.

**Budget.** The logged `total_cost_usd` of every `claude -p` call (runs, grading, diagnostics, subagents) is in `surviving-lines-r8-cost.tsv`. No new batch of runs or grading starts once 34 USD is logged; the results so far are written, with what is missing named. The hard maximum is 38 USD. If the budget cannot cover F9 and F6, PUBLIC and HELD-OUT D are completed first. Logged before this freeze: 7.4 USD (diagnosis, implementer, reviewer, fixer, writer, check, diagnostic runs).

**Claim scope.** A "first" claim is written only for the tasks, models, runs and date that completed, on the SDK path, naming the rivals in the comparison and the scan candidates that were not run.

### Results, round 8 and final gate

Run on 2026-10-22 under the "Round 8 and final gate measurement protocol" above (frozen in `115bc01` before any scored run). Ours ran from a `git archive` of `dabc18f`, model `claude-sonnet-5-5`, every call on the Agent SDK path, no cell reused from an earlier round, six arms, 3 runs per task: held-out D1 to D5 (90 runs) and the 11 public tasks (189 runs). All arms of a cell were graded together in a shuffled order, three votes per cell, a model judging every outcome criterion. The hooks and mcpServers guard passed on every competitor run. Published: `bench/head-to-head/results/round8-claude-sonnet-5-5/`. Logged `claude -p` cost: 35.34 USD (stop line 34 USD, hard maximum 38 USD), including 0.25 USD of grader replies that were replaced in the completed public grading. The stop line was crossed during public grading; the owner then asked for the missing grading passes to be completed (see "Update").

**Held-out D1 to D5** (mean criteria passed, runs in brackets):
| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | 5 | 3.00 (3/3/3) | 3.33 (3/2/5) | 3.67 (4/3/4) | 2.67 (3/2/3) | 3.67 (4/4/3) | 3.67 (5/3/3) |
| D2 | 5 | 3.00 (3/3/3) | 2.33 (0/3/4) | 4.33 (4/5/4) | 3.00 (4/4/1) | 0.33 (0/1/0) | 3.33 (4/3/3) |
| D3 | 5 | 4.67 (5/4/5) | 0.00 (0/0/0) | 0.33 (0/0/1) | 0.00 (0/0/0) | 0.00 (0/0/0) | 0.00 (0/0/0) |
| D4 | 5 | 4.67 (5/5/4) | 1.67 (1/2/2) | 1.33 (1/2/1) | 0.00 (0/0/0) | 1.67 (1/3/1) | 2.00 (2/2/2) |
| D5 | 5 | 4.00 (4/4/4) | 3.00 (3/3/3) | 3.00 (3/3/3) | 2.67 (3/3/2) | 2.67 (3/3/2) | 3.00 (3/3/3) |
| Total | 25 | 19.33 | 10.33 | 12.67 | 8.33 | 8.33 | 12.00 |

Rule A passes: ours lost 5.67 of 25; the best rival (project-pilot, better of pp and ppi per task, 13.00) lost 12.00, so the limit is 9.60. **Rule B fails on D1** (ours 3.00; ppi, bf and base 3.67, pp 3.33) **and on D2** (ours 3.00; ppi 4.33, base 3.33, hist 3.00). D3, D4 and D5 are strictly above every rival.

**Public tasks, completed grading** (`err=n`: n criteria had fewer than two valid votes and are left out of that cell's mean; none remain in this table). The first version of this section, written when the budget stop line cut public grading short, is kept below under "Update".
| Task | Criteria | ours | pp | ppi | hist | bf | base |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | 4 | 4.00 (4/4/4) | 4.00 (4/4/4) | 1.67 (2/1/2) | 3.33 (4/3/3) | 3.33 (3/3/4) | 3.33 (3/3/4) |
| T2 | 4 | 4.00 (4/4/4) | 2.33 (2/2/3) | 3.33 (3/3/4) | 1.33 (2/1/1) | 2.67 (2/3/3) | 3.67 (4/4/3) |
| T3 | 5 | 5.00 (5/5/5) | 4.33 (5/4/4) | - | 4.33 (5/4/4) | 4.00 (5/4/3) | 4.00 (3/5/4) |
| T4 | 5 | 5.00 (5/5/5) | 3.00 (3/3/3) | 4.00 (4/3/5) | 3.00 (3/3/3) | 2.33 (3/3/1) | 2.67 (3/2/3) |
| T1i | 4 | 4.00 (4/4/4) | 3.33 (3/3/4) | 2.67 (4/2/2) | 3.33 (4/4/2) | 3.67 (3/4/4) | 2.67 (4/2/2) |
| T4i | 5 | 5.00 (5/5/5) | 3.00 (3/3/3) | 3.33 (3/3/4) | 3.00 (3/3/3) | 3.33 (3/3/4) | 3.67 (3/5/3) |
| E1 | 5 | 5.00 (5/5/5) | 4.00 (4/3/5) | 2.67 (3/2/3) | 4.00 (5/4/3) | 2.00 (2/2/2) | 3.33 (3/4/3) |
| E2k | 5 | 5.00 (5/5/5) | 4.33 (4/5/4) | 4.33 (5/4/4) | 4.67 (4/5/5) | 4.00 (4/4/4) | 4.00 (4/4/4) |
| E3 | 4 | 3.67 (3/4/4) | 3.00 (3/3/3) | - | 3.00 (3/3/3) | 3.00 (3/3/3) | 3.00 (3/3/3) |
| E4h | 5 | 5.00 (5/5/5) | 4.67 (5/5/4) | - | 3.00 (3/3/3) | 5.00 (5/5/5) | 4.33 (5/3/5) |
| E5 | 5 | 5.00 (5/5/5) | 4.67 (5/5/4) | 4.33 (3/5/5) | 4.00 (5/2/5) | 5.00 (5/5/5) | 5.00 (5/5/5) |
| Total | 51 | 50.67 | 40.67 | 26.33 | 37.00 | 38.33 | 39.67 |

Rule A passes: ours lost 0.33 of 51; the best rival (project-pilot, better of pp and ppi per task, 43.00) lost 8.00, so the limit is 6.40. **Rule B passes**: no task fails (T1 ties pp at 4.00, the maximum, and ours is at the maximum; every other task is strictly above every rival or ties a rival at the maximum with ours at the maximum).

**The gate failed**: Rule B passes on the public set but fails on the held-out set (D1, D2), and the gate needs both sets. F9 (Haiku, Opus) and the F6 audit were not run: the protocol runs them only after both sets pass. Ours has the highest total in both sets (held-out 19.33 of 25 against 13.00 for the best rival; public 50.67 of 51 against 43.00). No "first" claim is made for per-task superiority.

Departures and caveats, stated plainly: the driver script skipped grading after each batch because of a shell status bug; grading was run afterwards by a separate script with the same grader code and the same budget check. The controller read two README entries of the held-out writer by accident (see the protocol). A product change was made in round 8 from the diagnosis of C1, T1, E5 and C3 (R8-1 to R8-5); one implementer run used `git checkout -- hooks` on its own uncommitted edit, which the handoff rules forbid (nothing else was touched, the tree was clean afterwards). The losses on D1 and D2 were not investigated.

**Update (2026-10-22, owner instruction, same day).** Public grading was completed after the stop line: the grader replies that did not parse (T1-2, T1i-3, E1-2, E3-1, and one that failed again in the first re-ask) were asked again with the same `gate-grade.py`, grader model and prompts; no run was repeated and no other reply changed. Before completion the public table read: ours 50.33, pp 39.33, ppi 26.00, hist 36.67, bf 38.00, base 39.00, Rule A passed, and **Rule B failed on T1** (ours 3.67 tied pp 3.67 with one criterion left out in four arms). After completion: ours 50.67, pp 40.67, ppi 26.33, hist 37.00, bf 38.33, base 39.67, Rule A passes, **Rule B passes**. The held-out table did not change. The replaced failed replies are kept in `grades/public/reasks/`. The evidence folders for rounds 7 and 8 follow the owner's evidence standard (`SUMMARY.md`, `PROTOCOL.md`, `arms.json`, `env.json`, `tasks/`, `runs/`, `grades/`, `score.py`, `REPRODUCE.md`, `VERIFY.md`, `SHA256SUMS`); `SUMMARY.md` is generated by `score.py` from the raw votes.

**Single result sentence (scope included).** On 2026-10-22, on the Claude Agent SDK path with `claude-sonnet-5-5`, with 3 runs per cell and a model grader, surviving-lines at `dabc18f` had the highest total of six arms (itself, project-pilot with and without its command, mcp-git-historian, k41n/busfactor, plain Claude) on 5 new held-out tasks (19.33 of 25 against 13.00 for the best rival) and on 11 public tasks (50.67 of 51 against 43.00; Rule A and Rule B both pass on the public set), but Rule B failed on the held-out set (D1 and D2 were below at least one rival), so the preregistered gate failed and F9 and F6 were not run.

## Round 9: rulings (frozen 2026-10-23 before any round 9 code change)

Source: `docs/BEST-RIVAL-r9.md` (primary rival: project-pilot invoked; second: plain Claude). Criteria, check scripts, tasks and the win rule do not change. Each rule names a general loss class; none names a fixture.

- **R9-1** Exact agreement between the full name of one identity (two or more words, letters only, accents and punctuation removed) and the address name of another identity is near-conclusive identity evidence (kind like `accent`). Partial name containment stays weak.
- **R9-3** Every view prints one scope line when one address appears under several author names and they were counted as one person (names capped at five). Skill: name them in the answer, never say "no duplicates" while the line is printed.
- **R9-4** Default table shows every author with at least 1% of the lines, minimum 10 rows, maximum 25 rows, then one tail line (count, combined share, largest tail author). Explicit `--top` keeps its meaning. A "last commit" column is added. The 1% threshold is not tuned on any seen task. Skill: on "which people" questions list every row shown and state the tail line.
- **R9-5** The prompt hint also matches natural ownership wording that does not start with "who" (for example "who actually wrote", "which people/authors", "still in the repo/code", "losing one or two people", "concentrated"). Phrases that appear verbatim in a seen task prompt are not used. Context cap and read-only guarantees stay.
- **R9-6** Skill text: in the default view `Co-authored-by` trailer names carry no lines unless `--co-authors share`.
- **R9-7** `--copies deep` prints a scope line that deep detection can credit lines to a commit that was later reverted.
- **R9-2 not adopted** (reverses R7-4; needs a seen-truth check; R9-1 covers the loss class more safely).

Development gate (BEST-RIVAL-SPEC step 6): ours x3 on held-out D (D1-D5) and on C1-C5, same grading, compared with the best rival's published scores; strictly higher or tied at the ceiling on every task. At most 3 iterations.

## Round 9 development gate, iteration 1: diagnosis and rulings

Frozen 2026-10-23 before any iteration 1 code change. Ours (`09e09d9`) was run x3 on the seen sets D and C and graded with the same method (results: `/Users/efe/claude-kredi-runs/2026-10-23/r9/dev-D`, `dev-C`; this section does not enter the score tables). Criteria, check scripts, tasks and the win rule are unchanged.

| Task | Ours | Best rival | Result |
| --- | --- | --- | --- |
| D1 | 5.00 | - | ok |
| D2 | 4.33 | 4.33 (ppi) | tie below the ceiling, fail |
| D3 | 2.00 | 0.33 | ok |
| D4 | 4.00 | - | ok |
| D5 | 3.67 | - | ok |
| C1 | 2.67 (err=5) | 3.00 (base) | fail |
| C2 | 2.00 (round 7: 4.00) | 3.67 (bf), 3.00 (ppi) | fail, regression |
| C3 | 3.00 | - | ok |
| C4 | 2.67 (round 7: 3.67) | 3.00 (pp) | fail, regression |
| C5 | 2.00 (round 7: 3.00) | 2.00 | fail, regression |

Diagnosis from the failed criteria, the final answers and a re-run of the tool on the run repositories. Each class is general.

1. **Blank lines are counted as surviving lines (C4, C5, C2; probably the cause of the shifts against round 7 on the same code).** The truth of every held-out set counts non-blank lines. The tool counts blank lines, which inflate the denominator and move shares toward whoever writes more blank lines: C4 lib/ José Valim 56.7% against 60.7% (accepted 57.7% to 63.7%), C5 lines 1,187 against 1,007, C2 signer.py 366 lines against 279. Graders also cited the differing line counts as a reason to fail the numeric criteria. Not a rule change of R8: the round 7 and round 8 numbers were computed with blank lines as well, so the C2 drop from 4.00 to 2.00 is mostly the next two classes plus grader variance (every reason for C2 criterion 1 and 4 is the same in all nine votes).
2. **Automation identities that are not named `[bot]` stay in the table (C4 criterion 4, C5 criterion 5).** Weblate (`hosted@weblate.org`, 80 lines) and StyleCI Bot (`bot@styleci.io`) were ranked as owners; the answers had to say "ask a person instead". The bots line also gave only a count ("1 identity"), so answers wrote "one bot identity is excluded" without a name and the grader read it as not saying bot commits were ignored (C2 criterion 4).
3. **Placeholder identities are ranked as people (C5 criterion 2).** `root@localhost` and "Your Name" appeared as two table rows; the criterion wants about 15% stated as unattributable and not offered as contacts.
4. **A commit that is clearly a codemod is only named, never set aside (C1 criterion 3, D2 run 3).** The check printed `d43be5f "all: go fix ./..." ... 38 surviving lines` as a candidate that was not set aside (frozen R8-2: a candidate is never set aside). All three C1 answers wrote that they "kept" the commit; the skill asks the agent to re-run with `--ignore-rev`, and it did not.
5. **Per-file answers where a package or directory share was asked (C2 criterion 1).** The question named two files and "the package"; every answer gave per-file tables only and failed criterion 1 in nine of nine votes (round 7 failed the same criterion). The skill gives no rule about a wider scope.
6. **Grader noise, not fixed:** C4 criterion 3 (the answers say "the same owners in nearly the same proportions" and also name the different second owner; the wording is the agent's), C1 criterion 1 and 2 (borderline hedging on a passing share), the unparsed replies behind C1 err=5, and several D2 run 3 reasons that contradict their own verdict ("numbers pass"). No code change for these. Candidate causes checked and not supported by the failed reasons: R8-1 plain `-C` default (shares for the named people are inside tolerance in every C2, C4 and C5 vote except through blank lines), R9-4 table shape, R9-3 scope line, R9-1, hint changes, skill length.

Rules for iteration 1 (R9-2 stays not adopted):

- **R9-8** Blank (whitespace-only) lines are not counted: they are dropped from every blame result before counting, and the file size used in the header is the non-blank size of each blamed file.
- **R9-9** More automation identities are bots by address: hosted translation platforms (Weblate, Crowdin, Transifex, Lokalise), `bot@styleci.io`, and the default GitHub Actions address. A person on a similar address is not matched. The `bots excluded` line names the identities (at most three).
- **R9-10** Placeholder identities (git's template name "Your Name", an address on `localhost`, `localhost.localdomain`, `(none)` or a `.local`, `.localdomain` or `.lan` host) keep their lines in the shares but are never suggested as a reviewer, and one scope line states their lines and share as not attributable to a person. `example.org` alone is not a placeholder.
- **R9-11** (supersedes the "never set aside" part of R8-2 for one case) A mechanical-rewrite candidate with both signs, the same small change in at least 10 files and a formatter, lint fix or codemod named in the subject, is set aside automatically like a reformat commit; the scope line says the rewrite was looked through. A candidate with one sign stays a named candidate that is not set aside.
- **R9-12** Skill text: when the question names files and also the package, the repository or a directory, run the tool on the wider scope too; state the `placeholder identities` line; name the bots and the `rewrites looked through` commits.

Run the development gate again after these changes (iteration 2) before any new held-out measurement.

## Round 9 development gate, iteration 2: diagnosis and rulings

Frozen 2026-10-23 before any iteration 2 code change. Ours (`c689450`) was run x3 on the seen set D (results: `/Users/efe/claude-kredi-runs/2026-10-23/r9/dev2-D`; this section does not enter the score tables). Criteria, check scripts, tasks and the win rule are unchanged.

| Task | Iteration 1 (`09e09d9`) | Iteration 2 (`c689450`) | Best rival | Result |
| --- | --- | --- | --- | --- |
| D1 | 5.00 | 3.00 (err=5, unparsed replies) | - | regrade by the controller |
| D2 | 4.33 | 4.33 | 4.33 (ppi) | tie below the ceiling, fail |
| D3 | 2.00 | 2.00 | 0.33 | ok |
| D4 | 4.00 | 2.00 | 2.00 (base) | fail, regression |
| D5 | 3.67 | 4.33 (err=2, unparsed replies) | - | regrade by the controller |

Diagnosis from the failed-criterion reasons of all nine votes per task, the final answers, and a read-only run of the tool on the D4 and D2 fixtures.

1. **D4 regression comes from R9-8 (blank lines dropped).** Iteration 1 failed only criterion 3 (see class 3) and, in one vote, criterion 4. Iteration 2 fails criterion 4 in 8 of 9 votes and criterion 1 in 3, every time with the same reason: the answer says 2,941 lines, the criterion wants about 3,320 (accept 3,150 to 3,500). Counting the fixture directly: the seven files of `src/` hold 2,941 non-blank lines and 3,322 lines in all; the D truth counts all lines, the truth of the held-out sets C counts non-blank lines. The two truths disagree about what a "line" is, so dropping blank lines is not wrong in itself (it moved C4, C5 and C2 shares by up to 4 points) but giving only the non-blank total is not enough for a reader who counts the file the way `wc -l` does. R9-9 (bots), R9-10 (placeholders), R9-11 (set-aside) and R9-12 (skill text) are not implicated: D4 has no bot, placeholder or codemod candidate that was set aside (the answers report "set aside 0 commits"), and the shares of the named people moved only by the denominator (Andrew Gallant 75.5% against 76.9%, both inside the accepted range).
2. **D2: the same denominator effect plus a display-name choice.** D2 run 2 and 3 both fail criterion 3 for the same reason: after the merge the row is named `bogem` (27 commits) and not Albert Nigmatzianov, because the merged row takes the name of the address with the most commits. A handle with one word wins over a person's full name. The graders also say the total is 10,587 and not about 12,200 (criterion 1 and 2, 5 of 9 votes mention it, 2 fail on it). Iteration 1 failed D2 run 3 on the same denominator, so the D2 tie is not new. The Sam Okafor `interface{}` to `any` rewrite (49 lines, 39 files, tool name `gofmt -r` is in the body only) stays a named candidate that is not set aside (R9-11 needs the name in the subject); Sam holds 0.4%, inside the criterion, so nothing is lost there.
3. **Not fixed, no general fix (D4 criterion 3, 9 of 9 votes in both iterations).** The criterion wants the share of `src/error.rs` and Kaito Mori named. The question asks about `src/` as a whole; Kaito is absent from the table because he holds no lines. Reporting a per-file share for a file nobody asked about is not a general behaviour, and a rule that names every person with 0 lines is not either. Grader noise and question shape; no change.
4. **Not fixed:** D1 and D5 unparsed replies (the controller regrades), D2 run 1 criterion 2 and 3 reasons that contradict their own verdict.

Rules for iteration 2:

- **R9-13** (narrows R9-8) Blank lines stay out of every share and every count, and the header also states the size with them: `N of N lines attributed (non-blank; M with blank lines)`, printed only when a blank line was dropped. JSON: `sample.linesWithBlank`, integer, always present. The skill text tells the agent to give both numbers when it states a total.
- **R9-14** A merged row is named by the most complete personal name in the group (two or more alphabetic words, for example "Albert Nigmatzianov") before a one-word handle; within the same kind the address with the most commits still decides (R8-5 unchanged otherwise). The address list of the person still names every address.

Run the development gate again (iteration 3) after these changes before any new held-out measurement.

## Round 9 development gate

The development gate of round 9 (best-rival specification, step 6) was run three times with ours only on the already-seen sets D and C. It failed in every iteration, so no scored round was run and held-out set e was never opened. These numbers do not enter any score table and show no pass. Ours was graded alone, the best rival numbers are the published numbers of rounds 8 (D) and 7 (C), so the comparison is indicative, not a controlled head-to-head.

| Iteration (product) | Set D, ours of 25 | D tasks passing the rule | Set C, ours of 25 | C tasks passing the rule |
| --- | --- | --- | --- | --- |
| 1 (`09e09d9`) | 19.00 | 4 of 5 | 12.33 | 1 of 5 |
| 2 (`c689450`) | 16.33 | 2 of 5 | 24.33 | 5 of 5 |
| 3 (`7c78c82`) | 15.33 | 2 of 5 | 23.33 | 5 of 5 |

Best published rival total: 13.33 (D), 12.33 (C). Rule: ours strictly above the best other arm on every task, or at the ceiling together with it. Set D keeps tying at D2 (4.33) and D4 (2.00) below the ceiling. Per-task tables, bootstrap intervals, grader parse failures (several err criteria), cost (about 17.6 USD logged) and the list of everything that went wrong: `bench/head-to-head/results/round9-devgate-claude-sonnet-5-5/SUMMARY.md`.

## Round 10 design (frozen before code, 2026-10-23)

Round 10 changes the product only. No measurement is made (owner instruction), so none of these rules has a score yet. The analysis is in `docs/BEST-RIVAL-r10.md`. Criteria, checks, tasks, the win rule and the grader prompt do not change. The set-D and set-C tasks stay seen; the next round must run the development gate before any new held-out set is opened.

Diagnosis in one paragraph. The D4 tie is mostly a product gap. The D truth counts every line (3,322 lines in `src/` of D4, 12,194 Go lines in D2), the C truth counts non-blank lines (R9-8 moved C from 12.33 to 24.33). Our headline counts non-blank lines and gives the other size only in a parenthesis, so graders fail the D answers on the denominator (D4 c4 in 17 of 18 votes of iterations 2 and 3; D2 c1 in 6 of 18 votes), and in D4 c1 give `pass: false` while their own reason says the share is in range (18 of 18 votes). D4 c3 fails in 27 of 27 votes in all three iterations because no answer ever names Kaito Mori's line-ending commit or the share of `src/error.rs`; the rivals do (ppi and base print a per-file top-owner table). The previous round called that "no general fix". It has one: a commit that touched many lines and changed no code under `-w` is invisible to the table, and the tool never says so.

- **R10-1** Both bases side by side. When a blank line was dropped (the condition of the R9-13 header), the author table gets two more columns, `with blank` (lines) and `share`, in text, Markdown and CSV. Rows stay ordered by non-blank lines (R9-8 unchanged, C truth unchanged). The `bus factor` line states both: `bus factor 1: <name> alone holds 75.5% of 2,941 non-blank lines (76.9% of 3,322 lines with blank lines) · to reach 80%: 3 authors`; when the bus factor or the 80% count differs on the with-blank basis, the line adds it (`counting blank lines: bus factor N`). The with-blank count comes from the same blame output, so it moves with set-aside commits, merged identities, bots, dropped files and `--include` / `--exclude` exactly as the non-blank count does. JSON: every author has `linesWithBlank` and `shareWithBlank` (equal to `lines` and `share` when no blank line was dropped), and `busFactor` gains `withBlank` (same shape). The schema file changes with it. With no dropped blank line the output is byte-for-byte the output of 7c78c82.
- **R10-2** `--files [n]` prints one row per file of the scope, largest first, `n` rows (default 25): `file | lines | top owner | share | next two owners`, on the non-blank basis, owners after identity merging, followed by `N more files` and one summary line (`files: K; one owner above 80% in M; no owner above 50% in P`). JSON: `files[]` with `path`, `lines`, `owners[]` (up to three, with `name`, `lines`, `share`). Not combinable with `--group-by`, `--csv`, `--markdown`, `--identities`, `--reviewers`, `--history`. It uses the same blame flags, exclusions and set-aside rules as the default view.
- **R10-3** `whitespace-only commits` line, in every view that prints the scope notes. A commit qualifies when it is a non-merge commit in scope, not by a bot, and for some file still present at the ref `git log --numstat` shows at least 20 added plus deleted lines while the same log with `-w` shows no entry for that file; the commit's qualifying lines total at least 20. The line lists up to five, largest first: `whitespace-only commits (git blame -w gives them no lines): 2455f7c "Fix line endings in error.rs" by Kaito Mori, 262 lines in src/error.rs (now: Andrew Gallant 64.5%, 169 of 262 lines)`, then `N more`. The "now" part comes from blaming only the files named (at most five) with the run's blame flags. Author names go through `.mailmap`. The check has a 20-second limit; on timeout the line says `whitespace-only check skipped (history too large)`. It never changes a number. JSON: `whitespaceOnlyCommits[]` with `sha`, `subject`, `author`, `lines`, `files[]` (`path`, `lines`, `topOwner`, `topShare`). It does not duplicate the reformat set-aside (R9-11): a commit that was set aside is not listed here.
- **R10-4** Skill text (kept short, same place as the other rules): (a) when two bases are printed, give both for each named person and for the total, and the bus factor on both bases when they differ; (b) for a concentration or ownership question about a directory or package, run `--files` once and give the rows where no owner holds half or one owner holds everything, next to the table shares; (c) name each commit of the `whitespace-only commits` line with its author and file, say the author holds no line of it, and give the figure for who does hold it. No benchmark names appear in any rule.
- **R10-5** Blame and log calls also pass `core.quotepath=off`, `log.showSignature=false` and `color.ui=never` (adapted as plain configuration names from mcp-git-historian `core.py:56-62`, MIT; no code copied). No output changes.
- **R10-6** (report only, not code, not frozen as a rule) Grader reliability, for the owner to decide before the next scored round: (1) five votes per cell for every arm; (2) put `reason` before `pass` in the grader's JSON so the verdict is written after the reasoning (the contradictions above suggest the verdict is committed first); (3) regrade every arm in the same round and report which cells come from the CLI path. This changes the protocol, not a criterion, and must be frozen before the first scored run.

Considered and not taken: a `--count-blank-lines` flag (R10-1 shows both, a flag would only move the headline); the files-owned bus factor of Avelino et al. (the reference implementation is GPL-3.0, so idea only, and no lost criterion depends on it; roadmap); git porcelain `ignored` / `unblamable` counts (parse change, no lost criterion); an auto-merge of same-name addresses (the existing strength levels are stricter).

Tests that must exist before the commit: both-basis columns and bus-factor line on a fixture with blank lines, byte-identical output on a fixture without blank lines, JSON fields and schema validation, `--files` rows and its refusals, a whitespace-only commit on a fixture repo (line endings changed, listed with the right owner) and a commit that also changes code (not listed), the timeout note, and the config settings.

## Round 11 confirmation protocol (frozen before any run)

Written and committed on 2026-10-23 before the first scored run of this round. Nothing of this round has been run or graded when this section is committed (one billing check call, `apiKeySource` = `ANTHROPIC_API_KEY`, 0.0034 USD). This section is not changed after results exist. Round 11 measures; it changes no product code, criterion, task, check script or grader prompt.

**Product.** Ours runs from a `git archive` of `1670228` (round 10), model `claude-sonnet-5-5`. The product does not change in this round. Rounds 9 and 10 changed it after the round 8 measurement, so ours is measured again on every set. No ours cell of an earlier round is reused.

**Run path (owner decision, 2026-10-22).** Every `claude -p` call (runs, grading, F6, F9) goes through the Claude Agent SDK shim (`~/claude-kredi-runs/sdk-shim/claude`, `claude_agent_sdk.query()`, the same installed CLI 2.1.308, stream-json unchanged). The org key via the plain CLI returns 429 "weekly limit"; the promotional credit covers the Agent SDK. Known differences between the SDK path and the older CLI path: the desktop application's `Artifact` tool and its `artifact-diagramming` skill are absent on the SDK path; and the older CLI cells also saw the user skills installed on the machine (for example caveman, impeccable; a proactive-gate round 5 diagnosis counted 44 against 18 skills). Cost and behaviour numbers of the CLI era are therefore not comparable one to one with SDK-path numbers. This round has no CLI-path cell: the rival cells reused on the public set come from round 8, which also ran on the SDK path (2026-10-22). They are marked `reused (round 8, SDK path)` in every table. In the held-out set e every cell is new. In the final gate no cell is reused; for the public set the reuse of rival cells is a departure from that sentence of the owner's instructions, which this round states in advance (owner instruction of 2026-10-23, step 3b).

**Sets.**
- HELD-OUT e (`HE1` to `HE5`, 25 outcome criteria): written in round 9 by a fresh Sonnet agent that had not seen the product code or any earlier task set (owner statement). It is stored on the local branch `heldout-2026-10-e` (`76a4a86`, never pushed). The controller of round 11 did not read the task prompts, criteria or ground-truth scripts. Disclosed slip: while checking the files, the first 600 characters of the writer's `README.md` (the problem sentence and the truth conventions: non-blank lines, `git blame --line-porcelain -w -M -C`, author not committer) and the first eight lines of `e1/build-fixture.sh` (its repository URL) were displayed. This happened after the product was frozen. Setup was validated without reading: all five fixtures build and the ground-truth output equals the committed `truth.txt` for every task. The task list `e-tasks.json` is built by script from the files (ids `HE1` to `HE5`; invoked prompt of `ppi` = "Use the /project-pilot:bus-factor command for this. " plus the natural prompt).
- PUBLIC: the 11 tasks of `tasks.json` (T1, T2, T3, T4, T1i, T4i, E1, E2k, E3, E4h, E5; 51 outcome criteria; `tasks.json` is unchanged since before round 8, SHA-256 `96dbeadbcebf21272265d4fdaff93bb284d79c07daf40a2594b88f51ea276d8e`), fixtures of round 7's `pubfix`.

**Arms.** `ours`, `pp`, `ppi` (project-pilot 1.0.0, `bf6eabe`; `ppi` only on tasks with an invoked prompt), `hist` (mcp-git-historian `bb2e209`), `bf` (k41n/busfactor `d898d8d`, with the `--no-github` line), `base` (empty plugin). Copies, licences and install methods are those of `results/round8-claude-sonnet-5-5/arms.json`. HELD-OUT e: all six arms, 3 runs per task, all new (90 runs). PUBLIC: `ours` 3 runs per task, new (33 runs); `pp`, `ppi`, `hist`, `bf`, `base` are the round 8 cells (3 runs per task, 156 cells), copied from the round 8 run folder together with their `mailmap.txt`; run number n of ours is graded together with run number n of the rivals. Round 8 rival cells ran from the same arm copies on the same fixtures.

**Grading (same for both sets).** All arms of one task and run number are graded together in one grader prompt, answers labelled in a shuffled order (`random.Random("<task>-<n>-gate")`, as in round 7 and 8), plugin names, directories and MCP tool prefixes replaced, the criteria and the ground truth shown with the run's `.mailmap` if any. `gate-grade.py` is unchanged: three separate `claude -p` calls per cell (`claude-sonnet-5-5`, `--setting-sources project`, `--strict-mcp-config`), a criterion takes the majority of its valid votes, a criterion with fewer than two valid votes is `err`. Parse failures: the driver asks the failed calls again with the same method, at most three further passes. A criterion still `err` after that is graded a second time by the new script `gate-regrade-reverse.py` (committed with this protocol): the same answers in the reverse of the first shuffled order, three new calls, the votes of this second grading replace only the `err` criteria. A criterion that is still `err` counts as not passed for every arm and is reported. The grader prompt keeps its three-vote form: the round 10 proposal R10-6 (five votes, reason before verdict) is not adopted in this round, because the owner's round 11 instruction fixes three votes. Grading budget is separate from the run budget (see Budget).

**Claims, registered in advance, both reported whatever the result.**
- **I1, first in total.** In each set separately (HELD-OUT e; PUBLIC 11 tasks), the 95% bootstrap interval of the paired difference between ours and the best other arm, in total points, lies entirely above zero (lower bound > 0). Bootstrap: seed `20261023`, 10,000 resamples, resampling over runs: for each task, three run numbers are drawn with replacement from {1, 2, 3} and the same draw is used for every arm of that task (the pairing is the grading cell, where all arms were graded together); an arm's total is the sum over tasks of its mean over the drawn runs; percentile interval 2.5% to 97.5%. "The best other arm" is the single other arm (`pp`, `ppi`, `hist`, `bf`, `base` separately) with the highest observed total in that set (ties in this order). Intervals for ours minus each other arm, and minus the per-task better of `pp` and `ppi`, are reported too. The statement says plainly when an interval includes zero. On the public set, rival cells come from another day than ours, so the pairing there is only by grading cell.
- **I2, per task.** In each set separately: Rule A (our lost points are at most 80% of the lost points of the rival with the highest total, `pp` and `ppi` counted as the better of the two per task), Rule B (on every task our mean is strictly above every rival's, and where a rival is at the maximum we are at the maximum), and Rule B′ (EVIDENCE-SPEC, repeated here): in each set, ours is strictly higher than every other arm on every task, or at the ceiling together with the best arm, except on at most one task; on that one task our deficit to the best other arm is at most 0.34 points. `SUMMARY.md` reports Rule B and Rule B′ side by side. Rule A and B use the same rival definition as round 8.
- A set counts as completed only when all its cells are graded. A claim for a set that was not completed is not made.

**F6 (independent audit).** A random 10% of all graded cells of this round (`random.Random(20261023)`, cells named `<task>-<arm>-<n>` sorted by name, `ceil(0.10 × N)` cells; reused cells are in the sample) are run again by a fresh agent session on a new copy of the fixture, with the same arm and prompt, and graded alone by a fresh grader session that has seen neither this code nor these tasks (three calls, same grader prompt form, one answer). Reported: the rate of criteria on which the independent verdict equals the original verdict, the rate of cells within one point, and every cell that differs by more than one point (a difference of more than one point on a cell is a failed audit). Cost goes to the F6 category.

**F9 (other models).** `claude-haiku-5-5` first, then `claude-opus-5-5`, one run per task, arms `ours`, `base` and the best rival of that task (highest Sonnet mean of this round for that set, ties in the order `pp`, `ppi`, `hist`, `bf`), both sets, graded together per task with the same method, Rule B per model. Order and budget: F9 starts after F6. Haiku starts only when the logged total is at most 17.5 USD, Opus only when it is at most 7.0 USD (an Opus step costs about 12 to 14 USD). A model step that does not start, or is cut by the budget, is not claimed and is reported as not done.

**Safety.** Rival arms run only from `git archive` copies. `guard.sh` hashes the `hooks` object of `~/.claude/settings.json` and the `mcpServers` object of `~/.claude.json` before and after every competitor run; a change stops the round. Vaara is never run. No checkout, restore, stash, reset or clean in a working tree (the held-out branch was created with git plumbing from a staging folder). Parallelism 3. A cell that fails (429, no result line) is run again and never graded. A call that returns 429 or an authentication error stops the round and is written to the report. The shim's credit guard (exit 3) stops new runs; results up to that point and the evidence folder are written.

**Single key.** The shim's `ACTIVE_KEY` order is not changed. At the start of this round the first key (`anthropic_key_2`) has 174.20 of 193.42 USD in its ledger; the second (`anthropic_test_key`) has 73.19 of 87.19. The shim moves to the second key by itself when the first reaches its limit. If that happens during the round, it is written as a departure with the first affected cell. The key itself is never written anywhere.

**Budget.** Logged `total_cost_usd` of every `claude -p` call goes to `surviving-lines-r11-cost.tsv` with a category. Caps (owner): runs 13 USD, grading 6 USD (separate), F6 and F9 the rest, total 22 USD, controller session 5 USD. Estimates from round 8 (mean cost per run 0.07 to 0.09 USD, per grading call 0.06 USD): HELD-OUT e runs about 7 USD and public ours runs about 2.5 USD (within the run cap); grading of e about 3 USD and of the public set about 6 USD (99 calls), so about 9 USD in all, which is above the 6 USD grading cap. The order is therefore frozen: (1) HELD-OUT e runs, (2) PUBLIC ours runs, (3) HELD-OUT e grading with re-asks and the reverse pass, (4) PUBLIC grading, one task at a time in the order of `tasks.json` (T1, T2, T3, T4, T1i, T4i, E1, E2k, E3, E4h, E5), (5) F6, (6) F9. No new grading call starts once the logged grading cost is 6.00 USD; the public tasks not graded by then are listed, the public set is then reported as not completed (partial tables are marked partial, no claim), and the amount needed to finish it is reported for the owner to decide. The cap is not exceeded without the owner.

**Result wording.** The single result sentence names, for each of I1 and I2 and for each set, the number of tasks, the rivals, the models, the date, the SDK path and the total dollars, and states which cells were reused.

## Round 11 departure: subscription path for the remaining calls (2026-10-23, before any public grading call succeeded)

Written and committed before the public set has a single graded cell. Nothing in the protocol above changes except what this section names.

**State when written.** HELD-OUT e: all 90 runs and all grading are complete on the SDK path, including the reverse-order pass for the one cell left unparsed after the re-asks. PUBLIC: the 33 ours runs are complete on the SDK path. Not one public grading call succeeded: at about 04:20 the owner set both key limits to 0 because the promotional credit was nearly spent, and the shim's credit guard refused every public grading call (exit 3); those attempts cost nothing and left no grade. Departure under **Single key**: the last six grading calls of held-out e (from 04:24:29) went through the second key, `anthropic_test_key`, after the first key reached its limit. This is the automatic switch the protocol describes.

**Owner instruction (2026-10-23).** The remaining calls of this round go through the owner's Claude Code subscription login, not through an API key.

**Path for the remaining calls.** These are public grading with its re-asks and reverse-order pass, then F6. They use the same installed CLI 2.1.308 and the same `claude -p` command lines as `gate-grade.py` builds them. The calls go through a wrapper (`~/claude-kredi-runs/sub-shim/claude`) that does two things. First, it runs the CLI under an isolated HOME: none of the machine's user settings, skills or plugins are loaded, and the session reports `apiKeySource: none`. Second, it logs each call's `total_cost_usd` to its own ledger. Unchanged: `gate-grade.py`, `gate-regrade-reverse.py`, the grader prompt, the model `claude-sonnet-5-5`, the three-vote majority, the shuffled labelling, the re-ask passes and the reverse-order rule.

**What this changes in the evidence.** The public set is graded on a different path from held-out e. Within one grading cell, every arm is graded by the same calls, so the pairing that I1 relies on is unaffected. The grader runs no tools, so the known SDK-against-CLI differences (the `Artifact` tool, the skills installed on the machine) do not reach it. Both paths are named wherever a public number is shown.

**Budget.** The dollar caps above were written for the promotional credit and do not bind subscription calls. Each call's `total_cost_usd` is still logged as the CLI's list-price estimate under the source `subscription` (`cost.py` reads the wrapper's ledger as a third source), and the evidence folder reports it apart from the dollars billed to the keys. F9: its budget gates were written in dollars. The owner decides F9 after F6; until then it is reported as not done.

**Result wording.** In place of "the SDK path": "runs and held-out e grading on the Agent SDK path, public grading and F6 on the Claude Code CLI path (subscription)".


## Round 11 F9 decision (owner, 2026-10-23, before any F9 run)

Written and committed before the first F9 call. The F6 re-runs (28 cells, subscription path) are complete and their re-grading was running when this section was written; F9 is independent of F6 and starts after it. Nothing in the protocol changes except what this section names.

**Owner decision (2026-10-23, in chat).** F9 is run, on the subscription path (`~/claude-kredi-runs/sub-shim/claude`, the same wrapper as the public grading and F6), as the F9 paragraph of the frozen protocol says: `claude-haiku-5-5` first, then `claude-opus-5-5`; one run per task (run number 1); arms `ours`, `base` and the best rival of that task, chosen by this round's Sonnet mean in that set (ties in the order `pp`, `ppi`, `hist`, `bf`); both sets (11 public tasks and the 5 held-out e tasks, 16 tasks, 48 runs per model); graded per task with the same method (`gate-grade.py`, three calls, majority, the same re-ask passes and reverse pass). `ours` is the round 10 product (`git archive` of `1670228`), unchanged.

**Best rival per task** (fixed from the Sonnet means in `out-E` and `out-P` before any F9 call): HE1 pp, HE2 bf, HE3 pp, HE4 ppi, HE5 hist, T1 bf, T2 ppi, T3 pp, T4 ppi, T1i bf, T4i ppi, E1 pp, E2k hist, E3 pp, E4h bf, E5 bf.

**What changes.** The dollar gates of the F9 paragraph (Haiku only at a logged total of at most 17.5 USD, Opus only at most 7.0 USD) were written for the promotional credit and do not apply on the subscription. Rule B per model is reported, and I1-style totals per model are reported descriptively (one run per task, so no bootstrap interval and no claim of being first). A model step cut by a usage limit is reported as not completed and not claimed. Result wording: "F9, one run per task on the Claude Code CLI path (subscription)".


## Round 11 F6b: grader reproducibility audit (registered 2026-10-23 after F6 failed, before any F6b call)

Written and committed before the first F6b call. The F6 result stays reported as failed (7 of 26 comparable cells differ by more than one point, 2 cells not comparable); it is not re-scored and nothing below replaces it. F6 re-ran the agent and graded the new answer alone, so its disagreement mixes agent variance and grader variance. F6b separates them. No new claim is made from F6b.

**F6b-1 (grader).** The same 28 sampled cells (`f6-sample.json`, `random.Random(20261023)`), the ORIGINAL answers of this round (no agent re-run), graded again by fresh grader sessions with the unchanged grader prompt form. The grading unit is the original one: all arms of the cell's task and run number are graded together, answers labelled in the same shuffled order (`random.Random("<task>-<n>-gate")`), so the comparison is like for like (20 grading units cover the 28 cells). Three calls per unit, the same majority rule (two valid votes), the same re-ask passes (at most three further), `claude-sonnet-5-5`, subscription CLI path, parallelism 3. Reported: per-criterion agreement with the original verdicts on the 28 sampled cells, and every cell whose score differs by more than one point. A criterion that stays `err` in either grading counts as a disagreement and as not passed in the cell score; the reverse-order pass is not run. **Pass condition, fixed now:** no sampled cell differs by more than one point and the criterion agreement is at least 90%. The result is reported whatever it is.

**F6b-2 (runs, descriptive only, no new calls).** For each of the 26 comparable F6 re-runs, whether the re-run score lies within the minimum and maximum of that cell's three original runs (for a reused rival cell, its three round 8 runs); the count is reported. It carries no pass condition.

**Not done.** No recomputation of I1 or I2 with the F6 cells included or excluded; no other claim is added.

## Round 12 confirmation protocol (frozen before any run)

Written and committed on 2026-10-23 before the first scored run of this round. Nothing of this round has been run or graded when this section is committed (one billing check call on the subscription path, `apiKeySource` = `none`, Haiku, 0.0024 USD list price). This section is not changed after results exist. Round 12 measures; it changes no product code, criterion, task, check script or the grader prompt text except as stated under **Grading**.

**Why round 12.** Round 11 passed I1 in both sets but F6 and F6b failed (F6b by one cell, HE2-base-3, 0 against 2: three votes are not reproducible enough). Owner decision of 2026-10-23: the launch claim is Sonnet I1 only; grading in final measurements is five calls per cell, each giving its reason before its verdict (proposal R10-6); F6 is split in two parts (F6-grader pass or fail, F6-runs descriptive); F9 (Haiku and Opus) is reported descriptively. Round 12 is a confirmation measurement on a new held-out set with the product unchanged.

**Product.** Ours runs from a `git archive` of `1670228` (round 10, the product measured in round 11), model `claude-sonnet-5-5`. The product does not change in this round. The archive is checked against the one used in round 11 (`diff -rq`, no difference).

**Run path (owner decision, 2026-10-23).** Every `claude -p` call of this round (runs, grading, F6, F9) goes through the owner's Claude Code subscription login: `~/claude-kredi-runs/sub-shim/claude` is first on `PATH` and the Agent SDK shim is removed from `PATH`. The wrapper runs the installed CLI 2.1.308 under an isolated `HOME` (none of the machine's user settings, skills or plugins load; the session reports `apiKeySource: none`) and logs each call's `total_cost_usd`, the CLI's list-price estimate, to its own ledger. No API key is used. Known difference from earlier SDK-path rounds: none of the cells of this round is comparable one to one with SDK-path numbers of earlier rounds in cost or behaviour; all arms of this round are measured on the same path.

**Sets.**
- HELD-OUT f (`HF1` to `HF5`, 25 outcome criteria): written for this round by a fresh Sonnet agent that was given only a plain description of the user's job and the file layout, and was told not to read this repository, `docs/HEAD-TO-HEAD.md`, earlier task sets or results (the writer prompt is `tasks/heldout-f/writer.prompt.md` in the evidence folder). It is stored on the local branch `heldout-2026-10-f` (`f1199be`, never pushed before this round is published). The controller did not read the task prompts, criteria or ground-truth scripts; setup was validated by script only: all five fixtures build and the ground-truth output equals the committed `truth.txt` for every task. The task list `f-tasks.json` is built by script from the files (SHA-256 `eadd2bed90828878876d57d393aeb240e97b5d31d05076c3b51e7c0891f1e14e`; ids `HF1` to `HF5`; invoked prompt of `ppi` = "Use the /project-pilot:bus-factor command for this. " plus the natural prompt). A set that has been read is not held-out again; f is published in the evidence folder after this round.
- PUBLIC: the 11 tasks of `tasks.json` (T1, T2, T3, T4, T1i, T4i, E1, E2k, E3, E4h, E5; 51 outcome criteria; SHA-256 `96dbeadbcebf21272265d4fdaff93bb284d79c07daf40a2594b88f51ea276d8e`, unchanged), fixtures of round 7's `pubfix`.

**Arms.** `ours`, `pp`, `ppi` (project-pilot 1.0.0, `bf6eabe`; `ppi` only on tasks with an invoked prompt), `hist` (mcp-git-historian `bb2e209`), `bf` (k41n/busfactor `d898d8d`, with the `--no-github` line), `base` (empty plugin). Copies, licences and install methods are those of `results/round11-claude-sonnet-5-5/arms.json`. **Every arm is re-run fresh in both sets, 3 runs per task and arm, on the path above: no cell of any earlier round is reused** (HELD-OUT f: 5 tasks x 6 arms x 3 runs = 90 runs; PUBLIC: 189 runs).

**Grading (both sets), changed from round 11 as the owner decided.** All arms of one task and run number are graded together in one grader prompt, answers labelled in a shuffled order (`random.Random("<task>-<n>-gate")`), plugin names, directories and MCP tool prefixes replaced, the criteria and the ground truth shown with the run's `.mailmap` if any: as in rounds 7 to 11. New script `bench/head-to-head/gate-grade5.py` (committed before this protocol, `f745749`; `gate-grade.py` is unchanged): **five** separate `claude -p` calls per cell (`claude-sonnet-5-5`, `--setting-sources project`, `--strict-mcp-config`); the prompt asks for each entry as `{"n", "reason", "pass"}` and tells the grader to write the reason first and decide the verdict after it (otherwise the prompt text is that of `gate-grade.py`); a criterion takes the strict majority of its valid votes (more than half true passes; a 2-2 tie among four valid votes fails); **a criterion with fewer than three valid votes is `err`**. A call that fails or does not parse gives no vote. Re-ask passes: the driver asks the calls whose reply does not parse again with the same method, at most three further passes. A criterion still `err` after that is graded a second time by `gate-grade5.py --reverse`: the same answers in the reverse of the first shuffled order, five new calls; their votes replace only the `err` criteria. A criterion still `err` counts as not passed for every arm and is reported. The share of replies that wrote `reason` before `pass` is reported. `selftest5.sh` (parsing, majority, `err` threshold, prompt order) kills 7 of 7 mutants of the script.

**Claims, registered in advance.**
- **I1, first in total (the launch claim, Sonnet only).** In each set separately (HELD-OUT f; PUBLIC 11 tasks), the 95% bootstrap interval of the paired difference between ours and the best other arm, in total points, lies entirely above zero (lower bound > 0). Bootstrap exactly as in round 11: seed `20261023`, 10,000 resamples, resampling over runs; for each task, three run numbers are drawn with replacement from {1, 2, 3} and the same draw is used for every arm of that task; an arm's total is the sum over tasks of its mean over the drawn runs; percentile interval 2.5% to 97.5%. "The best other arm" is the single other arm (`pp`, `ppi`, `hist`, `bf`, `base` separately) with the highest observed total in that set (ties in this order). Intervals for ours minus each other arm, and minus the per-task better of `pp` and `ppi`, are reported too. The statement says plainly when an interval includes zero. A set counts as completed only when all its cells are graded; a claim for an incomplete set is not made.
- **I2, per task (descriptive, not a launch condition).** In each set separately: Rule A (our lost points are at most 80% of the lost points of the rival with the highest total, `pp` and `ppi` counted as the better of the two per task), Rule B (on every task our mean is strictly above every rival's, and where a rival is at the maximum we are at the maximum), Rule B′ (EVIDENCE-SPEC: strictly higher or at the ceiling on every task except at most one, where the deficit to the best other arm is at most 0.34). All three are reported side by side; a failure does not change I1.

**F6, in two parts, both frozen now.** Sample: `random.Random(20261023).sample(sorted cell names, ceil(0.10 x N))`, N = all graded cells of this round (cells named `<task>-<arm>-<n>`); one sample for both parts.
- **F6-grader (pass or fail).** The sampled cells' original answers, no agent re-run, are graded again by fresh grader sessions with the unchanged five-call prompt form. The grading unit is the original one: all arms of the cell's task and run number together, in the same shuffled order, so every sampled cell is judged like for like. Five calls per unit, the same majority rule and `err` threshold, the same re-ask passes, the reverse pass is not run. A criterion that is `err` in either grading counts as a disagreement and as not passed in that cell's score. **Pass condition, fixed now:** no sampled cell differs by more than one point from its original score, and the criterion agreement over the sampled cells is at least 90%.
- **F6-runs (descriptive, no pass condition).** One fresh re-run of each sampled cell (same arm, prompt, new copy of the fixture), graded alone (one answer, five calls, same method). Reported per cell: re-run score against the minimum and maximum of that cell's three original runs, and the count within range.

**F9 (other models, descriptive).** After F6. `claude-haiku-5-5` first, then `claude-opus-5-5`; run number 1 of each task of both sets (16 tasks); arms `ours`, `base` and the best rival of that task (highest Sonnet mean of this round for that task, among `pp`, `ppi`, `hist`, `bf`; ties in that order, fixed from the Sonnet grades before any F9 call); each task graded per task with the same five-call method (grader model stays Sonnet), per model. Reported per model and set: totals of ours, base and the best rivals and whether ours is ahead in total; Rule B per model as a table. One run per task, so no bootstrap interval and no claim of being first. F9 does not gate the launch claim. A model step that is cut by a usage limit is reported as not completed and not claimed.

**Order and stop rule.** (1) HELD-OUT f runs, then PUBLIC runs, parallelism 3; HELD-OUT f grading starts when its runs are complete and overlaps the PUBLIC runs. (2) PUBLIC grading. (3) F6-grader and F6-runs. (4) F9. A cell that fails (usage limit, authentication, no result line) is run again and is never graded. A call that returns a usage-limit or authentication error stops the round; state is written to the run folder and the report. There is no dollar cap on the subscription path; each call's list-price `total_cost_usd` is logged and reported by category.

**Safety.** Rival arms run only from `git archive` copies. `guard.sh` hashes the `hooks` object of `~/.claude/settings.json` and the `mcpServers` object of `~/.claude.json` before and after every competitor run; a change stops the round. Vaara is never run. No checkout, restore, stash, reset or clean in a working tree; the held-out branch was created with git plumbing from a staging folder.

**Result wording.** The single result sentence names, for each of I1 and I2 and each set, the number of tasks, the rivals, the models, the date, the path (Claude Code CLI 2.1.308 on the owner's subscription login) and the list-price total, and states that no cell was reused.

## Round 12 stopped: isolation breach (2026-10-23, 19:50)

Written after the round 12 driver was stopped. Round 12 (protocol frozen in `c0e37a5`) produced no valid measurement and no claim is made from it. Nothing in the frozen protocol above is changed.

**What happened.** Every run cell of round 12 was started with its working directory under `/Users/efe/claude-kredi-runs/2026-10-23/r12/`. Claude Code reads `<ancestor>/.claude/CLAUDE.md` as project instructions for every ancestor of the working directory, so each run cell loaded the owner's global `/Users/efe/.claude/CLAUDE.md` (a commit-message format rule, a terse "caveman" answer style and a command-output filter) even though the wrapper's isolated `HOME` kept the owner's settings, skills and plugins out. The cells then read the owner's caveman skill file. This was found by another controller (`ISOLATION-WARNING-from-product-engineer.md`) and confirmed on the public cell `T4i-ours-1`. It affects every arm of every set equally in kind, but not in size: the answer style and the extra reading change what each arm writes and costs, so the cells are not clean runs of the arms.

**Which cells.** All run cells of round 12: HELD-OUT f, 90 of 90 cells (runs 1 to 3, six arms, five tasks), and PUBLIC, 85 finished cells of 189 (T1, T1i, T2, T4, T4i complete for runs 1 to 3, T3 partly, E1 to E5 partly) when the driver was stopped at 19:50. The grader calls ran under a temporary directory outside `/Users/efe` and are not affected. The wrapper now refuses any call whose working directory is below `/Users/efe`.

**What is recorded.** HELD-OUT f was graded with the frozen five-call method (no `err` criterion, no reverse pass). Totals of 25: base 16.00, ppi 15.00, ours 14.00, pp 14.00, hist 11.33, bf 11.33. This result is recorded as it came out but it is **not a valid measurement of any arm**, neither for nor against the product, and I1 is not evaluated on it. Public grading, F6 and F9 were not run. The public cells that finished were not graded.

**Held-out status.** The set f was written for this round, its totals were seen by the controller, and its cells were run: **f is no longer held-out** and cannot be used as a held-out set again. Its fixtures, tasks and truth files stay on the local branch `heldout-2026-10-f` (`f1199be`, not pushed).

**Other events of the round.** A session limit stopped the driver at 11:59 during run 3 of f: the 30 cells of that run number were set aside unused (`set-aside/F`, never graded) and re-run after the reset; a restart at 14:31 did not start; a restart at 19:31 stopped wrongly because the driver read the old limit messages of the set-aside cells and was fixed by moving them away. Cost of the contaminated runs and the f grading is logged in the wrapper's ledger (list price).

**Evidence kept.** The raw round folder `~/claude-kredi-runs/2026-10-23/r12/` (run logs, grader replies, drive log) is kept unchanged and is not published as an evidence folder, because no result is claimed. The next surviving-lines round starts with clean isolation: all work directories under `/private/tmp`, no `CLAUDE.md` in any ancestor.

## Round 13 (research and development round): rulings before any product change (2026-10-23)

Round 13 is not a measurement. Owner request: make surviving-lines first in total by analysing the rivals, the open-source alternatives and the places where it fails on real repositories; product changes are allowed again (the product was frozen only for rounds 11 and 12). Nothing in a frozen protocol above is changed.

- **R13-1 Seen sets become development material.** The held-out sets b, c, d, e and f (local branches `heldout-2026-10-b` to `heldout-2026-10-f`) have all been read or graded and are no longer held-out; set f's cells were also contaminated (round 12 isolation breach). They, and the public `tasks.json`, are development material from now on. Rule for using them: diagnose the user capability behind a loss; never copy repository names, file names, numbers or criteria into the product.
- **R13-2 Isolation.** Every benchmark work directory (fixtures, run cwd, grader cwd) is under `/private/tmp`. A working directory under `/Users/efe` loads the owner's `~/.claude/CLAUDE.md` into every arm; the subscription wrapper refuses such calls.
- **R13-3 Rivals.** mcp-git-historian (hist), k41n/busfactor (bf) and project-pilot (pp, ppi), read only from `git archive` copies. MIT, Apache and BSD code may be adapted with the copyright line kept.
- **R13-4 Method.** Loss diagnosis (e: HE1 and HE3 against pp, HE4 against ppi; f: HF2 and HF3 against hist, f overall against base; public T1, T1i, E5 against bf or base, E2k against hist) -> real-repository sweep against plain git and other tools (no model cost; log in `docs/SWEEP-2026-10-23.md`) -> open-source and literature review -> implementation with tests -> development gate on sets written by fresh agents that never saw this repository -> final measurement only on a clear lead, on a new sealed set.
- **R13-5 Clear lead (defined before any gate run).** On the development gate, the 95% bootstrap interval (seed 20261023, 10,000 resamples over runs, same draw for every arm of a task) of ours minus the best other arm's total has a lower bound above zero on the union of the fresh writers' sets, and ours is not behind the best other arm in total on the seen sets e and f. A final measurement is started only then; otherwise the round goes back to diagnosis.

## Round 13 Resume (paused 2026-10-23 evening, owner: usage limit close)

**Done.** R13-1 to R13-5 rulings (above, committed before any product change). Loss diagnosis for e, f and public (three agent reports), literature review (29 sources), and the gap table with a six-step plan in `docs/BEST-RIVAL-r13.md`. Three fresh writers produced development sets a, b and c (12 tasks, 60 criteria); the controller read none of their task content; all 12 fixtures build and match their truth files; stored on the local branch `devgate-2026-10-r13` (not pushed). `gate-grade5.py` (five calls, reason first) is committed. Baseline `npm test`: 391 of 391 pass. **No product change has been made in round 13.**

**Not done / next.** (1) Finish the real-repository sweep (an agent was cloning about 60 repositories under `/private/tmp/r13/sweep`; it was told to stop and write `SWEEP.md`; if the file is missing, rerun the sweep from `/private/tmp/r13/sweep/scripts`) and copy the findings to `docs/SWEEP-2026-10-23.md`. (2) Implement plan steps 1 to 6 of `BEST-RIVAL-r13.md`, one implementer at a time, tests with a mutation check, push after each reviewed task. (3) Run the development gate (about 390 runs and 330 grading calls) with all work under `/private/tmp`, `gate-grade5.py`, rivals from `/Users/efe/claude-kredi-runs/2026-10-22/sl-gate/src` (pp, hist-plugin, bf-plugin). (4) Only on a clear lead (R13-5): a final measurement on a new sealed set from another fresh writer, frozen protocol before any run.

**Sets.** Seen, no longer held-out: b, c, d, e, f and the public `tasks.json`. Sealed from the controller (read none): dev sets a, b, c on `devgate-2026-10-r13`. Not yet written: the final-measurement set.

**Running processes.** No benchmark process is running. One sweep agent (local git work only) was asked to wrap up. Working files live in `/private/tmp/r13` (data copies, diag reports, lit, sweep, writers, gate fixtures `gate/fixtures`, `gate/dev-tasks.json`), which can be lost if `/private/tmp` is cleaned; the reports are summarised in `BEST-RIVAL-r13.md`.

**Round 13 Resume, update (same evening).** The real-repository sweep finished before the pause: 57 full clones and 5 special cases, written to `docs/SWEEP-2026-10-23.md` (no model calls). Findings that join the gap table of `BEST-RIVAL-r13.md`: S1 crash (`fatal: no such path`) on submodules outside a recognised vendor directory (`listTextFiles`, line 652; high); S2 binary-like files that `numstat` calls text are counted as source lines (medium); S3 default `-C` is very slow on some repositories (Alamofire over 300 s, 13 s with `--no-copies`; medium); S4 bots missed (`jekyllbot`, `vue-bot`, `StepSecurity Bot`; medium, README states the limit); S5 blank-only authors show 0 in the with-blank column (low); S6 symlinks counted as one line (low). Plan step 2 grows to include S1 to S3 first (the crash is a bug to fix before anything else). The sweep agent has finished; no process is running.

## Round 13 development gate 1 protocol (frozen before any gate run, 2026-10-24)

This is a development gate, not a measurement for a claim: it decides whether a final measurement is started. Nothing here is published as a head-to-head result. Rulings R13-1 to R13-5 above apply.

**Product under test.** `git archive` of `6fa5c6d` (round 13 work: sweep fixes, both-counts headline, wider reformat/boilerplate/generated detection, per-file owners, committer and re-apply notes, activity/orphans/`--without`, `--brief` with hook injection, the Stop-hook answer check and the claim-checker agent, `--for-diff`, `--owned-by`, `--why-not`, `--check-codeowners`, adaptive `--suggest-codeowners`, history caveats, active bus factor, skill rules). Not yet implemented and therefore not in this gate: ownership tree, attention list, coupling, recent-code survival, timeline (rows #7 to #10 and #12 of `docs/BEST-RIVAL-r13-deep.md`). Test suite at that commit: 704 of 704 pass.

**Tasks.** `gate-tasks.json` (SHA-256 `5097c1f2921d5533e7c7a4d347b73568f4b791e33b4aeac77ae5048fc2fad75f`), 22 tasks, 110 outcome criteria: DA1 to DA4, DB1 to DB4, DC1 to DC4 (development sets a, b, c, written by three fresh Sonnet agents that were not shown this repository, its documents or any task; the controller read none of their prompts, criteria or truth scripts; branch `devgate-2026-10-r13` `8b450eb`, local) and the seen sets HE1 to HE5 (set e) and HF1 to HF5 (set f; ground truth and fixtures as in rounds 11 and 12). Sets a and b share three repositories with different synthetic hazards and different prompts (disclosed). The invoked prompt of `ppi` is "Use the /project-pilot:bus-factor command for this. " plus the natural prompt.

**Arms.** `ours`, `pp`, `ppi`, `hist`, `bf`, `base`, as in round 11 (`results/round11-claude-sonnet-5-5/arms.json`; rival copies from `git archive`). 3 runs per arm and task, all new, no reuse: 22 x 6 x 3 = about 390 runs (`ppi` runs on every task). Model `claude-sonnet-5-5`, parallelism 3.

**Path and isolation.** The owner's subscription login through `~/claude-kredi-runs/sub-shim/claude` (fresh HOME per call, cwd below `/Users/efe` refused). Every work directory (fixtures, run cwd, grader cwd) under `/private/tmp/r13/gate`. Plugins are passed with `--plugin-dir`. The plugin's hooks run in the `ours` arm as shipped.

**Grading.** `gate-grade5.py` (five calls per cell, reason before verdict, strict majority of valid votes, `err` below three valid votes, re-ask passes, reverse-order pass for `err` criteria), `claude-sonnet-5-5`, all arms of a task and run graded together in a shuffled order, as in rounds 7 to 12.

**Analysis and decision (R13-5, restated).** Bootstrap exactly as in round 11 (seed 20261023, 10,000 resamples over runs, the same draw for every arm of a task). Groups: DEV (the 12 fresh-writer tasks), E (seen), F (seen). Ours minus the single best other arm in total, with 95% interval, is reported per group, together with ours minus the per-task better of `pp` and `ppi`. **Clear lead** = the lower bound of the DEV interval against the best other arm of DEV is above zero AND ours is not behind the best other arm in total on E and on F. Otherwise no final measurement is started and the round returns to diagnosis. The analysis script is `analyse.py` in the gate folder (copied to the evidence of any later round).

**Stop rule.** A usage-limit or authentication error stops the driver, the failed cells are set aside and re-run, never graded. No protocol change after the first run.

### Round 13 development gate 1: result and the defects it found (2026-10-24)

Protocol above, product `6fa5c6d`, all 396 cells run and graded (five-vote reason-first grading, 0 cells needed the reverse pass). Not a claim; the decision rule R13-5 gives **NO CLEAR LEAD**.

| Group | ours | pp | ppi | hist | bf | base | ours minus best other (95% interval) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DEV (12 fresh-writer tasks, max 60) | 20.00 | 33.33 | 28.67 | 20.67 | 24.67 | 28.67 | -13.33 (-17.67 to -9.00) vs pp |
| E, seen (5 tasks, max 25) | 17.33 | 14.00 | 11.67 | 6.67 | 11.33 | 13.67 | +3.33 (-0.33 to +6.00) vs pp |
| F, seen (5 tasks, max 25) | 12.33 | 13.67 | 14.33 | 10.67 | 5.67 | 14.00 | -2.00 (-7.00 to +4.00) vs ppi |

**Diagnosis (before any change).** (1) In 30 of the 66 `ours` cells the new Stop hook blocked the first answer. Those cells scored 0.80 of 5 on average, the 36 unblocked cells 3.47. On the repair turn the model replied with a list of corrections only, and that became the final answer the graders saw; many findings were also false positives (numbers that the injected brief or other tool output contained). (2) Machine-written files without a banner (an Xcode project file, a `*.generated.json` fixture) were counted as human code (DA3, DA4). (3) The skill rule "name only active people to ask" contradicted what independent writers treat as correct (the top owner by surviving lines is the person to ask, with a note when they are inactive). These are product defects of commit `6fa5c6d`, not a property of the grader. DA3 scored 0 for every arm, which the same diagnosis explains for ours; for the rivals it reflects criteria none of them met.

**Consequence.** The `ours` cells of gate 1 do not measure the product as it will ship. They are kept as recorded. Gate 2 (protocol below) re-runs `ours` with the fixed product; the rival cells of gate 1 are reused (same path, same day, same fixtures), and every unit is graded again, so the pairing by grading cell holds.

## Round 13 development gate 2 protocol (frozen before any gate 2 run, 2026-10-24)

Same rules as gate 1 (the section above) except what is stated here. Not a claim.

**Product under test.** `git archive` of `8af57f4`: gate 1 product plus `--tree`, `--attention`, `--coupled`, `--written-since`, `--timeline`, the copy-detection line term, and the three fixes for the defects above (Stop hook precision and a complete-answer repair request; name-based generated files; skill rule naming the top owner first). 790 of 790 tests pass.

**Cells.** `ours`: 22 tasks x 3 runs, all new (66 runs, same path, parallelism 3, work directories under `/private/tmp/r13/gate2`). `pp`, `ppi`, `hist`, `bf`, `base`: the 330 cells of gate 1 are reused (same day, same fixtures, same path, same rival copies); they are marked as reused in any table. Every one of the 66 task-run units is graded again with `gate-grade5.py` (new grader replies; the labels and shuffled order are those of gate 1, so only the `ours` answer changed), so the gate 1 grades of the rivals are not carried over.

**Decision rule.** Unchanged from R13-5 and gate 1 (`analyse.py`, seed 20261023): clear lead = DEV lower bound against the best other arm above zero AND ours not behind the best other arm in total on E and F. Additionally reported: the share of `ours` cells in which the Stop hook blocked the first answer (gate 1: 30 of 66) and the mean score of blocked and unblocked cells. If more than 25% of the `ours` cells are blocked again, the hook is treated as a defect and is fixed before any further decision.

**Stop rule.** As gate 1. No protocol change after the first run.

### Round 13 development gate 2: result (2026-10-24)

Protocol above, product `8af57f4`; 66 new `ours` cells, 330 rival cells reused from gate 1, all 66 units graded again (five-vote reason-first, 0 cells needed the reverse pass). Rule R13-5 gives **CLEAR LEAD** (a decision to start a final measurement, not a claim).

| Group | ours | pp | ppi | hist | bf | base | ours minus best other (95% interval) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DEV (12 fresh-writer tasks, max 60) | 36.67 | 32.00 | 29.67 | 20.00 | 25.00 | 28.33 | +4.67 (+1.00 to +8.33) vs pp |
| E, seen (5 tasks, max 25) | 19.67 | 13.00 | 11.67 | 5.67 | 11.00 | 13.00 | +6.67 (+4.67 to +8.67) vs pp |
| F, seen (5 tasks, max 25) | 22.00 | 12.67 | 14.00 | 10.33 | 5.67 | 14.33 | +7.67 (+5.67 to +10.00) vs base |

Against the per-task better of pp and ppi the intervals are DEV -2.00 to +4.00 (includes zero), E +4.33 to +7.33, F +2.00 to +7.67. The Stop hook blocked the first answer in 13 of 66 `ours` cells (20%, below the 25% bound of the gate 2 protocol); blocked cells averaged 3.46 of 5 and unblocked cells 3.58. Tasks where ours still trails the best other arm in DEV: DA1, DA2, DB1, DC4 (and DA4, DB4 by 0.67 or less). Per-task means are in the gate 2 analysis, kept with the evidence of the final round.

## Round 13 final measurement protocol (frozen before any run, 2026-10-24)

Written and committed before the first scored run of the final measurement. This section is not changed after results exist. The product, the grader and the analysis do not change in the final round.

**Product.** `git archive` of `8af57f4` (the gate 2 product; `bin/`, `hooks/`, `agents/`, `skills/`, `schema/` are byte-identical to `HEAD` at the time of this commit: `git diff --stat 8af57f4 HEAD -- bin hooks agents skills schema` is empty). Model `claude-sonnet-5-5`. Hooks run as shipped.

**Sets.**
- SEALED z (`HZ1` to `HZ5`, 25 outcome criteria): written for this round by a fresh Sonnet agent given only a plain description of the user's job and the file layout (writer prompt kept as `tasks/sealed-z/writer.prompt.md`); it did not read this repository, its documents or any task. Branch `heldout-2026-10-z` (`93fb942`, local, never pushed before the round is published); a read-only copy is outside `/private/tmp`. The controller read no task prompt, criterion or ground-truth script; setup was validated by script only (all five fixtures build, the ground truth equals the committed `truth.txt`). **Disclosure:** the writer's closing summary, which lists the five repositories, pinned commits and one line of hazards per task, was shown to the controller before this section was written. The product was already frozen at `8af57f4` and is not changed. Invoked prompt of `ppi` = "Use the /project-pilot:bus-factor command for this. " plus the natural prompt.
- PUBLIC: the 11 tasks of `tasks.json` (SHA-256 `96dbeadbcebf21272265d4fdaff93bb284d79c07daf40a2594b88f51ea276d8e`), fixtures of round 7's `pubfix`. **The public set is development material since ruling R13-1** (it was read during round 13 diagnosis); it is reported but the launch claim rests on SEALED z.

**Arms.** `ours`, `pp`, `ppi`, `hist`, `bf`, `base` as in round 11 (`results/round11-claude-sonnet-5-5/arms.json`; rival copies from `git archive`); `ppi` only on tasks with an invoked prompt. **All cells new, none reused**, 3 runs per arm and task, parallelism 3: SEALED z 5 x 6 x 3 = 90 runs; PUBLIC 189 runs.

**Path and isolation.** The owner's subscription login through `~/claude-kredi-runs/sub-shim/claude` (fresh HOME per call; a working directory below `/Users/efe` is refused). All work directories under `/private/tmp/r13/final`. Plugins are passed with `--plugin-dir`.

**Grading.** `gate-grade5.py` as in the gate: five calls per cell, reason before verdict, strict majority of valid votes, `err` below three valid votes, re-ask passes, reverse-order pass for `err` criteria; all arms of a task and run graded together in a shuffled order (`random.Random("<task>-<n>-gate")`), `claude-sonnet-5-5`.

**Claims.**
- **I1 (launch claim, Sonnet only).** In SEALED z, the 95% bootstrap interval of the paired difference between ours and the single best other arm (highest observed total; ties pp, ppi, hist, bf, base) lies entirely above zero. Bootstrap exactly as in rounds 11 and 12 (seed `20261023`, 10,000 resamples over runs, the same draw for every arm of a task, percentile interval). The same I1 statement is reported for PUBLIC (seen set). Reported too: ours minus the per-task better of pp and ppi, and minus every other arm. An incomplete set makes no claim.
- **I2 (descriptive).** Rule A, Rule B and Rule B-prime per set, as in round 11.

**F6 (two parts, as in the round 12 protocol, same sample rule).** `random.Random(20261023).sample(sorted cell names, ceil(0.10 x N))`, N = all graded cells. **F6-grader (pass or fail):** the sampled cells' original answers graded again in their original units by fresh grader sessions (five calls, same majority rule and `err` threshold, re-ask passes, no reverse pass); pass = no sampled cell differs by more than one point and criterion agreement is at least 90% (a criterion that is `err` in either grading counts as a disagreement). **F6-runs (descriptive):** one fresh re-run of each sampled cell graded alone, reported against the min and max of the cell's three original runs.

**F9 (descriptive).** After F6: `claude-haiku-5-5`, then `claude-opus-5-5`; run 1 of ours, base and the best rival (highest Sonnet mean in the set for that task among pp, ppi, hist, bf; ties in that order; fixed from the Sonnet grades before any F9 call) on the 16 tasks of both sets; graded per task with the same method (grader model Sonnet). Reported: totals per model and set, and whether ours is ahead in total. No interval, no claim.

**Order and stop rule.** (1) SEALED z runs, then PUBLIC runs; (2) grading (z grading starts when its runs are complete); (3) F6; (4) F9. A cell that fails (usage limit, authentication, no result) is set aside, run again and never graded. A usage-limit or authentication error stops the driver; the state is written and the driver resumed after the reset. A guard change of the hooks/mcpServers hash stops the round; a change that the host itself made (hashes back to baseline) is recorded as a departure. No dollar cap; each call's list-price `total_cost_usd` is logged.

**Result wording.** One sentence naming, for I1 and I2 and each set, the number of tasks, the rivals, the model, the date, the path (Claude Code CLI 2.1.308, owner subscription login), and stating that no cell was reused and that PUBLIC is a development-seen set.

## Round 13 Resume (2026-10-24 10:35): final measurement paused, login expired

**Done.** Final measurement per the frozen protocol (`8345b3d`), product `8af57f4`: all 279 run cells (SEALED z 90, PUBLIC 189, every arm new) and their grading (five-vote, reason-first, no cell needed the reverse pass), F6-grader run (28 sampled cells regraded). Raw results are in `/private/tmp/r13/final` (`out-F`, `ANALYSIS.txt`, `drive.log`). Computed by `analyse.py` (not yet checked by the evidence `score.py`): SEALED z totals ours 9.67, pp 2.33, ppi 7.33, hist 2.00, bf 2.67, base 3.33 (of 25); I1 interval ours minus ppi +0.33 to +4.33 (lower bound above zero). PUBLIC (development-seen) ours 47.67, pp 40.33, ppi 27.33, hist 38.33, bf 40.33, base 41.00 (of 55); ours minus base +6.67 (+5.00 to +8.33). Against the per-task better of pp and ppi: z +2.33 (+0.33 to +4.33), public +4.33 (+2.00 to +6.00). These numbers are provisional until the evidence folder recomputes them.

**Blocked.** At 08:58 and again at 10:33 the F6-runs stopped. The second stop is not a usage limit: every call, also the plain `claude` binary, answers `Not logged in - Please run /login` (the Keychain item exists, the token is not accepted). The owner has to log in again before any further call. Failed F6-run cells are set aside (`set-aside/f6r-limit`) and never graded; they are re-run on resume.

**Next, in order.** (1) Owner: `/login`. (2) `bash /private/tmp/r13/final/drive2.sh` (F6-runs, then F9 Haiku and Opus; stops by itself on a limit; delete `STATE.md` and `LIMIT_HIT` first). (3) Evidence: `python3 -I /private/tmp/r13/evid/assemble.py --out bench/head-to-head/results/round13-claude-sonnet-5-5` with the published sealed-z scripts from `/private/tmp/r13/evid/sealed-published` (addresses hashed; owner ruling 2026-10-24: not a protocol change), then `score.py --check`, `scrub.py --check`, `shasum -c`, commit and push. (4) Write the result sentence from the computed tables only; the launch claim rests on SEALED z (I1), PUBLIC is development-seen.

**Sets.** SEALED z is read now (graded) and can not be sealed again; the controller saw the writer's per-task hazard summary (not prompts, criteria or truth). Departures so far: session-limit stops and set-aside cells (gate and final), one guard stop that was the host editing `~/.claude.json` (gate), the login expiry above.

## Results, round 13 final measurement (2026-10-24)

Frozen protocol `8345b3d`, product `8af57f4`, all 279 run cells new, five-vote reason-first grading, evidence in `bench/head-to-head/results/round13-claude-sonnet-5-5/` (`SUMMARY.md` is recomputed by `score.py --check`, which passes; `scrub.py --check` and `SHA256SUMS` pass). The provisional numbers of the Resume section above are confirmed by the recomputation.

- **I1, SEALED z (5 tasks, 25 criteria): PASS.** ours 9.67 against the best other arm ppi 7.33; 95% interval of the difference +0.33 to +4.33 (lower bound above zero, close to it). Against the per-task better of pp and ppi: +2.33 (+0.33 to +4.33). The set is hard for every arm (the best arm passes 7.33 of 25).
- **I1, PUBLIC (11 tasks, development-seen set): PASS.** ours 47.67 against base 41.00; +6.67 (+5.00 to +8.33); against pp/ppi best-of +4.33 (+2.00 to +6.00).
- **I2 (descriptive): Rule A, B and B-prime FAIL on SEALED z** (ours lost 15.33 of 25 against 17.67 for pp/ppi; ours trails the best rival on HZ3 by 0.67 and on HZ5 by 0.33); **PUBLIC: Rule A passes, B and B-prime fail** (tasks listed in SUMMARY). No claim of being first on every task is made.
- **F6-grader: PASS** (28 sampled cells regraded in their original units; 129 of 131 criteria equal, 98.5%; no cell differs by more than one point). **F6-runs (descriptive):** 25 of 28 gradable re-runs fall inside the min-max of the three original runs.
- **F9 (descriptive, one run per task).** Haiku: SEALED z ours 6, base 3, best rival 0; PUBLIC ours 46, base 33, best rival 33. Opus: SEALED z ours 15, base 12, best rival 14; PUBLIC ours 51, base 39, best rival 43. Ours is ahead in total in all four rows; Rule B per model fails on several tasks (listed in SUMMARY).
- **Stop hook:** 5 of 48 `ours` cells (10%) had the first answer blocked; mean score of blocked cells 3.40, unblocked 3.60.
- **Scope of the statement the tables support:** on these 16 tasks (5 sealed, 11 development-seen), model claude-sonnet-5-5, Claude Code CLI 2.1.308 on one subscription login, three runs per cell, ours has the highest total of six arms in each set, with the lower bound of the 95% interval above zero in both; per-task wins are not claimed.
- **Departures:** listed in `SUMMARY.md` (session-limit stops and set-aside cells, login renewed at about 10:40 with a possibly different account behind the later calls, the sealed-z scripts published with hashed e-mail addresses, the writer summary seen by the controller). No tag, release, merge to main or README change was made; those need the owner.
