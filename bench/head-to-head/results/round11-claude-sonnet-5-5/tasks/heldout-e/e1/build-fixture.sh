#!/usr/bin/env bash
# Usage: build-fixture.sh <dest-dir>
# Clones the upstream repo, pins one commit, drops the remote, then adds
# synthetic commits with fixed authors/dates so every build has the same shas.
set -euo pipefail
URL=https://github.com/kennethreitz/records
PIN=ea4273695cee6da42edf1cb294d1f2a4505470fc
DEST="${1:?usage: build-fixture.sh <dest-dir>}"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_TERMINAL_PROMPT=0
rm -rf "$DEST"
git clone -q "$URL" "$DEST"
cd "$DEST"
git checkout -q -B master "$PIN"
git remote remove origin
for r in $(git for-each-ref --format='%(refname)' refs/heads refs/tags refs/remotes | grep -v '^refs/heads/master$' || true); do git update-ref -d "$r"; done
git config core.autocrlf false
git config commit.gpgsign false
[ "$(git rev-parse HEAD)" = "$PIN" ] || { echo "pin mismatch" >&2; exit 1; }

# cm "Author Name" "author@mail" "date" "message" ["Committer Name" "committer@mail"]
cm() {
  local an="$1" ae="$2" d="$3" msg="$4" cn="${5:-$1}" ce="${6:-$2}"
  git add -A
  GIT_AUTHOR_NAME="$an" GIT_AUTHOR_EMAIL="$ae" GIT_AUTHOR_DATE="$d" \
  GIT_COMMITTER_NAME="$cn" GIT_COMMITTER_EMAIL="$ce" GIT_COMMITTER_DATE="$d" \
  git commit -q --no-verify -m "$msg"
}
# Run a git command that creates a commit (revert) as the given identity/date.
as() {
  local an="$1" ae="$2" d="$3"; shift 3
  GIT_AUTHOR_NAME="$an" GIT_AUTHOR_EMAIL="$ae" GIT_AUTHOR_DATE="$d" \
  GIT_COMMITTER_NAME="$an" GIT_COMMITTER_EMAIL="$ae" GIT_COMMITTER_DATE="$d" "$@"
}

MARCUS=("Marcus Lindqvist" "<email redacted>")
DANA1=("Dana Okafor" "<email redacted>")
DANA2=("dana okafor" "dokafor@fastmail.example")
TOMAS=("Tomás Ibarra" "<email redacted>")
PRIYA=("Priya Raman" "<email redacted>")
BOT=("pre-commit-ci[bot]" "66853113+pre-commit-ci[bot]@users.noreply.github.com")
KEN=("Kenneth Reitz" "<email redacted>")

# Marcus: constant block in records.py (survives) + a legacy exporter example built over 24 small commits (deleted later)
python3 - <<'PY'
p = "records.py"
s = open(p).read()
anchor = "def isexception(obj):"
assert anchor in s
blk = "# Column names that are never exported by the legacy exporter.\nLEGACY_SKIP = (\n    'id_old',\n    'rowid',\n    'ctid',\n)\n\n\n"
open(p, "w").write(s.replace(anchor, blk + anchor, 1))
PY
cm "${MARCUS[@]}" "2026-03-02T09:00:00+0000" "records: define LEGACY_SKIP columns"
for i in $(seq 1 24); do
  d=$(printf "2026-03-%02dT10:%02d:00+0000" $((i % 27 + 3)) $i)
  mkdir -p examples
  printf "def step_%d(row):\n    return {'step': %d, 'row': row}\n" "$i" "$i" >> examples/export_legacy.py
  cm "${MARCUS[@]}" "$d" "examples: tweak legacy exporter ($i)"
done

# Dana (identity 1): helpers + test
python3 - <<'PY'
p = "records.py"
s = open(p).read()
anchor = "def _reduce_datetimes(row):"
assert anchor in s
blk = '''def _normalize_keys(row, case='lower'):
    """Return a copy of ``row`` with its keys normalised.

    ``case`` may be ``'lower'`` or ``'upper'``; anything else leaves the keys
    untouched.
    """
    out = {}
    for key, value in row.items():
        if case == 'lower':
            key = key.lower()
        elif case == 'upper':
            key = key.upper()
        out[key] = value
    return out


def _chunked(iterable, size=100):
    """Yield lists of at most ``size`` items taken from ``iterable``."""
    chunk = []
    for item in iterable:
        chunk.append(item)
        if len(chunk) >= size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


'''
open(p, "w").write(s.replace(anchor, blk + anchor, 1))
open("tests/test_records.py", "a").write('''

def test_normalize_keys():
    row = {'Name': 'a', 'AGE': 3}
    assert records._normalize_keys(row) == {'name': 'a', 'age': 3}
    assert records._normalize_keys(row, 'upper') == {'NAME': 'a', 'AGE': 3}


def test_chunked():
    assert list(records._chunked(range(5), 2)) == [[0, 1], [2, 3], [4]]
''')
PY
cm "${DANA1[@]}" "2026-04-06T14:00:00+0000" "records: add key normalisation and chunking helpers"

# Tomas authored, Kenneth applied the patch (committer differs from author)
python3 - <<'PY'
p = "records.py"
s = open(p).read()
anchor = "def _reduce_datetimes(row):"
blk = '''def _coerce_row(row, types):
    """Apply the callables in ``types`` (a mapping of key -> callable) to ``row``."""
    out = dict(row)
    for key, func in types.items():
        if key in out and out[key] is not None:
            try:
                out[key] = func(out[key])
            except (TypeError, ValueError):
                raise ValueError('cannot coerce column %r' % key)
    return out


'''
open(p, "w").write(s.replace(anchor, blk + anchor, 1))
PY
cm "${TOMAS[@]}" "2026-04-20T08:30:00+0000" "records: add _coerce_row for typed columns" "${KEN[@]}"

# Dana (identity 2, same person, other address): more helpers, and removes Marcus's legacy example
python3 - <<'PY'
p = "records.py"
s = open(p).read()
anchor = "def _reduce_datetimes(row):"
blk = '''def _describe(rows, sep=', '):
    """Return a one-line summary of the column names found in ``rows``."""
    names = []
    for row in rows:
        for key in row.keys():
            if key not in names:
                names.append(key)
    if not names:
        return '(no columns)'
    return sep.join(names)


'''
open(p, "w").write(s.replace(anchor, blk + anchor, 1))
PY
git rm -q examples/export_legacy.py
cm "${DANA2[@]}" "2026-05-11T16:45:00+0000" "records: add _describe; drop legacy exporter example"

# Priya: black-style quote normalisation across all python files (not whitespace-only, no ignore-revs file)
python3 - <<'PY'
import re, subprocess
files = subprocess.check_output(["git", "ls-files", "*.py"], text=True).split()
changed = 0
for p in files:
    out, doc = [], False
    for line in open(p).read().split("\n"):
        n3 = line.count('"""') + line.count("'''")
        if doc or n3 or line.strip().startswith("#"):
            if n3 % 2:
                doc = not doc
            out.append(line)
            continue
        new = re.sub(r"'([^'\"\\]*)'", r'"\1"', line)
        changed += new != line
        out.append(new)
    open(p, "w").write("\n".join(out))
print("black-style lines changed:", changed)
PY
cm "${PRIYA[@]}" "2026-06-03T11:00:00+0000" "style: format with black"
printf "repos:\n  - repo: https://github.com/asottile/pyupgrade\n    rev: v3.15.0\n    hooks:\n      - id: pyupgrade\n" > .pre-commit-config.yaml
cm "${PRIYA[@]}" "2026-06-03T11:20:00+0000" "ci: add pre-commit config"

# pre-commit.ci bot: pyupgrade autofix (class X(object): -> class X:)
python3 - <<'PY'
import re
p = "records.py"
s = open(p).read()
n = len(re.findall(r"^class (\w+)\(object\):$", s, re.M))
assert n >= 3, n
open(p, "w").write(re.sub(r"^class (\w+)\(object\):$", r"class \1:", s, flags=re.M))
PY
cm "${BOT[@]}" "2026-06-08T00:05:00+0000" "[pre-commit.ci] auto fixes from pre-commit.com hooks"

[ -z "$(git status --porcelain)" ] || { echo "dirty tree" >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = master ]
echo "built $(git rev-parse HEAD)"

