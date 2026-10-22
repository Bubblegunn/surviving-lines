#!/usr/bin/env bash
# Builds the fixtures if they are missing, then runs every task for every arm.
# Usage: run-all.sh <out-dir> <runs-per-cell>
# Env: OURS_DIR and PP_DIR are required, each a plugin clone; MODEL and GUARD_CMD
# are passed through to run.sh. The ppi arm is skipped for tasks with no
# ppInvokedPrompt. At most three run.sh processes run at once.
# The folder gets PLUGIN_DIRS (arm to plugin directory, commit and version) and TASKS_SHA256 (the hash of tasks.json at run time). A failed guard
# writes GUARD_FAILED; the round then stops and this script exits 3.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?usage: run-all.sh <out-dir> <runs-per-cell>}"
RUNS="${2:?usage: run-all.sh <out-dir> <runs-per-cell>}"
case "$RUNS" in
  ''|*[!0-9]*)
    echo "runs-per-cell must be a whole number" >&2
    exit 2
    ;;
esac
: "${OURS_DIR:?set OURS_DIR to this repository}"
: "${PP_DIR:?set PP_DIR to the project-pilot plugin directory}"
for dir in "$OURS_DIR" "$PP_DIR"; do
  if [ ! -f "$dir/.claude-plugin/plugin.json" ]; then
    echo "run-all.sh: '$dir' has no .claude-plugin/plugin.json; OURS_DIR and PP_DIR must be plugin clones" >&2
    exit 2
  fi
done

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
if [ -f "$OUT/GUARD_FAILED" ]; then
  echo "round stopped earlier by a failed guard: $(cat "$OUT/GUARD_FAILED")" >&2
  echo "remove $OUT/GUARD_FAILED only after the cause is fixed, then run again" >&2
  exit 3
fi
TASKS_SHA="$(python3 -I -c 'import hashlib, sys
print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$HERE/tasks.json")"
# One folder, one task file: publish-results.sh refuses a copy whose tasks.json differs.
if [ -f "$OUT/TASKS_SHA256" ] && [ "$(cat "$OUT/TASKS_SHA256")" != "$TASKS_SHA" ]; then
  echo "tasks.json changed since this folder was started; use a new out-dir" >&2
  exit 2
fi
printf '%s\n' "$TASKS_SHA" > "$OUT/TASKS_SHA256"
# The directory, commit and version of each arm's plugin, recorded once at the start. grade.py reads it to
# blind the command lines, and publish-results.sh reads it for the manifest instead of the environment.
python3 -I - "$OUT/PLUGIN_DIRS" "$OURS_DIR" "$PP_DIR" <<'PY'
import json, os, subprocess, sys

dest, ours, pp = sys.argv[1:4]


def describe(path):
    given = os.path.abspath(path)
    path = os.path.realpath(path)
    try:
        commit = subprocess.run(["git", "-C", path, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip() or None
    except OSError:
        commit = None
    try:
        version = json.load(open(os.path.join(path, ".claude-plugin", "plugin.json"))).get("version")
    except (OSError, ValueError):
        version = None
    return {"dir": given, "realDir": path, "commit": commit, "version": version}


data = {"ours": describe(ours), "pp": describe(pp), "ppi": describe(pp), "base": {"dir": os.path.join(os.path.dirname(dest), "baseline"), "commit": None, "version": "0.0.0"}}
tmp = dest + ".tmp"
with open(tmp, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
os.replace(tmp, dest)
PY
FIX="$OUT/fixtures"
if [ ! -f "$FIX/reformat-sha.txt" ]; then
  bash "$HERE/build-fixture.sh" "$FIX"
fi

# One "arm task run" line per job, in run order, then three jobs per xargs call.
JOBS="$(python3 -I -c 'import json, sys
tasks = json.load(open(sys.argv[1]))["tasks"]
for n in range(1, int(sys.argv[2]) + 1):
    for task in tasks:
        arms = ["ours", "pp"]
        if isinstance(task.get("ppInvokedPrompt"), str):
            arms.append("ppi")
        for arm in arms + ["base"]:
            print(arm, task["id"], n)' "$HERE/tasks.json" "$RUNS")"
# JOBS_ONLY (optional) is an extended regular expression; only the "arm task run" lines that match it run.
# Round 4 uses it to run T3 for every arm and every task for ours.
if [ -n "${JOBS_ONLY:-}" ]; then
  JOBS="$(printf '%s\n' "$JOBS" | grep -E "$JOBS_ONLY" || true)"
  [ -n "$JOBS" ] || { echo "JOBS_ONLY matched no job" >&2; exit 2; }
fi
# xargs exits non-zero when any job fails; the list below is the real check.
# A run that fails its guard exits 3 and writes GUARD_FAILED. Later runs check that file
# first and exit without starting, so the round stops. xargs exit status is not used for this.
set +e
printf '%s\n' "$JOBS" | xargs -n 3 -P "${PARALLEL:-3}" bash "$HERE/run.sh" "$OUT" "$FIX"
set -e
if [ -f "$OUT/GUARD_FAILED" ]; then
  echo "round stopped: $(cat "$OUT/GUARD_FAILED")" >&2
  exit 3
fi

FAILED=""
FAILED_COUNT=0
while read -r arm task n; do
  if [ ! -f "$OUT/runs/$task-$arm-$n/final.txt" ]; then
    FAILED="$FAILED$task $arm $n
"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi
done <<EOF_JOBS
$JOBS
EOF_JOBS

if [ "$FAILED_COUNT" -ne 0 ]; then
  echo "$FAILED_COUNT run(s) have no final.txt (rerun run-all.sh to retry them):" >&2
  printf '%s' "$FAILED" | sed 's/^/  /' >&2
  exit 1
fi
echo "all runs finished under $OUT/runs"
