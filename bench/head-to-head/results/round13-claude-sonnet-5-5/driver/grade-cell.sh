#!/bin/bash
# grade-cell.sh <task-n>: five-call grading with up to 3 re-ask passes
source /private/tmp/r13/final/env.sh
OUT=$R/out-F
for pass in 1 2 3 4; do
  python3 -I $B/gate-grade5.py $OUT $R/final-tasks.json $R/truth --cells $1 > $OUT/grade-$1.log 2>&1
  { grep -qiE "$LIMIT_RE" $OUT/grade-$1.log || grep -qiE "hit your (session|usage|weekly) limit|usage limit reached|weekly limit" $OUT/grade/$1.call*.out 2>/dev/null; } && { echo "$1" >> $R/LIMIT_HIT; exit 9; }
  grep -q 'did not parse\|failed\|err=' $OUT/grade-$1.log || break
  say "re-ask $1 pass $pass"
done
