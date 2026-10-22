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

def main(repo):
    scope = "lib/"
    all_files = [f for f in ls_files(repo) if f.startswith(scope)]
    excluded = {}
    files = []
    for f in all_files:
        why = exclusion_reason(repo, f, vendor_prefixes=["lib/vendor/"])
        if why is None and not f.endswith(".js"): why = "not code (.md)"
        if why: excluded[f] = why
        else: files.append(f)
    # Reformat commits: subject starts with "style:" (whole-file quote change)
    reformat = [l.split()[0] for l in git(repo, "log", "--format=%H %s", "--grep=^style:").splitlines()]
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".ignore") as fh:
        fh.write("\n".join(reformat) + "\n"); ign = fh.name
    print("fixture HEAD:", git(repo, "rev-parse", "HEAD").strip())
    print("scope: directory", scope, "code files counted:", len(files))
    print("excluded files:", ", ".join(f"{k} ({v})" for k, v in sorted(excluded.items())))
    print("reformat commits (must not count as authorship):", ", ".join(r[:10] for r in reformat))
    raw = tally(repo, files, ign)
    res = merge(raw)
    print("\n== CORRECT (blame -w -M -C -C -C, reformat ignored, bots/generated/vendored dropped, identities merged)")
    report(res, label="lib/")
    raw_naive = tally(repo, [f for f in all_files], None, plain=True)
    print()
    naive(raw_naive)
    # commit-count view, for contrast
    cc = collections.Counter(l for l in git(repo, "log", "--format=%an", "--", scope).splitlines())
    print("\ncommit count top 4 touching lib/ (NOT ownership):", cc.most_common(4))
    uf_pairs = collections.defaultdict(set)
    for (n, m) in raw: uf_pairs[m].add(n)
    print("emails with more than one name:", {m: sorted(v) for m, v in uf_pairs.items() if len(v) > 1})
    names = collections.defaultdict(set)
    for (n, m) in raw: names[norm_name(n)].add(m)
    print("names with more than one email:", {n: sorted(v) for n, v in names.items() if len(v) > 1})

main(sys.argv[1])
