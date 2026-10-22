#!/usr/bin/env bash
# guard.sh before|after <run-dir>: hash hooks (~/.claude/settings.json) and mcpServers (~/.claude.json).
python3 -I - "$1" "$2" <<'PY'
import hashlib, json, os, sys
phase, run = sys.argv[1:3]
def h(path, key):
    try: v = json.load(open(os.path.expanduser(path))).get(key)
    except (OSError, ValueError): v = None
    return hashlib.sha256(json.dumps(v, sort_keys=True).encode()).hexdigest()
cur = {"hooks": h("~/.claude/settings.json", "hooks"), "mcpServers": h("~/.claude.json", "mcpServers")}
snap = os.path.join(run, "guard.json")
if phase == "before":
    os.makedirs(run, exist_ok=True); json.dump(cur, open(snap, "w")); sys.exit(0)
if json.load(open(snap)) != cur:
    print("GUARD: hooks or mcpServers hash changed", file=sys.stderr); sys.exit(1)
PY
