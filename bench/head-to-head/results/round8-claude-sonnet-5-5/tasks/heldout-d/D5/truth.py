# truth.py for d5 (phpdotenv, directory src/Parser/).
# Conventions chosen, as an expert maintainer would:
#  * Ownership = author of the line alive at HEAD (git blame -w -M -C), not commit counts or committer.
#  * src/Parser/Regex.php was moved into the directory by a pure rename (Marta Kowalska); blame follows
#    the rename, so its lines belong to the original authors and Marta owns nothing.
#  * Every commit whose subject starts "Apply fixes from StyleCI" is a mechanical style rewrite: the
#    synthetic one by "StyleCI Bot" and the real ones that StyleCI pushed through the maintainer's account.
#    They are passed to blame as ignored revisions (found by subject) so lines return to their authors.
#    Any remaining bot lines are reported, never ranked.
#  * Reverted code does not count, but code re-landed by a revert-of-revert belongs to the author of that
#    re-landing commit (Dmitri Volkov), because that commit is the one that put the lines back.
#  * Merge commits own no lines (Fatima Zahra's branch keeps her authorship).
#  * Identities merged: same e-mail, same multi-word name. The maintainer "Graham Campbell" appears
#    under several e-mail addresses (work, alt-three, cachethq, GitHub noreply) and counts as one person.
SCOPE = ["src/Parser/"]
EXCLUDE_PATHS = []
IGNORE_SUBJECTS = [r"^Apply fixes from StyleCI"]
MANUAL_ALIASES = []
BOT_RE = r"\[bot\]|styleci"


def facts(c):
    for nm in ("Graham Campbell", "Vance Lucas", "Fatima Zahra", "Dmitri Volkov", "Marta Kowalska", "StyleCI"):
        n, p = c["person"](nm)
        print(f"FACT {nm}: {n} lines = {p:.2f}%")
    for f in sorted(c["per_file"]):
        tot = sum(c["per_file"][f].values())
        (nm, m), k = c["per_file"][f].most_common(1)[0]
        print(f"FACT file {f}: {tot} lines, top author {nm} {100 * k / tot:.0f}%")

# ---------------------------------------------------------------- shared engine
import subprocess, sys, os, re, collections, tempfile

REPO = sys.argv[1]
ENV = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_SYSTEM="/dev/null", LC_ALL="C")


def git(*args, inp=None, raw=False):
    r = subprocess.run(["git", "-C", REPO, *args], input=inp.encode() if inp else None,
                       capture_output=True, env=ENV, check=True)
    return r.stdout if raw else r.stdout.decode("utf-8", "replace")


def is_generated(path):
    with open(os.path.join(REPO, path), "rb") as f:
        head = f.read(600).decode("utf-8", "replace")
    return bool(re.search(r"DO NOT EDIT|@generated|Code generated", head))


files, excluded = [], []
for p in git("ls-files", "-z", "--", *SCOPE).split("\0"):
    if not p:
        continue
    why = None
    for rx, reason in EXCLUDE_PATHS:
        if re.search(rx, p):
            why = reason
    if why is None and is_generated(p):
        why = "generated (header says so)"
    if why:
        excluded.append((p, why))
    else:
        files.append(p)

# ignore-revs: repo file (if present) + commits matched by subject
ignore = []
bi = os.path.join(REPO, ".git-blame-ignore-revs")
if os.path.exists(bi):
    for l in open(bi):
        l = l.split("#")[0].strip()
        if l:
            ignore.append(l)
for rx in IGNORE_SUBJECTS:
    for l in git("log", "--format=%H %s", "-E", "--grep", rx).splitlines():
        ignore.append(l.split()[0])
ignore = sorted(set(ignore))
tf = tempfile.NamedTemporaryFile("w", suffix=".ignore", delete=False)
tf.write("\n".join(ignore) + "\n")
tf.close()

# blame every in-scope file: -w ignores whitespace, -M/-C follow moved and copied lines
idents = collections.Counter()
per_file = collections.defaultdict(collections.Counter)
cur = {}
for p in files:
    out = git("blame", "-w", "-M", "-C", f"--ignore-revs-file={tf.name}", "--line-porcelain", "HEAD", "--", p)
    for l in out.split("\n"):
        if l.startswith("author "):
            cur["n"] = l[7:]
        elif l.startswith("author-mail "):
            cur["m"] = l[12:].strip("<>")
        elif l.startswith("\t"):
            k = (cur["n"], cur["m"])
            idents[k] += 1
            per_file[p][k] += 1
os.unlink(tf.name)

# identities -> people: .mailmap via git check-mailmap, then same email (case-insensitive),
# same multi-word name (case-insensitive), plus MANUAL_ALIASES
keys = sorted(idents)
mm = git("check-mailmap", "--stdin", inp="".join(f"{n} <{m}>\n" for n, m in keys)).splitlines()
canon = {}
for k, l in zip(keys, mm):
    mo = re.match(r"(.*) <(.*)>$", l)
    canon[k] = (mo.group(1), mo.group(2))
parent = {}


def find(x):
    parent.setdefault(x, x)
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def union(a, b):
    parent[find(a)] = find(b)


for k in keys:
    n, m = canon[k]
    union(("id",) + k, ("e", m.lower()))
    if len(n.split()) >= 2:
        union(("id",) + k, ("n", n.lower()))
for group in MANUAL_ALIASES:
    for e in group[1:]:
        union(("e", group[0].lower()), ("e", e.lower()))

people = collections.defaultdict(lambda: {"lines": 0, "ids": collections.Counter()})
for k in keys:
    r = find(("id",) + k)
    people[r]["lines"] += idents[k]
    people[r]["ids"][k] += idents[k]
rows = []
for r, d in people.items():
    # display name: the fullest name (most words), then the one with most lines
    best = max(d["ids"], key=lambda k: (len(canon[k][0].split()), d["ids"][k]))
    name = canon[best][0]
    is_bot = any(re.search(BOT_RE, f"{n} {m}", re.I) for n, m in d["ids"])
    rows.append(dict(name=name, lines=d["lines"], bot=is_bot, ids=d["ids"], root=r))
rows.sort(key=lambda r: (-r["lines"], r["name"]))
total = sum(r["lines"] for r in rows)
humans = [r for r in rows if not r["bot"]]
bots = [r for r in rows if r["bot"]]
hl = sum(r["lines"] for r in humans)

print(f"HEAD {git('rev-parse', 'HEAD').strip()}")
print(f"scope: {' '.join(SCOPE)}")
print(f"files counted: {len(files)}  excluded: {len(excluded)}")
for p, why in excluded:
    print(f"  excluded {p}: {why}")
print(f"ignore-revs ({len(ignore)}):")
for s in ignore:
    print(f"  {s[:12]} {git('log', '-1', '--format=%an | %s', s).strip()}")
print(f"live lines in scope: {total}")
print(f"bot-authored live lines (not ranked): {sum(r['lines'] for r in bots)} " +
      ", ".join(f"{r['name']}={r['lines']}" for r in bots))
print(f"human live lines (denominator for shares): {hl}")
print("RANKING (share of human live lines)")
for i, r in enumerate(humans[:15], 1):
    print(f"{i:2d}. {r['name']}: {r['lines']} lines, {100 * r['lines'] / hl:.2f}%")
print("MERGED IDENTITIES (people with more than one name/email in blame)")
for r in humans:
    if len(r["ids"]) > 1 and r["lines"] / hl >= 0.005:
        print(f"  {r['name']}: " + "; ".join(f"{n} <{m}>={c}" for (n, m), c in r["ids"].most_common()))
acc = 0
bf = {50: None, 80: None}
for i, r in enumerate(humans, 1):
    acc += r["lines"]
    for t in bf:
        if bf[t] is None and acc * 100 >= t * hl:
            bf[t] = i
print(f"people needed to cover >=50% of human live lines: {bf[50]}; >=80%: {bf[80]}")
def person(needle):
    """(lines, percent of human lines) for the person who has any identity whose name contains needle"""
    n = sum(r["lines"] for r in humans if any(needle.lower() in nm.lower() for nm, _ in r["ids"]))
    return n, 100 * n / hl


ctx = dict(person=person, git=git, files=files, humans=humans, bots=bots, hl=hl, per_file=per_file, canon=canon, find=find,
           people=people, idents=idents, rows=rows)
facts(ctx)
