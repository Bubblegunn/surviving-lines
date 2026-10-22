#!/usr/bin/env bash
# build-fixture.sh <dest-dir> : deterministic fixture for task d1
REPO_URL=https://github.com/DaveGamble/cJSON.git
PIN=c859b25da02955fef659d658b8f324b5cde87be3
set -euo pipefail
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_TERMINAL_PROMPT=0
export LC_ALL=C TZ=UTC
DEST=${1:?usage: build-fixture.sh <dest-dir>}
if [ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ]; then echo "dest not empty: $DEST" >&2; exit 1; fi
mkdir -p "$DEST"
git clone -q --no-tags "$REPO_URL" "$DEST"
cd "$DEST"
git remote remove origin
git checkout -q -B master "$PIN"
for b in $(git for-each-ref --format='%(refname:short)' refs/heads); do [ "$b" = master ] || git branch -q -D "$b"; done
git config core.autocrlf false
git config commit.gpgsign false
git reflog expire --expire=now --all
# as NAME EMAIL DATE [COMMITTER_NAME COMMITTER_EMAIL]: identity and dates for the next commands
as() {
  export GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_AUTHOR_DATE="$3" \
         GIT_COMMITTER_NAME="${4:-$1}" GIT_COMMITTER_EMAIL="${5:-$2}" GIT_COMMITTER_DATE="$3"
}
commit() { git add -A; git commit -q --no-verify -m "$1"; }

# ---- synthetic history (all dates after the pinned commit)
as "Max Bruckner" "<email redacted>" "2026-01-12T09:30:00+01:00"
printf 'Alan Wang <<email redacted>> Alanscut <<email redacted>>\n' > .mailmap
commit "Add .mailmap entry for Alan Wang"

# Tomas Ibarra, first identity (work address): typed getters with a fallback value
as "Tomás Ibarra" "tibarra@corp.example" "2026-02-03T10:15:00-03:00"
python3 - <<'PY'
types = [("Int", "int", "(int)item->valuedouble"), ("Long", "long", "(long)item->valuedouble"),
         ("Double", "double", "item->valuedouble"), ("Float", "float", "(float)item->valuedouble"),
         ("Short", "short", "(short)item->valuedouble"), ("UInt", "unsigned int", "(unsigned int)item->valuedouble")]
c, h = "", ""
for n, t, e in types:
    c += f"""
CJSON_PUBLIC({t}) cJSON_Get{n}Or(const cJSON * const item, const {t} fallback)
{{
    if (!cJSON_IsNumber(item))
    {{
        return fallback;
    }}

    return {e};
}}
"""
    h += f"CJSON_PUBLIC({t}) cJSON_Get{n}Or(const cJSON * const item, const {t} fallback);\n"
open("cJSON.c", "a", newline="").write(c)
s = open("cJSON.h", newline="").read()
m = "/* Macro for iterating over an array or object */"
s = s.replace(m, "/* Typed getters that return a fallback instead of 0 when the item is not a number */\n" + h + "\n" + m, 1)
open("cJSON.h", "w", newline="").write(s)
PY
commit "Add cJSON_Get*Or typed getters with fallback value"

# Tomas Ibarra, second identity (GitHub noreply address, other display name)
as "tomasi" "<email redacted>" "2026-02-17T21:40:00-03:00"
python3 - <<'PY'
types = [("Int", "int"), ("Long", "long"), ("Double", "double"), ("Float", "float"), ("Short", "short"), ("UInt", "unsigned int")]
c, h = "", ""
for n, t in types:
    c += f"""
CJSON_PUBLIC({t}) cJSON_GetObject{n}Or(const cJSON * const object, const char * const name, const {t} fallback)
{{
    const cJSON *item = cJSON_GetObjectItemCaseSensitive(object, name);
    if (item == NULL)
    {{
        return fallback;
    }}

    return cJSON_Get{n}Or(item, fallback);
}}
"""
    h += f"CJSON_PUBLIC({t}) cJSON_GetObject{n}Or(const cJSON * const object, const char * const name, const {t} fallback);\n"
open("cJSON.c", "a", newline="").write(c)
s = open("cJSON.h", newline="").read()
m = "/* Macro for iterating over an array or object */"
s = s.replace(m, "/* Object-key variants of the typed getters */\n" + h + "\n" + m, 1)
open("cJSON.h", "w", newline="").write(s)
PY
commit "Add object-key variants of the typed getters

Signed-off-by: Tomás Ibarra <tibarra@corp.example>"

# Priya adds an experiment, the maintainer reverts it
as "Priya Nair" "<email redacted>" "2026-03-10T14:02:00+05:30"
python3 - <<'PY'
c = """
CJSON_PUBLIC(cJSON_bool) cJSON_MergePatchLite(cJSON * const target, const cJSON * const patch)
{
    cJSON *child = NULL;
    if (!cJSON_IsObject(target) || !cJSON_IsObject(patch))
    {
        return false;
    }
    for (child = patch->child; child != NULL; child = child->next)
    {
        if (cJSON_IsNull(child))
        {
            cJSON_DeleteItemFromObjectCaseSensitive(target, child->string);
            continue;
        }
        cJSON_DeleteItemFromObjectCaseSensitive(target, child->string);
        cJSON_AddItemToObject(target, child->string, cJSON_Duplicate(child, true));
    }
    return true;
}
"""
open("cJSON.c", "a", newline="").write(c)
s = open("cJSON.h", newline="").read()
m = "/* Macro for iterating over an array or object */"
s = s.replace(m, "CJSON_PUBLIC(cJSON_bool) cJSON_MergePatchLite(cJSON * const target, const cJSON * const patch);\n\n" + m, 1)
open("cJSON.h", "w", newline="").write(s)
PY
commit "Add experimental cJSON_MergePatchLite"
as "Max Bruckner" "<email redacted>" "2026-03-12T08:45:00+01:00"
git revert --no-edit HEAD >/dev/null

# Priya: clang-format run (2-space indent, trailing whitespace stripped), then the ignore list
as "Priya Nair" "<email redacted>" "2026-04-01T11:00:00+05:30"
python3 - <<'PY'
import re
for f in ("cJSON.c", "cJSON.h"):
    out = []
    for l in open(f, newline="").read().split("\n"):
        m = re.match(r" +", l)
        if m:
            l = " " * (len(m.group(0)) // 2) + l[len(m.group(0)):]
        out.append(l.rstrip(" \t"))
    open(f, "w", newline="").write("\n".join(out))
PY
commit "style: run clang-format over cJSON.c and cJSON.h (2-space indent)"
FMT=$(git rev-parse HEAD)
as "Priya Nair" "<email redacted>" "2026-04-01T11:20:00+05:30"
printf '# clang-format run over cJSON.c and cJSON.h\n%s\n' "$FMT" > .git-blame-ignore-revs
commit "Add .git-blame-ignore-revs"

# release bot: SPDX headers and version bump
as "github-actions[bot]" "41898282+github-actions[bot]@users.noreply.github.com" "2026-04-20T06:00:00+00:00"
python3 - <<'PY'
import re
for f in ("cJSON.c", "cJSON.h"):
    s = open(f, newline="").read()
    s = re.sub(r"/\*.*?\*/", "/* SPDX-License-Identifier: MIT */\n/* SPDX-FileCopyrightText: 2009-2017 Dave Gamble and cJSON contributors */", s, count=1, flags=re.S)
    if f == "cJSON.h":
        s = s.replace("#define CJSON_VERSION_PATCH 19", "#define CJSON_VERSION_PATCH 20")
    open(f, "w", newline="").write(s)
PY
commit "chore(release): add SPDX headers, bump version to 1.7.20"

test -z "$(git status --porcelain)" || { echo "dirty tree" >&2; exit 1; }
git reflog expire --expire=now --all
echo "built $DEST HEAD=$(git rev-parse HEAD)"
