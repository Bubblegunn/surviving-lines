#!/usr/bin/env bash
# Fixture for task t3: reviewers for a file whose code was moved out of index.js.
# Base: expressjs/compression pinned at 0f9707417bd53d41a319fce8bdb80dfa08b435c8.
set -euo pipefail
DEST="${1:?usage: build-fixture.sh <dest-dir>}"
rm -rf "$DEST"
git clone -q https://github.com/expressjs/compression "$DEST"
cd "$DEST"
git checkout -q -B master 0f9707417bd53d41a319fce8bdb80dfa08b435c8
git remote remove origin
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null

commit_as() { # name email date message
  GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_AUTHOR_DATE="$3" \
  GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$2" GIT_COMMITTER_DATE="$3" \
  git commit -q -m "$4"
}
GLEN_EMAIL="$(git log --author='Glen Mailer' -1 --format=%ae)"

# 1. Branch: move the helper functions from index.js into lib/helpers.js (cut and paste, one commit)
git checkout -q -b refactor/extract-helpers
mkdir -p lib
python3 -I - <<'PY'
lines = open("index.js", encoding="utf-8").read().split("\n")
i = next(k for k, l in enumerate(lines) if l.startswith("function addListeners"))
start = i
while not lines[start].startswith("/**"):
    start -= 1
moved = lines[start:]
while moved and moved[-1] == "": moved.pop()
kept = lines[:start]
while kept and kept[-1] == "": kept.pop()
names = ["addListeners", "chunkLength", "shouldCompress", "shouldTransform", "toBuffer", "headersSent"]
for n in names:
    assert any(l.startswith("function " + n) for l in moved), n
header = ["'use strict'", "", "var Buffer = require('safe-buffer').Buffer",
          "var compressible = require('compressible')",
          "var debug = require('debug')('compression')", ""]
footer = ["", "module.exports = {"] + [f"  {n}: {n}," for n in names[:-1]] + [f"  {names[-1]}: {names[-1]}", "}"]
open("lib/helpers.js", "w", encoding="utf-8").write("\n".join(header + moved + footer) + "\n")
req = "var helpers = require('./lib/helpers')\n" + "".join(f"var {n} = helpers.{n}\n" for n in names)
out = "\n".join(kept) + "\n"
out = out.replace("var zlib = require('zlib')\n", "var zlib = require('zlib')\n" + req, 1)
open("index.js", "w", encoding="utf-8").write(out)
PY
git add -A; commit_as "Marta Mover" "marta@example.com" "2026-04-01T10:00:00Z" "refactor: move helpers out of index.js"

# 2. Same branch: a maintainer adds three small helpers under a second identity (same email, other name)
cat >> lib/helpers.js <<'JS'

function isEventStream (res) {
  var type = res.getHeader('Content-Type')
  return typeof type === 'string' && /^text\/event-stream/i.test(type)
}

function hasContentRange (res) {
  return res.getHeader('Content-Range') !== undefined
}

function isHeadRequest (req) {
  return req.method === 'HEAD'
}

module.exports.isEventStream = isEventStream
module.exports.hasContentRange = hasContentRange
module.exports.isHeadRequest = isHeadRequest
JS
git add -A; commit_as "glenjamin" "$GLEN_EMAIL" "2026-04-02T10:00:00Z" "feat: stream and range helpers"
git checkout -q master
GIT_AUTHOR_NAME="Mara Merger" GIT_AUTHOR_EMAIL="mara@example.com" GIT_AUTHOR_DATE="2026-04-03T10:00:00Z" \
GIT_COMMITTER_NAME="Mara Merger" GIT_COMMITTER_EMAIL="mara@example.com" GIT_COMMITTER_DATE="2026-04-03T10:00:00Z" \
  git merge -q --no-ff refactor/extract-helpers -m "Merge branch 'refactor/extract-helpers'"
git branch -q -d refactor/extract-helpers

# 3. Whitespace-only reformat (2 to 4 spaces) of the new file
python3 -I - <<'PY'
import re
out = []
for l in open("lib/helpers.js", encoding="utf-8").read().split("\n"):
    m = re.match(r"^( +)", l)
    out.append((m.group(1) * 2 + l[len(m.group(1)):]) if m else l)
open("lib/helpers.js", "w", encoding="utf-8").write("\n".join(out))
PY
git add -A; commit_as "Tab Lover" "tab@example.com" "2026-04-10T10:00:00Z" "style: four-space indentation in helpers"

# 4. Move into lib/internal/ and update the import, by another author
mkdir -p lib/internal
git mv lib/helpers.js lib/internal/helpers.js
sed -i.bak "s#./lib/helpers#./lib/internal/helpers#" index.js && rm index.js.bak
git add -A; commit_as "Mass Renamer" "renamer@example.com" "2026-04-15T10:00:00Z" "refactor: internal modules live in lib/internal"

# 5. A bot stamps a licence header on the file (most recent commit on the path)
{ printf '// Copyright (c) 2026 compression contributors\n// SPDX-License-Identifier: MIT\n// Header maintained by docs-bot, do not edit by hand\n'; cat lib/internal/helpers.js; } > .tmp && mv .tmp lib/internal/helpers.js
git add -A; commit_as "docs-bot[bot]" "docs-bot@users.noreply.github.com" "2026-04-20T10:00:00Z" "chore: add licence header"
echo "fixture ready: $DEST ($(git rev-list --count HEAD) commits)"
