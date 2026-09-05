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
2. On a clean, green `main`: `npm run release -- X.Y.Z` (or `patch`, `minor`, `major`; add `--dry-run` to see the plan). It dates the entry, sets the version in `package.json` and `CITATION.cff`, runs the tests, commits, tags `vX.Y.Z` and pushes.
3. Watch the `release` workflow: it publishes to npm with provenance, creates the GitHub release from the CHANGELOG entry, and installs the published version from the registry on three operating systems.

CI runs `scripts/release-gate.mjs` on every push: the version must agree across those files and `npm pack` may ship only the paths in `scripts/pack-allowlist.txt` (regenerate with `node scripts/release-gate.mjs --update` when the package layout changes on purpose).

The workflow uses npm trusted publishing and holds no token. Before the first tagged release the maintainer configures the trusted publisher on npmjs.com: package settings, Trusted publishing, GitHub Actions, repository `Bubblegunn/surviving-lines`, workflow `release.yml`, "Allow npm publish" ticked.
