#!/usr/bin/env python3
"""f6-sample.json: ceil(0.10 x N) of the N graded cells, random.Random(20261023).sample over the sorted cell names."""
import json, math, random
R = '/private/tmp/r13/final'
s = json.load(open(R + '/out-F/grade/scores.json'))
cells = {}
for tid, arms in s.items():
    for arm, runs in arms.items():
        for n, rec in runs.items():
            cells[f'{tid}-{arm}-{n}'] = ('sealed-z' if tid.startswith('HZ') else 'public', [c['pass'] for c in rec['criteria']])
names = sorted(cells); k = math.ceil(0.10 * len(names))
pick = random.Random(20261023).sample(names, k)
json.dump({'seed': 20261023, 'graded_cells': len(names), 'cells': [{'cell': c, 'set': cells[c][0], 'original': cells[c][1]} for c in pick]}, open(R + '/f6-sample.json', 'w'), indent=1)
print(len(names), k)
