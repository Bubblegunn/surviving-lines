#!/usr/bin/env bash
# Usage: build-fixture.sh <dest-dir>
# Clones the upstream repo, pins one commit, drops the remote, then adds
# synthetic commits with fixed authors/dates so every build has the same shas.
set -euo pipefail
URL=https://github.com/BurntSushi/walkdir
PIN=6fd031c82ba5a4204b4ce6eae73dacb00dc072ec
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

ANDREW=("Andrew Gallant" "<email redacted>")
TOBIAS=("Tobias Brandt" "<email redacted>")
MEI=("Mei Tanaka" "<email redacted>")
SAM=("Sam Whitfield" "<email redacted>")

# Tobias adds a helper; Andrew reverts it, then reverts the revert (restores Tobias's lines under Andrew's name)
cat >> src/util.rs <<'RS'

/// Returns true if both paths live on the same device.
#[cfg(unix)]
pub fn same_device<P: AsRef<Path>, Q: AsRef<Path>>(a: P, b: Q) -> io::Result<bool> {
    let da = device_num(a)?;
    let db = device_num(b)?;
    Ok(da == db)
}

/// Returns true if both paths live on the same device.
#[cfg(windows)]
pub fn same_device<P: AsRef<Path>, Q: AsRef<Path>>(a: P, b: Q) -> io::Result<bool> {
    let da = device_num(a)?;
    let db = device_num(b)?;
    Ok(da == db)
}

#[cfg(test)]
mod same_device_tests {
    use super::*;

    #[test]
    fn same_path_is_same_device() {
        assert!(same_device(".", ".").unwrap());
    }
}
RS
cm "${TOBIAS[@]}" "2026-01-12T10:00:00+0000" "util: add same_device helper"
as "${ANDREW[@]}" "2026-01-13T09:00:00+0000" git revert --no-edit HEAD >/dev/null
as "${ANDREW[@]}" "2026-01-14T09:00:00+0000" git revert --no-edit HEAD >/dev/null

# Mei authored, Andrew committed (committer differs from author)
cat >> src/dent.rs <<'RS'

/// Returns a short human readable description of a file type.
#[allow(dead_code)]
pub(crate) fn describe_file_type(ft: fs::FileType) -> &'static str {
    if ft.is_dir() {
        "directory"
    } else if ft.is_symlink() {
        "symbolic link"
    } else if ft.is_file() {
        "regular file"
    } else {
        "other"
    }
}
RS
cm "${MEI[@]}" "2026-02-03T08:15:00+0000" "dent: add describe_file_type" "${ANDREW[@]}"

# Sam: boilerplate license header on every Rust file
python3 - <<'PY'
import subprocess
H = "// Copyright (c) 2026 The walkdir developers\n// SPDX-License-Identifier: Unlicense OR MIT\n//\n// See LICENSE-MIT and UNLICENSE for the full terms.\n\n"
for p in subprocess.check_output(["git", "ls-files", "*.rs"], text=True).split():
    s = open(p).read()
    open(p, "w").write(H + s)
PY
cm "${SAM[@]}" "2026-03-09T12:00:00+0000" "Add license headers to Rust sources"

# Sam: move Ancestor out of lib.rs into src/ancestor.rs (pure move)
python3 - <<'PY'
L = open("src/lib.rs").read().split("\n")
a = L.index("/// An ancestor is an item in the directory tree traversed by walkdir, and is")
i = L.index("impl Ancestor {")
j = next(k for k in range(i, len(L)) if L[k] == "}")
moved = L[a:j + 1]
rest = L[:a] + L[j + 2:]
k = rest.index("mod dent;")
rest[k:k] = ["mod ancestor;"]
rest.insert(rest.index("mod util;") + 1, "use crate::ancestor::Ancestor;")
open("src/lib.rs", "w").write("\n".join(rest))
open("src/ancestor.rs", "w").write("use std::io;\nuse std::path::PathBuf;\n\nuse crate::DirEntry;\n\n" + "\n".join(moved) + "\n")
print("moved lines:", len(moved))
PY
cm "${SAM[@]}" "2026-03-16T12:00:00+0000" "Move Ancestor into its own module"

# Sam: rename src/tests -> src/testsuite
git mv src/tests src/testsuite
sed -i.bak 's/^mod tests;$/mod testsuite;/' src/lib.rs && rm -f src/lib.rs.bak
grep -q '^mod testsuite;$' src/lib.rs
cm "${SAM[@]}" "2026-03-23T12:00:00+0000" "Rename src/tests to src/testsuite"

[ -z "$(git status --porcelain)" ] || { echo "dirty tree" >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = master ]
echo "built $(git rev-parse HEAD)"

