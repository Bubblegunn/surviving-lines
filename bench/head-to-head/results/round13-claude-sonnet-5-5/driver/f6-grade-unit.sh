#!/bin/bash
# F6-grader: original answers of one unit (task-n, all arms) graded again by fresh sessions; no reverse pass.
source /private/tmp/r13/final/env.sh
u=$1; n=${u##*-}; task=${u%-*}
D=$R/f6g/$u; mkdir -p $D/runs
for d in $R/out-F/runs/$task-*-$n; do
  b=$(basename $d); mkdir -p $D/runs/$b; cp $d/final.txt $D/runs/$b/; [ -f $d/mailmap.txt ] && cp $d/mailmap.txt $D/runs/$b/
done
for pass in 1 2 3 4; do
  python3 -I $B/gate-grade5.py $D $R/final-tasks.json $R/truth --cells $u > $D/grade.log 2>&1
  { grep -qiE "$LIMIT_RE" $D/grade.log || grep -qiE "hit your (session|usage|weekly) limit|usage limit reached|weekly limit" $D/grade/$u.call*.out 2>/dev/null; } && { echo "$u" >> $R/LIMIT_HIT; exit 9; }
  grep -q 'did not parse\|failed\|err=' $D/grade.log || break
done
echo "$u done"
