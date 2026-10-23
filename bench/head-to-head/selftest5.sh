#!/usr/bin/env bash
# Self-test of gate-grade5.py with a mutation check: the test must pass on the real file and FAIL on each mutant.
# Mutants are made in a temporary copy; the repository file is never changed. No model call.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
python3 -I "$HERE/gate-grade5.py" --self-test || { echo "self-test fails on the real file" >&2; exit 1; }
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
cp "$HERE"/grade.py "$HERE"/gate-grade.py "$T"/
fail=0
mutant() { # name sed-expression
  cp "$HERE/gate-grade5.py" "$T/gate-grade5.py"
  sed -i.bak "$2" "$T/gate-grade5.py"
  if cmp -s "$T/gate-grade5.py" "$HERE/gate-grade5.py"; then echo "mutant $1: sed changed nothing" >&2; fail=1; return; fi
  if python3 -I "$T/gate-grade5.py" --self-test >/dev/null 2>&1; then echo "mutant $1 SURVIVED" >&2; fail=1; else echo "mutant $1 killed"; fi
}
mutant min-valid-2 's/^MIN_VALID = 3/MIN_VALID = 2/'
mutant votes-3 's/^VOTES = 5/VOTES = 3/'
mutant tie-passes 's/\* 2 > len(valid)/* 2 >= len(valid)/'
mutant tie-needs-all 's/\* 2 > len(valid)/== len(valid)/'
mutant pass-before-reason 's/{"n": %d, "reason": "...", "pass": true}/{"n": %d, "pass": true, "reason": "..."}/'
mutant drop-reason-first-line 's/write the reason FIRST/write the reason when you like/'
mutant reason-first-check 's/keys.index("reason") > keys.index("pass")/keys.index("reason") < keys.index("pass")/'
exit $fail
