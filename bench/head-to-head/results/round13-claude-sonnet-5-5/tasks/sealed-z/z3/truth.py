"""Ground truth for z3 (MasterQ32/zig-args). Plain git only.

Conventions chosen:
 * Scope: tracked *.zig files at HEAD, excluding generated files (first lines say
   "DO NOT EDIT"): src/width_table.zig.
 * Blame: git blame -w -M -C --line-porcelain with an ignore-revs file holding the
   three mechanical 'allocator -> gpa' commits (rename, its revert, its re-apply).
   -C follows the help printer code that moved from args.zig into help.zig, and
   git follows the later move of both files into src/.
 * Owner = author, never the committer (Dmitri Volkov's squash-merged PR is
   committed by GitHub).
 * Identities merged by alias table: the original author appears under 5 e-mail
   addresses and 3 spellings; another contributor under 3 addresses.
 * 'Left' = no authored commit (author date) in the 365 days before 2026-12-01.
 * Bus factor = fewest people whose surviving lines reach >= 50 %.
 * 'Nobody left who wrote it' for person P = lines whose only author is P in the
   blame sense, i.e. P's surviving lines (every line has exactly one owner here).
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
    'Felix Queissner': ['ab20bd39ba63961b50c588870dcd07725a5d7fc6dea73fa4e332337a3a4840b9', 'b597d051bd46b9cdda348c57bc72f739d249ac171d6755245725611dc3f14e77', '01f1d0964a57f415b6e63ab74ef8fcf13f5cf6f2dde79aa5c7dc9f4dd9cec515',
                        '4f4049ddb22aa211157022b512966d9f6073aa1d5cded5a4483c59765bb30268', 'c6230551b40d297592b2c2fd1979904cc2972a65970dac5a4e84210be03c38f9'],
    'Antoine Gagniere': ['c003db464ccf80a7e48ba14e40f2e5eb3ec74e5193800e076da0964fed982dd9', '733de49ce139794dba4ecc88fd4851ae0297557644406d9dba2926f6dec4da5d', 'dc4d18031890911b0964a6215563320cb037da50d69b900e32341144bc807954'],
}
E2N = {e: k for k, v in ALIASES.items() for e in v}


def canon(name, email):
    return E2N.get(H(email.strip('<>')), name)


log = [l.split('\t') for l in git('log', '--format=%H\t%an\t%ae\t%ad\t%cn\t%s', '--date=short').splitlines()]
ign = [l[0] for l in log if re.match(r'(Rename allocator to gpa|Revert "Rename allocator|Reapply "Rename allocator)', l[5])]
tmp = tempfile.NamedTemporaryFile('w', delete=False); tmp.write('\n'.join(ign) + '\n'); tmp.close()
files = [f for f in git('ls-files', '*.zig').split('\n') if f]
gen = [f for f in files if 'DO NOT EDIT' in '\n'.join(git('show', 'HEAD:' + f).splitlines()[:3])]
scope = [f for f in files if f not in gen]


def blame(f, extra):
    res = collections.Counter(); nm = em = None
    for line in git('blame', '-w', '-M', '-C', *extra, '--line-porcelain', 'HEAD', '--', f).splitlines():
        if line.startswith('author '):
            nm = line[7:]
        elif line.startswith('author-mail '):
            em = line[12:]
        elif line.startswith('\t'):
            res[canon(nm, em)] += 1
    return res


per_file = {f: blame(f, ['--ignore-revs-file', tmp.name]) for f in scope}
tot = collections.Counter()
for c in per_file.values():
    tot.update(c)
T = sum(tot.values())
naive = collections.Counter()
for f in scope:
    for line in git('blame', '--line-porcelain', 'HEAD', '--', f).splitlines():
        if line.startswith('author '):
            naive[line[7:]] += 1
NT = sum(naive.values())
last = {}; cc = collections.Counter()
for sha, an, ae, ad, cn, s in log:
    p = canon(an, ae); cc[p] += 1
    if p not in last or ad > last[p]:
        last[p] = ad
rank = tot.most_common()
print('FIXTURE HEAD', git('rev-parse', 'HEAD').strip())
print('SCOPE', len(scope), 'zig files', T, 'lines; generated excluded:', gen)
print('\n== surviving lines per person (merged identities, rename/revert/reapply commits ignored)')
for n, c in rank:
    if c / T >= 0.01:
        st = 'LEFT' if last[n] < cut else 'active'
        print(f'  {n:22s} {c:5d} {100*c/T:5.1f}%  commits {cc[n]:3d}  last {last[n]} {st}')
print('\n== naive blame (no -w/-M/-C, no ignore, names not merged), same scope')
for n, c in naive.most_common(6):
    print(f'  {n:30s} {c:5d} {100*c/NT:5.1f}%')
top = rank[0][0]
cum = k = 0
for n, c in rank:
    cum += c; k += 1
    if cum / T >= 0.5:
        break
print('\n== top owner:', top, f'{100*tot[top]/T:.1f}%   top2: {[n for n,_ in rank[:2]]} {100*(rank[0][1]+rank[1][1])/T:.1f}%   top3 {100*sum(c for _,c in rank[:3])/T:.1f}%')
print('bus factor (>=50%):', k, [n for n, _ in rank[:k]], f'{100*cum/T:.1f}%')
left_total = sum(c for n, c in tot.items() if last[n] < cut)
print(f'lines whose author has left: {left_total} = {100*left_total/T:.1f}%')
rest = T - tot[top]
left_wo = sum(c for n, c in tot.items() if last[n] < cut and n != top)
print(f'if {top} left too: lines with no active author = {tot[top] + left_wo} = {100*(tot[top]+left_wo)/T:.1f}%')
print('\n== per file: top owner share')
for f in scope:
    c = per_file[f]; n = sum(c.values())
    print(f'  {f:20s} {n:5d} lines; ' + ', '.join(f'{p} {100*k/n:.0f}%' for p, k in c.most_common(3)))
print('\n== hazard specifics')
for n in ('Wen Li', 'Tobias Ek', 'Dmitri Volkov', 'Felix Queissner', 'Antoine Gagniere'):
    print(f'  {n}: {tot.get(n,0)} lines ({100*tot.get(n,0)/T:.1f}%), commits {cc[n]}')
print('  lines in help.zig credited to Tobias Ek:', per_file['src/help.zig'].get('Tobias Ek', 0), 'of', sum(per_file['src/help.zig'].values()))
os.unlink(tmp.name)
