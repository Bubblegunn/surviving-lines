"""Ground truth for z4 (ruby-grape/grape-entity). Plain git only.

Conventions chosen:
 * Scope: tracked Ruby sources: *.rb, *.gemspec, Gemfile, Rakefile, Guardfile,
   Dangerfile (code and specs; no markdown/yaml).
 * Blame: git blame -w -M -C -C --line-porcelain with an ignore-revs file listing
   the dependabot commits (their edits replace single lines 1:1).  -C -C is needed so lines copied from an untouched file
   (NestingExposure -> GroupedExposure) are credited to the original author.
   Git follows the delegator -> delegators directory rename on its own.
 * Lines blamed on the commit that stamped a copyright header into every file are
   pure additions with no earlier version (git's ignore-revs heuristic would shift
   them onto neighbouring lines, so that commit is NOT in the ignore file); they are
   mechanical and are EXCLUDED from the totals; the count is reported.
 * Owner = author, never the committer (Anna Kowalczyk's patch was applied by Marco
   Silva).
 * Identities merged by alias table (the maintainer appears under 4 spellings of
   one address; other people under 2-3 addresses).
 * Bots own nothing.
 * 'Left' = no authored commit in the 365 days before 2026-11-15 (author date).
 * "Best reviewer" for a directory = the ACTIVE person owning most of its lines;
   if no active person owns a meaningful share, that is stated.
"""
import hashlib, subprocess, sys, os, re, collections, datetime, tempfile


def H(address):
    """SHA-256 of the trimmed, lower-cased address: addresses are compared as hashes only."""
    return hashlib.sha256(address.strip().lower().encode()).hexdigest()

REPO = sys.argv[1]
REF = datetime.date(2026, 11, 15)
cut = (REF - datetime.timedelta(days=365)).isoformat()


def git(*a):
    return subprocess.check_output(['git', '-C', REPO, *a], text=True, errors='replace',
                                   env={**os.environ, 'GIT_CONFIG_GLOBAL': '/dev/null',
                                        'GIT_CONFIG_SYSTEM': '/dev/null', 'LC_ALL': 'C'})


ALIASES = {
    'Daniel Doubrovkine': ['f0d1b9f8d9dedb5aa422043f62c0690c21e9ee635c937ccc5f3bf9368bb03394'],
    'Peter Scholz': ['83f40b290dd95aa00352e0e60e7611374adade4f62121130d9ee0cb677706939', 'e8ab32db592be7677a05cc9d08f690443358189ae08305ff74b1950ad14a7bee'],
    'Andrey Subbota': ['5eb58f8b1a46aaeaa64f7bd7f73b1608aa9abc700319ab9cddfaa06ab128343b'],
    'Marco Silva': ['a07081b6c341a9fbbec01262c1fe1433cb3c195391c5c141e069d4dc3fb42ea6', '7b60611849e94a47d0e5962dfa79a077b4813d51c00850c80825ff4f05457021'],
}
E2N = {e: k for k, v in ALIASES.items() for e in v}
BOT = re.compile(r'\[bot\]')


def canon(n, e):
    return E2N.get(H(e.strip('<>')), n)


log = [l.split('\t') for l in git('log', '--format=%H\t%an\t%ae\t%ad\t%s', '--date=short').splitlines()]
ign = [l[0] for l in log if BOT.search(l[1])]
mech_commits = {l[0] for l in log if l[4].startswith('Add copyright header to all')}
tmp = tempfile.NamedTemporaryFile('w', delete=False); tmp.write('\n'.join(ign) + '\n'); tmp.close()
allf = git('ls-files').split('\n')
scope = [f for f in allf if f and (f.endswith(('.rb', '.gemspec')) or os.path.basename(f) in ('Gemfile', 'Rakefile', 'Guardfile', 'Dangerfile'))]


def blame(f):
    res = collections.Counter(); mech = 0; sha = nm = em = None
    for line in git('blame', '-w', '-M', '-C', '-C', '--ignore-revs-file', tmp.name, '--line-porcelain', 'HEAD', '--', f).splitlines():
        if re.match(r'^[0-9a-f]{40} \d+ \d+', line):
            sha = line.split()[0]
        elif line.startswith('author '):
            nm = line[7:]
        elif line.startswith('author-mail '):
            em = line[12:]
        elif line.startswith('\t'):
            if sha in mech_commits:
                mech += 1
            else:
                res[canon(nm, em)] += 1
    return res, mech


per = {}; mech_total = 0
for f in scope:
    per[f], m = blame(f); mech_total += m
tot = collections.Counter()
for c in per.values():
    tot.update(c)
T = sum(tot.values())
last = {}; cc = collections.Counter()
for sha, an, ae, ad, s in log:
    if BOT.search(an):
        cc['BOT'] += 1; continue
    p = canon(an, ae); cc[p] += 1
    if p not in last or ad > last[p]:
        last[p] = ad
CT = sum(v for k, v in cc.items() if k != 'BOT')
st = lambda p: 'LEFT' if last[p] < cut else 'active'
rank = tot.most_common()
print('FIXTURE HEAD', git('rev-parse', 'HEAD').strip())
print('SCOPE', len(scope), 'ruby files,', T, 'attributable lines;', mech_total, 'mechanical lines excluded (copyright headers etc.)')
print(f"\n== surviving lines per person (>=1.5 pct) vs commit share (humans only: {CT} commits; bots {cc['BOT']})")
for n, c in rank:
    if c / T >= 0.015:
        print(f'  {n:22s} lines {c:5d} {100*c/T:5.1f}%   commits {cc[n]:3d} {100*cc[n]/CT:5.1f}%   last {last[n]} {st(n)}')
mc = max((k for k in cc if k != 'BOT'), key=lambda k: cc[k])
print('most commits:', mc, cc[mc], f'({100*cc[mc]/CT:.1f}%) -> owns {tot[mc]} lines ({100*tot[mc]/T:.1f}%), rank by lines #', [n for n, _ in rank].index(mc) + 1)
print('most surviving lines:', rank[0][0], f'{100*rank[0][1]/T:.1f}%')
cum = k = 0
for n, c in rank:
    cum += c; k += 1
    if cum / T >= 0.5:
        break
print('bus factor (>=50%):', k, [n for n, _ in rank[:k]], f'{100*cum/T:.1f}%')
lt = sum(c for n, c in tot.items() if last[n] < cut)
print(f'lines owned by people who left: {lt} = {100*lt/T:.1f}%; by active people: {100*(T-lt)/T:.1f}%')
print('\n== directory owners (>=5% of directory lines)')
for d in ('lib/grape_entity/exposure/', 'lib/grape_entity/delegators/', 'lib/grape_entity/condition/', 'lib/grape_entity/'):
    c = collections.Counter()
    for f in scope:
        if f.startswith(d):
            c.update(per[f])
    n = sum(c.values())
    print(f'-- {d} ({n} lines)')
    for p, k in c.most_common():
        if k / n >= 0.05:
            print(f'     {p:22s} {k:4d} {100*k/n:5.1f}%  last {last[p]} {st(p)}')
    act = sum(k for p, k in c.items() if last[p] >= cut)
    print(f'     lines owned by active people: {act} ({100*act/n:.1f}%)')
    ap = [(p, k) for p, k in c.most_common() if last[p] >= cut]
    print('     best active reviewer:', ap[0] if ap else None)
print('\n== hazard specifics')
for n in ('Lena Brandt', 'Marco Silva', 'Anna Kowalczyk'):
    print(f'  {n}: {tot.get(n,0)} lines ({100*tot.get(n,0)/T:.2f}%), commits {cc[n]}')
g = per['lib/grape_entity/exposure/grouped_exposure.rb']
print('  grouped_exposure.rb owners:', g.most_common(4), 'of', sum(g.values()))
print('  base.rb Anna lines:', per['lib/grape_entity/exposure/base.rb'].get('Anna Kowalczyk', 0))
os.unlink(tmp.name)
