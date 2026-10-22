#!/usr/bin/env python3
"""Ground truth for a head-to-head fixture, computed with git blame only.

Usage: python3 -I truth.py <repo> [--ignore-rev SHA]...
       python3 -I truth.py --self-test

Each line is credited to the blame author name, so one person under two
e-mail addresses counts once. Bots (names containing "[bot]") are left out of
the percentages and the bus factor. Every blame runs with -w -M and with each
--ignore-rev given, which is how the reformat commit is skipped. The plain
blame section of lib/index.js is deliberately unfiltered, to show the trap.

The sections after the commit counts serve the extra tasks E1 to E5: surviving
lines by extension and by top-level directory, commits in a fixed author-date
window, and the authors of lib/index.js in order of first change.
"""
import collections
import os
import subprocess
import sys
import tempfile

# The window and the file are the ones the extra tasks E2 and E5 name. They are
# fixed here so that the ground truth cannot drift with a different argument.
WINDOW_SINCE = "2026-03-29"
WINDOW_UNTIL = "2026-04-12"
HISTORY_FILE = "lib/index.js"

# One person under two author names. alex94puchades signs five commits from the same
# address as Alejandro Caravaca Puchades (one author address on all five, dated
# 2015-05-26 to 2015-05-28, one pull request). The lines and commits under the handle
# are credited to the person, the same way the mailmap unification is.
NAME_ALIASES = {"alex94puchades": "Alejandro Caravaca Puchades"}


def git(repo, *args):
    return subprocess.run(
        ["git", "-C", repo, *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    ).stdout


def is_bot(name):
    return "[bot]" in name


def person(name):
    """The person behind an author name: the alias target, or the name itself."""
    return NAME_ALIASES.get(name, name)


def blame_counts(repo, path, flags):
    """Lines per author name for one file, from --line-porcelain output."""
    counts = collections.Counter()
    author = None
    for line in git(repo, "blame", *flags, "--line-porcelain", "HEAD", "--", path).split("\n"):
        if line.startswith("author "):
            author = person(line[len("author "):])
        elif line.startswith("\t"):
            counts[author] += 1
    return counts


def blame_all(repo, ignore_revs):
    """Lines per author name for every tracked file, with the ignore rule applied."""
    flags = ["-w", "-M"]
    for rev in ignore_revs:
        flags += ["--ignore-rev", rev]
    files = [f for f in git(repo, "ls-files").split("\n") if f]
    return {f: blame_counts(repo, f, flags) for f in files}


def show(title, counts):
    human = {k: v for k, v in counts.items() if not is_bot(k)}
    total = sum(human.values())
    bots = sum(v for k, v in counts.items() if is_bot(k))
    print(title, "total(non-bot)", total, "bots", bots)
    for name, n in sorted(human.items(), key=lambda kv: -kv[1])[:8]:
        print("  %-32s %5d %5.1f%%" % (name, n, 100 * n / total))
    # Bus factor: fewest people who together hold at least half the lines.
    running = 0
    people = 0
    for name, n in sorted(human.items(), key=lambda kv: -kv[1]):
        running += n
        people += 1
        if running * 2 >= total:
            break
    print("  bus factor (min authors >=50%%): %d" % people)


def humans(counts):
    return collections.Counter({k: v for k, v in counts.items() if not is_bot(k)})


def extension_of(path):
    """The extension with its dot, or (none) for a file without one."""
    return os.path.splitext(os.path.basename(path))[1] or "(none)"


def top_directory(path):
    """The first path segment, or . for a file at the root."""
    return path.split("/", 1)[0] if "/" in path else "."


def grouped_counts(by_file, key):
    """Human lines per group. A group whose files hold only bot lines still appears, with total 0."""
    groups = collections.defaultdict(collections.Counter)
    for path, counts in by_file.items():
        groups[key(path)].update(humans(counts))
    return groups


def show_groups(title, groups, top=3):
    lines = [title]
    for label in sorted(groups):
        counts = groups[label]
        total = sum(counts.values())
        lines.append("%s total %d" % (label, total))
        for name, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:top]:
            lines.append("  %-32s %5d %5.1f%%" % (name, n, 100 * n / total))
    return lines


def window_commits(repo, since, until):
    """Non-merge commits per author name, by author date (the date in the commit's own time zone)."""
    counts = collections.Counter()
    for line in git(repo, "log", "--no-merges", "--date=short", "--format=%an%x09%ad").split("\n"):
        if not line:
            continue
        name, date = line.rsplit("\t", 1)
        if since <= date <= until and not is_bot(name):
            counts[person(name)] += 1
    return counts


def show_window(counts, since, until):
    lines = ["COMMITS IN WINDOW %s..%s" % (since, until)]
    for name, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append("  %-32s %5d" % (name, n))
    return lines


def file_authors(repo, path):
    """Names that changed the file, first appearance (oldest) first, following renames, bots left out."""
    seen = []
    for name in git(repo, "log", "--follow", "--no-merges", "--reverse", "--format=%an", "--", path).split("\n"):
        name = person(name)
        if name and not is_bot(name) and name not in seen:
            seen.append(name)
    return seen


def show_history(repo, path, counts):
    lines = ["HISTORY %s" % path]
    for name in file_authors(repo, path):
        lines.append("  %-32s %5d" % (name, counts.get(name, 0)))
    return lines


def extra_sections(repo, by_file, history_file=HISTORY_FILE, since=WINDOW_SINCE, until=WINDOW_UNTIL):
    """The lines for the extra tasks E1 to E5, from the same blame as the rest of the output."""
    lines = []
    lines += show_groups("BY EXTENSION", grouped_counts(by_file, extension_of))
    lines += show_groups("BY TOP-LEVEL DIRECTORY", grouped_counts(by_file, top_directory))
    lines += show_window(window_commits(repo, since, until), since, until)
    lines += show_history(repo, history_file, humans(by_file.get(history_file, {})))
    return lines


def main(argv):
    if "--self-test" in argv[1:]:
        return self_test()
    if len(argv) < 2:
        sys.exit(__doc__.strip().splitlines()[2])
    repo = argv[1]
    ignore_revs = []
    rest = argv[2:]
    while rest:
        if rest[0] != "--ignore-rev" or len(rest) < 2:
            sys.exit("usage: truth.py <repo> [--ignore-rev SHA]...")
        ignore_revs.append(rest[1])
        rest = rest[2:]

    by_file = blame_all(repo, ignore_revs)
    files = list(by_file)

    def total_for(selected):
        counts = collections.Counter()
        for f in selected:
            counts.update(by_file[f])
        return counts

    show("ALL", total_for(files))
    show("lib/", total_for([f for f in files if f.startswith("lib/")]))
    show("test/", total_for([f for f in files if f.startswith("test/")]))
    show("lib/index.js", by_file["lib/index.js"])

    plain = collections.Counter()
    author = None
    for line in git(repo, "blame", "--line-porcelain", "HEAD", "--", "lib/index.js").split("\n"):
        if line.startswith("author "):
            author = person(line[len("author "):])
        elif line.startswith("\t"):
            plain[author] += 1
    print("plain blame lib/index.js", plain.most_common(4))

    commits = collections.Counter()
    for name in git(repo, "log", "--no-merges", "--format=%an", "--", "lib/index.js").split("\n"):
        if name:
            commits[person(name)] += 1
    print("commits lib/index.js", commits.most_common(5))

    for line in extra_sections(repo, by_file):
        print(line)
    return 0


# ---- self-test --------------------------------------------------------------

def _commit(repo, name, email, date, files, message):
    """Writes the files (path -> lines), then commits exactly those paths as the given author."""
    for path, lines in files.items():
        full = os.path.join(repo, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as fh:
            fh.write("".join(line + "\n" for line in lines))
    env = dict(
        os.environ,
        GIT_AUTHOR_NAME=name,
        GIT_AUTHOR_EMAIL=email,
        GIT_AUTHOR_DATE=date,
        GIT_COMMITTER_NAME=name,
        GIT_COMMITTER_EMAIL=email,
        GIT_COMMITTER_DATE=date,
    )
    subprocess.run(["git", "-C", repo, "add", "--", *files], check=True, capture_output=True)
    subprocess.run(
        ["git", "-C", repo, "-c", "commit.gpgsign=false", "commit", "-q", "-m", message],
        check=True,
        capture_output=True,
        env=env,
    )
    return git(repo, "rev-parse", "HEAD").strip()


def _build_self_test_repo(repo):
    """A repository whose blame, extension, window and history answers are known by hand.

    Returns the id of the reformat commit (Fiona rewrites src/a.js), which the blame ignores.
    Bob writes from two addresses. Dependabot is a bot. Erin is one day before the window and
    Carol's last commit is one day after it.
    """
    subprocess.run(["git", "init", "-q", repo], check=True)
    _commit(repo, "Alice", "alice@writer.example", "2026-03-01T10:00:00+0000",
            {"src/a.js": ["one", "two", "three"]}, "src: first version")
    _commit(repo, "Bob", "bob@one.example", "2026-03-01T11:00:00+0000",
            {"lib/b.yml": ["x: 1", "y: 2"], "README": ["readme"]}, "lib: config and readme")
    _commit(repo, "dependabot[bot]", "dependabot@bot.example", "2026-03-02T10:00:00+0000",
            {"docs/x.md": ["d1", "d2"]}, "docs: bump")
    reformat = _commit(repo, "Fiona", "fiona@formatter.example", "2026-03-03T10:00:00+0000",
                       {"src/a.js": ["ONE", "TWO", "THREE"]}, "style: reformat")
    _commit(repo, "Erin", "erin@tester.example", "2026-03-28T10:00:00+0000",
            {"lib/d.yml": ["z: 9"]}, "lib: one day before the window")
    _commit(repo, "Carol", "carol@coder.example", "2026-03-29T10:00:00+0000",
            {"lib/c.js": ["c1", "c2"]}, "lib: first day of the window")
    _commit(repo, "Bob", "bob@two.example", "2026-04-01T10:00:00+0000",
            {"lib/c.js": ["c1", "c2", "b3"]}, "lib: second address")
    _commit(repo, "dependabot[bot]", "dependabot@bot.example", "2026-04-05T10:00:00+0000",
            {"docs/x.md": ["d1", "d3"]}, "docs: bump again")
    _commit(repo, "Bob", "bob@one.example", "2026-04-12T10:00:00+0000",
            {"lib/c.js": ["c1", "c2", "b3", "b4"]}, "lib: last day of the window")
    _commit(repo, "Carol", "carol@coder.example", "2026-04-13T10:00:00+0000",
            {"lib/c.js": ["c1", "c2", "b3", "b4", "c5"]}, "lib: one day after the window")
    return reformat


def self_test():
    """Checks every extra section on a repository built here. No model call, no network."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = os.path.join(tmp, "repo")
        reformat = _build_self_test_repo(repo)

        def sections(ignore_revs):
            lines = extra_sections(repo, blame_all(repo, ignore_revs), history_file="lib/c.js")
            return [" ".join(line.split()) for line in lines]

        expected = [
            "BY EXTENSION",
            "(none) total 1",
            "Bob 1 100.0%",
            ".js total 8",
            "Alice 3 37.5%",
            "Carol 3 37.5%",
            "Bob 2 25.0%",
            ".md total 0",
            ".yml total 3",
            "Bob 2 66.7%",
            "Erin 1 33.3%",
            "BY TOP-LEVEL DIRECTORY",
            ". total 1",
            "Bob 1 100.0%",
            "docs total 0",
            "lib total 8",
            "Bob 4 50.0%",
            "Carol 3 37.5%",
            "Erin 1 12.5%",
            "src total 3",
            "Alice 3 100.0%",
            "COMMITS IN WINDOW 2026-03-29..2026-04-12",
            "Bob 2",
            "Carol 1",
            "HISTORY lib/c.js",
            "Carol 3",
            "Bob 2",
        ]
        got = sections([reformat])
        assert got == expected, "\n".join(got)

        # Without the ignore, the reformat takes src/a.js, so the ignore is what moves it back.
        plain = sections([])
        assert "Fiona 3 37.5%" in plain, "\n".join(plain)
        assert "Alice 3 37.5%" not in plain, "\n".join(plain)

        # Bots never reach a row, a total or the window.
        assert not any("dependabot" in line for line in got)

        # The window is inclusive at both ends: a commit on 2026-03-28 or 2026-04-13 is outside it.
        counts = window_commits(repo, WINDOW_SINCE, WINDOW_UNTIL)
        assert counts == collections.Counter({"Bob": 2, "Carol": 1}), counts

        # The alias: one author name is credited to the person in blame, window commits and history.
        alias_repo = os.path.join(tmp, "alias")
        subprocess.run(["git", "init", "-q", alias_repo], check=True)
        _commit(alias_repo, "Alejandro Caravaca Puchades", "a@x.example", "2015-05-26T10:00:00+0000",
                {"f.txt": ["a1", "a2"]}, "first")
        _commit(alias_repo, "alex94puchades", "a@x.example", "2015-05-27T10:00:00+0000",
                {"f.txt": ["a1", "a2", "b3"]}, "second, under the alias")
        blame = blame_all(alias_repo, [])["f.txt"]
        assert blame == collections.Counter({"Alejandro Caravaca Puchades": 3}), blame
        assert window_commits(alias_repo, "2015-05-26", "2015-05-28") == collections.Counter(
            {"Alejandro Caravaca Puchades": 2}), "window commits"
        assert file_authors(alias_repo, "f.txt") == ["Alejandro Caravaca Puchades"], "history"

    print("truth self-test OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
