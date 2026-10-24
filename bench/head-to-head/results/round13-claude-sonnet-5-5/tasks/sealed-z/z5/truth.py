"""Ground truth for z5 (ramsey/collection). Plain git only.

Conventions chosen:
 * Scope: tracked *.php files (src/ and tests/, incl. tests/stubs and tests/types),
   excluding files that carry an '@generated' marker (src/Generated/TypeMap.php).
   Results are reported for src/, for tests/ and combined.
 * Blame: git blame -w -M -C --line-porcelain with an ignore-revs file holding
   (a) the mechanical namespace/directory rename Tool -> Support and (b) the
   github-actions php-cs-fixer commit (1:1 line rewrites).  Git follows the
   renamed directories on its own.
 * Owner = author field, EXCEPT a squash commit whose message carries an
   'Original authorship: NAME <EMAIL>' line: its lines belong to that person
   (the maintainer only pressed the button; the commit author field is Ben's).
 * Identities merged by alias table: Ben Ramsey (2 addresses), Tomasz Wrona (2),
   Katarzyna/Kasia Nowak (2 addresses, same PR).  The repo's .mailmap is partial
   and is not trusted.
 * Bots own nothing.
 * 'Left' = no authored commit in the 365 days before 2026-12-01 (author date).
 * 'Main loss if Ben left' = Ben's share of lines plus, per area, whether the
   remaining active authors cover the rest.
"""
import hashlib, subprocess, sys, os, re, collections, datetime, tempfile


def H(address):
    """SHA-256 of the trimmed, lower-cased address: addresses are compared as hashes only."""
    return hashlib.sha256(address.strip().lower().encode()).hexdigest()

REPO = sys.argv[1]
REF = datetime.date(2026, 12, 1)
cut = (REF - datetime.timedelta(days=365)).isoformat()


def git(*a):
    return subprocess.check_output(['git', '-C', REPO, *a], text=True, errors='replace',
                                   env={**os.environ, 'GIT_CONFIG_GLOBAL': '/dev/null',
                                        'GIT_CONFIG_SYSTEM': '/dev/null', 'LC_ALL': 'C'})


ALIASES = {
    'Ben Ramsey': ['f514481fa9cfdfd5dbcaccb3e5b480f18ea05ebf331cddf9b1c5a2a96a78fef5', '7adaa12b77d33b62ef80bebf503b4c1edaf4a1c55e6ddb9edcd23a77563a92b6'],
    'Tomasz Wrona': ['5bf3174b6418957eea7a3aa2a266fc7a98fd1cbe1388c3ff0225dc23b151a6b4', '0f5afdc9df611497e5d158d2c2108846cfb00f7860f7b1f91b015d8e595a2b89'],
    'Katarzyna Nowak': ['460755abf08496b8b2f5364291814548442f69c9fa1a8c3f554a8357b59c42b8', '5e0d8fb160917db3a9e7926dac268e18f7ad7eabf163c82a17f3b7da2daa68da'],
}
E2N = {e: k for k, v in ALIASES.items() for e in v}
BOT = re.compile(r'\[bot\]')


def canon(n, e):
    return E2N.get(H(e.strip('<>')), n)


log = [l.split('\t') for l in git('log', '--format=%H\t%an\t%ae\t%ad\t%s', '--date=short').splitlines()]
ign = [l[0] for l in log if BOT.search(l[1]) or l[4].startswith('Rename Tool namespace to Support')]
squash = {}
for l in log:
    m = re.search(r'^Original authorship: (.+?) <(.+?)>$', git('log', '-1', '--format=%B', l[0]), re.M)
    if m:
        squash[l[0]] = canon(m.group(1), m.group(2))
tmp = tempfile.NamedTemporaryFile('w', delete=False); tmp.write('\n'.join(ign) + '\n'); tmp.close()
files = [f for f in git('ls-files', '*.php').split('\n') if f]
gen = [f for f in files if '@generated' in git('show', 'HEAD:' + f)]
scope = [f for f in files if f not in gen]


def blame(f):
    res = collections.Counter(); sha = nm = em = None
    for line in git('blame', '-w', '-M', '-C', '--ignore-revs-file', tmp.name, '--line-porcelain', 'HEAD', '--', f).splitlines():
        if re.match(r'^[0-9a-f]{40} \d+ \d+', line):
            sha = line.split()[0]
        elif line.startswith('author '):
            nm = line[7:]
        elif line.startswith('author-mail '):
            em = line[12:]
        elif line.startswith('\t'):
            res[squash.get(sha) or canon(nm, em)] += 1
    return res


per = {f: blame(f) for f in scope}
last = {}; cc = collections.Counter()
for sha, an, ae, ad, s in log:
    if BOT.search(an):
        cc['BOT'] += 1; continue
    p = canon(an, ae); cc[p] += 1
    if p not in last or ad > last[p]:
        last[p] = ad
CT = sum(v for k, v in cc.items() if k != 'BOT')
st = lambda p: 'LEFT' if last.get(p, '0') < cut else 'active'
print('FIXTURE HEAD', git('rev-parse', 'HEAD').strip())
print('SCOPE', len(scope), 'php files; generated excluded:', gen)
for label, pre in (('src/', 'src/'), ('tests/', 'tests/'), ('ALL', '')):
    c = collections.Counter()
    for f in scope:
        if f.startswith(pre):
            c.update(per[f])
    T = sum(c.values())
    print(f'\n== {label}: {T} lines; owners >= 1.5 pct')
    for n, k in c.most_common():
        if k / T >= 0.015:
            print(f'  {n:22s} {k:5d} {100*k/T:5.1f}%  commits {cc[n]:3d}  last {last[n]} {st(n)}')
    act = sum(k for n, k in c.items() if st(n) == 'active')
    lft = T - act
    print(f'  lines owned by people who left: {lft} = {100*lft/T:.1f}%   by active people: {100*act/T:.1f}%')
    ben = c['Ben Ramsey']
    print(f'  if Ben Ramsey left: {ben} lines ({100*ben/T:.1f}%) lose their author; lines with no active author = {100*(ben+lft-(ben if st("Ben Ramsey")=="LEFT" else 0))/T:.1f}%')
    cum = i = 0
    for n, k in c.most_common():
        cum += k; i += 1
        if cum / T >= 0.5:
            break
    print(f'  bus factor (>=50%): {i} {[n for n,_ in c.most_common(i)]} {100*cum/T:.1f}%')
tc = sum(v for k, v in cc.items() if k != 'BOT')
print(f'\n== commit share (humans {tc}, bots {cc["BOT"]}): ' + ', '.join(f'{n} {k} ({100*k/tc:.1f}%)' for n, k in cc.most_common(5) if n != 'BOT'))
print('\n== hazard specifics')
g = per['src/Grouping.php']; gt = per['tests/GroupingTest.php']
print('  src/Grouping.php:', dict(g), ' tests/GroupingTest.php:', dict(gt))
print('  naive author of the squash commit lines: Ben Ramsey (author field)')
sup = collections.Counter()
for f in scope:
    if f.startswith('src/Support/'):
        sup.update(per[f])
print('  src/Support (renamed from Tool):', sup.most_common(4))
print('  Tomasz Wrona src lines:', sum(per[f].get('Tomasz Wrona', 0) for f in scope if f.startswith('src/')), ' tests lines:', sum(per[f].get('Tomasz Wrona', 0) for f in scope if f.startswith('tests/')))
os.unlink(tmp.name)
