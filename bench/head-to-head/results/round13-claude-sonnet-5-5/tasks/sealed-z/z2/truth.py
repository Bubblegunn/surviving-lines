"""Ground truth for z2 (google/uuid). Plain git only.

Conventions chosen (what a maintainer preparing a hand-over would do):
 * Scope: tracked *.go files at HEAD (tests included). Excluded: anything under
   vendor/ and files whose first lines say "Code generated ... DO NOT EDIT".
 * Blame: git blame -w -M -C --line-porcelain.  -w neutralises the CRLF
   normalisation commit, -M/-C follow the NodeID move into node_id.go, and git
   follows the sql.go -> database_sql.go rename by itself.  No ignore-revs file
   is needed here.
 * Owner = author (never the committer): Mei Chen's patch applied by Ravi Menon
   belongs to Mei Chen.
 * Reverted work (Noor Haddad's ULID commits, reverted by Ravi Menon) leaves no
   surviving lines, so it earns no ownership; it is only visible in commit counts.
 * Identities merged by alias table (same person under different names / e-mails;
   .mailmap in the repo is deliberately incomplete and is NOT trusted).
 * Bots own nothing.
 * Activity time = COMMITTER date of the person's commits (an author date can be
   wrong: Kofi Mensah's commit carries author date 1970-01-01).  'Left' = no commit
   with committer date in the 365 days before 2026-10-15.
"""
import hashlib, subprocess, sys, os, re, collections, datetime


def H(address):
    """SHA-256 of the trimmed, lower-cased address: addresses are compared as hashes only."""
    return hashlib.sha256(address.strip().lower().encode()).hexdigest()

REPO = sys.argv[1]
REF = datetime.date(2026, 10, 15)
cut = (REF - datetime.timedelta(days=365)).isoformat()


def git(*a):
    return subprocess.check_output(['git', '-C', REPO, *a], text=True, errors='replace',
                                   env={**os.environ, 'GIT_CONFIG_GLOBAL': '/dev/null',
                                        'GIT_CONFIG_SYSTEM': '/dev/null', 'LC_ALL': 'C'})


ALIASES = {
    'Paul Borman': ['d45aa910df101f083176827bb9fb115a1e6f928cee17c8252cab4cb0b1227295', 'e8bbb45b6277df9b2e5c78aa74ea292d57357ea9d33f20d9cae561af688d4f3b', 'cf2e66a274d3295b5550e3f02095463ff279950660734237be8db3fa73198f0b'],
    'Alex Rowe': ['b95b09c3d6c606267f575fb619b1bd50442315453d012f0ec77cb5af1ba2e1e5', 'c556030ccf7bb4fe530aff1464ec7a92746ef39d44bb94259eeab25c01d4b7cd', '757bd84ead702034101d4896c5a4a5db49e214f3a79096e104b0478bd06e7ac0'],
    'Noah Dietz': ['0c856f06418dfc8e53df21efa0d4901415eeb2a423fa2b52f13fe941166f944d', '30734de49aac0d3c325a4cf4089d3ada3f6399f9945b8c772651ead7b417081a'],
    'Oleksandr Redko': ['3f0b1385705a21bdd844e83634e29069303f869fba12b6d40dcd587b2e2e650e', 'caf30664f68a671641bac3153ec379764cf3b94518eef2f1b07cad0c38971002'],
}
E2N = {e: k for k, v in ALIASES.items() for e in v}
BOT = re.compile(r'\[bot\]', re.I)


def canon(name, email):
    e = H(email.strip('<>'))
    return E2N.get(e, E2N.get(e, name))


log = [l.split('\t') for l in git('log', '--format=%H\t%an\t%ae\t%ad\t%cd\t%s', '--date=short').splitlines()]
files = [f for f in git('ls-files', '*.go').split('\n') if f]


def generated(f):
    return 'DO NOT EDIT' in '\n'.join(git('show', 'HEAD:' + f).splitlines()[:5])


excluded = [f for f in files if f.startswith('vendor/') or generated(f)]
scope = [f for f in files if f not in excluded]


def blame(f):
    out = git('blame', '-w', '-M', '-C', '--line-porcelain', 'HEAD', '--', f).splitlines()
    nm = em = None
    res = collections.Counter()
    for line in out:
        if line.startswith('author '):
            nm = line[7:]
        elif line.startswith('author-mail '):
            em = line[12:]
        elif line.startswith('\t'):
            res['BOT' if BOT.search(nm) else canon(nm, em)] += 1
    return res


per_file = {f: blame(f) for f in scope}
tot = collections.Counter()
for c in per_file.values():
    tot.update(c)
T = sum(tot.values())
last = {}
cc = collections.Counter()
for sha, an, ae, ad, cd, s in log:
    if BOT.search(an):
        cc['BOT'] += 1
        continue
    p = canon(an, ae)
    cc[p] += 1
    if p not in last or cd > last[p]:
        last[p] = cd


def status(p):
    return 'LEFT' if last.get(p, '0') < cut else 'active'


print('FIXTURE HEAD', git('rev-parse', 'HEAD').strip())
print('SCOPE', len(scope), 'go files,', T, 'lines; excluded generated/vendored:', excluded)
print('\n== repo-wide surviving lines (>=1%) and commit share')
ct = sum(cc.values())
for n, c in tot.most_common():
    if c / T >= 0.01:
        print(f'  {n:20s} lines {c:5d} {100*c/T:5.1f}%   commits {cc.get(n,0):4d} ({100*cc.get(n,0)/ct:4.1f}% of {ct})  last {last.get(n,"-")} {status(n) if n in last else ""}')
print('  commit counts of zero/near-zero line owners:', {n: (tot.get(n, 0), cc[n]) for n in ('Noor Haddad', 'Sam Okafor', 'Ravi Menon', 'Mei Chen', 'Kofi Mensah')})
print('  bot commits:', cc['BOT'], 'of', ct)
print('\n== per-file owners (>=5% of the file), last activity, status')
for f in ('time.go', 'version7.go', 'database_sql.go', 'version8.go', 'node_id.go', 'version4.go'):
    c = per_file[f]; n = sum(c.values())
    print(f'-- {f} ({n} lines)')
    for p, k in c.most_common():
        if k / n >= 0.05:
            print(f'     {p:20s} {k:4d} {100*k/n:5.1f}%  last {last.get(p,"-")} {status(p) if p in last else ""}')
    act = sum(k for p, k in c.items() if p in last and status(p) == 'active')
    print(f'     lines owned by active people: {act} ({100*act/n:.1f}%)')
sqlf = per_file['database_sql.go']
print('\n== who is active and what they own (whole scope)')
for p in last:
    if status(p) == 'active':
        print(f'  {p:16s} {tot.get(p,0):4d} lines ({100*tot.get(p,0)/T:.1f}%) last {last[p]}')
lost = sum(c for p, c in tot.items() if p in last and status(p) == 'LEFT')
print(f'lines owned by people who left: {lost} = {100*lost/T:.1f}%')
cum = k = 0
for n, c in tot.most_common():
    cum += c; k += 1
    if cum / T >= 0.5:
        break
print('bus factor (>=50% of lines):', k, [n for n, _ in tot.most_common(k)], f'{100*cum/T:.1f}%')
print('Kofi Mensah author-date of his commit:', [l[3] for l in log if l[1] == 'Kofi Mensah'], 'committer date:', last['Kofi Mensah'])
