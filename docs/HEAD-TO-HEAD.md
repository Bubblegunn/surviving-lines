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
