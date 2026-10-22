#!/usr/bin/env bash
# One command for one round: builds the fixtures if missing, runs every task on
# every arm, grades blind, and prints the path of RESULTS.md.
# Usage: OURS_DIR=<this repository> PP_DIR=<project-pilot clone> [MODEL=haiku|opus|claude-...] \
#        bash rerun.sh <out-dir> [runs]
# runs defaults to 3. A new round needs a new <out-dir>: an existing grade/ is reused.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?usage: rerun.sh <out-dir> [runs]}"
RUNS="${2:-3}"
: "${OURS_DIR:?set OURS_DIR to this repository}"
: "${PP_DIR:?set PP_DIR to the project-pilot plugin clone}"
MODEL="${MODEL:-claude-sonnet-5-5}"
case "$MODEL" in
  haiku|opus|claude-*) ;;
  *)
    echo "MODEL must be haiku, opus or a full claude-* model id, not '$MODEL'" >&2
    exit 2
    ;;
esac
export MODEL

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
if [ ! -f "$OUT/fixtures/reformat-sha.txt" ]; then
  bash "$HERE/build-fixture.sh" "$OUT/fixtures"
fi
bash "$HERE/run-all.sh" "$OUT" "$RUNS"
python3 -I "$HERE/grade.py" "$OUT"
echo "$OUT/grade/RESULTS.md"
