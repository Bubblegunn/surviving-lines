#!/usr/bin/env bash
# Runs one task for one arm on a fresh copy of its fixture, then writes final.txt.
# Usage: run.sh <out-dir> <fixtures-dir> <arm> <task-id> <run-number>
# Arms: ours (OURS_DIR), pp (PP_DIR, the task's prompt), ppi (PP_DIR, the task's
# ppInvokedPrompt, skipped with exit 0 when that is null), base (an empty plugin
# in <out-dir>/baseline).
# Env: MODEL (default claude-sonnet-5-5, recorded in <out-dir>/MODEL; a folder
#      started with another model is refused).
#      GUARD_CMD (optional): run for the pp and ppi arms as "$GUARD_CMD before <run-dir>"
#      before claude and "$GUARD_CMD after <run-dir>" after it. A non-zero exit writes
#      <out-dir>/GUARD_FAILED and exits 3, and run-all.sh then stops the round.
# A run whose final.txt exists is skipped. A run does not start when GUARD_FAILED exists.
# final.txt is written only when claude exits 0 and its log has a result line.
# Otherwise the run leaves run.failed with the reason and exits 1, so a retry runs it again.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
if [ "$#" -ne 5 ]; then
  echo "usage: run.sh <out-dir> <fixtures-dir> <arm> <task-id> <run-number>" >&2
  exit 2
fi
mkdir -p "$1"
OUT="$(cd "$1" && pwd)"
FIX="$(cd "$2" && pwd)"
ARM="$3"
TASK="$4"
N="$5"
MODEL="${MODEL:-claude-sonnet-5-5}"
# TASKS_FILE (optional): another task list in the tasks.json format, for the final gate.
TASKS_FILE="${TASKS_FILE:-$HERE/tasks.json}"

# The round stops for good once a guard has failed, so no later run may start.
if [ -f "$OUT/GUARD_FAILED" ]; then
  echo "not started $TASK $ARM $N: the round was stopped by a failed guard (see $OUT/GUARD_FAILED)" >&2
  exit 3
fi
# One folder holds one model. A mixed folder would make the report wrong.
if [ -f "$OUT/MODEL" ] && [ "$(cat "$OUT/MODEL")" != "$MODEL" ]; then
  echo "run.sh: $OUT was started with MODEL=$(cat "$OUT/MODEL"), not $MODEL; use a new out-dir for another model" >&2
  exit 2
fi

# A competitor or our plugin must be a plugin clone, or claude would run with no plugin at all.
require_plugin() {
  if [ ! -f "$1/.claude-plugin/plugin.json" ]; then
    echo "run.sh: $2 directory '$1' has no .claude-plugin/plugin.json; set it to a plugin clone (claude --plugin-dir needs it)" >&2
    exit 2
  fi
}

case "$ARM" in
  ours)
    PLUGIN="${OURS_DIR:?set OURS_DIR to this repository}"
    require_plugin "$PLUGIN" OURS_DIR
    ;;
  pp|ppi)
    PLUGIN="${PP_DIR:?set PP_DIR to the project-pilot plugin directory}"
    require_plugin "$PLUGIN" PP_DIR
    ;;
  hist)
    PLUGIN="${HIST_DIR:?set HIST_DIR to the mcp-git-historian plugin wrapper}"
    require_plugin "$PLUGIN" HIST_DIR
    ;;
  bf)
    PLUGIN="${BF_DIR:?set BF_DIR to the busfactor plugin wrapper}"
    require_plugin "$PLUGIN" BF_DIR
    ;;
  base)
    PLUGIN="$OUT/baseline"
    mkdir -p "$PLUGIN/.claude-plugin"
    # Written once and renamed into place, so parallel runs never read a half-written file.
    if [ ! -f "$PLUGIN/.claude-plugin/plugin.json" ]; then
      tmp="$(mktemp "$PLUGIN/.plugin.XXXXXX")"
      printf '{"name":"baseline","version":"0.0.0"}\n' > "$tmp"
      mv "$tmp" "$PLUGIN/.claude-plugin/plugin.json"
    fi
    ;;
  *)
    echo "unknown arm: $ARM" >&2
    exit 2
    ;;
esac
# claude runs from inside the copied repo, so the plugin path must be absolute.
PLUGIN="$(cd "$PLUGIN" && pwd)"
[ -f "$OUT/MODEL" ] || printf '%s\n' "$MODEL" > "$OUT/MODEL"
# run-all.sh records every arm's plugin directory. A run started on its own records just its arm, once, so grade.py
# can still blind the command lines. Written and renamed into place, so parallel runs never read half a file.
if [ ! -f "$OUT/PLUGIN_DIRS" ]; then
  tmp="$(mktemp "$OUT/.plugin-dirs.XXXXXX")"
  python3 -I -c 'import json, sys
json.dump({sys.argv[1]: {"dir": sys.argv[2], "commit": None, "version": None}}, open(sys.argv[3], "w"))' "$ARM" "$PLUGIN" "$tmp"
  mv -n "$tmp" "$OUT/PLUGIN_DIRS" 2>/dev/null || true
  rm -f "$tmp"
fi

RUN="$OUT/runs/$TASK-$ARM-$N"
if [ -f "$RUN/final.txt" ]; then
  echo "skip $TASK $ARM $N (final.txt exists)"
  exit 0
fi

# Prints one task field. Exit 3 when the field is null, 2 for an unknown task.
task_field() {
  python3 -I -c 'import json, sys
tasks = json.load(open(sys.argv[1]))["tasks"]
match = [t for t in tasks if t["id"] == sys.argv[2]]
if not match:
    sys.exit(2)
value = match[0].get(sys.argv[3])
if value is None:
    sys.exit(3)
print(value)' "$TASKS_FILE" "$TASK" "$1"
}

FIELD=prompt
[ "$ARM" = ppi ] && FIELD=ppInvokedPrompt
set +e
PROMPT="$(task_field "$FIELD")"
FIELD_RC=$?
set -e
case "$FIELD_RC" in
  0) ;;
  3)
    echo "skip $TASK $ARM: tasks.json has no ppInvokedPrompt for this task"
    exit 0
    ;;
  *)
    echo "unknown task: $TASK" >&2
    exit 2
    ;;
esac
VARIANT="$(python3 -I -c 'import json, sys
tasks = json.load(open(sys.argv[1]))["tasks"]
print([t for t in tasks if t["id"] == sys.argv[2]][0]["fixture"])' "$TASKS_FILE" "$TASK")"

if [ ! -d "$FIX/$VARIANT" ]; then
  echo "missing fixture: $FIX/$VARIANT" >&2
  exit 1
fi

# True when the stream-json log has at least one line with "type":"result".
has_result() {
  python3 -I -c 'import json, re, sys
for line in open(sys.argv[1], encoding="utf-8", errors="replace"):
    try:
        d = json.loads(line)
        if d.get("type") == "result":
            # A rate-limited or otherwise failed call also ends with a result event: it is not an answer.
            text = str(d.get("result") or "")
            bad = d.get("is_error") is True or d.get("api_error_status") not in (None, 0) or re.search(r"hit your (session|usage|weekly) limit|rate[ _]limit|usage limit reached|HTTP 429", text, re.I)
            sys.exit(1 if bad else 0)
    except (ValueError, AttributeError):
        continue
sys.exit(1)' "$1"
}

# The guard is for the competitor arms only: it checks that the run did not change the
# plugin's own configuration. Its snapshot lives in the run folder. A failure stops the
# whole round: GUARD_FAILED records why, and run-all.sh reads it and exits 3.
guard() {
  [ -n "${GUARD_CMD:-}" ] || return 0
  case "$ARM" in pp|ppi|hist|bf) ;; *) return 0 ;; esac
  local rc=0
  "$GUARD_CMD" "$1" "$RUN" || rc=$?
  if [ "$rc" -ne 0 ]; then
    printf 'guard %s exited %s for %s %s %s (run folder %s)\n' "$1" "$rc" "$TASK" "$ARM" "$N" "$RUN" > "$OUT/GUARD_FAILED"
    echo "FAILED $TASK $ARM $N: $(cat "$OUT/GUARD_FAILED"); the round is stopped" >&2
    exit 3
  fi
}

rm -rf "$RUN"
mkdir -p "$RUN"
cp -R "$FIX/$VARIANT" "$RUN/repo"
cd "$RUN/repo"
guard before
# The hist arm is an MCP server: --strict-mcp-config ignores a plugin's own .mcp.json, so its server comes from --mcp-config.
MCP_ARGS=()
[ "$ARM" = hist ] && MCP_ARGS=(--mcp-config "$PLUGIN/.mcp.json")
set +e
claude -p "$PROMPT" \
  --setting-sources project \
  --plugin-dir "$PLUGIN" \
  --model "$MODEL" \
  --dangerously-skip-permissions \
  --strict-mcp-config \
  ${MCP_ARGS[@]+"${MCP_ARGS[@]}"} \
  --output-format stream-json \
  --verbose > "$RUN/run.jsonl" 2>&1 < /dev/null
CLAUDE_RC=$?
set -e

guard after
REASON=""
if [ "$CLAUDE_RC" -ne 0 ]; then
  REASON="claude exited $CLAUDE_RC"
elif ! has_result "$RUN/run.jsonl"; then
  REASON="no result line in run.jsonl"
fi

if [ -n "$REASON" ]; then
  rm -f "$RUN/final.txt"
  echo "$REASON" > "$RUN/run.failed"
  echo "FAILED $TASK $ARM $N: $REASON (log kept at $RUN/run.jsonl)" >&2
  exit 1
fi

PLUGIN_NAME="$(python3 -I -c 'import json, sys
print(json.load(open(sys.argv[1]))["name"])' "$PLUGIN/.claude-plugin/plugin.json")"
# summarize.py writes the PLUGIN_NAME, PLUGIN_LOADED and SKILLS header that grade.py reads.
python3 -I "$HERE/summarize.py" "$RUN/run.jsonl" "$PLUGIN_NAME" > "$RUN/final.txt"
rm -f "$RUN/run.failed"
if [ -f "$RUN/repo/.mailmap" ]; then
  cp "$RUN/repo/.mailmap" "$RUN/mailmap.txt"
fi
echo "done $TASK $ARM $N"
