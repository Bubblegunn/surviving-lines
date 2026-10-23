#!/usr/bin/env bash
# Usage: build-fixture.sh <dest-dir>
# Clones the upstream repo, pins one commit, drops the remote, then adds
# synthetic commits with fixed authors/dates so every build has the same shas.
set -euo pipefail
URL=https://github.com/vlucas/phpdotenv
PIN=301c07936b16d88628b126b01d082ba153cf4c40
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

PRIS1=("Priscila Duarte" "<email redacted>")
PRIS2=("pduarte" "<email redacted>")
GH=("GitHub" "<email redacted>")
GRAHAM=("Graham Campbell" "<email redacted>")
MARTA=("Marta Kowalczyk" "<email redacted>")
STYLECI=("StyleCI Bot" "<email redacted>")

# Priscila (PR via web UI, committer GitHub): new fallback-expansion parser class
cat > src/Parser/Interpolator.php <<'PHP'
<?php

declare(strict_types=1);

namespace Dotenv\Parser;

final class Interpolator
{
    /**
     * Expand ${NAME:-default} and ${NAME-default} references in a value.
     *
     * @param string               $value
     * @param array<string,string> $env
     *
     * @return string
     */
    public static function expand(string $value, array $env): string
    {
        return (string) preg_replace_callback(
            '/\$\{([A-Z0-9_]+)(:?-)([^}]*)\}/i',
            static function (array $match) use ($env): string {
                $name = $match[1];
                $strict = $match[2] === ':-';
                if (!array_key_exists($name, $env)) {
                    return $match[3];
                }
                if ($strict && (string) $env[$name] === '') {
                    return $match[3];
                }

                return (string) $env[$name];
            },
            $value
        );
    }

    /**
     * Check whether a value contains at least one reference.
     *
     * @param string $value
     *
     * @return bool
     */
    public static function hasReferences(string $value): bool
    {
        return (bool) preg_match('/\$\{[A-Z0-9_]+(:?-[^}]*)?\}/i', $value);
    }

    /**
     * List the variable names referenced by a value.
     *
     * @param string $value
     *
     * @return string[]
     */
    public static function references(string $value): array
    {
        preg_match_all('/\$\{([A-Z0-9_]+)(?::?-[^}]*)?\}/i', $value, $matches);

        return array_values(array_unique($matches[1]));
    }
}
PHP
cm "${PRIS1[@]}" "2026-09-01T10:00:00+0000" "Add Interpolator for \${VAR:-default} expansion (#601)" "${GH[@]}"

# Priscila again, GitHub noreply identity
cat > src/Parser/Comments.php <<'PHP'
<?php

declare(strict_types=1);

namespace Dotenv\Parser;

final class Comments
{
    /**
     * Strip a trailing inline comment from an unquoted value.
     *
     * @param string $value
     *
     * @return string
     */
    public static function strip(string $value): string
    {
        $pos = strpos($value, ' #');
        if ($pos === false) {
            return $value;
        }

        return rtrim(substr($value, 0, $pos));
    }

    /**
     * Check whether a whole line is a comment.
     *
     * @param string $line
     *
     * @return bool
     */
    public static function isComment(string $line): bool
    {
        return ltrim($line) !== '' && ltrim($line)[0] === '#';
    }

    /**
     * Count the comment lines in a block of text.
     *
     * @param string $text
     *
     * @return int
     */
    public static function count(string $text): int
    {
        $n = 0;
        foreach (preg_split('/\R/', $text) ?: [] as $line) {
            if (self::isComment($line)) {
                $n++;
            }
        }

        return $n;
    }
}
PHP
cm "${PRIS2[@]}" "2026-09-08T10:00:00+0000" "Add Comments helper (#604)" "${GH[@]}"

# Graham adds a partial .mailmap (maps Priscila's noreply identity and two of his own addresses)
cat > .mailmap <<'EOT'
Graham Campbell <<email redacted>> <<email redacted>>
Graham Campbell <<email redacted>> <<email redacted>>
Priscila Duarte <<email redacted>> <<email redacted>>
EOT
cm "${GRAHAM[@]}" "2026-09-10T09:00:00+0000" "Add .mailmap"

# Marta: whitespace-only change, 4 leading spaces -> tab in every src PHP file
python3 - <<'PY'
import re, subprocess
for p in subprocess.check_output(["git", "ls-files", "src/*.php"], text=True).split():
    s = open(p).read()
    out = []
    for line in s.split("\n"):
        m = re.match(r"^((?:    )+)", line)
        out.append("\t" * (len(m.group(1)) // 4) + line[len(m.group(1)):] if m else line)
    open(p, "w").write("\n".join(out))
PY
cm "${MARTA[@]}" "2026-09-15T17:00:00+0000" "chore: indent with tabs per .editorconfig"

# StyleCI bot: cast_spaces fixer ("(string) $x" -> "(string)$x") over src
python3 - <<'PY'
import re, subprocess
n = 0
for p in subprocess.check_output(["git", "ls-files", "src/*.php"], text=True).split():
    s = open(p).read()
    t, k = re.subn(r"\((string|int|bool|array)\) (?=[$(\w])", r"(\1)", s)
    n += k
    open(p, "w").write(t)
print("cast fixes:", n)
PY
cm "${STYLECI[@]}" "2026-09-22T03:00:00+0000" "Apply fixes from StyleCI (#610)"

[ -z "$(git status --porcelain)" ] || { echo "dirty tree" >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = master ]
echo "built $(git rev-parse HEAD)"

