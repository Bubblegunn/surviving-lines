# Held-out set: surviving-lines tasks

Written 2026-10-21. Three tasks, each with prompt.txt, build-fixture.sh (clones a public repo fully, pins a commit, adds pitfall commits with fixed dates so shas are reproducible), truth.py (plain git, run as `python3 -I truth.py <fixture-dir>`), truth.txt (output from a verified build) and criteria.md.

- t1: ownership of one directory (lib/ in tj/commander.js) with a quote-style reformat commit, a bot-generated bundle, a vendored copy, a three-identity contributor and a module rename.
- t2: whole-repo ownership and bus factor (expressjs/morgan) with a whitespace-only reindent, a test/ to tests/ rename, vendored and generated files, a lockfile, a merge commit and one maintainer under two names and two emails.
- t3: reviewers for lib/internal/helpers.js (expressjs/compression) whose code was cut out of index.js by another author, then reindented, renamed, and stamped by a bot, with one reviewer under two names.

Truth conventions: `git blame -w -M -C -C -C` at HEAD, reformat commits ignored via --ignore-revs-file, bots and generated/vendored/lockfile files dropped, identities merged by shared email or normalised name. Bus factor is the fewest people holding more than 50% (and at least 80%) of surviving lines.
