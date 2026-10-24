#!/bin/bash
# all runs of the gate: run numbers 1..3, six arms, failed cells re-run (3 tries). Cells that hit a limit are moved to set-aside/.
source /private/tmp/r13/final/env.sh
TASKS="$1"; OUT=$R/out-F; TF=$R/final-tasks.json; FIX=$R/fixtures
mkdir -p $R/set-aside
say "runs start"
for n in 1 2 3; do
  for try in 1 2 3; do
    bash $B/run-gate.sh $OUT $TF $FIX ours,pp,ppi,hist,bf,base $n "$TASKS" >> $LOG 2>&1 && break
    [ -f $OUT/GUARD_FAILED ] && stop_state "guard failed in run $n: $(cat $OUT/GUARD_FAILED)"
    if L=$(limit_in_dir $OUT); then
      for d in $OUT/runs/*/; do [ -f $d/final.txt ] || mv $d $R/set-aside/; done
      stop_state "usage limit or auth error in run $n: $L (failed cells moved to set-aside)"
    fi
  done
  say "runs $n done"
done
say "runs complete"
