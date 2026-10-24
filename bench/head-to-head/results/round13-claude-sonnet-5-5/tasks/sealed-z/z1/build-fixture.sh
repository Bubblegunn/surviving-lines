#!/usr/bin/env bash
# usage: build-fixture.sh <dest-dir>
set -euo pipefail
DEST=${1:?dest dir}
URL=https://github.com/tartley/colorama
PIN=841634ed2a0da5d5ac2d867db533da8131266cb2
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export TZ=UTC LC_ALL=C
rm -rf "$DEST"
git clone -q "$URL" "$DEST"
cd "$DEST"
git checkout -q -B main "$PIN"
git remote remove origin
for b in $(git branch --format='%(refname:short)' | grep -v '^main$' || true); do git branch -q -D "$b"; done
for t in $(git tag); do git tag -d "$t" >/dev/null; done
git reflog expire --expire=now --all
git gc -q --prune=now

# E-mail addresses of real people are not written in this file. A real upstream
# address is looked up in the pinned clone's history by its SHA-256 (lower-cased
# and trimmed); the stored form, with its original case, is what the commit uses.
# Synthetic *.example / *.local addresses are literal. A synthetic GitHub no-reply
# address for a made-up login is assembled by nr() so no full address appears here.
addr() { # addr <sha256-hex>   -> prints the matching address from the pinned history
  git log "$PIN" --format='%ae%n%ce' | sort -u | python3 -I -c '
import sys, hashlib
want = sys.argv[1]
for line in sys.stdin.read().splitlines():
    if hashlib.sha256(line.strip().lower().encode()).hexdigest() == want:
        print(line, end="")
        sys.exit(0)
sys.exit(1)' "$1"
}
nr() { printf "<email redacted>.%s" "$1" "github.com"; }

# c <name> <email> <date> <message> [committer-name committer-email committer-date]
c() {
  GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_AUTHOR_DATE="$3" \
  GIT_COMMITTER_NAME="${5:-$1}" GIT_COMMITTER_EMAIL="${6:-$2}" GIT_COMMITTER_DATE="${7:-$3}" \
  git commit -q --no-verify -m "$4"
}
rv() { # rv <name> <email> <date> <sha>   (git revert with fixed identity)
  GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_AUTHOR_DATE="$3" \
  GIT_COMMITTER_NAME="$1" GIT_COMMITTER_EMAIL="$2" GIT_COMMITTER_DATE="$3" \
  git revert --no-edit "$4" >/dev/null
}
rep() { # rep <file> <old> <new>  exact, must occur once
  python3 -I - "$1" "$2" "$3" <<'PY'
import sys
p, old, new = sys.argv[1:4]
s = open(p, encoding='utf-8', newline='').read()
assert s.count(old) == 1, (p, old, s.count(old))
open(p, 'w', encoding='utf-8', newline='').write(s.replace(old, new))
PY
}

PN=("Priya Nair" "priya.nair@northwind.example")
JH=("Jonathan Hartley" "$(addr e9e9ddeb72fe3c5389baf3c72a8f65d8925d7e1f7cd3ca51d158957d7a3b1e4a)")
DK=("Dana Kessler" "dana.kessler@northwind.example")
TI=("Tomás Ibarra" "$(nr tomas.ibarra)")
BOT=("pre-commit-ci[bot]" "$(nr '66853113+pre-commit-ci[bot]')")
DEP=("dependabot[bot]" "$(nr '49699333+dependabot[bot]')")

# 1. Priya adds cursor helpers + tests
rep colorama/ansi.py "        return CSI + str(y) + ';' + str(x) + 'H'
" "        return CSI + str(y) + ';' + str(x) + 'H'
    def SAVE(self):
        return CSI + 's'
    def RESTORE(self):
        return CSI + 'u'
    def STYLE(self, n=0):
        # DECSCUSR: 0 default, 1/2 block, 3/4 underline, 5/6 bar
        return CSI + str(n) + ' q'
"
rep colorama/tests/ansi_test.py "

if __name__ == '__main__':
    main()" "
    def testCursorSaveRestore(self):
        self.assertEqual(Cursor.SAVE(), '\\033[s')
        self.assertEqual(Cursor.RESTORE(), '\\033[u')

    def testCursorStyle(self):
        self.assertEqual(Cursor.STYLE(), '\\033[0 q')
        self.assertEqual(Cursor.STYLE(5), '\\033[5 q')


if __name__ == '__main__':
    main()"
git add -A
c "${PN[0]}" "${PN[1]}" "2026-06-02T10:00:00+0000" "Add cursor save/restore and cursor style helpers"
FEAT=$(git rev-parse HEAD)
# 2. Hartley reverts it (CI broke), 3. then re-applies it with a revert of the revert
rv "${JH[0]}" "${JH[1]}" "2026-06-20T09:30:00+0000" "$FEAT"
REV=$(git rev-parse HEAD)
rv "${JH[0]}" "${JH[1]}" "2026-07-03T16:45:00+0000" "$REV"

# 4. Dana: NO_COLOR support (small real contribution)
rep colorama/initialise.py "import contextlib
import sys
" "import contextlib
import os
import sys
"
rep colorama/initialise.py "def init(autoreset=False, convert=None, strip=None, wrap=True):
" "def init(autoreset=False, convert=None, strip=None, wrap=True):

    if os.environ.get('NO_COLOR') and strip is None:
        strip = True
"
git add -A
c "${DK[0]}" "${DK[1]}" "2026-07-05T13:00:00+0200" "Honour NO_COLOR in init()"

# 5. Dana: formatter run over every python file (quote style only)
python3 -I - <<'PY'
import io, subprocess, tokenize
files = subprocess.check_output(['git', 'ls-files', '*.py'], text=True).split()
for p in files:
    src = open(p, encoding='utf-8', newline='').read()
    lines = src.splitlines(keepends=True)
    starts = [0]
    for l in lines:
        starts.append(starts[-1] + len(l))
    edits = []
    for t in tokenize.generate_tokens(io.StringIO(src).readline):
        if t.type != tokenize.STRING:
            continue
        s = t.string
        i = 0
        while s[i] not in '\'"':
            i += 1
        pre, body = s[:i], s[i:]
        if body.startswith("'''") and '"""' not in body and not body.endswith('"'):
            new = pre + '"""' + body[3:-3] + '"""'
        elif body.startswith("'") and not body.startswith("'''") and '"' not in body and "\\'" not in body:
            new = pre + '"' + body[1:-1] + '"'
        else:
            continue
        a = starts[t.start[0] - 1] + t.start[1]
        b = starts[t.end[0] - 1] + t.end[1]
        edits.append((a, b, new))
    for a, b, new in reversed(edits):
        src = src[:a] + new + src[b:]
    open(p, 'w', encoding='utf-8', newline='').write(src)
PY
git add -A
c "${DK[0]}" "${DK[1]}" "2026-07-10T11:00:00+0200" "Apply black-style string quotes to all python files"
FMT=$(git rev-parse HEAD)

# 6. Dana: vendored compatibility module
mkdir -p colorama/_vendor
printf '"""Vendored third-party code."""\n' > colorama/_vendor/__init__.py
python3 -I - <<'PY'
out = ['# Vendored from typing_extensions 4.12.2 (PSF-2.0). DO NOT EDIT.',
       '# Regenerate with tools/vendor.sh', '']
for i in range(1, 221):
    out += ['def _compat_%03d(value, default=None):' % i,
            '    if value is None:',
            '        return default',
            '    return value',
            '']
open('colorama/_vendor/_typing_compat.py', 'w').write('\n'.join(out) + '\n')
PY
git add -A
c "${DK[0]}" "${DK[1]}" "2026-07-12T15:20:00+0200" "Vendor typing compatibility shims"

# 7. pre-commit.ci autofix (pyupgrade: printf-style -> f-strings in demos)
rep demos/demo01.py "    sys.stdout.write(\"%s%-7s\" % (foreground, NAMES[foreground]))" "    sys.stdout.write(f\"{foreground}{NAMES[foreground]:<7}\")"
rep demos/demo06.py "    print(\"%s%s\" % (pos(MINY, MINX), \" \"*MAXX), end=\"\")" "    print(f\"{pos(MINY, MINX)}{' '*MAXX}\", end=\"\")"
rep demos/demo06.py "    print(\"%s%s\" % (pos(MAXY, MINX), \" \"*MAXX), end=\"\")" "    print(f\"{pos(MAXY, MINX)}{' '*MAXX}\", end=\"\")"
rep demos/demo06.py "    print(\"%s%s%s%s\" % (pos(MINY, MINX), Fore.WHITE, Back.BLACK, Style.NORMAL), end=\"\")" "    print(f\"{pos(MINY, MINX)}{Fore.WHITE}{Back.BLACK}{Style.NORMAL}\", end=\"\")"
git add -A
c "${BOT[0]}" "${BOT[1]}" "2026-07-15T04:12:00+0000" "[pre-commit.ci] auto fixes from pre-commit.com hooks"
BOTSHA=$(git rev-parse HEAD)

# 8. dependabot bumps a non-python file
printf 'wheel==0.45.1\n' >> requirements-dev.txt
git add -A
c "${DEP[0]}" "${DEP[1]}" "2026-07-18T03:00:00+0000" "Bump wheel from 0.44.0 to 0.45.1"

# 9. Tomás's patch, applied by Hartley (author != committer)
rep colorama/winterm.py "        adjusted_position = (position.Y + y, position.X + x)
        win32.SetConsoleCursorPosition(handle, adjusted_position, adjust=False)" "        adjusted_position = self._clamp((position.Y + y, position.X + x), handle)
        win32.SetConsoleCursorPosition(handle, adjusted_position, adjust=False)

    def _clamp(self, position, handle):
        # never move the cursor outside of the screen buffer
        csbi = win32.GetConsoleScreenBufferInfo(handle)
        row = min(max(position[0], 0), csbi.dwSize.Y - 1)
        col = min(max(position[1], 0), csbi.dwSize.X - 1)
        return (row, col)"
rep colorama/tests/winterm_test.py "

if __name__ == \"__main__\":
    main()" "
    @patch('colorama.winterm.win32')
    def testClampKeepsCursorInsideBuffer(self, mockWin32):
        mockAttr = Mock()
        mockAttr.dwSize.X = 80
        mockAttr.dwSize.Y = 25
        mockWin32.GetConsoleScreenBufferInfo.return_value = mockAttr
        term = WinTerm()
        self.assertEqual(term._clamp((-3, 200), mockWin32.STDOUT), (0, 79))
        self.assertEqual(term._clamp((30, 5), mockWin32.STDOUT), (24, 5))


if __name__ == \"__main__\":
    main()"
git add -A
c "${TI[0]}" "${TI[1]}" "2026-08-04T08:10:00+0200" "Keep cursor_adjust inside the screen buffer" "${JH[0]}" "${JH[1]}" "2026-08-05T19:00:00+0000"

# 10. Dana moves the tests out of the package (pure rename)
git mv colorama/tests tests
git add -A
c "${DK[0]}" "${DK[1]}" "2026-08-20T10:00:00+0200" "Move tests out of the installed package"

# 11. Priya: Windows Terminal detection
cat >> colorama/win32.py <<'PY'


def is_windows_terminal():
    """Return True when running inside Windows Terminal.

    Windows Terminal sets WT_SESSION for every tab, and it understands ANSI
    sequences natively, so callers can skip the conversion layer.
    """
    import os

    if not os.environ.get("WT_SESSION"):
        return False
    return os.environ.get("TERM_PROGRAM") != "legacy"
PY
git add -A
c "${PN[0]}" "${PN[1]}" "2026-09-12T14:00:00+0000" "Add is_windows_terminal() helper"
git status --porcelain | grep . && { echo dirty; exit 1; } || true
echo "HEAD $(git rev-parse HEAD)"
