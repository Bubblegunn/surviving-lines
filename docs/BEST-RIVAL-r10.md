# Best-rival analysis, round 10 (2026-10-23)

Round 10 is research, analysis and implementation only. No benchmark, held-out or development-gate run was made, and no model call was made to diagnose a result. The measurement is the next round. Every claim below about a graded answer comes from the committed evidence folders `bench/head-to-head/results/round8-claude-sonnet-5-5/` and `round9-devgate-claude-sonnet-5-5/`. Claims about rival code come from clones read in `/tmp/r10-rivals/` and were not executed.

Path note: the round 9 development gate graded ours alone, three iterations (`09e09d9`, `c689450`, `7c78c82`), against rival scores published in round 8 and round 7. The rival cells come from the SDK path of round 8 (set D) and from the older CLI path of round 7 (set C). Those two paths differ (see PROTOCOL below), so the C-set rival numbers are not directly comparable.

## 1. Best rival per task (set D, latest published)

| Task | Ours, iteration 3 | Best other arm | Gap | Status |
| --- | --- | --- | --- | --- |
| D1 | 4.33 | 3.67 | +0.67 | ahead |
| D2 | 4.33 | 4.33 (ppi) | 0 | tie below the ceiling, fails Rule B |
| D3 | 1.67 | 0.33 | +1.33 | ahead |
| D4 | 2.00 | 2.00 (base) | 0 | tie below the ceiling, fails Rule B |
| D5 | 4.50 without one unparsed cell | 3.00 | +1.50 | ahead (one cell unparsed in five regrades) |

Set C, iteration 3: 5.00 / 4.67 / 5.00 / 4.33 / 4.33 against 3.00 / 3.67 / 0.67 / 3.00 / 2.00. Ahead on all five.

The primary rival is again ppi (project-pilot invoked), tied on D2. The base arm (plain Claude) ties on D4, so it is the second rival.

## 2. What the rivals did on D2 and D4 (read from the round 8 transcripts)

- **ppi, D4** (`round8.../runs/D4/ppi/1/final.txt`): `git blame -w -M -C` run by hand, 4,206 lines (all lines, generated table included), then 76.9% without the table; a **per-file table** (file, lines, top author, share, number of authors) with `src/error.rs` Andrew Gallant 64.5%. The per-file table is what criterion 3 asks for (the share of `src/error.rs`).
- **base, D4** (`runs/D4/base/1/final.txt`): same blame flags, names the commit "Fix line endings in error.rs" in the prose, gives a per-file top-author table (`error.rs` 64.5%), and the total both with the generated table (4,205) and without (3,322). It counts blank lines.
- **ppi, D2** (`runs/D2/ppi/1/final.txt`): 12,194 live lines (all lines), Eric Paris 16.6%, Alex Ogier 10.1%, Noah Dietz 10.1%; excludes `vendor/` and the generated file; does not mention `bogem`, Lena Voss's squash-merge or the co-authors.
- **base, D2**: also 12,194 lines, merges the `interface{}` to `any` commit with `--ignore-rev`, lists Eric Paris 16.7%.

Both rivals count every blame line, blank lines included. The D truth does the same; the C truth does not.

## 3. Our lost and tied criteria, with the grader's reasons

Source: all nine grader votes per task in iterations 1 to 3 (`grades/iterN/D/D2-*`, `D4-*`; extraction script `bench/head-to-head/vote-reasons.py`).

| Criterion | Votes failing | What the reasons say | Class |
| --- | --- | --- | --- |
| D4 c3 (Kaito Mori at most 0.5%, `src/error.rs` about 65% Andrew Gallant) | 27 of 27 in three iterations | "Kaito Mori is not mentioned", "no per-file figure for src/error.rs". The answers never name the commit or the file. | **Product gap** (disclosure), also question shape: the question asks about `src/` |
| D4 c4 (total about 3,320, accept 3,150 to 3,500) | 9 of 9 (iter 2), 8 of 9 (iter 3) | "the total is 2,941 lines, outside 3,150 to 3,500"; the with-blank total 3,322 appears only in parentheses. | **Product gap**: the headline basis is non-blank, the D truth is all lines |
| D4 c1 (Andrew Gallant 74.5% to 79.5%, bus factor 1) | 9 of 9 (iter 2), 9 of 9 (iter 3) | Most reasons say the share is in range and the bus factor is 1, then fail the vote on the denominator ("ground truth 76.88%"). The criterion does not ask for that denominator. | **Grader noise** with a product cause: the reasons contradict the verdict; it disappears when the answer's headline basis matches the truth |
| D2 c1 / c2 (top three, total 12,200) | 2 of 3 votes in iteration 2 run 2, iteration 3 run 2 and run 3 (c1) | "the answer reports 10,587 lines, not about 12,200"; Noah Dietz ranked above Alex Ogier (both 10.1%) because the order is by non-blank lines. | **Product gap** (same basis) |
| D2 c3 (`bogem` merged under the personal name) | 3 of 3 in iter 2 run 2; 1 of 3 in iter 3 run 3 | Iteration 2: the row was named `bogem`. Iteration 3: the one failing vote says "merged at 1.7%, within range, not a separate entry. This passes." | Product gap fixed by R9-14; the remaining vote is **grader noise** |
| D2 c4 (Lena Voss, co-authors) | 1 of 3 (iter 2 run 1) | "does not mention Ravi Menon or Yuki Sato". Trailer-only names carry no lines by default. | Question shape (the question does not name them); skill rule exists |

Summary: of the two ties, the D4 tie is mostly a product gap plus the shape of the question. Two criteria (c3 and c4) are answered wrongly or not at all in a way a reader could also notice; one (c1) is grader noise caused by the basis mismatch. The D2 tie has a product cause (the headline basis) and grader noise in single votes.

## 4. Technique map

Licences were read from each repository's `LICENSE`. "Idea only" means no code is copied; nothing in this round copies rival code, so `THIRD-PARTY-NOTICES.md` is unchanged.

| Rival technique | Source (file:line) | Licence | Do we have it | General or task-specific | Decision |
| --- | --- | --- | --- | --- | --- |
| Count every blame line, blank lines included | git-fame `gitfame/_gitfame.py:320`; mcp-git-historian `mcp_git_historian/core.py:410-443` | MPL-2.0 / MIT | We drop blank lines (`bin/surviving-lines.js:422`), and state both sizes in the header only (`:1065`) | General (two conventions exist: `wc -l` and non-blank) | **Adapt as an idea**: show both bases next to each other, in the table, the bus-factor line and JSON (R10-1) |
| Per-file table: file, lines, main owner, share, top three owners | mcp-git-historian `core.py:1060-1100`; git-who `internal/tally/tree.go:67-97` | MIT / MIT | Internal `fileCounts` map (`:1053`), no output | General | **Adopt as an idea**: `--files` view (R10-2) |
| Disclose a commit that touched many lines without changing code | none of the rivals does it | n/a | Only commits that leave surviving lines are examined (`:1453-1511`) | General | **Adopt** (own design): whitespace-only commit line (R10-3) |
| Self-describing rule text and counts of what was skipped | mcp-git-historian `core.py:722-748, 1130` | MIT | Yes for dropped files, bots, set-aside (`:2545`) | General | Already have; extend to the new line only |
| git config hardening (`core.quotepath=off`, `log.showSignature=false`, `color.ui=never`) | mcp-git-historian `core.py:56-62` | MIT | Only `core.precomposeunicode=false` (`:521`) | General | **Adopt** the three settings (R10-5), they are plain config names |
| Bus factor over files owned (Avelino greedy removal) | truckfactor `compute.py:118-139`; paper arXiv 1604.06766 | GPL-3.0 / paper | Line-coverage definition only (`:959`) | General | **Idea only, deferred**: second definition needs its own design and tests; not needed for D2 or D4 |
| Ignore author regex | git-fame `_gitfame.py:285-291` | MPL-2.0 | Bots only | General | Reject: not behind any lost criterion |
| Orphaned file (owners inactive) metric | mcp-git-historian `core.py:996-1140` | MIT | `last commit` column | General | Reject for now: ownership by survival is the product's question |
| Name-key merge (same name, many emails) | git-fame `_gitfame.py:422-430` | MPL-2.0 | `--merge-identities` suggestions with strength | General | Already have a stricter version |
| COCOMO, hour estimates, heatmaps, timezone histograms | git-fame `:131`; git-quick-stats `:129-150` | MPL-2.0 / MIT | no | Task-specific | Reject |
| git `ignored` / `unblamable` counts from porcelain | git-blame docs | n/a | no | General | Defer: needs a porcelain parse change; no lost criterion depends on it |

## 5. Second-best arm (base)

Base wins D4 by naming the line-ending commit and giving the per-file table, both in prose it wrote itself. R10-2 and R10-3 give our output the same two facts, so the skill can pass them on instead of asking the model to rebuild them. Base's weakness is the denominator (4,205 with the generated table as headline) and ranking the generated file's author; our generated-file exclusion already handles that.

## 6. Additional scan (GitHub, PyPI, npm, arXiv; fetched 2026-10-23)

Sources with licence, fetched through the HTTP APIs. arXiv and Semantic Scholar returned HTTP 429 for several queries ("line ownership", "degree of authorship", "identity merging", Bird et al., Kouters et al.); those are not verified.

| Name | URL | Licence | Technique worth noting |
| --- | --- | --- | --- |
| Truck Factor (Avelino et al.) | https://arxiv.org/abs/1604.06766 ; https://github.com/aserg-ufmg/Truck-Factor | paper; MIT | Degree of authorship, greedy removal until fewer than half the files have an author; alias step: same email, or name Levenshtein distance 1 |
| ALFAA | https://arxiv.org/abs/1901.03363 | paper | Alias candidates from time zone, shared files, message embeddings; used as suggestions |
| Knowledge Islands (Cury, Avelino) | https://arxiv.org/abs/2408.08733 | paper | Truck factor per folder and file |
| Authorship metrics and AI code | https://arxiv.org/abs/2507.08160 ; https://arxiv.org/abs/2606.20882 | papers | Authorship is less reliable when code is AI-generated; say that authorship is not knowledge |
| git-blame-ignore | https://github.com/sulthonzh/git-blame-ignore | MIT | Transparent score for mechanical commits: files touched, message words, whitespace share, lines per file |
| blamewheel | https://github.com/JesseRWeigel/blamewheel | MIT | Coverage of the top candidates instead of a concentration index; states its thresholds are unvalidated |
| Hercules | https://github.com/src-d/hercules | README says Apache-2.0, GitHub API "Other" | Identity join (same email new name, same name new email); `--people-dict` file |
| git-of-theseus | https://github.com/erikbern/git-of-theseus | PyPI field empty | Survival curves per cohort |
| git-fame | https://github.com/casperdcl/git-fame | MPL-2.0 | See table above |
| git-who | https://github.com/sinclairtarget/git-who | MIT | Owner tree by directory |
| mcp-git-historian | https://github.com/AleBrito124356/mcp-git-historian | MIT | Per-file `main_owner`, `files_as_main_owner`, `orphaned`; rule text inside the answer |
| truckfactor | https://github.com/HelgeCPH/truckfactor | GPL-3.0 | Files-owned truck factor (idea only) |
| busfactor (several) | dav-m85/busfactor (MIT), zgrossbart/busfactor (Apache-2.0), k41n/busfactor (MIT), kriskimmerle/busfactor (MIT) | as listed | Per-developer per-file coverage reports (listed by search, not read) |
| gitinspector | PyPI `gitinspector` | GPLv3 | Per-author stats |
| codeowners-gen, codeowners-audit | https://github.com/moveeeax/codeowners-gen , https://github.com/watson/codeowners-audit | MIT | CODEOWNERS from blame; coverage gaps |

None of the surveyed tools documents how it treats blank lines. Showing both counts is therefore not copied from anyone.

## 7. Development gate

Not run in round 10 (owner instruction: no measurement). The three round 9 iterations stay the record. The next round must run the gate before any held-out measurement.
