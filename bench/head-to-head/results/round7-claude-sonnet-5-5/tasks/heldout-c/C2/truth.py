# truth.py <fixture-dir> for task c2 (https://github.com/pallets/itsdangerous, pinned 672971d66a).
# Question: who should review src/itsdangerous (signer.py, timed.py); who wrote what is still there.
# Conventions: scope = src/itsdangerous/*.py. Blame uses the AUTHOR, never the committer (a maintainer applied patches
# written by someone else). Commits authored by pre-commit-ci[bot] are auto-fix reformatting and are ignored via
# --ignore-revs-file so the original authors keep the lines; bot lines that cannot be reassigned are dropped and reported.
# Renames are followed by blame. A contributor whose code was fully deleted has 0 lines alive.
import os, re, subprocess, sys, tempfile, unicodedata
from collections import Counter, defaultdict

SCOPE_RE = r'^src/itsdangerous/.*\.py$'            # paths counted as "code"
EXCLUDE_RE = r''        # vendored paths, dropped entirely
GEN_RE = r'AUTOMATICALLY GENERATED|auto-generated|@generated|DO NOT EDIT|Code generated'  # header marker => generated file
IGN_SUBJ = r'(?!)'         # commits whose subject marks a mechanical rewrite
IGN_AUTH = r'pre-commit-ci'         # commits whose author is a formatter bot
BOT_RE = r'\[bot\]'
UNATTRIB_RE = r'(?!)'
ALIASES = {}              # email(lowercase) -> canonical name
REPORTS = [('src/itsdangerous (package)', r'.'), ('signer.py', r'/signer\.py$'), ('timed.py', r'/timed\.py$')]              # (label, path regex)

repo = os.path.abspath(sys.argv[1])
ENV = {'PATH': os.environ.get('PATH', ''), 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_CONFIG_SYSTEM': '/dev/null', 'HOME': '/nonexistent', 'LC_ALL': 'C.UTF-8'}

def git(*a):
    return subprocess.run(['git', '-C', repo] + list(a), env=ENV, capture_output=True, check=True).stdout.decode('utf-8', 'replace')

def norm(n):
    n = unicodedata.normalize('NFKD', n)
    return ' '.join(''.join(c for c in n if not unicodedata.combining(c)).casefold().split())

revs, rev_info = [], []
for l in git('log', '--no-merges', '--format=%H%x09%an%x09%ae%x09%s').splitlines():
    h, an, ae, s = l.split('\t', 3)
    if (IGN_SUBJ and re.search(IGN_SUBJ, s)) or (IGN_AUTH and re.search(IGN_AUTH, an + ' ' + ae, re.I)):
        revs.append(h); rev_info.append(f'{h[:10]} {an}: {s}')
rf = tempfile.NamedTemporaryFile('w', delete=False, suffix='.revs')
rf.write('\n'.join(revs) + '\n'); rf.close()

files, generated, vendored = [], {}, {}
for f in git('ls-files').splitlines():
    if not re.search(SCOPE_RE, f):
        continue
    if EXCLUDE_RE and re.search(EXCLUDE_RE, f):
        vendored[f] = len(git('show', 'HEAD:' + f).splitlines()); continue
    head = '\n'.join(git('show', 'HEAD:' + f).splitlines()[:8])
    if re.search(GEN_RE, head):
        generated[f] = len(git('show', 'HEAD:' + f).splitlines()); continue
    files.append(f)

recs = {}  # file -> list of (name, mail)
raw_pairs = set()
for f in files:
    out = git('blame', '--line-porcelain', '-w', '-M', '-C', '--ignore-revs-file', rf.name, 'HEAD', '--', f)
    name = mail = None; rows = []
    for l in out.split('\n'):
        if l.startswith('author '): name = l[7:]
        elif l.startswith('author-mail '): mail = l[13:-1]
        elif l.startswith('\t'):
            if l.strip(): rows.append((name, mail)); raw_pairs.add((name, mail))
    recs[f] = rows
os.unlink(rf.name)

pairs = sorted(raw_pairs)
mm = git('check-mailmap', *[f'{n} <{m}>' for n, m in pairs]).splitlines()
resolved = {}
for (n, m), r in zip(pairs, mm):
    mo = re.match(r'(.*) <(.*)>$', r)
    resolved[(n, m)] = (mo.group(1), mo.group(2))

def classify(n, m):
    n2, m2 = resolved[(n, m)]
    if re.search(BOT_RE, f'{n2} <{m2}>', re.I): return ('bot', n2)
    if re.search(UNATTRIB_RE, f'{n2} <{m2}>', re.I): return ('unattributed', 'unattributable (root/placeholder identities)')
    if m2.lower() in ALIASES: return ('human', norm(ALIASES[m2.lower()]))
    return ('human', norm(n2))

disp = defaultdict(Counter); members = defaultdict(set)
def stats(pred):
    c = Counter(); kinds = Counter(); total = 0
    for f in files:
        if not re.search(pred, f): continue
        for n, m in recs[f]:
            k, key = classify(n, m); total += 1; kinds[k] += 1
            disp[key][resolved[(n, m)][0]] += 1; members[key].add(f'{n} <{m}>')
            if k != 'bot': c[key] += 1
    return c, kinds, total

def name(key):
    if key.startswith('unattributable'): return key
    for a in ALIASES.values():
        if norm(a) == key: return a
    return sorted(disp[key].items(), key=lambda x: (-x[1], x[0]))[0][0]

print(f'fixture HEAD {git("rev-parse", "HEAD").strip()}')
print('convention: git blame --line-porcelain -w -M -C with --ignore-revs-file (mechanical rewrites), non-blank lines, generated/vendored files dropped,')
print('  bots dropped from denominator, identities merged via .mailmap + email aliases + accent/case-folded name; share = lines / (all counted lines - bot lines)')
print(f'ignored revs ({len(revs)}):')
for r in rev_info[:12]: print('  ' + r)
if len(rev_info) > 12: print(f'  ... {len(rev_info) - 12} more')
print('generated files dropped:', dict(sorted(generated.items())) or 'none')
print('vendored files dropped (lines):', sum(vendored.values()), sorted(vendored))
for label, pred in REPORTS:
    c, kinds, total = stats(pred)
    denom = total - kinds['bot']
    print(f'\n== {label}: counted lines {total}, bot lines {kinds["bot"]} ({100*kinds["bot"]/total:.1f}% of counted), unattributed {kinds["unattributed"]}, denominator {denom}')
    rows = sorted(c.items(), key=lambda x: (-x[1], x[0]))
    cum = 0; n80 = None
    for i, (k, v) in enumerate(rows, 1):
        cum += v
        if n80 is None and cum >= 0.8 * denom and not k.startswith('unattrib'): n80 = i
        if i <= 8: print(f'  {i}. {name(k)}: {v} lines, {100*v/denom:.1f}%')
    print(f'  people with >=1%: {sum(1 for k, v in rows if v >= 0.01*denom and not k.startswith("unattrib"))}; rows to reach 80%: {n80}')
bots = Counter()
for f in files:
    for n, m in recs[f]:
        if classify(n, m)[0] == 'bot': bots[resolved[(n, m)][0]] += 1
print('\nbot lines alive (whole scope):', dict(sorted(bots.items())) or 'none')
print('identities merged (whole scope):')
for k in sorted(members):
    if len(members[k]) > 1 and not k.startswith('unattrib'): print(f'  {name(k)}: ' + '; '.join(sorted(members[k])))
cc = Counter()
for l in git('log', '--no-merges', '--format=%an%x09%ae').splitlines():
    n, m = l.split('\t')
    cc[ALIASES.get(m.lower(), n) if m.lower() in ALIASES else n] += 1
print('raw commit counts by author name (non-merge, whole history), top 6:', cc.most_common(6))
