#!/bin/bash
# p-grade.sh <task-regex> [parallel-units]: grade the (task, run) units whose task id matches, then the reverse pass for err criteria.
source /private/tmp/r13/final/env.sh
OUT=$R/out-F; PAT="${1:-.*}"; PAR="${2:-2}"; rm -f $R/LIMIT_HIT
say "grading start ($PAT)"
python3 -I -c 'import json,sys
for t in json.load(open(sys.argv[1]))["tasks"]:
    for n in (1,2,3): print(t["id"]+"-"+str(n))' $R/final-tasks.json | grep -E "^($PAT)-[0-9]\$" | xargs -P$PAR -I{} bash $R/grade-cell.sh {} >> $R/grades.log 2>&1
[ -f $R/LIMIT_HIT ] && stop_state "usage limit or auth error while grading: $(tr '\n' ' ' < $R/LIMIT_HIT)"
NC=$(python3 -I -c 'import json
s=json.load(open("'$OUT'/grade/scores.json"))
print(len(set((t,n) for t,a in s.items() for arm,runs in a.items() for n,r in runs.items() if any(c["pass"] is None for c in r["criteria"]))))')
[ "$NC" -gt 0 ] && python3 -I $B/gate-grade5.py $OUT $R/final-tasks.json $R/truth --reverse >> $OUT/reverse.log 2>&1
say "grading complete ($PAT; $NC cells needed the reverse pass)"
