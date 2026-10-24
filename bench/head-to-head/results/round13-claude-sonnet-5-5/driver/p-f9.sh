#!/bin/bash
source /private/tmp/r13/final/env.sh
rm -f $R/LIMIT_HIT; [ -f $R/f9-best.json ] || python3 -I $R/f9-best.py
for m in claude-haiku-5-5 claude-opus-5-5; do
  say "F9 $m start"
  python3 -I -c 'import json
b=json.load(open("'$R'/f9-best.json"))
for t,r in b.items():
    for a in ("ours","base",r): print("'$m'",t,a)' | sort -u > $R/f9-jobs-$m.txt
  for pass in 1 2; do xargs -P3 -n3 bash $R/f9-run.sh < $R/f9-jobs-$m.txt >> $R/f9-runs.log 2>&1; done
  [ -f $R/LIMIT_HIT ] && stop_state "usage limit or auth error in F9 runs ($m)"
  awk '{print $2}' $R/f9-jobs-$m.txt | sort -u | sed "s/^/$m /" | xargs -P2 -n2 bash $R/f9-grade.sh >> $R/f9-grades.log 2>&1
  [ -f $R/LIMIT_HIT ] && stop_state "usage limit or auth error in F9 grading ($m)"
  say "F9 $m complete"
done
