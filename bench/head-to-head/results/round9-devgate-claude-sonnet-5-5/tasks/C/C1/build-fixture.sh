#!/bin/bash
# build-fixture.sh <dest-dir>: clone https://github.com/spf13/pflag, pin d26a4dcd30a3c17923a2083b48bd6233aada9d47, add synthetic commits (fixed names/emails/dates).
set -euo pipefail
DEST="${1:?usage: build-fixture.sh <dest-dir>}"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_TERMINAL_PROMPT=0
rm -rf "$DEST"
git clone -q https://github.com/spf13/pflag "$DEST"
cd "$DEST"
git checkout -q -B master d26a4dcd30a3c17923a2083b48bd6233aada9d47
for b in $(git for-each-ref --format='%(refname:short)' refs/heads | grep -vx master || true); do git branch -q -D "$b"; done
git remote remove origin
for t in $(git tag -l); do git tag -d "$t" >/dev/null; done

commit() { # author-name author-email date msg [committer-name committer-email committer-date]
  git add -A
  GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_AUTHOR_DATE="$3 +0000" \
  GIT_COMMITTER_NAME="${5:-$1}" GIT_COMMITTER_EMAIL="${6:-$2}" GIT_COMMITTER_DATE="${7:-$3} +0000" \
  git commit -q --no-verify -m "$4"
}
synth() { # lang prefix count : deterministic filler functions
python3 -I - "$@" <<'PY'
import sys
lang, p, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
o = []
for i in range(n):
    k, m = i % 7 + 2, i % 5 + 3
    if lang == 'go':
        o += [f"// {p}{i} computes a derived value for case {i}.", f"func {p}{i}(x int) int {{", f"\tif x%{k} == 0 {{", f"\t\treturn x / {k}", "\t}", f"\treturn x*{m} + {i}", "}", ""]
    elif lang == 'py':
        o += [f"def {p}_{i}(value: int) -> int:", f'    """Return a derived value for case {i}."""', f"    if value % {k} == 0:", f"        return value // {k}", f"    return value * {m} + {i}", "", ""]
    elif lang == 'rust':
        o += [f"/// Returns a derived value for case {i}.", f"pub fn {p}_{i}(x: u32) -> u32 {{", f"    if x % {k} == 0 {{", f"        return x / {k};", "    }", f"    x * {m} + {i}", "}", ""]
    elif lang == 'ruby':
        o += [f"    # Derived value for case {i}.", f"    def {p}_{i}(value)", f"      label = 'case {i}'", f"      return [label, value / {k}] if (value % {k}).zero?", f"      [label, value * {m} + {i}]", "    end", ""]
    elif lang == 'php':
        o += [f"    /** Derived value for case {i}. */", f"    public static function {p}_{i}(int $x): int", "    {", f"        return $x % {k} === 0 ? intdiv($x, {k}) : $x * {m} + {i};", "    }", ""]
print("\n".join(o))
PY
}
splice() { # file nfooter newfile : insert newfile before the last nfooter lines of file
python3 -I -c 'import sys
f,n,g=sys.argv[1],int(sys.argv[2]),sys.argv[3]
L=open(f).read().split("\n")
if L[-1]=="": L.pop()
new=open(g).read().rstrip("\n").split("\n")
open(f,"w").write("\n".join(L[:-n]+new+L[-n:])+"\n")' "$@"
}

D=2026-10-21
mkdir -p vendor/github.com/example/ansi
{ printf 'package ansi\n\n'; synth go Ansi 100; } > vendor/github.com/example/ansi/ansi.go
printf '# github.com/example/ansi v1.2.0\ngithub.com/example/ansi\n' > vendor/modules.txt
commit "Priya Raman" priya@ramanlabs.example ${D}T08:00:00 "vendor: add example/ansi v1.2.0"
{ printf 'package pflag\n\n'; synth go shellComp 55; } > shellcomp.go
commit "Marcus Lindqvist" <email redacted> ${D}T08:10:00 "add shell completion helpers"
synth go fishComp 32 >> shellcomp.go
commit "mlindqvist" <email redacted> ${D}T08:20:00 "completion: add fish support"
{ printf 'package pflag\n\n'; synth go testShellComp 40; } > shellcomp_test.go
commit "Marcus Lindqvist" mlindqvist@corp.example ${D}T08:30:00 "completion: add tests"
for f in *.go; do
  { printf '// Copyright 2026 The pflag Authors. All rights reserved.\n// Use of this source code is governed by a BSD-style\n// license that can be found in the LICENSE file.\n\n'; cat "$f"; } > "$f.tmp"
  mv "$f.tmp" "$f"
done
commit "github-actions[bot]" 41898282+github-actions[bot]@users.noreply.github.com ${D}T08:40:00 "chore: add license headers"
perl -pi -e 's/interface\{\}/any/g' *.go
commit "Dana Whitfield" dana@whitfield.example ${D}T08:50:00 "all: go fix ./... (interface{} -> any)"

git reflog expire --expire=now --all
git gc -q --prune=now
git status --short | head -3
git rev-parse HEAD
