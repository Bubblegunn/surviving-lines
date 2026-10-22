#!/bin/bash
# build-fixture.sh <dest-dir>: clone https://github.com/heartcombo/responders, pin eb9b9baac1f8e2d44265e20120bdec45c0890a28, add synthetic commits (fixed names/emails/dates).
set -euo pipefail
DEST="${1:?usage: build-fixture.sh <dest-dir>}"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_TERMINAL_PROMPT=0
rm -rf "$DEST"
git clone -q https://github.com/heartcombo/responders "$DEST"
cd "$DEST"
git checkout -q -B master eb9b9baac1f8e2d44265e20120bdec45c0890a28
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

D=2026-10-10
{ printf 'module Responders\n  module Pagination\n'; synth ruby page 26; printf '  end\nend\n'; } > lib/responders/pagination_responder.rb
mkdir -p test/responders
{ printf 'require "test_helper"\n\nclass PaginationResponderTest < ActiveSupport::TestCase\n  module Cases\n'; synth ruby test_page 22; printf '  end\nend\n'; } > test/responders/pagination_responder_test.rb
commit "Kaito Mori" kaito@mori.example ${D}T09:00:00 "Add pagination responder"
synth ruby page_more 10 > /tmp/hb-c4-more.$$
splice lib/responders/pagination_responder.rb 2 /tmp/hb-c4-more.$$
rm -f /tmp/hb-c4-more.$$
commit "kmori" <email redacted> ${D}T09:10:00 "pagination: more helpers"
printf 'Kaito Mori <kaito@mori.example> kmori <<email redacted>>\n' > .mailmap
commit "Carlos Antonio da Silva" <email redacted> ${D}T09:20:00 "Add .mailmap"
git mv test/action_controller test/controllers
commit "Kaito Mori" kaito@mori.example ${D}T09:30:00 "Rename test dir to match Rails conventions"
python3 -I - <<'PY'
import re, subprocess
for f in subprocess.check_output(['git', 'ls-files', 'lib', 'test']).decode().split('\n'):
    if not f.endswith('.rb'):
        continue
    s = open(f, encoding='utf-8', newline='').read().split('\n')
    s = [re.sub(r"'([^'\\\n]*)'", r'"\1"', l) if ('"' not in l and '#' not in l) else l for l in s]
    open(f, 'w', encoding='utf-8', newline='').write('\n'.join(s))
PY
commit "Kaito Mori" kaito@mori.example ${D}T09:40:00 "Apply rubocop -A (Style/StringLiterals)"
printf '# rubocop -A (Style/StringLiterals) reformat\n%s\n' "$(git rev-parse HEAD)" > .git-blame-ignore-revs
commit "Carlos Antonio da Silva" <email redacted> ${D}T09:50:00 "Add .git-blame-ignore-revs"
for l in pt-BR de; do
  { printf '%s:\n  flash:\n' "$l"; for i in $(seq 1 38); do printf '    key_%d: "Texto %d"\n' "$i" "$i"; done; } > lib/responders/locales/$l.yml
done
commit "Weblate" <email redacted> ${D}T10:00:00 "Translated using Weblate (Portuguese (Brazil))"
perl -pi -e 's/(VERSION\s*=\s*)(["\x27]).*?\2/$1"3.9.9"/' lib/responders/version.rb
commit "github-actions[bot]" 41898282+github-actions[bot]@users.noreply.github.com ${D}T10:10:00 "Bump version to 3.9.9"

git reflog expire --expire=now --all
git gc -q --prune=now
git status --short | head -3
git rev-parse HEAD
