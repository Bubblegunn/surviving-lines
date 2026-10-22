# Head-to-head harness

Runs the public tasks in `tasks.json` on four arms and grades them blind.
The method, the frozen task list and the fairness rules are in
[docs/HEAD-TO-HEAD.md](../../docs/HEAD-TO-HEAD.md).
Needs `claude` (Claude Code), `git` 2.23 or later, and `python3`. Only the
standard library is used.

| Script | What it does |
| --- | --- |
| `build-fixture.sh <dir>` | Builds `<dir>/noignore`, `<dir>/ignore` and `<dir>/reformat-sha.txt` from expressjs/cors at `5317ebe` plus three fixed commits. |
| `truth.py <repo> [--ignore-rev SHA]...` | Ground truth by `git blame -w -M`, skipping the given revisions. It does not use surviving-lines. |
| `run.sh <out> <fixtures> <arm> <task> <n>` | One run in a fresh copy of the fixture, then `final.txt` (and `mailmap.txt` if written). Skips a run that already has `final.txt`. |
| `summarize.py <run.jsonl> [plugin]` | Turns the stream-json log into the text the grader reads, with the plugin header. |
| `run-all.sh <out> <runs>` | Builds the fixtures if missing, then runs every task on every arm, three at a time. |
| `grade.py <out> [--runs N]` | Blind grading: scripts decide numbers, names, ranges and files; a model decides the rest, three calls per cell, majority of the votes. Then `grade/RESULTS.md`. |
| `grade.py --self-test` | Checks the parser, the labels, the plugin header, every script check, the majority vote, the agreement maths and the report on canned data. No model call. |
| `rerun.sh <out> [runs]` | One command: fixtures, `run-all.sh`, `grade.py`, then prints the path of `RESULTS.md`. |
| `publish-results.sh <out> <name>` | Copies a graded round to `results/<name>/`, redacted, with a `MANIFEST.txt`. |
| `scrub.py <dir>`, `scrub.py --check <dir>`, `scrub.py --self-test` | Redacts e-mail addresses in a copy and fails if one remains. JSON lines are decoded first, so an address after an escape is redacted and the line still parses. |
| `self-test.sh` | Stub-only checks: a failed guard stops the round, one folder refuses a second model, and publish checks the task hash and redacts. No model call. |

## Arms

| Arm | Plugin directory | Prompt |
| --- | --- | --- |
| `ours` | `OURS_DIR`, this repository | the natural prompt |
| `pp` | `PP_DIR`, a project-pilot clone | the natural prompt |
| `ppi` | `PP_DIR` | the task's `ppInvokedPrompt`, which names the project-pilot command. Skipped for tasks where that field is null. |
| `base` | an empty plugin named `baseline` | the natural prompt |

## Competitor setup

A competitor is loaded with `claude --plugin-dir` from a local clone. Clone the
plugin, then point `PP_DIR` at the clone. `run.sh` and `run-all.sh` stop with a
clear message when the directory has no `.claude-plugin/plugin.json`, because
without that file claude would run with no plugin and the arm would score as
plain Claude.

After each run, `summarize.py` reads the stream-json init event. `PLUGIN_LOADED:
yes` means the plugin's name is in that event's plugin list. `SKILLS` and
`SLASH` list the skills and slash commands that ran. `grade.py` reports, per
arm, the runs where the plugin loaded and the runs where one of its skills or
commands ran. An arm whose plugin never loaded in any run is reported as "not
run: plugin did not load", and it is not an opponent in the win rule.

`GUARD_CMD` (optional) names an executable that is run as `GUARD_CMD before
<run-dir>` before a competitor run and `GUARD_CMD after <run-dir>` after it. A
non-zero exit stops the whole round: `run.sh` writes `<out-dir>/GUARD_FAILED`
with the reason and exits 3, later runs refuse to start, and `run-all.sh` exits
3 and prints the reason. Remove `GUARD_FAILED` only after the cause is fixed.
The guard is not in this repository. Use it to check that a competitor run left
the host configuration as it found it.

`summarize.py` also records `PLUGIN_SKILLS`: the plugin's skills in the init
event, without the name prefix. A skill that the run names without a prefix
counts as invoked only when it matches one of those names.

## Environment

- `OURS_DIR`: this repository (arm `ours`, required by `run-all.sh`).
- `PP_DIR`: a project-pilot clone (arms `pp` and `ppi`, required by `run-all.sh`).
- `MODEL`: the model for the runs, default `claude-sonnet-5-5`.
  The full id is the default everywhere. `rerun.sh` also accepts `haiku` and `opus`.
  The value is written to `<out>/MODEL` and into `MANIFEST.txt`.
  A folder started with one model refuses another: use a new `<out>` for each model.
- `GRADER_MODEL`: the model that grades, default `claude-sonnet-5-5`.
- `GUARD_CMD`: see above.
- `CORS_SRC`: source repository for the fixture, default `https://github.com/expressjs/cors.git`. A local path works offline.
- `RESULTS_ROOT`: where `publish-results.sh` writes, default `bench/head-to-head/results`.

## One command

```
OURS_DIR="$PWD" PP_DIR=/path/to/project-pilot-clone bash bench/head-to-head/rerun.sh /tmp/h2h-sonnet 3
```

Use a new `<out>` for each round. A folder that already has `grade/` reuses the
grades in it. A `grade/` written before the three-call method has single-reply
files (`<task>-<n>.out`), which are not read: delete `grade/` to grade again. Several models can sit side by side in one round by giving each
model its own folder, for example `MODEL=haiku ... rerun.sh /tmp/h2h-haiku 3`.

## Outputs

Under `<out>`: `MODEL`, `TASKS_SHA256` (the hash of `tasks.json` when the round started), `GUARD_FAILED` (only after a failed guard), `fixtures/`, `runs/<task>-<arm>-<n>/` (repo, run.jsonl,
final.txt, mailmap.txt, and run.failed for a failed run), and `grade/`
(labels.json, scores.json, RESULTS.md, and for each model-judged cell its `.in`
and the three replies `.call1.out` to `.call3.out`).
The arm labels are shuffled per cell and kept in `grade/labels.json`.
Delete `grade/` to grade again.

`RESULTS.md` holds the per-run scores, the outcome-only table, the table of all
criteria, the process criteria listed on their own, the plugin loading counts,
the win rule on outcome criteria, and the cost of each arm.

## Publishing and redaction

`publish-results.sh <out> <name>` copies every `run.jsonl`, `final.txt`,
`mailmap.txt` and `run.failed`, the whole `grade/` folder, `tasks.json` and
`criteria-labels.json` as they are now, and a `MANIFEST.txt` into
`results/<name>/`. The manifest holds the repository commit, the claude version,
the model, the grader model, the date, node and git versions, the sha256 of both
task files, and, for each plugin directory recorded in `<out>/PLUGIN_DIRS`
(written by `run-all.sh`, not read from the environment), its commit,
`git describe`, number of changed paths and plugin version. The directory path
itself is not written to the manifest.

Publish refuses a folder that has no `TASKS_SHA256` (it was not started by
`run-all.sh`), and refuses when `tasks.json` no longer has the hash recorded
when the round ran.

The graders saw unredacted transcripts. The transcripts quote upstream git
history, which holds real contributor addresses. The published copy does not.
`scrub.py` replaces every address whose domain does not end with `.example`
and that is not `noreply@anthropic.com` with `<email redacted>`, in every text
file of the copy. Then it checks the copy and fails the publish if an address
remains. It also replaces the home directory (`$HOME` and any `/Users/<name>`
prefix) with `<home>`, the session scratch prefix with `<scratch>` and
`/var/folders` temp prefixes with `<tmp>`. Check a published copy again with
`python3 -I scrub.py --check <dir>`.

## What the blinding covers

Before the grader reads an answer, `grade.py` removes the header lines and
neutralises the command lines under `COMMANDS RUN:`: plugin names (from the
answer's `PLUGIN_NAME` header, plus `surviving-lines` and `project-pilot`)
become `<plugin>`, `plugin:skill` ids become `tool:skill`, `${CLAUDE_PLUGIN_ROOT}`
and every plugin directory in `<out>/PLUGIN_DIRS` become `<plugin>`, and the tool
binary becomes `<tool>`. The answer text is left as written. This covers names,
ids and paths only. The numbers and wording that a tool prints in a command's
output can still reveal which arm produced an answer, and the blinding does not
hide them. `python3 -I grade.py --self-test` runs a canned transcript through it.

Do not commit `results/` unless the round is meant to be published. Its
`grade/*.in` files hold the blinded answers.
