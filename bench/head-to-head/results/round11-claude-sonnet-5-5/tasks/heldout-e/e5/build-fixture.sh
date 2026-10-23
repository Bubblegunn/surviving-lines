#!/usr/bin/env bash
# Usage: build-fixture.sh <dest-dir>
# Clones the upstream repo, pins one commit, drops the remote, then adds
# synthetic commits with fixed authors/dates so every build has the same shas.
set -euo pipefail
URL=https://github.com/rack/rack-attack
PIN=b771ea18afb9e6b625906a641d2d331e6d0c282b
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

SANTI=("Santiago Bartesaghi" "<email redacted>")
JONAS=("Jonas Keller" "<email redacted>")
HIRO1=("Hiroshi Tanaka" "hiroshi@tanaka.example")
HIRO2=("Hiroshi Tanaka" "<email redacted>")
GH=("GitHub" "<email redacted>")

# Santiago: rubocop Style/StringLiterals autocorrect (double -> single quotes) over lib/ and spec/; sha goes in .git-blame-ignore-revs
python3 - <<'PY'
import re, subprocess
n = 0
for p in subprocess.check_output(["git", "ls-files", "lib/*.rb", "spec/*.rb"], text=True).split():
    out = []
    for line in open(p).read().split("\n"):
        if "#{" in line or line.lstrip().startswith("#"):
            out.append(line)
            continue
        new = re.sub(r'"([^"\'\\#]*)"', r"'\1'", line)
        n += new != line
        out.append(new)
    open(p, "w").write("\n".join(out))
print("autocorrected lines:", n)
PY
cm "${SANTI[@]}" "2026-08-04T10:00:00+0000" "Autocorrect Style/StringLiterals"
printf "# rubocop -a Style/StringLiterals\n%s\n" "$(git rev-parse HEAD)" > .git-blame-ignore-revs
cm "${SANTI[@]}" "2026-08-04T10:10:00+0000" "Add .git-blame-ignore-revs"

# Jonas: Layout/ExtraSpacing (collapse runs of spaces before = and or); whitespace-only, NOT in the ignore file
python3 - <<'PY'
import re, subprocess
n = 0
for p in subprocess.check_output(["git", "ls-files", "lib/*.rb", "spec/*.rb"], text=True).split():
    out = []
    for line in open(p).read().split("\n"):
        new = re.sub(r"(\S)  +(=|or)\b", r"\1 \2", line)
        n += new != line
        out.append(new)
    open(p, "w").write("\n".join(out))
print("spacing lines:", n)
PY
cm "${JONAS[@]}" "2026-08-18T12:00:00+0000" "Fix Layout/ExtraSpacing offenses"

# Hiroshi (PR squash-merged in the web UI, committer GitHub): Valkey store proxy
cat > lib/rack/attack/store_proxy/valkey_proxy.rb <<'RB'
# frozen_string_literal: true

require 'rack/attack/base_proxy'

module Rack
  class Attack
    module StoreProxy
      class ValkeyProxy < BaseProxy
        def self.handle?(store)
          defined?(::Valkey) && store.is_a?(::Valkey)
        end

        def initialize(client)
          super(client)
        end

        def read(key)
          rescuing { get(key) }
        end

        def write(key, value, options = {})
          if (expires_in = options[:expires_in])
            rescuing { setex(key, expires_in, value) }
          else
            rescuing { set(key, value) }
          end
        end

        def increment(key, amount, options = {})
          count = nil

          rescuing do
            pipelined do |redis|
              count = redis.incrby(key, amount)
              redis.expire(key, options[:expires_in]) if options[:expires_in]
            end
          end

          count.is_a?(Redis::Future) ? count.value : count
        end

        def delete(key, _options = {})
          rescuing { del(key) }
        end

        def delete_matched(matcher, _options = nil)
          cursor = '0'

          rescuing do
            # Fetch keys in batches using SCAN to avoid blocking the Valkey server.
            loop do
              cursor, keys = scan(cursor, match: matcher, count: 1000)
              del(*keys) unless keys.empty?
              break if cursor == '0'
            end
          end
        end

        private

        def rescuing
          yield
        rescue ::Valkey::BaseConnectionError
          nil
        end
      end
    end
  end
end
RB
cm "${HIRO1[@]}" "2026-09-02T10:00:00+0000" "Add Valkey store proxy (#310)" "${GH[@]}"
cat >> lib/rack/attack/store_proxy/valkey_proxy.rb <<'RB'

# Wrap Valkey::Client instances created without the high-level API.
module Rack
  class Attack
    module StoreProxy
      class ValkeyProxy
        def self.wrap(client)
          return client if client.is_a?(self)

          new(client)
        end

        def self.supported_version?(version)
          Gem::Version.new(version) >= Gem::Version.new('0.1.0')
        end
      end
    end
  end
end
RB
cm "${HIRO2[@]}" "2026-09-16T10:00:00+0000" "ValkeyProxy: add wrap and version check (#318)" "${GH[@]}"

# Santiago: tapioca-generated RBI for rack, committed as-is
python3 - <<'PY'
import os
os.makedirs("sorbet/rbi/gems", exist_ok=True)
L = ["# typed: true", "", "# DO NOT EDIT MANUALLY", "# This is an autogenerated file for types exported from the `rack` gem.",
     "# Please instead update this file by running `bin/tapioca gem rack`.", ""]
for i in range(1, 19):
    L += ["class Rack::Middleware%d" % i, "  sig { params(app: T.untyped).void }", "  def initialize(app); end", "",
          "  sig { params(env: T::Hash[String, T.untyped]).returns(T.untyped) }", "  def call(env); end", "end", ""]
open("sorbet/rbi/gems/<email redacted>", "w").write("\n".join(L))
PY
cm "${SANTI[@]}" "2026-09-30T10:00:00+0000" "Add sorbet RBI for rack"

[ -z "$(git status --porcelain)" ] || { echo "dirty tree" >&2; exit 1; }
[ "$(git rev-parse --abbrev-ref HEAD)" = master ]
echo "built $(git rev-parse HEAD)"

