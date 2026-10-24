#!/bin/bash
source /private/tmp/r13/final/env.sh
rm -f $R/LIMIT_HIT; [ -f $R/f6-sample.json ] || python3 -I $R/f6-sample.py >> $LOG
say "F6 start"
python3 -I -c 'import json,re;c=json.load(open("'$R'/f6-sample.json"))["cells"]
print("\n".join(sorted({re.sub(r"-(ours|pp|ppi|hist|bf|base)-","-",x["cell"]) for x in c})))' > $R/f6-units.txt
python3 -I -c 'import json;print("\n".join(x["cell"] for x in json.load(open("'$R'/f6-sample.json"))["cells"]))' > $R/f6-cells.txt
cat $R/f6-units.txt | xargs -P2 -I{} bash $R/f6-grade-unit.sh {} >> $R/f6-grades.log 2>&1
[ -f $R/LIMIT_HIT ] && stop_state "usage limit or auth error in F6-grader"
say "F6-grader complete"
for pass in 1 2; do cat $R/f6-cells.txt | xargs -P3 -I{} bash $R/f6-run-cell.sh {} >> $R/f6-runs.log 2>&1; [ -f $R/LIMIT_HIT ] && stop_state "usage limit or auth error in F6-runs"; done
say "F6 complete"
