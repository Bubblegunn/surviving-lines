#!/bin/bash
source /private/tmp/r13/final/env.sh
m=$1; task=$2; D=$R/f9/$m
for pass in 1 2 3 4; do
  python3 -I $B/gate-grade5.py $D $R/final-tasks.json $R/truth --cells $task-1 > $D/grade-$task.log 2>&1
  { grep -qiE "$LIMIT_RE" $D/grade-$task.log || grep -qiE "hit your (session|usage|weekly) limit|usage limit reached|weekly limit" $D/grade/$task-1.call*.out 2>/dev/null; } && { echo "$m $task" >> $R/LIMIT_HIT; exit 9; }
  grep -q 'did not parse\|failed\|err=' $D/grade-$task.log || break
done
echo "$m $task graded"
