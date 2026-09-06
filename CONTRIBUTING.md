# Contributing

surviving-lines measures who wrote the code that is still alive in a git ref, next to commit share. Contributions are welcome, and small ones are the easiest to merge.

## Running the tests

```
npm ci
npm test        # node:test; builds a throwaway repository with two authors, a rewrite, a rename and a binary
```

Node 20 or newer and git are required. Note that Node 20's test runner does not expand glob patterns, so test files are named explicitly in `package.json`.

## Adding to the tool

To add an output format or an option: add it to `parseArgs` and `HELP` in `bin/surviving-lines.js`, implement it next to `renderTable`, and add a test in `test/surviving-lines.test.js` that runs against the fixture repository. Keep the file dependency-free.

## Pull requests

- One change per pull request, with a test that fails before and passes after.
- Say in the description what a user sees differently; the template asks for it.
- Keep the package dependency-free unless the issue discussing the dependency was accepted first.
- No em dashes in shipped text (README, help, output). Plain sentences.
- Contributors are credited in the changelog entry for the release that ships their change.

## Releasing

Maintainers only. One command; the workflow does the rest.

1. Write the `## X.Y.Z (unreleased)` entry in `CHANGELOG.md` and merge it.
2. On a clean, green `main`: `npm run release -- X.Y.Z` (or `patch`, `minor`, `major`; add `--dry-run` to see the plan). It dates the entry, sets the version in `package.json` and `CITATION.cff`, runs the tests, commits, tags `vX.Y.Z`, pushes, and then moves the major tag (`v0` today) to the release and force-pushes it, so anyone pinning a major follows the newest release in it. The major tag moves from this command and not from the workflow because release tags are admin-only by ruleset; a workflow token could not move it.
3. Watch the `release` workflow: it publishes to npm with provenance, creates the GitHub release from the CHANGELOG entry, and installs the published version from the registry on three operating systems.

CI runs `scripts/release-gate.mjs` on every push: the version must agree across those files and `npm pack` may ship only the paths in `scripts/pack-allowlist.txt` (regenerate with `node scripts/release-gate.mjs --update` when the package layout changes on purpose).

The workflow uses npm trusted publishing and holds no token. Before the first tagged release the maintainer configures the trusted publisher on npmjs.com: package settings, Trusted publishing, GitHub Actions, repository `Bubblegunn/surviving-lines`, workflow `release.yml`, "Allow npm publish" ticked.

## What a review here looks like

This is a promise about how your pull request is treated, written down so you can hold it to it.

**You get a real review, quickly.** Not a rubber stamp and not a queue. Every outside pull request so
far has been reviewed the same day it arrived.

**Your work gets checked, not admired.** If you send a test, it gets run against something broken to
confirm it fails; if you send a fix, the bug gets reproduced before and after. When that happens the
review says exactly what was tried, and the throwaway code used to check it is handed to you, because
it is more useful in your hands than in a maintainer's terminal.

**A change request comes with the answer**, not just the objection: the file, the shape, and why the
first idea does not work. If something is refused, the reason is given plainly and whatever part of
your work was used still gets the credit.

**A review written against a stale commit is a mistake on this side.** If you push while a review is
being written, say so; the review will be redone against your head rather than leaving you to argue
with a comment about a bug you already fixed.

**Your name goes in three places when it merges**, and stays there: the changelog entry, the README
beside the thing you built, and the commit itself, because merges are squashed with your authorship
intact and never rewritten under someone else's name.

**You are told when it ships.** A merge is a promise; a release is the thing you can show somebody. You
get a message on your pull request with the version and the install command when your code is live.

**And you get thanked, in words.** Reviewing your code carefully is respect, but it is not the same as
saying thank you, and both are owed.
