# Conventions (e1, kennethreitz/records, Python files):
# - Scope: every tracked *.py file at HEAD (records.py, tests/, setup.py, examples/). Docs/CI files are not "code".
# - Counting unit: non-blank lines, credited to the *author* of the commit that last changed the line, found with
#   `git blame --line-porcelain -w -M -C` (whitespace changes and moved/copied lines are looked through).
# - Not credited: the "style: format with black" commit (quote normalisation, not whitespace-only, and no
#   .git-blame-ignore-revs exists) and the "[pre-commit.ci] auto fixes" bot commit (pyupgrade). Both are passed to
#   `--ignore-rev`, so their lines go back to whoever wrote them before. Lines git cannot hand back stay
#   "unattributable" and leave the denominator.
# - Identities: one person = identities sharing an email, a GitHub noreply login, or a multi-word name (case and
#   diacritics ignored): "Jan Vlcinsky"/"Jan Vlčinský", "Dana Okafor"/"dana okafor". No .mailmap exists in this repo.
# - Author, not committer: Tomás Ibarra's patch was applied by Kenneth Reitz; Tomás gets the lines.
# - Bots are reported separately and are not in the share denominator. Shares are of human-attributed lines.
import collections, os, re, subprocess, sys, unicodedata

FIX = os.path.abspath(sys.argv[1])
ENV = dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_SYSTEM="/dev/null")
BOT_RE = re.compile(r"\[bot\]|^StyleCI Bot$", re.I)
HDR = re.compile(r"^([0-9a-f]{40}) \d+ \d+(?: \d+)?$")


def git(*a, inp=None):
    r = subprocess.run(["git", "-C", FIX, *a], input=inp.encode("utf-8") if inp is not None else None, capture_output=True, env=ENV)
    if r.returncode:
        sys.exit("git %s failed: %s" % (" ".join(a), r.stderr.decode("utf-8", "replace")))
    return r.stdout.decode("utf-8", "replace")


def norm_name(n):
    n = unicodedata.normalize("NFKD", n)
    return " ".join("".join(c for c in n if not unicodedata.combining(c)).lower().split())


def build_identities():
    """Union identities that share an email, a GitHub noreply login, or a
    multi-word name (case and diacritics ignored); apply .mailmap first."""
    rows = [l.split("\t") for l in git("log", "--no-merges", "--format=%an\t%ae").splitlines()]
    raw = sorted(set((n, m) for n, m in rows))
    mapped = git("check-mailmap", "--stdin", inp="".join("%s <%s>\n" % i for i in raw)).splitlines()
    mp = {}
    for i, line in zip(raw, mapped):
        m = re.match(r"^(.*) <(.*)>$", line)
        mp[i] = (m.group(1), m.group(2))
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    keys = {}
    for (n, m) in sorted(set(mp.values())):
        find((n, m))
        ks = ["m:" + m.lower()]
        g = re.match(r"(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$", m, re.I)
        if g:
            ks.append("gh:" + g.group(1).lower())
        nn = norm_name(n)
        if len(nn.split()) >= 2:
            ks.append("n:" + nn)
        for k in ks:
            if k in keys:
                parent[find((n, m))] = find(keys[k])
            else:
                keys[k] = (n, m)
    return mp, find


MP, FIND = build_identities()


def gid(name, mail):
    ident = MP.get((name, mail), (name, mail))
    return FIND(ident)


def group_stats():
    """Per identity group: display name, #commits, last author date, members, bot flag."""
    st = {}
    names = collections.defaultdict(collections.Counter)
    for l in git("log", "--no-merges", "--format=%an\t%ae\t%as").splitlines():
        n, m, d = l.split("\t")
        g = gid(n, m)
        s = st.setdefault(g, {"commits": 0, "last": "", "members": set()})
        s["commits"] += 1
        s["last"] = max(s["last"], d)
        s["members"].add(MP.get((n, m), (n, m)))
        names[g][MP.get((n, m), (n, m))[0]] += 1
    for g, s in st.items():
        s["name"] = sorted(names[g].items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        s["bot"] = any(BOT_RE.search(n) or BOT_RE.search(m) for n, m in s["members"])
    return st


STATS = group_stats()


def blame(path, ignores):
    args = ["blame", "--line-porcelain", "-w", "-M", "-C"]
    for s in sorted(ignores):
        args += ["--ignore-rev", s]
    out = git(*args, "HEAD", "--", path)
    recs, cur = [], None
    for ln in out.split("\n"):
        if cur is None:
            m = HDR.match(ln)
            if m:
                cur = {"sha": m.group(1)}
            continue
        if ln.startswith("\t"):
            cur["text"] = ln[1:]
            recs.append(cur)
            cur = None
        elif ln.startswith("author "):
            cur["an"] = ln[7:]
        elif ln.startswith("author-mail "):
            cur["am"] = ln[12:].strip().strip("<>")
        elif ln.startswith("summary "):
            cur["summary"] = ln[8:]
    return recs


def commit_meta(sha, _c={}):
    if sha not in _c:
        an, ae, body = git("log", "-1", "--format=%an\t%ae\t%B", sha).split("\t", 2)
        _c[sha] = (an, ae, body)
    return _c[sha]


def ignore_set(subject_re=None, ignore_file=False):
    s = set()
    if ignore_file:
        p = os.path.join(FIX, ".git-blame-ignore-revs")
        if os.path.exists(p):
            for l in open(p):
                l = l.split("#")[0].strip()
                if re.fullmatch(r"[0-9a-f]{40}", l):
                    s.add(l)
    if subject_re:
        rx = re.compile(subject_re)
        for l in git("log", "--format=%H\t%s").splitlines():
            h, subj = l.split("\t", 1)
            if rx.search(subj):
                s.add(h)
    return s


def nonblank(s):
    return bool(s.strip())


def run(cfg):
    ignores = ignore_set(cfg.get("ignore_subject"), cfg.get("ignore_file", False))
    files = [f for f in git("ls-files", "-z").split("\0") if f and cfg["in_scope"](f)]
    resolve = cfg.get("resolve")
    labels = [("ALL", lambda p: True)] + cfg.get("groups", [])
    tab = {l: collections.Counter() for l, _ in labels}
    other = {l: collections.Counter() for l, _ in labels}   # bot / ignored counters
    excluded = collections.Counter()
    for f in sorted(files):
        full = os.path.join(FIX, f)
        text = open(full, encoding="utf-8", errors="replace").read()
        why = cfg["exclude"](f, text.splitlines()[:30])
        if why:
            excluded[why] += sum(1 for x in text.splitlines() if nonblank(x))
            continue
        for r in blame(f, ignores):
            if not nonblank(r["text"]):
                continue
            if r["sha"] in ignores:
                key = ("unattributable", "lines blamed to ignored boilerplate commits")
            else:
                a = resolve(r) if resolve else None
                an, am = a if a else (r["an"], r["am"])
                g = gid(an, am)
                key = ("bot", g) if STATS[g]["bot"] else ("human", g)
            for l, pred in labels:
                if pred(f):
                    (tab[l] if key[0] == "human" else other[l])[key[1] if key[0] == "human" else key[0] + ":" + (STATS[key[1]]["name"] if key[0] == "bot" else key[1])] += 1
    head = git("log", "-1", "--format=%H %cs").strip()
    print("== %s ground truth ==" % cfg["name"])
    print("fixture HEAD: %s (as-of date = HEAD commit date)" % head)
    print("scope: %s" % cfg["scope_doc"])
    print("excluded files (non-blank lines): %s" % (dict(excluded) or "none"))
    print("ignored commits (%d): %s" % (len(ignores), ", ".join("%s %s" % (s[:8], commit_meta(s)[2].splitlines()[0]) for s in sorted(ignores, key=lambda s: git("log", "-1", "--format=%at", s)))))
    for l, _ in labels:
        t = tab[l]
        tot = sum(t.values())
        print("\n-- %s: attributable human lines = %d" % (l, tot))
        for k, v in other[l].items():
            print("   not counted: %s = %d" % (k, v))
        for i, (g, n) in enumerate(sorted(t.items(), key=lambda kv: (-kv[1], STATS[kv[0]]["name"])), 1):
            s = STATS[g]
            print("   %2d. %-24s %5d lines %6.2f%%  | commits(all history)=%d last_commit=%s" % (i, s["name"], n, 100.0 * n / tot, s["commits"], s["last"]))
            if i >= cfg.get("top", 8):
                break
    byname = {STATS[g]["name"]: g for g in STATS}
    for w in cfg.get("watch", []):
        g = byname[w]
        print("\nWATCH %s: %s" % (w, "; ".join("%s: %d lines (%.2f%%)" % (l, tab[l][g], 100.0 * tab[l][g] / max(1, sum(tab[l].values()))) for l, _ in labels)))
    print("\n-- identity groups with more than one name/email (merged):")
    for g, s in sorted(STATS.items(), key=lambda kv: kv[1]["name"]):
        if len(s["members"]) > 1:
            print("   %s: %s" % (s["name"], "; ".join("%s <%s>" % m for m in sorted(s["members"]))))
    print("\n-- commit-count ranking (no-merges, all history; what a commit count would say):")
    for i, (g, s) in enumerate(sorted(STATS.items(), key=lambda kv: (-kv[1]["commits"], kv[1]["name"]))[:8], 1):
        print("   %d. %-24s %4d commits%s" % (i, s["name"], s["commits"], "  [bot]" if s["bot"] else ""))
    if cfg.get("extra"):
        print()
        cfg["extra"]()

import re
cfg = dict(
    name="e1", top=10, watch=["Marcus Lindqvist","Priya Raman","Tomás Ibarra","Dana Okafor","Kenneth Reitz"],
    scope_doc="tracked *.py files at HEAD",
    in_scope=lambda p: p.endswith(".py"),
    exclude=lambda p, head: None,
    ignore_subject=r"^style: format with black$|^\[pre-commit\.ci\]",
    groups=[("records.py", lambda p: p == "records.py"), ("tests/", lambda p: p.startswith("tests/"))],
)


def extra():
    print("Marcus Lindqvist commits touching examples/export_legacy.py:",
          git("log", "--format=%an", "--", "examples/export_legacy.py").count("Marcus"))
    print("examples/export_legacy.py exists at HEAD:", os.path.exists(os.path.join(FIX, "examples/export_legacy.py")))


cfg["extra"] = extra
run(cfg)
