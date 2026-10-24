#!/usr/bin/env python3
"""Development-gate analysis: totals per group, bootstrap of ours minus the best other arm (seed 20261023, 10000 resamples over runs,
same draw for every arm of a task), clear-lead decision per ruling R13-5. usage: analyse.py [out-dir]"""
import json, math, random, sys, os
OUT = sys.argv[1] if len(sys.argv) > 1 else '/private/tmp/r13/final/out-F'
s = json.load(open(OUT + '/grade/scores.json'))
tasks = json.load(open('/private/tmp/r13/final/final-tasks.json'))['tasks']
ARMS = ['ours', 'pp', 'ppi', 'hist', 'bf', 'base']; OTH = ARMS[1:]
groups = {'SEALED z (5 tasks)': lambda t: t.startswith('HZ'), 'PUBLIC (11 tasks, development-seen)': lambda t: not t.startswith('HZ')}
def sc(t, a, n):
    r = s.get(t, {}).get(a, {}).get(str(n))
    return None if r is None else float(sum(1 for c in r['criteria'] if c['pass']))
def mean(x): return sum(x) / len(x)
res = {}
for g, f in groups.items():
    ids = [t['id'] for t in tasks if f(t['id']) and t['id'] in s]
    def arm_tot(a, draw=None):
        tot = 0.0
        for t in ids:
            runs = draw[t] if draw else [1, 2, 3]
            v = [sc(t, a, n) for n in runs]
            v = [x for x in v if x is not None]
            tot += mean(v) if v else 0.0
        return tot
    obs = {a: arm_tot(a) for a in ARMS}
    # pp/ppi: per-task better of the two
    def bestpp(draw=None):
        tot = 0.0
        for t in ids:
            runs = draw[t] if draw else [1, 2, 3]
            m = []
            for a in ('pp', 'ppi'):
                v = [sc(t, a, n) for n in runs]; v = [x for x in v if x is not None]
                if v: m.append(mean(v))
            tot += max(m) if m else 0.0
        return tot
    best = max(OTH, key=lambda a: (obs[a], -OTH.index(a)))
    rng = random.Random(20261023); diffs = {a: [] for a in OTH}; dpp = []
    for _ in range(10000):
        draw = {t: [rng.randint(1, 3) for _ in range(3)] for t in ids}
        o = arm_tot('ours', draw)
        for a in OTH: diffs[a].append(o - arm_tot(a, draw))
        dpp.append(o - bestpp(draw))
    def ci(d):
        d = sorted(d); return d[int(math.floor(0.025 * len(d)))], d[int(math.ceil(0.975 * len(d))) - 1]
    res[g] = dict(ids=ids, obs=obs, best=best, ci={a: ci(diffs[a]) for a in OTH}, ci_pp=ci(dpp), obs_pp=bestpp())
print('Final measurement (outcome criteria, mean of runs; 5 criteria per task)')
for g, r in res.items():
    mx = 5 * len(r['ids'])
    print(f"\n== {g}: {len(r['ids'])} tasks, max {mx}")
    print('totals:', ', '.join(f"{a} {r['obs'][a]:.2f}" for a in ARMS), f"| pp/ppi per-task best {r['obs_pp']:.2f}")
    for a in OTH:
        lo, hi = r['ci'][a]; print(f"  ours - {a}: {r['obs']['ours'] - r['obs'][a]:+.2f}  [{lo:+.2f}, {hi:+.2f}]" + ('  <- best other' if a == r['best'] else ''))
    lo, hi = r['ci_pp']; print(f"  ours - pp/ppi best-of: {r['obs']['ours'] - r['obs_pp']:+.2f}  [{lo:+.2f}, {hi:+.2f}]")
z = res['SEALED z (5 tasks)']; p = res['PUBLIC (11 tasks, development-seen)']
for name, r in (('SEALED z', z), ('PUBLIC', p)):
    lo = r['ci'][r['best']][0]
    print(f"I1 {name}: ours minus {r['best']} lower bound {lo:+.2f} -> {'I1 PASS' if lo > 0 else 'I1 FAIL'}")
# per-task table
print('\nper task (mean criteria, ours vs arms):')
for t in tasks:
    tid = t['id']
    if tid not in s: continue
    row = []
    for a in ARMS:
        v = [sc(tid, a, n) for n in (1, 2, 3)]; v = [x for x in v if x is not None]
        row.append(f"{mean(v):.2f}" if v else '-')
    print(tid, ' '.join(f"{a}={x}" for a, x in zip(ARMS, row)))
