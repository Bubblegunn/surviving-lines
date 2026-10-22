# truth.py for d1 (cJSON, C library files cJSON.c and cJSON.h).
# Conventions chosen, as an expert maintainer would:
#  * Ownership = author of the line that is alive at HEAD (git blame), not commit counts.
#  * git blame -w -M -C: whitespace-only edits are ignored; moved/copied lines keep the original author.
#  * The repo ships .git-blame-ignore-revs (names the clang-format commit); it is honoured.
#  * Authors are not committers: only the author field counts.
#  * Identities are merged: .mailmap (git check-mailmap), same e-mail, same multi-word name, and an
#    explicit alias for the contributor "tomasi" <<email redacted>...> = "Tomás Ibarra"
#    <tibarra@corp.example> (the noreply commit carries a Signed-off-by line with the work address).
#  * Bots (github-actions[bot]) are not people: their live lines are reported but not ranked, and
#    shares use human-authored live lines as the denominator.
#  * Reverted code does not survive, so it earns nobody credit.
SCOPE = ["cJSON.c", "cJSON.h"]
EXCLUDE_PATHS = []
IGNORE_SUBJECTS = []  # the repo's own .git-blame-ignore-revs is enough here
MANUAL_ALIASES = [["<email redacted>", "tibarra@corp.example"]]
BOT_RE = r"\[bot\]"


def facts(c):
    for nm in ("Ibarra", "Priya", "Alan Wang", "Max Bruckner", "Dave Gamble"):
        n, p = c["person"](nm)
        print(f"FACT {nm}: {n} lines = {p:.2f}%")
    n, p = c["person"]("tomasi")
    print(f"FACT tomasi (same person as Tomás Ibarra): {n} lines = {p:.2f}%")

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
