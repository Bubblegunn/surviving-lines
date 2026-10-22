#!/usr/bin/env bash
# build-fixture.sh <dest-dir> : deterministic fixture for task d3
REPO_URL=https://github.com/rack/rack-attack.git
PIN=77195a5be6f69645aef0f62c1c54f13998d3a08d
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

# ---- synthetic history. Contributors send patches; the maintainer applies them (committer != author).
MAINT_N="Gonzalo Rodriguez"; MAINT_E="<email redacted>"

as "Hye-jin Park" "<email redacted>" "2026-01-14T19:10:00+09:00" "$MAINT_N" "$MAINT_E"
python3 - <<'PY'
p = "lib/rack/attack/store_proxy/redis_proxy.rb"
s = open(p).read()
add = """
        def multi_increment(keys, amount, options = {})
          rescuing do
            keys.map do |key|
              count = increment(key, amount, options)
              count
            end
          end
        end

        def ttl(key)
          rescuing do
            with do |redis|
              redis.ttl(key)
            end
          end
        end

        def exists?(key)
          rescuing do
            with do |redis|
              redis.exists(key)
            end
          end
        end
"""
marker = "\n        private\n"
assert marker in s
s = s.replace(marker, add + marker, 1)
open(p, "w").write(s)
PY
commit "Add multi_increment, ttl and exists? to RedisProxy"

as "Divya Rao" "<email redacted>" "2026-01-28T11:45:00+05:30" "$MAINT_N" "$MAINT_E"
cat > lib/rack/attack/store_proxy/memory_store_proxy.rb <<'RB'
# frozen_string_literal: true

require 'rack/attack/base_proxy'

module Rack
  class Attack
    module StoreProxy
      class MemoryStoreProxy < BaseProxy
        def self.handle?(store)
          defined?(::ActiveSupport::Cache::MemoryStore) && store.is_a?(::ActiveSupport::Cache::MemoryStore)
        end

        def read(key)
          rescuing { __getobj__.read(key, :raw => true) }
        end

        def write(key, value, options = {})
          rescuing { __getobj__.write(key, value, options.merge(:raw => true)) }
        end

        def increment(key, amount, options = {})
          rescuing { __getobj__.increment(key, amount, options) }
        end

        def delete(key, options = {})
          rescuing { __getobj__.delete(key, options) }
        end

        def delete_matched(matcher, options = {})
          rescuing { __getobj__.delete_matched(matcher, options) }
        end

        def entries
          rescuing { __getobj__.instance_variable_get('@data').keys }
        end

        def size
          rescuing { __getobj__.instance_variable_get('@data').size }
        end

        def clear
          rescuing { __getobj__.clear }
        end

        def stats
          rescuing { { :size => size, :keys => entries.length, :store => 'memory' } }
        end

        private

        def rescuing
          yield
        rescue StandardError => e
          warn 'MemoryStoreProxy error: ' + e.message
          nil
        end
      end
    end
  end
end
RB
commit "Add MemoryStoreProxy for ActiveSupport::Cache::MemoryStore"

# Mei extracts methods from DalliProxy into a new file: lines move, authorship should not
as "Mei Tanaka" "<email redacted>" "2026-02-09T15:00:00+09:00"
python3 - <<'PY'
p = "lib/rack/attack/store_proxy/dalli_proxy.rb"
s = open(p).read()
start = s.index("        def read(key)")
end_ = s.index("        private\n")
block = s[start:end_]
s = s[:start] + "        include DalliAccessors\n\n" + s[end_:]
s = s.replace("require 'rack/attack/base_proxy'\n", "require 'rack/attack/base_proxy'\nrequire 'rack/attack/store_proxy/dalli_accessors'\n", 1)
open(p, "w").write(s)
new = """# frozen_string_literal: true

module Rack
  class Attack
    module StoreProxy
      module DalliAccessors
""" + block.rstrip("\n") + """
      end
    end
  end
end
"""
open("lib/rack/attack/store_proxy/dalli_accessors.rb", "w").write(new)
PY
commit "Extract Dalli read/write/increment/delete into DalliAccessors"

# patch applied by the maintainer, plus a trailing-whitespace fix by the same contributor
as "Hye-jin Park" "<email redacted>" "2026-02-20T09:20:00+09:00" "$MAINT_N" "$MAINT_E"
python3 - <<'PY'
p = "lib/rack/attack/store_proxy/redis_cache_store_proxy.rb"
s = open(p).read()
i = s.rindex("      end\n    end\n  end\nend")
add = """
        def ttl(key)
          rescuing do
            store.redis.with { |conn| conn.ttl(namespaced(key)) }
          end
        end
"""
s = s[:i] + add + s[i:]
open(p, "w").write(s)
PY
commit "Add ttl to RedisCacheStoreProxy"

# a contributor adds a file, the maintainer drops it again
as "Jaroslav Novak" "<email redacted>" "2026-03-03T08:30:00+01:00" "$MAINT_N" "$MAINT_E"
cat > lib/rack/attack/store_proxy/null_proxy.rb <<'RB'
# frozen_string_literal: true

module Rack
  class Attack
    module StoreProxy
      class NullProxy
        def read(_key); nil; end
        def write(_key, _value, _options = {}); true; end
        def increment(_key, _amount, _options = {}); 1; end
        def delete(_key); true; end
        def handle?(_store); false; end
        def clear; true; end
        def stats; {}; end
        def keys; []; end
        def ttl(_key); -1; end
        def exists?(_key); false; end
      end
    end
  end
end
RB
commit "Add NullProxy"
as "$MAINT_N" "$MAINT_E" "2026-03-09T20:00:00-03:00"
git rm -q lib/rack/attack/store_proxy/null_proxy.rb
commit "Remove NullProxy, unused"

# rubocop bot autocorrect (Style/StringLiterals, Style/HashSyntax); no ignore-revs file in this repo
as "github-actions[bot]" "41898282+github-actions[bot]@users.noreply.github.com" "2026-04-14T05:00:00+00:00"
python3 - <<'PY'
import glob, re
for p in glob.glob("lib/rack/attack/store_proxy/*.rb"):
    s = open(p).read()
    s = re.sub(r"'([^'\"\\#]*)'", r'"\1"', s)
    s = re.sub(r":(\w+) => ", r"\1: ", s)
    open(p, "w").write(s)
PY
commit "[bot] rubocop -A autocorrect (Style/StringLiterals, Style/HashSyntax)"

test -z "$(git status --porcelain)" || { echo "dirty tree" >&2; exit 1; }
git reflog expire --expire=now --all
echo "built $DEST HEAD=$(git rev-parse HEAD)"
