#!/usr/bin/env python3
"""Development-gate analysis: totals per group, bootstrap of ours minus the best other arm (seed 20261023, 10000 resamples over runs,
same draw for every arm of a task), clear-lead decision per ruling R13-5. usage: analyse.py [out-dir]"""
import json, math, random, sys, os
OUT = sys.argv[1] if len(sys.argv) > 1 else '/private/tmp/r13/gate2/out-G'
s = json.load(open(OUT + '/grade/scores.json'))
tasks = json.load(open('/private/tmp/r13/gate2/gate-tasks.json'))['tasks']
ARMS = ['ours', 'pp', 'ppi', 'hist', 'bf', 'base']; OTH = ARMS[1:]
groups = {'dev (fresh writers a,b,c)': lambda t: t.startswith('D'), 'e (seen)': lambda t: t.startswith('HE'), 'f (seen)': lambda t: t.startswith('HF')}
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
print('Development gate (outcome criteria, mean of runs; 5 criteria per task)')
for g, r in res.items():
    mx = 5 * len(r['ids'])
    print(f"\n== {g}: {len(r['ids'])} tasks, max {mx}")
    print('totals:', ', '.join(f"{a} {r['obs'][a]:.2f}" for a in ARMS), f"| pp/ppi per-task best {r['obs_pp']:.2f}")
    for a in OTH:
        lo, hi = r['ci'][a]; print(f"  ours - {a}: {r['obs']['ours'] - r['obs'][a]:+.2f}  [{lo:+.2f}, {hi:+.2f}]" + ('  <- best other' if a == r['best'] else ''))
    lo, hi = r['ci_pp']; print(f"  ours - pp/ppi best-of: {r['obs']['ours'] - r['obs_pp']:+.2f}  [{lo:+.2f}, {hi:+.2f}]")
# clear lead per R13-5: dev union lower bound > 0, and ours not behind best other in total on e and f
dev = res['dev (fresh writers a,b,c)']; e = res['e (seen)']; f = res['f (seen)']
c1 = dev['ci'][dev['best']][0] > 0
c2 = e['obs']['ours'] >= max(e['obs'][a] for a in OTH) and f['obs']['ours'] >= max(f['obs'][a] for a in OTH)
print(f"\nR13-5: dev lower bound vs best other ({dev['best']}) = {dev['ci'][dev['best']][0]:+.2f} -> {'ok' if c1 else 'NOT ok'}; ours not behind best other in total on e and f -> {'ok' if c2 else 'NOT ok'}")
print('CLEAR LEAD' if c1 and c2 else 'NO CLEAR LEAD')
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
