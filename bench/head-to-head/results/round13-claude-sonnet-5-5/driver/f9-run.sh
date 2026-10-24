#!/bin/bash
source /private/tmp/r13/final/env.sh
m=$1; task=$2; arm=$3; export MODEL=$m TASKS_FILE=$R/final-tasks.json
O=$R/f9/$m; mkdir -p $O
bash $B/run.sh $O $R/fixtures $arm $task 1 > $O/run-$task-$arm.log 2>&1; rc=$?
[ -f $O/runs/$task-$arm-1/final.txt ] || { grep -qiE "$LIMIT_RE" $O/runs/$task-$arm-1/run.jsonl 2>/dev/null && echo "$m $task $arm LIMIT" >> $R/LIMIT_HIT; }
echo "$m $task $arm rc=$rc"
