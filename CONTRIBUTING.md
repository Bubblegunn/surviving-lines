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

Maintainers only.

1. Bump `version` in `package.json` and add a `CHANGELOG.md` entry.
2. Commit, then `git tag vX.Y.Z && git push origin main --tags`.
3. The `release` workflow runs the tests and publishes to npm with provenance (`npm publish --provenance`), so every published tarball is linked to the exact commit and workflow run that built it.

The workflow uses npm trusted publishing and holds no token. Before the first tagged release, the maintainer configures the trusted publisher on npmjs.com: package settings, Trusted publishing, GitHub Actions, repository `Bubblegunn/surviving-lines`, workflow `release.yml`.
