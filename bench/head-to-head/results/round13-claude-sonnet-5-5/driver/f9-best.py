#!/usr/bin/env python3
import json
R='/private/tmp/r13/final'; best={}
s=json.load(open(R+'/out-F/grade/scores.json'))
O=['pp','ppi','hist','bf']
for tid,arms in s.items():
    m={a:sum(sum(1 for c in r['criteria'] if c['pass']) for r in runs.values())/len(runs) for a,runs in arms.items() if a in O}
    best[tid]=max(O,key=lambda a:(m.get(a,-1),-O.index(a)))
json.dump(best,open(R+'/f9-best.json','w'),indent=1)
