#!/usr/bin/env bash
# Builds the two head-to-head fixture variants (docs/HEAD-TO-HEAD.md, "Fixture").
# Usage: build-fixture.sh <dest-dir>
# Env: CORS_SRC names the source repository (a local path works offline).
# Output: <dest>/noignore, <dest>/ignore and <dest>/reformat-sha.txt.
# The commits carry fixed identities and dates so that their ids are stable.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${CORS_SRC:-https://github.com/expressjs/cors.git}"
BASE=5317ebe670db2aaebc1d496eb5d33493deefb3ed
DEST="${1:?usage: build-fixture.sh <dest-dir>}"

mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
rm -rf "$DEST/noignore" "$DEST/ignore" "$DEST/reformat-sha.txt"

# A clone of the whole history, then the base commit as the only branch,
# so the copy is standalone and holds nothing after the base.
git clone --quiet "$SRC" "$DEST/noignore"
cd "$DEST/noignore"
git checkout --quiet -B master "$BASE"
git for-each-ref --format='%(refname)' refs/tags refs/heads refs/remotes |
  while read -r ref; do
    [ "$ref" = refs/heads/master ] || git update-ref -d "$ref"
  done
git remote remove origin 2>/dev/null || true

# commit_as <name> <email> <date> <message>: the author and committer are the same.
commit_as() {
  GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_AUTHOR_DATE="$3" \
  GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$2" GIT_COMMITTER_DATE="$3" \
    git -c commit.gpgsign=false commit --quiet -m "$4"
}

TROY="Troy Goode"
TROY_MAIL="troy@laptop.example"
TROY_DATE="2026-04-10T10:00:00+0000"
FIONA="Fiona Formatter"
FIONA_MAIL="fiona@formatter.example"
FIONA_DATE="2026-04-12T10:00:00+0000"

# Commit 1: a new test file, copied from data/vary.js.
cp "$HERE/data/vary.js" test/vary.js
git add test/vary.js
commit_as "$TROY" "$TROY_MAIL" "$TROY_DATE" "test: vary header coverage"

# Commit 2: a "// checked" marker on the opening line and on every function
# declaration line, 12 lines in all. The script refuses any other count.
python3 -I - lib/index.js <<'PY'
import re, sys

path = sys.argv[1]
with open(path, encoding="utf-8", newline="") as fh:
    lines = fh.read().splitlines(keepends=True)

decl = re.compile(r"^\s*function \w+\(.*\) \{$")
changed = 0
opened = False
for i, line in enumerate(lines):
    body = line.rstrip("\r\n")
    end = line[len(body):]
    if not opened and body == "(function () {":
        opened = True
        lines[i] = body + " // checked" + end
        changed += 1
    elif decl.match(body):
        lines[i] = body + " // checked" + end
        changed += 1

if changed != 12:
    sys.exit("annotate: expected 12 lines, changed %d" % changed)
with open(path, "w", encoding="utf-8", newline="") as fh:
    fh.write("".join(lines))
PY
git add lib/index.js
commit_as "$TROY" "$TROY_MAIL" "$TROY_DATE" "lib: annotate handlers"

# Commit 3: the formatter pass. Leading spaces are doubled and single quotes
# become double quotes, in the four files the reference fixture reformats.
# A line with an apostrophe inside its text ("wasn't", or an escaped \') keeps
# its quotes, as the reference fixture does; only the indentation changes there.
python3 -I - lib/index.js test/error-response.js test/example-app.js test/test.js <<'PY'
import re, sys

inner_quote = re.compile(r"\\'|[A-Za-z]'[A-Za-z]")
for path in sys.argv[1:]:
    with open(path, encoding="utf-8", newline="") as fh:
        text = fh.read()
    out = []
    for line in text.splitlines(keepends=True):
        stripped = line.lstrip(" ")
        indent = len(line) - len(stripped)
        if inner_quote.search(stripped):
            out.append(" " * (2 * indent) + stripped)
        else:
            out.append(" " * (2 * indent) + stripped.replace("'", '"'))
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write("".join(out))
PY
git add lib/index.js test/error-response.js test/example-app.js test/test.js
commit_as "$FIONA" "$FIONA_MAIL" "$FIONA_DATE" "style: reformat js with 4-space indent and double quotes"

REFORMAT_SHA="$(git rev-parse HEAD)"
printf '%s\n' "$REFORMAT_SHA" > "$DEST/reformat-sha.txt"

# The ignore variant is the same history plus the blame-ignore file.
cp -R "$DEST/noignore" "$DEST/ignore"
cd "$DEST/ignore"
printf '# style reformat\n%s\n' "$REFORMAT_SHA" > .git-blame-ignore-revs
git add .git-blame-ignore-revs
commit_as "$FIONA" "$FIONA_MAIL" "$FIONA_DATE" "chore: add .git-blame-ignore-revs"

for variant in noignore ignore; do
  cd "$DEST/$variant"
  count="$(git rev-list --count HEAD)"
  want=354
  [ "$variant" = ignore ] && want=355
  if [ "$count" != "$want" ]; then
    echo "$variant: expected $want commits, found $count" >&2
    exit 1
  fi
  echo "$variant HEAD $(git rev-parse HEAD) commits $count"
done
echo "reformat $REFORMAT_SHA"
