# Changelog

## 0.1.3 (2026-09-05)

`--markdown` prints the table as a Markdown table for pasting into issues and README files, mutually exclusive with `--json` and `--csv`, with pipes escaped in author labels. Contributed by @shivam-070208 (#6, closes #1).

`bin/surviving-lines.js` held a literal NUL byte inside the sampling hash separator, so git classified the file as binary and no diff on it was readable, on GitHub or locally. The byte is now the `\u0000` escape: the same string, the same sample, and a file people can review. Output verified byte-identical at three sample rates before and after.

`--version` has a test, because the release workflow's smoke job calls it on three operating systems and nothing else covered it.

The README examples are a fresh run of the current code on openwiki at `1e6d54c`; the previous plain-table block predated the address suffix that separates two identities with the same name.

README section on how the sample is chosen: the hash, the NUL separator, why it is deterministic across machines, a worked example on openwiki and what a 1-in-5 sample is worth across three seeds (#2).

`npm run release` now moves the `v0` major tag to every release, and the release workflow starts on full version tags only, so the moving tag cannot start a second publish.

## 0.1.2 (2026-09-05)

`--csv` output; README comparison with git shortlog and git fame; Turkish README; contributing guide, issue templates, roadmap and a provenance release workflow.

## 0.1.1 (2026-09-05)

Plain errors outside a repository and for a ref that is not a commit.

## 0.1.0 (2026-09-05)

First release.
