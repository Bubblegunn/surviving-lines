# Changelog

## 0.1.5 (2026-09-05)

`--identities` lists the addresses in a repository that look like one person and prints the `.mailmap` lines that merge them. Someone who has committed from a laptop and a work machine is in their own history twice, every count here splits them, and nothing says so. Three signals produce a suggestion: the same name on two addresses, the same address name on two domains, and a GitHub noreply address whose login appears as the name or the address on another row. Role addresses such as `dev@` and bot addresses are ignored. Comparison uses the case fold that makes a Turkish name match itself and a decomposed accent match a precomposed one. Nothing is written, and the tool cannot know whether two identities are one person, so it prints the evidence and stops. On langchain-ai/openwiki at `1e6d54c` it finds two, one of them the duplicate row already visible in this README's own example.

## 0.1.4 (2026-09-05)

A repository whose paths are stored decomposed now produces a report instead of failing. Git precomposes command-line arguments on macOS, so a path read out of the tree and handed back to `git blame` came back as a different string and matched nothing, ending the run with `fatal: no such path café.ts in HEAD` and no output. Every call now pins `core.precomposeunicode=false`, so the path sent is the path git stored. A checkout authored on Linux carrying Korean, French, Turkish, Vietnamese, Portuguese or Spanish filenames was affected; ASCII repositories produce byte-identical output.

The plain table is padded by terminal columns rather than UTF-16 code units. East Asian characters are drawn two columns wide and combining marks none at all, so a Chinese, Japanese or Korean name pushed the numbers right and a decomposed Latin name pulled them left, and no column lined up. The ranges are the Wide and Fullwidth classes of Unicode Annex #11 plus the emoji blocks terminals draw double width. The Markdown, JSON and CSV outputs never padded and are unchanged.

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
