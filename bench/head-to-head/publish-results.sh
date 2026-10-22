#!/usr/bin/env bash
# Copies one graded round into results/<name>/ so that anyone can re-check it.
# Usage: publish-results.sh <out-dir> <name>
# Env: RESULTS_ROOT (default: results next to this script). The plugin directories come from
# <out-dir>/PLUGIN_DIRS (written by run-all.sh), not from the environment; the manifest gets
# their commit, describe, dirty file count and plugin version, and never the directory itself.
# Refuses when the folder has no TASKS_SHA256 (run-all.sh writes it) or when tasks.json
# no longer hashes to it. Copies every run.jsonl, final.txt, mailmap.txt and run.failed,
# the whole grade/ folder, tasks.json and criteria-labels.json as run, and a MANIFEST.txt.
# Then scrub.py redacts every e-mail address in the copy, and a final check fails the
# script if one remains. The graders saw unredacted transcripts. The copy does not.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?usage: publish-results.sh <out-dir> <name>}"
NAME="${2:?usage: publish-results.sh <out-dir> <name>}"
case "$NAME" in
  ''|.|..|*[!A-Za-z0-9._-]*)
    echo "name may only use letters, digits, dot, dash and underscore" >&2
    exit 2
    ;;
esac
if [ ! -d "$OUT/runs" ] || [ ! -d "$OUT/grade" ]; then
  echo "$OUT has no runs/ and grade/; grade the round first" >&2
  exit 1
fi
OUT="$(cd "$OUT" && pwd)"
if [ ! -f "$OUT/TASKS_SHA256" ]; then
  echo "$OUT has no TASKS_SHA256; the round was not started by run-all.sh" >&2
  exit 1
fi
HASH_CMD='import hashlib, sys
print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())'
if [ "$(cat "$OUT/TASKS_SHA256")" != "$(python3 -I -c "$HASH_CMD" "$HERE/tasks.json")" ]; then
  echo "tasks.json differs from the hash recorded when $OUT was run; publish refused" >&2
  exit 1
fi
ROOT="${RESULTS_ROOT:-$HERE/results}"
DEST="$ROOT/$NAME"
rm -rf "$DEST"
mkdir -p "$DEST"

# Only the files that a re-check needs, under the same relative paths as in the run folder.
while IFS= read -r file; do
  rel="${file#"$OUT"/}"
  mkdir -p "$DEST/$(dirname "$rel")"
  cp "$file" "$DEST/$rel"
done < <(find "$OUT/runs" -mindepth 2 -maxdepth 2 -type f \( -name run.jsonl -o -name final.txt -o -name mailmap.txt -o -name run.failed \))
cp -R "$OUT/grade" "$DEST/grade"
cp "$HERE/tasks.json" "$DEST/tasks.json"
cp "$HERE/criteria-labels.json" "$DEST/criteria-labels.json"

# Describes a plugin clone recorded in PLUGIN_DIRS: commit, describe, dirty path count and plugin version.
# The directory path is read here and not written to the manifest.
describe_dir() {
  local arm="$1" label="$2" dir version
  dir="$(python3 -I -c 'import json, sys
try:
    entry = json.load(open(sys.argv[1])).get(sys.argv[2])
except (OSError, ValueError):
    entry = None
print((entry.get("dir") if isinstance(entry, dict) else entry) or "")' "$OUT/PLUGIN_DIRS" "$arm")"
  if [ -z "$dir" ]; then
    echo "$label: not recorded in PLUGIN_DIRS"
    return
  fi
  version="$(python3 -I -c 'import json, sys
print(json.load(open(sys.argv[1])).get("version", "unknown"))' "$dir/.claude-plugin/plugin.json" 2>/dev/null || echo unknown)"
  echo "$label commit: $(git -C "$dir" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "$label describe: $(git -C "$dir" describe --always --dirty --tags 2>/dev/null || echo unknown)"
  echo "$label changed paths: $(git -C "$dir" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  echo "$label plugin version: $version"
}

{
  echo "repository commit: $(git -C "$HERE" rev-parse HEAD)"
  echo "claude version: $(claude --version 2>/dev/null || echo unknown)"
  echo "model: $(cat "$OUT/MODEL" 2>/dev/null || echo unknown)"
  echo "grader model: ${GRADER_MODEL:-claude-sonnet-5-5}"
  echo "date: $(date -u +%Y-%m-%d)"
  echo "node version: $(node --version 2>/dev/null || echo none)"
  echo "git version: $(git --version)"
  echo "tasks.json sha256: $(python3 -I -c "$HASH_CMD" "$DEST/tasks.json")"
  echo "criteria-labels.json sha256: $(python3 -I -c "$HASH_CMD" "$DEST/criteria-labels.json")"
  describe_dir ours "ours"
  describe_dir pp "project-pilot"
  echo "transcripts: redacted copy (every address other than *.example and noreply@anthropic.com is replaced; home, scratch and temp paths are replaced)"
} > "$DEST/MANIFEST.txt"

# The redaction runs over the whole copy, MANIFEST included, and then checks it.
python3 -I "$HERE/scrub.py" "$DEST"
python3 -I "$HERE/scrub.py" --check "$DEST"
echo "published $DEST"
