#!/bin/sh
# Packs the package exactly as npm would publish it, installs the tarball in an empty
# project, imports it when it has a library entry, and runs the bin. Catches a missing
# `files` entry or a broken `bin` path before a version is on the registry.
set -eu
root=$(pwd)
name=$(node -p "require('./package.json').name")
bins=$(node -p "Object.keys(require('./package.json').bin || {}).join(' ')")
version=$(node -p "require('./package.json').version")
entry=$(node -p "const p = require('./package.json'); p.exports || p.main ? 'yes' : ''")
tgz=$(npm pack --silent 2>/dev/null | tail -1)
dir=$(mktemp -d)
cd "$dir"
npm init -y >/dev/null
npm install --silent --ignore-scripts "$root/$tgz"
if [ -n "$entry" ]; then
  node --input-type=module -e "import('$name').then(m => { const k = Object.keys(m); if (!k.length) throw new Error('no exports'); console.log('exports:', k.join(', ')); })"
else
  echo "no main or exports: command-line package, import step skipped"
fi
# Every declared executable is checked. `--` keeps npx from reading --help as its own option (npm 11
# then exits 0 for a missing bin), and the explicit exit is needed because a failing command on the
# left of `&&` does not trip `set -e`: until 2026-10-14 the bin check printed nothing and the script
# still exited 0 when the bin path was broken.
for bin in $bins; do
  npx --no -- "$bin" --help >/dev/null || { echo "bin failed: $bin --help" >&2; exit 1; }
  actual_version=$(npx --no -- "$bin" --version 2>/dev/null) || { echo "bin failed: $bin --version" >&2; exit 1; }
  [ "$actual_version" = "$version" ] || { echo "bin version mismatch: $bin (expected $version, got $actual_version)" >&2; exit 1; }
  echo "bin ok: $bin --help and --version ($actual_version)"
done
cd "$root" && rm -rf "$dir" "$tgz"
