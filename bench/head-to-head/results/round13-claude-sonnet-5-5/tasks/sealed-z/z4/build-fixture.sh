#!/usr/bin/env bash
# usage: build-fixture.sh <dest-dir>
set -euo pipefail
DEST=${1:?dest dir}
URL=https://github.com/ruby-grape/grape-entity
PIN=4db6a7822cde32d031b574170e2b383f4ca1df4b
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

LB=("Lena Brandt" "lena.brandt@kestrel.example")
MS1=("Marco Silva" "marco.silva@kestrel.example")
MS2=("Marco Silva" "<email redacted>")
AK=("Anna Kowalczyk" "anna.k@kestrel.example")
DEP=("dependabot[bot]" "$(addr bd5a8d6c673b738d52b0ac42a110045f3f964b3ebfc1d60ea805af743b1dc0e6)")

# 1. Lena: licence header in every ruby file under lib/ and spec/
python3 -I - <<'PY'
import subprocess
magic = '# frozen_string_literal: true\n'
hdr = '# Copyright (c) 2026 the grape-entity authors.\n# Released under the MIT license, see LICENSE.\n'
n = 0
for p in subprocess.check_output(['git', 'ls-files', 'lib', 'spec'], text=True).split():
    if not p.endswith('.rb'):
        continue
    s = open(p, encoding='utf-8').read()
    if s.startswith(magic):
        open(p, 'w', encoding='utf-8').write(magic + hdr + s[len(magic):])
        n += 1
print('headers added to', n, 'files')
PY
git add -A
c "${LB[0]}" "${LB[1]}" "2026-07-14T10:00:00+0200" "Add copyright header to all library and spec files"

# 2. Marco: rename lib/grape_entity/delegator -> delegators
git mv lib/grape_entity/delegator lib/grape_entity/delegators
python3 -I - <<'PY'
p = 'lib/grape_entity/delegator.rb'
s = open(p).read()
s = s.replace("require 'grape_entity/delegator/", "require 'grape_entity/delegators/")
open(p, 'w').write(s)
PY
git add -A
c "${MS1[0]}" "${MS1[1]}" "2026-07-21T09:00:00+0100" "Rename delegator directory to delegators"

# 3. Marco (other address): fork nesting_exposure into grouped_exposure
python3 -I - <<'PY'
s = open('lib/grape_entity/exposure/nesting_exposure.rb', encoding='utf-8').read()
s = s.replace('NestingExposure', 'GroupedExposure')
s = s.replace('nesting_exposure', 'grouped_exposure')
assert 'GroupedExposure' in s
open('lib/grape_entity/exposure/grouped_exposure.rb', 'w', encoding='utf-8').write(s)
PY
rep lib/grape_entity/exposure/grouped_exposure.rb "        def nesting?
          true
        end" "        def nesting?
          true
        end

        def grouped?
          true
        end

        def group_name
          @options[:group] || @key
        end"
git add -A
c "${MS2[0]}" "${MS2[1]}" "2026-08-03T18:30:00+0100" "Add GroupedExposure (copy of NestingExposure with a group name)"

# 4. Anna's patch, applied by Marco (author != committer)
rep lib/grape_entity/exposure/base.rb '              "#{entity.class.name} missing attribute `#{@attribute}'"'"' on #{entity.object}"' '              "#{entity.class.name} missing attribute `#{@attribute}'"'"' on #{entity.object.class}"'
rep lib/grape_entity/exposure/base.rb "        def override?
          @override
        end
" "        def override?
          @override
        end

        def inspect
          \"#<#{self.class.name} attribute=#{@attribute.inspect} key=#{@key.inspect}>\"
        end
"
git add -A
c "${AK[0]}" "${AK[1]}" "2026-08-10T14:00:00+0200" "Shorter error message and a readable inspect for exposures" "${MS1[0]}" "${MS1[1]}" "2026-08-12T10:00:00+0100"

# 5. dependabot: Gemfile
rep Gemfile "gem 'rspec', '~> 3.9'" "gem 'rspec', '~> 3.13'"
git add -A
c "${DEP[0]}" "${DEP[1]}" "2026-08-18T03:00:00+0000" "Update rspec requirement from ~> 3.9 to ~> 3.13"
rep Gemfile "gem 'rubocop', '~> 1.0'" "gem 'rubocop', '~> 1.85'"
git add -A
c "${DEP[0]}" "${DEP[1]}" "2026-09-02T03:00:00+0000" "Update rubocop requirement from ~> 1.0 to ~> 1.85"

# 6. Marco: spec for grouped exposure
cat > spec/grape_entity/exposure/grouped_exposure_spec.rb <<'RB'
# frozen_string_literal: true
# Copyright (c) 2026 the grape-entity authors.
# Released under the MIT license, see LICENSE.

require 'spec_helper'

describe Grape::Entity::Exposure::GroupedExposure do
  subject(:exposure) { described_class.new(:stats, { group: :metrics }, []) }

  it 'is a nesting exposure' do
    expect(exposure.nesting?).to be true
  end

  it 'is grouped' do
    expect(exposure.grouped?).to be true
  end

  it 'prefers the explicit group name' do
    expect(exposure.group_name).to eq :metrics
  end

  it 'falls back to the key' do
    expect(described_class.new(:stats, {}, []).group_name).to eq :stats
  end
end
RB
git add -A
c "${MS1[0]}" "${MS1[1]}" "2026-09-15T11:00:00+0100" "Spec for GroupedExposure"

# 7. dependabot: gemspec
rep grape-entity.gemspec "s.add_dependency 'activesupport', '>= 3.0.0'" "s.add_dependency 'activesupport', '>= 7.0.0'"
git add -A
c "${DEP[0]}" "${DEP[1]}" "2026-10-05T03:00:00+0000" "Update activesupport requirement from >= 3.0.0 to >= 7.0.0"
git status --porcelain | grep . && { echo dirty; exit 1; } || true
echo "HEAD $(git rev-parse HEAD)"
