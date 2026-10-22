import collections, os, re, subprocess, sys, tempfile, unicodedata

def git(repo, *args, check=True):
    r = subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True, check=check)
    return r.stdout

def ls_files(repo):
    return [p for p in git(repo, "ls-files", "-z").split("\0") if p]

def blob(repo, path, n=4000):
    try:
        return subprocess.run(["git", "-C", repo, "show", "HEAD:" + path], capture_output=True, check=True).stdout[:n]
    except subprocess.CalledProcessError:
        return b""

LOCKFILES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml"}
BINARY_EXT = (".png", ".jpg", ".gif", ".ico", ".key", ".crt", ".pem", ".woff", ".woff2")

def exclusion_reason(repo, path, vendor_prefixes):
    base = os.path.basename(path)
    if base in LOCKFILES: return "lockfile"
    if path.lower().endswith(BINARY_EXT): return "binary/fixture"
    for v in vendor_prefixes:
        if path.startswith(v): return "vendored"
    head = blob(repo, path)
    if b"\0" in head: return "binary"
    if b"@generated" in head or b"DO NOT EDIT" in head: return "generated"
    return None

def is_bot(name, email):
    n = name.lower()
    return "[bot]" in n or n.endswith("-bot") or "bot@" in email.lower()

def norm_name(n):
    n = unicodedata.normalize("NFKD", n)
    n = "".join(c for c in n if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", n.casefold())

def blame_file(repo, path, ignore_file=None, plain=False):
    """Return list of (sha, name, email) per surviving line of path at HEAD."""
    args = ["blame", "--line-porcelain"]
    if not plain:
        args += ["-w", "-M", "-C", "-C", "-C"]
        if ignore_file: args += ["--ignore-revs-file", ignore_file]
    args += ["HEAD", "--", path]
    out = git(repo, *args)
    rows, cur = [], {}
    for line in out.split("\n"):
        if line.startswith("\t"):
            rows.append((cur["sha"], cur["author"], cur["mail"])); cur = {}
        elif re.match(r"^[0-9a-f]{40} \d+ \d+", line):
            cur["sha"] = line.split()[0]
        elif line.startswith("author "): cur["author"] = line[7:]
        elif line.startswith("author-mail "): cur["mail"] = line[12:].strip("<>").lower()
    return rows

class UF:
    def __init__(s): s.p = {}
    def f(s, x):
        s.p.setdefault(x, x)
        while s.p[x] != x:
            s.p[x] = s.p[s.p[x]]; x = s.p[x]
        return x
    def u(s, a, b): s.p[s.f(a)] = s.f(b)

def group_identities(pairs):
    """pairs: iterable of (name, email). Union by normalised name and by email."""
    uf = UF()
    for name, mail in pairs:
        uf.u("n:" + norm_name(name), "e:" + mail)
    return uf, lambda name, mail: uf.f("e:" + mail)

def tally(repo, files, ignore_file=None, plain=False, drop_bots=True):
    """Return (per-identity counter, groups detail, total, bot_lines)."""
    raw = collections.Counter()
    for f in files:
        for sha, name, mail in blame_file(repo, f, ignore_file, plain):
            raw[(name, mail)] += 1
    return raw

def merge(raw, drop_bots=True):
    uf = UF()
    for (name, mail) in raw: uf.u("n:" + norm_name(name), "e:" + mail)
    groups = collections.defaultdict(lambda: collections.Counter())
    for (name, mail), c in raw.items():
        groups[uf.f("e:" + mail)][(name, mail)] += c
    res = []
    for g, members in groups.items():
        n = sum(members.values())
        top = max(members.items(), key=lambda kv: (kv[1], " " in kv[0][0] and kv[0][0][0].isupper(), kv[0][0]))[0][0]
        bot = all(is_bot(nm, ml) for (nm, ml) in members)
        res.append({"name": top, "lines": n, "bot": bot, "aliases": sorted(members)})
    return sorted(res, key=lambda r: -r["lines"])

def report(res, drop_bots=True, label=""):
    people = [r for r in res if not (drop_bots and r["bot"])]
    total = sum(r["lines"] for r in people)
    print(f"{label} total surviving lines (humans only): {total}")
    cum = 0; bf50 = bf80 = None
    for i, r in enumerate(people, 1):
        sh = 100.0 * r["lines"] / total
        cum += r["lines"]
        if bf50 is None and cum / total > 0.5: bf50 = i
        if bf80 is None and cum / total >= 0.8: bf80 = i
        al = "; ".join(f"{n} <{m}>" for n, m in r["aliases"]) if len(r["aliases"]) > 1 else ""
        print(f"  {i:2d}. {r['name']:<28} {r['lines']:6d} lines {sh:5.1f}%" + (f"   identities merged: {al}" if al else ""))
        if i >= 12: break
    print(f"  bus factor (fewest people holding >50% of lines): {bf50}")
    print(f"  bus factor (fewest people holding >=80% of lines): {bf80}")
    return people, total

def naive(raw, top=6, label="naive"):
    """No ignore-revs, no copy detection, no identity merge, bots/generated/vendored all counted."""
    tot = sum(raw.values())
    print(f"{label} (for contrast, plain blame by raw author string; total {tot}):")
    for (n, m), c in raw.most_common(top):
        print(f"    {n} <{m}> {c} lines {100.0*c/tot:.1f}%")

def blame_times(repo, path):
    out = git(repo, "blame", "-w", "-M", "-C", "-C", "-C", "--line-porcelain", "HEAD", "--", path)
    rows, cur = [], {}
    for line in out.split("\n"):
        if line.startswith("\t"):
            rows.append(cur); cur = {}
        elif re.match(r"^[0-9a-f]{40} \d+ \d+", line): cur["sha"] = line.split()[0]
        elif line.startswith("author "): cur["name"] = line[7:]
        elif line.startswith("author-mail "): cur["mail"] = line[12:].strip("<>").lower()
        elif line.startswith("author-time "): cur["t"] = int(line[12:])
    return rows

def main(repo):
    import datetime
    path = "lib/internal/helpers.js"
    print("fixture HEAD:", git(repo, "rev-parse", "HEAD").strip())
    print("file under review:", path, "(%d lines)" % len(blame_times(repo, path)))
    rows = blame_times(repo, path)
    # identity merge
    uf = UF()
    for r in rows: uf.u("n:" + norm_name(r["name"]), "e:" + r["mail"])
    g = collections.defaultdict(lambda: {"lines": 0, "names": collections.Counter(), "last": 0})
    for r in rows:
        k = uf.f("e:" + r["mail"]); g[k]["lines"] += 1; g[k]["names"][r["name"]] += 1
        g[k]["last"] = max(g[k]["last"], r["t"])
        g[k]["bot"] = is_bot(r["name"], r["mail"])
    people = sorted((v for v in g.values() if not v["bot"]), key=lambda v: -v["lines"])
    total = sum(v["lines"] for v in people)
    bot_lines = sum(v["lines"] for v in g.values() if v["bot"])
    print(f"\n== CORRECT: surviving lines by original author (-w -M -C -C -C), bots dropped ({bot_lines} bot lines), identities merged")
    print("   total human lines:", total)
    for i, v in enumerate(people[:10], 1):
        nm = max(v["names"].items(), key=lambda kv: (kv[1], " " in kv[0] and kv[0][0].isupper()))[0]
        d = datetime.datetime.fromtimestamp(v["last"], datetime.timezone.utc).date()
        alias = " identities: " + ", ".join(sorted(v["names"])) if len(v["names"]) > 1 else ""
        print(f"  {i:2d}. {nm:<28} {v['lines']:4d} lines {100.0*v['lines']/total:5.1f}%  last original work {d}{alias}")
    print("  recommended reviewers: top two by surviving lines (ownership), see ranks 1 and 2")
    # naive: blame without move detection / without bot filter
    naive_rows = git(repo, "blame", "--line-porcelain", "HEAD", "--", path)
    c = collections.Counter(l[7:] for l in naive_rows.split("\n") if l.startswith("author "))
    print("\nnaive blame (no -w/-M/-C, bots counted), for contrast:", c.most_common(5))
    # naive history: who touched the path most recently / most often (git log without --follow)
    print("\ngit log on the path WITHOUT --follow (NOT ownership):")
    for l in git(repo, "log", "--format=  %h %an | %s", "--", path).splitlines(): print(l)
    print("git log --follow count:", len(git(repo, "log", "--follow", "--format=%h", "--", path).split()))
    print("\ncommit that moved the code out of index.js:", git(repo, "log", "--format=%h %an %s", "--grep=^refactor: move helpers").strip())
    print("origin of the moved functions, in index.js before the move: blame of the same text is credited as above")
    names = collections.defaultdict(set)
    for r in rows: names[norm_name(r["name"])].add(r["mail"])
    ems = collections.defaultdict(set)
    for r in rows: ems[r["mail"]].add(r["name"])
    print("emails with more than one name:", {m: sorted(v) for m, v in ems.items() if len(v) > 1})

main(sys.argv[1])
