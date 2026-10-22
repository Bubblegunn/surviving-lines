#!/bin/bash
# build-fixture.sh <dest-dir>: clone https://github.com/vlucas/phpdotenv, pin 301c07936b16d88628b126b01d082ba153cf4c40, add synthetic commits (fixed names/emails/dates).
set -euo pipefail
DEST="${1:?usage: build-fixture.sh <dest-dir>}"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_TERMINAL_PROMPT=0
rm -rf "$DEST"
git clone -q https://github.com/vlucas/phpdotenv "$DEST"
cd "$DEST"
git checkout -q -B master 301c07936b16d88628b126b01d082ba153cf4c40
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

D=2026-08-26
mkdir -p src/Parser/Unicode
{ printf '<?php\n\n// This file is auto-generated. DO NOT EDIT.\n\ndeclare(strict_types=1);\n\nnamespace Dotenv\\Parser\\Unicode;\n\nfinal class CharTable\n{\n'; synth php tbl 70; printf '}\n'; } > src/Parser/Unicode/CharTable.php
commit "Aiko Tanaka" <email redacted> ${D}T08:00:00 "Add unicode character table"
git checkout -q -b feature/escapes
{ printf '<?php\n\ndeclare(strict_types=1);\n\nnamespace Dotenv\\Parser;\n\nfinal class Escape\n{\n'; synth php esc 25; printf '}\n'; } > src/Parser/Escape.php
commit "Aiko Tanaka" <email redacted> ${D}T09:00:00 "Add escape sequence handling"
synth php esc_more 8 > /tmp/hb-c5-more.$$
splice src/Parser/Escape.php 1 /tmp/hb-c5-more.$$
rm -f /tmp/hb-c5-more.$$
commit "aiko tanaka" <email redacted> ${D}T09:30:00 "Escape: more sequences"
git checkout -q master
perl -pi -e 's/^(declare\(strict_types=1\);)$/$1\n\/\/ Reviewed for PHP 8.5 compatibility/' src/Parser/Lines.php
commit "Graham Campbell" <email redacted> ${D}T10:00:00 "Note PHP 8.5 review in Lines"
GIT_AUTHOR_NAME="Graham Campbell" GIT_AUTHOR_EMAIL=<email redacted> GIT_AUTHOR_DATE="${D}T11:00:00 +0000" \
GIT_COMMITTER_NAME="Graham Campbell" GIT_COMMITTER_EMAIL=<email redacted> GIT_COMMITTER_DATE="${D}T11:00:00 +0000" \
git merge -q --no-ff feature/escapes -m "Merge pull request #1 from aiko/feature/escapes"
git branch -q -d feature/escapes
{ printf '<?php\n\ndeclare(strict_types=1);\n\nnamespace Dotenv\\Parser;\n\nfinal class Quirks\n{\n'; synth php quirk 18; printf '}\n'; } > src/Parser/Quirks.php
commit "root" root@localhost ${D}T12:00:00 "fix"
{ printf '<?php\n\ndeclare(strict_types=1);\n\nnamespace Dotenv\\Parser;\n\nfinal class Compat\n{\n'; synth php compat 10; printf '}\n'; } > src/Parser/Compat.php
commit "Your Name" <email redacted> ${D}T12:30:00 "compat shims"
python3 -I - <<'PY'
import re, subprocess
for f in subprocess.check_output(['git', 'ls-files', 'src']).decode().split('\n'):
    if not f.endswith('.php'):
        continue
    s = open(f, encoding='utf-8', newline='').read().split('\n')
    s = [l if l.strip().startswith(('*', '/*', '//')) else re.sub(r'"([^"\'$\\\n{}]*)"', r"'\1'", l) for l in s]
    open(f, 'w', encoding='utf-8', newline='').write('\n'.join(s))
PY
commit "StyleCI Bot" <email redacted> ${D}T13:00:00 "Apply fixes from StyleCI"

git reflog expire --expire=now --all
git gc -q --prune=now
git status --short | head -3
git rev-parse HEAD
