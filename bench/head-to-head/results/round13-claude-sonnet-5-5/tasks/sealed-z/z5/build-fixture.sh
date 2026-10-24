#!/usr/bin/env bash
# usage: build-fixture.sh <dest-dir>
set -euo pipefail
DEST=${1:?dest dir}
URL=https://github.com/ramsey/collection
PIN=1678fd9462f52aa77532479fdf37c3bae47dd8fe
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

c() { # c <name> <email> <author-date> <message> [committer-name committer-email committer-date]
  GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_AUTHOR_DATE="$3" \
  GIT_COMMITTER_NAME="${5:-$1}" GIT_COMMITTER_EMAIL="${6:-$2}" GIT_COMMITTER_DATE="${7:-$3}" \
  git commit -q --no-verify -m "$4"
}
rep() {
  python3 -I - "$1" "$2" "$3" <<'PY'
import sys
p, old, new = sys.argv[1:4]
s = open(p, encoding='utf-8', newline='').read()
assert s.count(old) == 1, (p, old, s.count(old))
open(p, 'w', encoding='utf-8', newline='').write(s.replace(old, new))
PY
}
HDR='<?php

/**
 * This file is part of the ramsey/collection library
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 *
 * @copyright Copyright (c) Ben Ramsey <'"$(addr f514481fa9cfdfd5dbcaccb3e5b480f18ea05ebf331cddf9b1c5a2a96a78fef5)"'>
 * @license http://opensource.org/licenses/MIT MIT
 */

declare(strict_types=1);
'

BR2=("Ben Ramsey" "$(addr 7adaa12b77d33b62ef80bebf503b4c1edaf4a1c55e6ddb9edcd23a77563a92b6)")
BR1=("Ben Ramsey" "$(addr f514481fa9cfdfd5dbcaccb3e5b480f18ea05ebf331cddf9b1c5a2a96a78fef5)")
KN1=("Kasia Nowak" "kasia@nowak.example")
TW1=("Tomasz Wrona" "tomasz.wrona@brightmail.example")
TW2=("T. Wrona" "<email redacted>")
GHA=("github-actions[bot]" "$(nr '41898282+github-actions[bot]')")
DEP=("dependabot[bot]" "$(addr bd5a8d6c673b738d52b0ac42a110045f3f964b3ebfc1d60ea805af743b1dc0e6)")

# 1. Ben squash-merges Katarzyna Nowak's PR; the author field is Ben's
{ printf '%s\n' "$HDR"; cat <<'PHP'; } > src/Grouping.php
namespace Ramsey\Collection;

use function is_int;
use function is_string;
use function sprintf;

/**
 * Groups the elements of a collection by a key computed per element.
 */
final class Grouping
{
    /**
     * @param CollectionInterface<T> $collection
     * @param callable(T): (int | string) $keyOf
     *
     * @return array<int | string, list<T>>
     *
     * @template T
     */
    public static function by(CollectionInterface $collection, callable $keyOf): array
    {
        $groups = [];

        foreach ($collection as $element) {
            $key = $keyOf($element);

            if (!is_int($key) && !is_string($key)) {
                throw new Exception\InvalidArgumentException(
                    sprintf('Group keys must be int or string, %s given', get_debug_type($key)),
                );
            }

            $groups[$key][] = $element;
        }

        return $groups;
    }

    /**
     * @param CollectionInterface<T> $collection
     * @param callable(T): (int | string) $keyOf
     *
     * @return array<int | string, int>
     *
     * @template T
     */
    public static function countBy(CollectionInterface $collection, callable $keyOf): array
    {
        $counts = [];

        foreach (self::by($collection, $keyOf) as $key => $elements) {
            $counts[$key] = count($elements);
        }

        return $counts;
    }

    /**
     * @param array<int | string, list<T>> $groups
     *
     * @return list<T>
     *
     * @template T
     */
    public static function flatten(array $groups): array
    {
        $flat = [];

        foreach ($groups as $elements) {
            foreach ($elements as $element) {
                $flat[] = $element;
            }
        }

        return $flat;
    }
}
PHP
{ printf '%s\n' "$HDR"; cat <<'PHP'; } > tests/GroupingTest.php
namespace Ramsey\Collection\Test;

use Ramsey\Collection\Collection;
use Ramsey\Collection\Exception\InvalidArgumentException;
use Ramsey\Collection\Grouping;

class GroupingTest extends TestCase
{
    public function testByGroupsElementsUnderTheirKey(): void
    {
        $collection = new Collection('int', [1, 2, 3, 4, 5]);

        $groups = Grouping::by($collection, fn (int $n): string => $n % 2 === 0 ? 'even' : 'odd');

        $this->assertSame(['odd' => [1, 3, 5], 'even' => [2, 4]], $groups);
    }

    public function testByRejectsKeysThatAreNotIntOrString(): void
    {
        $collection = new Collection('int', [1]);

        $this->expectException(InvalidArgumentException::class);

        Grouping::by($collection, fn (int $n): float => $n / 2);
    }

    public function testCountBy(): void
    {
        $collection = new Collection('string', ['a', 'bb', 'cc', 'ddd']);

        $counts = Grouping::countBy($collection, fn (string $s): int => strlen($s));

        $this->assertSame([1 => 1, 2 => 2, 3 => 1], $counts);
    }

    public function testFlattenKeepsGroupOrder(): void
    {
        $this->assertSame([1, 3, 2, 4], Grouping::flatten(['odd' => [1, 3], 'even' => [2, 4]]));
    }

    public function testFlattenOfNothingIsEmpty(): void
    {
        $this->assertSame([], Grouping::flatten([]));
    }
}
PHP
git add -A
c "${BR2[0]}" "${BR2[1]}" "2026-05-12T09:00:00-0400" "Add grouping support (squash of #57)

Squashed from pull request #57.
Original authorship: Katarzyna Nowak <$(nr katarzyna.nowak)>"

# 2. Kasia fixes her own file afterwards
rep src/Grouping.php "                    sprintf('Group keys must be int or string, %s given', get_debug_type(\$key))," "                    sprintf('Group keys must be int or string, %s given', get_debug_type(\$key)),
                    previous: null,"
rep src/Grouping.php "    public static function flatten(array \$groups): array
    {
        \$flat = [];
" "    public static function flatten(array \$groups): array
    {
        // keep the original group order, ignore empty groups
        \$flat = [];
"
git add -A
c "${KN1[0]}" "${KN1[1]}" "2026-05-20T16:00:00+0200" "Follow-up to #57: document flatten order, name the previous exception"

# 3. Tomasz: namespace rename Tool -> Support (mechanical) with the directory moves
git mv src/Tool src/Support
git mv tests/Tool tests/Support
python3 -I - <<'PY'
import subprocess
for p in subprocess.check_output(['git', 'ls-files', '*.php'], text=True).split():
    s = open(p, encoding='utf-8').read()
    n = s.replace('Ramsey\\Collection\\Tool', 'Ramsey\\Collection\\Support').replace('Ramsey\\Collection\\Test\\Tool', 'Ramsey\\Collection\\Test\\Support')
    if n != s:
        open(p, 'w', encoding='utf-8').write(n)
PY
git add -A
c "${TW1[0]}" "${TW1[1]}" "2026-06-02T10:00:00+0200" "Rename Tool namespace to Support (mechanical: moves and namespace/use lines only)"

# 4. Tomasz (other identity): generated type map
mkdir -p src/Generated
python3 -I - <<'PY'
out = ['<?php', '', '/**', ' * @generated by bin/generate-types.php, do not edit by hand', ' */', '',
       'declare(strict_types=1);', '', 'namespace Ramsey\\Collection\\Generated;', '',
       'final class TypeMap', '{', '    public const MAP = [']
for i in range(1, 281):
    out.append("        'type-%03d' => 'Ramsey\\\\Collection\\\\Generated\\\\T%03d'," % (i, i))
out += ['    ];', '}', '']
open('src/Generated/TypeMap.php', 'w').write('\n'.join(out))
PY
git add -A
c "${TW2[0]}" "${TW2[1]}" "2026-06-16T22:10:00+0200" "Add generated type map"

# 5. github-actions: php-cs-fixer yoda_style on src (1:1 line rewrites)
python3 -I - <<'PY'
import re, subprocess
n = 0
for p in subprocess.check_output(['git', 'ls-files', 'src/*.php'], text=True).split():
    s = open(p, encoding='utf-8').read()
    t, k = re.subn(r'(\$\w+) === null', r'null === \1', s)
    if k:
        open(p, 'w', encoding='utf-8').write(t); n += k
print('yoda rewrites:', n)
PY
git add -A
c "${GHA[0]}" "${GHA[1]}" "2026-06-30T04:00:00+0000" "Apply php-cs-fixer changes"

# 6. Tomasz: ChunkTrait + test (real work)
{ printf '%s\n' "$HDR"; cat <<'PHP'; } > src/Support/ChunkTrait.php
namespace Ramsey\Collection\Support;

use function array_chunk;
use function array_values;

/**
 * Provides chunking for collections backed by a plain array.
 */
trait ChunkTrait
{
    /**
     * @return array<array-key, mixed>
     */
    abstract public function toArray(): array;

    /**
     * Splits the elements into lists of at most `$size` elements.
     *
     * @param positive-int $size
     *
     * @return list<list<mixed>>
     */
    public function chunk(int $size): array
    {
        return array_chunk(array_values($this->toArray()), $size);
    }

    /**
     * Returns the number of chunks `chunk($size)` would produce.
     *
     * @param positive-int $size
     */
    public function chunkCount(int $size): int
    {
        return (int) ceil(count($this->toArray()) / $size);
    }
}
PHP
{ printf '%s\n' "$HDR"; cat <<'PHP'; } > tests/Support/ChunkTraitTest.php
namespace Ramsey\Collection\Test\Support;

use Ramsey\Collection\Support\ChunkTrait;
use Ramsey\Collection\Test\TestCase;

class ChunkTraitTest extends TestCase
{
    private function subject(array $items): object
    {
        return new class ($items) {
            use ChunkTrait;

            public function __construct(private array $items)
            {
            }

            public function toArray(): array
            {
                return $this->items;
            }
        };
    }

    public function testChunkSplitsIntoLists(): void
    {
        $this->assertSame([[1, 2], [3, 4], [5]], $this->subject([1, 2, 3, 4, 5])->chunk(2));
    }

    public function testChunkIgnoresKeys(): void
    {
        $this->assertSame([['a', 'b']], $this->subject(['x' => 'a', 'y' => 'b'])->chunk(5));
    }

    public function testChunkCount(): void
    {
        $this->assertSame(3, $this->subject([1, 2, 3, 4, 5])->chunkCount(2));
        $this->assertSame(0, $this->subject([])->chunkCount(2));
    }
}
PHP
git add -A
c "${TW1[0]}" "${TW1[1]}" "2026-07-14T11:00:00+0200" "Add ChunkTrait"

# 7. Ben: small docblock change and a .mailmap that only knows part of the story
rep src/Sort.php "/**
 * Collection sorting
 */" "/**
 * Sort directions for collections
 */"
cat > .mailmap <<EOF
Ben Ramsey <${BR1[1]}> <${BR2[1]}>
Tomasz Wrona <${TW1[1]}> T. Wrona <${TW2[1]}>
EOF
git add -A
c "${BR1[0]}" "${BR1[1]}" "2026-08-05T09:00:00-0400" "Reword the Sort docblock and add .mailmap"

# 8. dependabot: composer.json only
rep composer.json '"php": "^8.1"' '"php": "^8.2"'
git add -A
c "${DEP[0]}" "${DEP[1]}" "2026-09-01T03:00:00+0000" "Bump minimum php to 8.2"
git status --porcelain | grep . && { echo dirty; exit 1; } || true
echo "HEAD $(git rev-parse HEAD)"
