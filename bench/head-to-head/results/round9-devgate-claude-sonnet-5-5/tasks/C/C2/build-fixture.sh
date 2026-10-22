#!/bin/bash
# build-fixture.sh <dest-dir>: clone https://github.com/pallets/itsdangerous, pin 672971d66a2ef9f85151e53283113f33d642dabd, add synthetic commits (fixed names/emails/dates).
set -euo pipefail
DEST="${1:?usage: build-fixture.sh <dest-dir>}"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_TERMINAL_PROMPT=0
rm -rf "$DEST"
git clone -q https://github.com/pallets/itsdangerous "$DEST"
cd "$DEST"
git checkout -q -B master 672971d66a2ef9f85151e53283113f33d642dabd
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

S=src/itsdangerous
{ printf '\n\n'; synth py rotate 14; } >> $S/signer.py
commit "Tomás Ibarra" tomas@ibarra.example 2025-07-01T10:00:00 "signer: add key rotation helpers" "David Lord" <email redacted> 2025-07-03T08:15:00
{ printf '\n\n'; synth py rotate_ts 10; } >> $S/timed.py
commit "Tomás Ibarra" tomas@ibarra.example 2025-07-02T10:00:00 "timed: add rotation helpers for timestamp signer" "David Lord" <email redacted> 2025-07-03T08:20:00
git mv $S/url_safe.py $S/urlsafe.py
grep -rl 'url_safe' src tests | while read -r f; do perl -pi -e 's/\.url_safe\b/.urlsafe/g' "$f"; done
commit "Lars Veen" lars@veen.example 2025-07-04T09:00:00 "rename url_safe module to urlsafe"
{ printf '"""Legacy v0 signer compatibility."""\n\n\n'; synth py legacy 20; } > $S/legacy.py
commit "Gustavo Reyes" gustavo@reyes.example 2025-07-05T09:00:00 "add legacy v0 signer compat"
synth py legacy_more 8 >> $S/legacy.py
commit "Gustavo Reyes" gustavo@reyes.example 2025-07-06T09:00:00 "legacy: more v0 helpers"
git rm -q $S/legacy.py
commit "David Lord" <email redacted> 2025-07-07T09:00:00 "remove legacy compat module, never released"
python3 -I - <<'PY'
import re, glob
for f in glob.glob('src/itsdangerous/*.py'):
    s = open(f, encoding='utf-8', newline='').read()
    s = re.sub(r'(?<!["\w])"([^"\'\\\n]*)"(?!")', r"'\1'", s)
    open(f, 'w', encoding='utf-8', newline='').write(s)
PY
commit "pre-commit-ci[bot]" 66853113+pre-commit-ci[bot]@users.noreply.github.com 2025-07-08T09:00:00 "[pre-commit.ci] auto fixes from pre-commit.com hooks"

git reflog expire --expire=now --all
git gc -q --prune=now
git status --short | head -3
git rev-parse HEAD
