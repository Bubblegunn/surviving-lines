#!/bin/bash
# F6-runs: fresh re-run of one sampled cell (task-arm-n), graded alone. 
source /private/tmp/r13/final/env.sh
cell=$1; n=${cell##*-}; rest=${cell%-*}; arm=${rest##*-}; task=${rest%-*}
export TASKS_FILE=$R/final-tasks.json
D=$R/f6r/$cell; mkdir -p $D
bash $B/run.sh $D $R/fixtures $arm $task $n > $D/run.log 2>&1
[ -f $D/runs/$task-$arm-$n/final.txt ] || { grep -qiE "$LIMIT_RE" $D/runs/$task-$arm-$n/run.jsonl 2>/dev/null && { echo "$cell LIMIT" >> $R/LIMIT_HIT; exit 9; }; echo "$cell run failed"; exit 1; }
for pass in 1 2 3 4; do
  python3 -I $B/gate-grade5.py $D $R/final-tasks.json $R/truth --cells $task-$n > $D/grade.log 2>&1
  grep -qiE "$LIMIT_RE" $D/grade.log && { echo "$cell" >> $R/LIMIT_HIT; exit 9; }
  grep -q 'did not parse\|failed\|err=' $D/grade.log || break
done
echo "$cell done"
