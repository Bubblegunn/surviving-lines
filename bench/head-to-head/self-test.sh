#!/usr/bin/env bash
# Stub-only checks for the harness. No model call, no network, temp folders only.
# A stub claude and a stub guard are put first on PATH. The checks are:
#   1. a guard that fails on its second call stops the round: exit 3, GUARD_FAILED
#      written, and no run starts after the failure;
#   2. a folder started with one model refuses another;
#   3. a round is graded and published: the manifest records both task files and the
#      plugin version, the copy is redacted and every transcript line still parses,
#      and publish refuses when tasks.json no longer matches the hash of the run;
#      PLUGIN_DIRS is written, the manifest holds no local path and the grader text
#      holds no plugin directory.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
STUB="$T/stubbin"
mkdir -p "$STUB" "$T/ours/.claude-plugin" "$T/pp/.claude-plugin"
# A tiny two-variant fixture: each variant is a real git repository, so truth.py can blame it.
# The reformat sha is the commit the ignore variant would skip. Fixed dates make both variants hold the same commit id; without them the two
# inits can land in different seconds and the ids differ.
for variant in noignore ignore; do
  mkdir -p "$T/fix/$variant/lib"
  printf 'a\nb\n' > "$T/fix/$variant/lib/index.js"
  (
    cd "$T/fix/$variant"
    git init -q
    git add -A
    GIT_AUTHOR_DATE="2026-01-01T00:00:00+0000" GIT_COMMITTER_DATE="2026-01-01T00:00:00+0000" git -c user.name="Fixture Author" -c user.email="fixture@self-test.example" commit -q -m "init"
  )
done
git -C "$T/fix/noignore" rev-parse HEAD > "$T/fix/reformat-sha.txt"
printf '{"name":"surviving-lines","version":"0.0.1"}\n' > "$T/ours/.claude-plugin/plugin.json"
printf '{"name":"project-pilot","version":"1.0.0"}\n' > "$T/pp/.claude-plugin/plugin.json"

write_stub_claude() {
  cat > "$STUB/claude" <<'PY'
#!/usr/bin/env python3
# Stub claude: no model. Grader mode prints a verdict per label; run mode prints a stream-json log.
import json, os, re, sys
args = sys.argv[1:]
if "--version" in args:
    print("0.0.0 (self-test stub)")
    sys.exit(0)
if "--output-format" in args and args[args.index("--output-format") + 1] == "json":
    prompt = sys.stdin.read()
    labels = sorted(set(re.findall(r"^=== ANSWER ([A-D]) ===", prompt, re.M)))
    crit, in_block = [], False
    for line in prompt.splitlines():
        if line == "CRITERIA:":
            in_block = True
        elif in_block and line == "":
            break
        elif in_block and re.match(r"^\d+\. ", line):
            crit.append(int(line.split(".")[0]))
    verdict = {lab: [{"n": n, "pass": n % 2 == 1, "reason": "stub"} for n in crit] for lab in labels}
    print(json.dumps({"type": "result", "result": json.dumps(verdict)}))
    sys.exit(0)
plugin_dir = args[args.index("--plugin-dir") + 1]
name = json.load(open(os.path.join(plugin_dir, ".claude-plugin", "plugin.json")))["name"]
# Upstream history with an address right after a newline escape. Built at run time.
planted = "".join(["some", "one", "@", "gm", "ail.com"])
events = [
    {"type": "system", "subtype": "init", "cwd": os.getcwd(), "skills": [name + ":bus-factor"],
     "plugins": [{"name": name, "path": plugin_dir}]},
    {"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": "Bash", "input": {"command": "node " + plugin_dir + "/bin/tool.js --json"}}]}},
    {"type": "result", "subtype": "success", "is_error": False,
     "result": "Troy Goode owns 810 lines.\n" + planted + " Name\nnoreply: noreply@anthropic.com",
     "total_cost_usd": 0.01, "duration_ms": 1000, "num_turns": 2},
]
for event in events:
    print(json.dumps(event))
PY
  chmod +x "$STUB/claude"
}

write_stub_guard() {
  cat > "$T/guard.sh" <<'SH'
#!/usr/bin/env bash
# Stub guard: counts its calls and fails on call number GUARD_FAIL_CALL (default 2).
count_file="$(dirname "$0")/guard-count"
n=$(( $(cat "$count_file" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$count_file"
[ "$n" -eq "${GUARD_FAIL_CALL:-2}" ] && exit 1
exit 0
SH
  chmod +x "$T/guard.sh"
}

write_stub_claude
write_stub_guard

# Every test runs with the stub first on PATH. The real claude is never reached.
export PATH="$STUB:$PATH"
if [ "$(command -v claude)" != "$STUB/claude" ]; then
  echo "self-test: claude does not resolve to the stub" >&2
  exit 1
fi
export CORS_SRC=/nonexistent OURS_DIR="$T/ours" PP_DIR="$T/pp"
unset MODEL GUARD_CMD RESULTS_ROOT GUARD_FAIL_CALL

TOTAL_JOBS="$(python3 -I -c 'import json, sys
tasks = json.load(open(sys.argv[1]))["tasks"]
print(sum(3 + (1 if isinstance(t.get("ppInvokedPrompt"), str) else 0) for t in tasks))' "$HERE/tasks.json")"

# 1. A guard failure stops the round.
ROUND="$T/round-guard"
set +e
mkdir -p "$ROUND" && ln -s "$T/fix" "$ROUND/fixtures"
GUARD_CMD="$T/guard.sh" GUARD_FAIL_CALL=2 bash "$HERE/run-all.sh" "$ROUND" 1 > "$T/guard-run.log" 2>&1
RC=$?
set -e
if [ "$RC" -ne 3 ]; then
  echo "guard test: expected exit 3, got $RC" >&2
  cat "$T/guard-run.log" >&2
  exit 1
fi
[ -f "$ROUND/GUARD_FAILED" ] || { echo "guard test: GUARD_FAILED not written" >&2; exit 1; }
grep -q "^guard " "$ROUND/GUARD_FAILED" || { echo "guard test: GUARD_FAILED has no reason" >&2; exit 1; }
STARTED="$(find "$ROUND/runs" -name run.jsonl 2>/dev/null | wc -l | tr -d ' ')"
if [ "$STARTED" -ge "$TOTAL_JOBS" ]; then
  echo "guard test: $STARTED of $TOTAL_JOBS runs started, so the round did not stop" >&2
  exit 1
fi
echo "guard test: exit 3, GUARD_FAILED written, $STARTED of $TOTAL_JOBS runs started"

# A later run.sh and a later run-all.sh refuse to start while GUARD_FAILED exists.
set +e
bash "$HERE/run.sh" "$ROUND" "$T/fix" pp T1 9 > "$T/later.log" 2>&1
RC_LATER=$?
bash "$HERE/run-all.sh" "$ROUND" 1 > "$T/later-all.log" 2>&1
RC_ALL=$?
set -e
[ "$RC_LATER" -eq 3 ] || { echo "guard test: later run.sh exit $RC_LATER, expected 3" >&2; exit 1; }
[ "$RC_ALL" -eq 3 ] || { echo "guard test: later run-all.sh exit $RC_ALL, expected 3" >&2; exit 1; }
[ ! -d "$ROUND/runs/T1-pp-9" ] || { echo "guard test: a run started after the stop" >&2; exit 1; }
echo "guard test: later run.sh and run-all.sh exit 3 without starting a run"

# 2. One folder, one model.
MODEL_ROUND="$T/round-model"
mkdir -p "$MODEL_ROUND" && ln -s "$T/fix" "$MODEL_ROUND/fixtures"
MODEL=claude-sonnet-5-5 bash "$HERE/run.sh" "$MODEL_ROUND" "$T/fix" ours T1 1 > /dev/null
set +e
MODEL=haiku bash "$HERE/run.sh" "$MODEL_ROUND" "$T/fix" ours T1 2 > "$T/model.log" 2>&1
RC_MODEL=$?
set -e
[ "$RC_MODEL" -eq 2 ] || { echo "model test: expected exit 2, got $RC_MODEL" >&2; exit 1; }
grep -q "use a new out-dir" "$T/model.log" || { echo "model test: no message" >&2; exit 1; }
echo "model test: a folder started with claude-sonnet-5-5 refuses haiku"

# 3. A complete round, graded and published.
PUB_ROUND="$T/round-pub"
mkdir -p "$PUB_ROUND" && ln -s "$T/fix" "$PUB_ROUND/fixtures"
bash "$HERE/run-all.sh" "$PUB_ROUND" 1 > /dev/null
python3 -I "$HERE/grade.py" "$PUB_ROUND" > /dev/null
python3 -I - "$PUB_ROUND/grade/scores.json" <<'GUARD'
import json, sys
# Every arm of every task keeps its run number. A criterion loop that reuses the run variable once lost them all but the last.
scores = json.load(open(sys.argv[1], encoding="utf-8"))
for task, arms in scores.items():
    for arm, runs in arms.items():
        if list(runs) != ["1"]:
            sys.exit("grade test: %s %s has run keys %s, expected [\"1\"]" % (task, arm, list(runs)))
GUARD
echo "grade test: scores keep the run number of every arm"
RESULTS_ROOT="$T/results" bash "$HERE/publish-results.sh" "$PUB_ROUND" check-round > /dev/null
PUBLISHED="$T/results/check-round"
grep -q "^criteria-labels.json sha256: " "$PUBLISHED/MANIFEST.txt" || { echo "publish test: manifest lacks the criteria-labels hash" >&2; exit 1; }
grep -q "^tasks.json sha256: " "$PUBLISHED/MANIFEST.txt" || { echo "publish test: manifest lacks the tasks.json hash" >&2; exit 1; }
grep -q "^ours plugin version: 0.0.1" "$PUBLISHED/MANIFEST.txt" || { echo "publish test: manifest lacks the plugin version" >&2; exit 1; }
[ -f "$PUB_ROUND/PLUGIN_DIRS" ] || { echo "publish test: run-all.sh wrote no PLUGIN_DIRS" >&2; exit 1; }
if grep -rqF "$T" "$PUBLISHED/MANIFEST.txt"; then echo "publish test: the manifest holds a local path" >&2; exit 1; fi
if grep -rqF "$T/ours" "$PUB_ROUND/grade"/*.in; then echo "publish test: a plugin directory reached the grader text" >&2; exit 1; fi
[ -f "$PUBLISHED/criteria-labels.json" ] || { echo "publish test: criteria-labels.json not copied" >&2; exit 1; }
PLANTED="$(python3 -I -c 'print("".join(["some", "one", "@", "gm", "ail.com"]))')"
python3 -I - "$PUBLISHED" "$PLANTED" <<'PY'
import json, os, sys
root, planted = sys.argv[1], sys.argv[2]
parsed = 0
for folder, _, names in os.walk(root):
    for name in names:
        path = os.path.join(folder, name)
        with open(path, encoding="utf-8", errors="replace") as fh:
            data = fh.read()
        if planted in data:
            sys.exit("publish test: unredacted address left in " + name)
        if name == "run.jsonl":
            for line in data.splitlines():
                json.loads(line)  # every transcript line still parses after redaction
                parsed += 1
if parsed == 0:
    sys.exit("publish test: no transcript lines were checked")
print("publish test: %d transcript lines parse, no unredacted address" % parsed)
PY

# Publish refuses when tasks.json differs from the hash recorded at run time.
ORIGINAL_SHA="$(cat "$PUB_ROUND/TASKS_SHA256")"
printf '%064d\n' 0 > "$PUB_ROUND/TASKS_SHA256"
set +e
RESULTS_ROOT="$T/results" bash "$HERE/publish-results.sh" "$PUB_ROUND" changed > /dev/null 2> "$T/publish.log"
RC_PUB=$?
set -e
printf '%s\n' "$ORIGINAL_SHA" > "$PUB_ROUND/TASKS_SHA256"
[ "$RC_PUB" -ne 0 ] || { echo "publish test: publish accepted a changed tasks.json" >&2; exit 1; }
grep -q "differs from the hash" "$T/publish.log" || { echo "publish test: no refusal message" >&2; exit 1; }
echo "publish test: publish refuses a changed tasks.json"

echo "self-test OK"
