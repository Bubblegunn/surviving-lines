#!/bin/bash
source /private/tmp/r13/final/env.sh
PUB='T1|T2|T3|T4|T1i|T4i|E1|E2k|E3|E4h|E5'
say "FINAL DRIVE START product 8af57f4"
bash $R/p-runs.sh "HZ1,HZ2,HZ3,HZ4,HZ5" || exit 9
bash $R/p-grade.sh 'HZ[1-5]' 1 >/dev/null 2>&1 &
GZ=$!
bash $R/p-runs.sh "T1,T2,T3,T4,T1i,T4i,E1,E2k,E3,E4h,E5" || { wait $GZ; exit 9; }
wait $GZ
[ -f $R/STATE.md ] && exit 9
bash $R/p-grade.sh "$PUB" 2 || exit 9
python3 -I $R/analyse.py > $R/ANALYSIS.txt 2>&1
bash $R/p-f6.sh || exit 9
bash $R/p-f9.sh || exit 9
say "FINAL DONE"
