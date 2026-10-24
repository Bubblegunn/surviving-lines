"""Ground truth for z1 (colorama). Plain git only.

Conventions chosen (what an expert maintainer doing a handover would do):
 * Scope: every tracked *.py file at HEAD (package, tests, demos), EXCLUDING
   colorama/_vendor/ (vendored third-party code, header says DO NOT EDIT).
 * Blame: git blame -w -M -C --line-porcelain, ignoring two revisions that only
   rewrote existing lines: the quote-style formatter run and the pre-commit.ci
   bot autofix. Lines they touched fall back to the author of the real change.
 * Author is the owner, never the committer (a patch applied by someone else
   belongs to its author).
 * A 'Reapply "X"' commit (revert of a revert) carries no new authorship: its
   lines are credited to the author of the original commit X.
 * Identities are merged by an alias table (same person under several names and
   e-mail addresses, GitHub no-reply addresses).
 * Bots own nothing and are never counted as people.
 * 'Left the project' = no authored commit in the 365 days before 2026-10-15
   (the handover date used for the fixture), over the whole history.
 * Bus factor = smallest number of people whose surviving lines reach >= 50 %.
"""
import hashlib, subprocess, sys, tempfile, os, re, collections, datetime


def H(address):
    """SHA-256 of the trimmed, lower-cased address: addresses are compared as hashes only."""
    return hashlib.sha256(address.strip().lower().encode()).hexdigest()

REPO = sys.argv[1]
REF = datetime.date(2026, 10, 15)
WINDOW = 365


def git(*a):
    return subprocess.check_output(['git', '-C', REPO, *a], text=True,
                                   env={**os.environ, 'GIT_CONFIG_GLOBAL': '/dev/null',
                                        'GIT_CONFIG_SYSTEM': '/dev/null', 'LC_ALL': 'C'})


ALIASES = {
    'Arnon Yaari': ['378467531edd9e1ffa8dcabf0e58c458b6628a50b1d3216d43b79e5689687dfd', 'd022700776219580bbe5d181db9da72687d78b7a574173d7610e8c1e4bbc3233', 'dcaa2f137ad35ed1bdb062fa5b8070c1c3d361d415a9e9fb1f43d242b739bc34', '0efc28366bb3498620e83de2554b4df88be0f3393607358c27b6ffa7b015fa04'],
    'Hugo van Kemenade': ['71c3f3a6a595f7ae2f22cc155a2e16438027f911fa0d7a0480d556d7b83fdd06', '3f611e1950096d0e902224890aa01cc3e43310857db7431f1f0062d897de809d'],
    'Alvaro Mondejar': ['cf0aa48c3dce090e6bc8561ed12419bf0b04d988057d214970fb79fdf7877d2b'],
    'Reece Dunham': ['b386786f91555bd2733501b86330076dcf21d108bbe376a8dfdc0626fb33d624', '7a8ed735ab55bc820823ced98b50d10b2b9da9013f7db12df4fa68c06442acae'],
}
NAME_ALIASES = {'wiggin15': 'Arnon Yaari', 'hugo': 'Hugo van Kemenade', 'hugovk': 'Hugo van Kemenade',
                'rdil': 'Reece Dunham', 'álvaro mondéjar': 'Alvaro Mondejar'}
BOT_RE = re.compile(r'\[bot\]|imgbot', re.I)
EMAIL_TO = {e.lower(): k for k, v in ALIASES.items() for e in v}


def canon(name, email):
    e = H(email.strip('<>'))
    if e in EMAIL_TO:
        return EMAIL_TO[e]
    return NAME_ALIASES.get(name.lower(), name)


def is_bot(name, email):
    return bool(BOT_RE.search(name) or BOT_RE.search(email))


log = [l.split('\t') for l in git('log', '--format=%H\t%an\t%ae\t%ad\t%s', '--date=short').splitlines()]
by_sha = {l[0]: l for l in log}
ignore = [l[0] for l in log if is_bot(l[1], l[2]) or l[4].startswith('Apply black-style string quotes')]
tmp = tempfile.NamedTemporaryFile('w', delete=False)
tmp.write('\n'.join(ignore) + '\n'); tmp.close()


def original_author(sha):
    m = re.match(r'Reapply "(.*)"$', by_sha[sha][4])
    if not m:
        return None
    for l in log:
        if l[4] == m.group(1):
            return l
    raise SystemExit('original not found')


files = [f for f in git('ls-files', '*.py').split('\n') if f]
vendored = [f for f in files if f.startswith('colorama/_vendor/')]
scope = [f for f in files if f not in vendored]

truth = collections.Counter()
for f in scope:
    sha = nm = em = None
    for line in git('blame', '-w', '-M', '-C', '--ignore-revs-file', tmp.name, '--line-porcelain', 'HEAD', '--', f).splitlines():
        if re.match(r'^[0-9a-f]{40} \d+ \d+', line):
            sha = line.split()[0]
        elif line.startswith('author '):
            nm = line[7:]
        elif line.startswith('author-mail '):
            em = line[12:]
        elif line.startswith('\t'):
            o = original_author(sha)
            if o:
                truth[canon(o[1], o[2])] += 1
            elif is_bot(nm, em):
                truth['BOT:' + nm] += 1
            else:
                truth[canon(nm, em)] += 1
naive = collections.Counter()
for f in files:
    for line in git('blame', '--line-porcelain', 'HEAD', '--', f).splitlines():
        if line.startswith('author '):
            naive[line[7:]] += 1
vend_lines = sum(len(git('show', 'HEAD:' + f).splitlines()) for f in vendored)
total = sum(truth.values())
print('FIXTURE HEAD', git('rev-parse', 'HEAD').strip())
print('SCOPE files', len(scope), 'lines', total, '| vendored files excluded', len(vendored), 'lines', vend_lines)
print('\n== surviving lines per person (canonical, ignoring formatter+bot revs, reapply credited to original author)')
rank = truth.most_common()
for n, c in rank:
    if c / total >= 0.004:
        print(f'  {n:24s} {c:5d}  {100*c/total:5.1f}%')
print('  (people below 0.4%:', sum(1 for n, c in rank if c / total < 0.004), ', together',
      f'{100*sum(c for n, c in rank if c/total < 0.004)/total:.1f}%)')
print('\n== naive: plain git blame, all .py incl vendored, no flags, no alias merge (author name only)')
nt = sum(naive.values())
for n, c in naive.most_common(5):
    print(f'  {n:24s} {c:5d}  {100*c/nt:5.1f}%')

cc = collections.Counter(); last = {}
for sha, nm, em, d, s in log:
    if is_bot(nm, em):
        continue
    p = canon(nm, em); cc[p] += 1
    if p not in last or d > last[p]:
        last[p] = d
tc = sum(cc.values())
print('\n== commit share (humans, merged identities), top 5 of', tc, 'commits')
for n, c in cc.most_common(5):
    print(f'  {n:24s} {c:5d}  {100*c/tc:5.1f}%')

cum = 0; k = 0
for n, c in rank:
    cum += c; k += 1
    if cum / total >= 0.5:
        break
print('\n== bus factor (>=50% of surviving lines):', k, [n for n, _ in rank[:k]], f'{100*cum/total:.1f}%')
top2 = sum(c for n, c in rank[:2])
print('top two:', [n for n, _ in rank[:2]], f'own {100*top2/total:.1f}% of surviving lines')

cut = (REF - datetime.timedelta(days=WINDOW)).isoformat()
print('\n== activity: last authored commit; left = last commit before', cut)
for n, c in rank:
    if c / total >= 0.01 or n in ('Priya Nair', 'Dana Kessler', 'Tomás Ibarra'):
        st = 'LEFT' if last[n] < cut else 'active'
        print(f'  {n:24s} last {last[n]}  {st:6s} lines {c:4d} ({100*c/total:.1f}%)')
left_lines = sum(c for n, c in rank if last.get(n, '0') < cut)
print(f'lines owned by people who left: {left_lines} = {100*left_lines/total:.1f}%')
print('lines owned by people active in the last 12 months:', f'{100*(total-left_lines)/total:.1f}%')
print('active owners:', [(n, c, f'{100*c/total:.1f}%') for n, c in rank if last.get(n, '0') >= cut and c / total >= 0.004])
print('\n== hazard specifics')
for n in ('Priya Nair', 'Dana Kessler', 'Tomás Ibarra', 'Jonathan Hartley'):
    print(f'  {n}: {truth.get(n,0)} lines ({100*truth.get(n,0)/total:.1f}%)')
print('  bots owning lines:', {n: c for n, c in truth.items() if n.startswith('BOT:')})
os.unlink(tmp.name)
