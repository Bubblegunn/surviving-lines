#!/usr/bin/env bash
# Final-gate runner. Usage: run-gate.sh <out> <tasks-file> <fixtures-dir> <arms,comma> <runs> [tasks,comma]
# Env as run.sh (OURS_DIR PP_DIR HIST_DIR BF_DIR MODEL GUARD_CMD); PARALLEL (default 2).
# Runs every task on the given arms (ppi only when the task has ppInvokedPrompt), run numbers 1..<runs>.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$1"; TF="$2"; FIX="$3"; ARMS="$4"; RUNS="$5"; ONLY="${6:-}"
export TASKS_FILE="$(cd "$(dirname "$TF")" && pwd)/$(basename "$TF")"
JOBS="$(python3 -I -c 'import json, sys
tasks = json.load(open(sys.argv[1]))["tasks"]
arms = sys.argv[2].split(",")
only = [x for x in sys.argv[4].split(",") if x]
for n in range(1, int(sys.argv[3]) + 1):
    for t in tasks:
        if only and t["id"] not in only:
            continue
        for a in arms:
            if a == "ppi" and not isinstance(t.get("ppInvokedPrompt"), str):
                continue
            print(a, t["id"], n)' "$TASKS_FILE" "$ARMS" "$RUNS" "$ONLY")"
set +e
printf '%s\n' "$JOBS" | xargs -n 3 -P "${PARALLEL:-2}" bash "$HERE/run.sh" "$OUT" "$FIX"
set -e
[ -f "$OUT/GUARD_FAILED" ] && { echo "round stopped: $(cat "$OUT/GUARD_FAILED")" >&2; exit 3; }
FAILED=0
while read -r arm task n; do
  [ -f "$OUT/runs/$task-$arm-$n/final.txt" ] || { echo "no final.txt: $task $arm $n" >&2; FAILED=$((FAILED+1)); }
done <<< "$JOBS"
echo "finished, $FAILED missing"
