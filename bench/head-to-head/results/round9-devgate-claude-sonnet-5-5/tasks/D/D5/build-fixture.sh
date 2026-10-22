#!/usr/bin/env bash
# build-fixture.sh <dest-dir> : deterministic fixture for task d5
REPO_URL=https://github.com/vlucas/phpdotenv.git
PIN=2af27192fc6c6bf7c05ef26e67d54afe9a0c39e1
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

# ---- synthetic history
# feature branch by Fatima, merged with a merge commit by the maintainer
git checkout -q -b feature/escape-sequences
as "Fatima Zahra" "<email redacted>" "2026-01-20T10:00:00+00:00"
cat > src/Parser/EscapeDecoder.php <<'PHP'
<?php

declare(strict_types=1);

namespace Dotenv\Parser;

final class EscapeDecoder
{
    /**
     * Escape sequences understood inside double quotes.
     */
    private const MAP = [
        'n' => "\n",
        'r' => "\r",
        't' => "\t",
        'v' => "\v",
        'f' => "\f",
        '\\' => '\\',
        '"' => '"',
        '$' => '$'
    ];

    private function __construct()
    {
        //
    }

    public static function decode(string $value): string
    {
        $out = '';
        $length = strlen($value);
        for ($i = 0; $i < $length; $i++) {
            $char = $value[$i];
            if ($char !== '\\' || $i + 1 >= $length) {
                $out .= $char;
                continue;
            }
            $next = $value[++$i];
            $mapped = self::MAP[$next] ?? null;
            if ($mapped === null) {
                $out .= '\\'.$next;
            } else {
                $out .= $mapped;
            }
        }

        return $out;
    }

    public static function needsDecoding(?string $value): bool
    {
        if ($value === null) {
            return false;
        }

        return strpos($value, '\\') !== false;
    }

    public static function knownSequences(): array
    {
        return array_keys(
            self::MAP
        );
    }

    public static function describe(string $sequence): ?string
    {
        $mapped = self::MAP[$sequence] ?? null;
        if ($mapped === null) {
            return null;
        }

        return sprintf('\\%s => 0x%02x', $sequence, ord($mapped));
    }
}
PHP
commit "Add EscapeDecoder for double-quoted values"
as "Fatima Zahra" "<email redacted>" "2026-01-22T15:30:00+00:00"
python3 - <<'PY'
p = "src/Parser/EscapeDecoder.php"
s = open(p).read().replace("'$' => '$'\n", "'$' => '$',\n        'e' => \"\\e\"\n")
open(p, "w").write(s)
PY
commit "Support the \\e escape"
git checkout -q master
as "Graham Campbell" "<email redacted>" "2026-01-26T12:00:00+00:00"
git merge -q --no-ff feature/escape-sequences -m "Merge pull request #601 from fatima/escape-sequences"
git branch -q -d feature/escape-sequences

# pure rename into the parser directory (content unchanged)
as "Marta Kowalska" "<email redacted>" "2026-02-11T09:15:00+01:00"
git mv src/Util/Regex.php src/Parser/Regex.php
commit "Move Regex helper next to the parser"

# add, revert, re-land
as "Dmitri Volkov" "<email redacted>" "2026-02-25T17:00:00+03:00"
cat > src/Parser/CommentStripper.php <<'PHP'
<?php

declare(strict_types=1);

namespace Dotenv\Parser;

final class CommentStripper
{
    private const MARKERS = [
        '#',
        ';'
    ];

    public static function strip(string $line): string
    {
        $quote = null;
        $length = strlen($line);
        for ($i = 0; $i < $length; $i++) {
            $char = $line[$i];
            if ($quote === null && ($char === '"' || $char === "'")) {
                $quote = $char;
                continue;
            }
            if ($quote !== null && $char === $quote) {
                $quote = null;
                continue;
            }
            if ($quote === null && in_array($char, self::MARKERS, true) && self::isCommentStart($line, $i)) {
                return rtrim(substr($line, 0, $i));
            }
        }

        return $line;
    }

    public static function isCommentStart(string $line, int $pos): bool
    {
        if ($pos === 0) {
            return true;
        }

        return ctype_space($line[$pos - 1]);
    }

    public static function hasComment(string $line): bool
    {
        return self::strip($line) !== $line;
    }

    public static function markers(): array
    {
        return array_merge(
            self::MARKERS,
            []
        );
    }

    public static function lastMarker(string $line): ?string
    {
        $found = null;
        foreach (self::MARKERS as $marker) {
            $pos = strrpos($line, $marker);
            if ($pos !== false && ($found === null || $pos > strrpos($line, $found))) {
                $found = $marker;
            }
        }

        return $found;
    }
}
PHP
commit "Strip inline comments in unquoted and quoted values"
as "Graham Campbell" "<email redacted>" "2026-02-27T08:00:00+00:00"
git revert --no-edit HEAD >/dev/null
as "Dmitri Volkov" "<email redacted>" "2026-03-10T11:30:00+03:00"
git revert --no-edit HEAD >/dev/null

# StyleCI: yoda comparisons and trailing commas, applied to the whole parser directory
as "StyleCI Bot" "<email redacted>" "2026-03-20T03:00:00+00:00"
python3 - <<'PY'
import glob, re
for p in sorted(glob.glob("src/Parser/*.php")):
    s = open(p).read()
    s = re.sub(r"(\$[\w>\[\]'-]+) (===|!==) (null|true|false)\b", r"\3 \2 \1", s)
    s = re.sub(r"([^,\[\(\s{])\n(\s+)\]", r"\1,\n\2]", s)
    open(p, "w").write(s)
PY
commit "Apply fixes from StyleCI"

test -z "$(git status --porcelain)" || { echo "dirty tree" >&2; exit 1; }
git reflog expire --expire=now --all
echo "built $DEST HEAD=$(git rev-parse HEAD)"
