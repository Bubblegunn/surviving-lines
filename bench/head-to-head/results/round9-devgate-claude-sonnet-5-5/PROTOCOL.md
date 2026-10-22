# Frozen rulings of round 9 (development gate)

Extracted verbatim from `docs/HEAD-TO-HEAD.md` at the commits that froze each section (`git show <commit>:docs/HEAD-TO-HEAD.md`). The development-gate rule itself is step 6 of the best-rival specification (below). Commit order of this round: 53cc762 (analysis and rulings), d8dbd81 (feature code), 09e09d9 (iteration 1 product), 706f3a1 (iteration 1 diagnosis, before code), c689450 (iteration 2 product), ca5b21c (iteration 2 diagnosis, before code), fd519c6 and 7c78c82 (iteration 3 product).

## Development gate rule (BEST-RIVAL-SPEC step 6, as written by the owner on 2026-10-22)

> Measuring on a new held-out set is expensive and burns that set. Before it, run ours x3 on the most recent already-seen set (it no longer counts for scoring; it is the development set) with the same grading method, and compare with the best rival's published scores on those tasks. Ours must be strictly higher on every task, or at the ceiling together with the rival. If not, do not measure: analyse the lost criteria, make a general fix (no fixture-specific entries), test and review, and rerun the development gate. At most three iterations per round; record each with its cost. Publish the development-gate results in the evidence folder as a separate section that does not enter the score tables.

This round ran the gate on two seen sets (D from round 8, C from round 7) because the owner asked for both.

Redaction: three non-personal automation or placeholder addresses named in the rulings (a hosted translation bot, a lint-bot address, a localhost placeholder) are replaced by `<email redacted>` by `scrub.py`; the names beside them stay.

<!-- source: docs/HEAD-TO-HEAD.md at 53cc762 -->
## Round 9: rulings (frozen 2026-10-23 before any round 9 code change)

Source: `docs/BEST-RIVAL-r9.md` (primary rival: project-pilot invoked; second: plain Claude). Criteria, check scripts, tasks and the win rule do not change. Each rule names a general loss class; none names a fixture.

- **R9-1** Exact agreement between the full name of one identity (two or more words, letters only, accents and punctuation removed) and the address name of another identity is near-conclusive identity evidence (kind like `accent`). Partial name containment stays weak.
- **R9-3** Every view prints one scope line when one address appears under several author names and they were counted as one person (names capped at five). Skill: name them in the answer, never say "no duplicates" while the line is printed.
- **R9-4** Default table shows every author with at least 1% of the lines, minimum 10 rows, maximum 25 rows, then one tail line (count, combined share, largest tail author). Explicit `--top` keeps its meaning. A "last commit" column is added. The 1% threshold is not tuned on any seen task. Skill: on "which people" questions list every row shown and state the tail line.
- **R9-5** The prompt hint also matches natural ownership wording that does not start with "who" (for example "who actually wrote", "which people/authors", "still in the repo/code", "losing one or two people", "concentrated"). Phrases that appear verbatim in a seen task prompt are not used. Context cap and read-only guarantees stay.
- **R9-6** Skill text: in the default view `Co-authored-by` trailer names carry no lines unless `--co-authors share`.
- **R9-7** `--copies deep` prints a scope line that deep detection can credit lines to a commit that was later reverted.
- **R9-2 not adopted** (reverses R7-4; needs a seen-truth check; R9-1 covers the loss class more safely).

Development gate (BEST-RIVAL-SPEC step 6): ours x3 on held-out D (D1-D5) and on C1-C5, same grading, compared with the best rival's published scores; strictly higher or tied at the ceiling on every task. At most 3 iterations.

<!-- source: docs/HEAD-TO-HEAD.md at 706f3a1 -->
## Round 9 development gate, iteration 1: diagnosis and rulings

Frozen 2026-10-23 before any iteration 1 code change. Ours (`09e09d9`) was run x3 on the seen sets D and C and graded with the same method (results: `<home>/claude-kredi-runs/2026-10-23/r9/dev-D`, `dev-C`; this section does not enter the score tables). Criteria, check scripts, tasks and the win rule are unchanged.

| Task | Ours | Best rival | Result |
| --- | --- | --- | --- |
| D1 | 5.00 | - | ok |
| D2 | 4.33 | 4.33 (ppi) | tie below the ceiling, fail |
| D3 | 2.00 | 0.33 | ok |
| D4 | 4.00 | - | ok |
| D5 | 3.67 | - | ok |
| C1 | 2.67 (err=5) | 3.00 (base) | fail |
| C2 | 2.00 (round 7: 4.00) | 3.67 (bf), 3.00 (ppi) | fail, regression |
| C3 | 3.00 | - | ok |
| C4 | 2.67 (round 7: 3.67) | 3.00 (pp) | fail, regression |
| C5 | 2.00 (round 7: 3.00) | 2.00 | fail, regression |

Diagnosis from the failed criteria, the final answers and a re-run of the tool on the run repositories. Each class is general.

1. **Blank lines are counted as surviving lines (C4, C5, C2; probably the cause of the shifts against round 7 on the same code).** The truth of every held-out set counts non-blank lines. The tool counts blank lines, which inflate the denominator and move shares toward whoever writes more blank lines: C4 lib/ José Valim 56.7% against 60.7% (accepted 57.7% to 63.7%), C5 lines 1,187 against 1,007, C2 signer.py 366 lines against 279. Graders also cited the differing line counts as a reason to fail the numeric criteria. Not a rule change of R8: the round 7 and round 8 numbers were computed with blank lines as well, so the C2 drop from 4.00 to 2.00 is mostly the next two classes plus grader variance (every reason for C2 criterion 1 and 4 is the same in all nine votes).
2. **Automation identities that are not named `[bot]` stay in the table (C4 criterion 4, C5 criterion 5).** Weblate (`<email redacted>`, 80 lines) and StyleCI Bot (`<email redacted>`) were ranked as owners; the answers had to say "ask a person instead". The bots line also gave only a count ("1 identity"), so answers wrote "one bot identity is excluded" without a name and the grader read it as not saying bot commits were ignored (C2 criterion 4).
3. **Placeholder identities are ranked as people (C5 criterion 2).** `root@localhost` and "Your Name" appeared as two table rows; the criterion wants about 15% stated as unattributable and not offered as contacts.
4. **A commit that is clearly a codemod is only named, never set aside (C1 criterion 3, D2 run 3).** The check printed `d43be5f "all: go fix ./..." ... 38 surviving lines` as a candidate that was not set aside (frozen R8-2: a candidate is never set aside). All three C1 answers wrote that they "kept" the commit; the skill asks the agent to re-run with `--ignore-rev`, and it did not.
5. **Per-file answers where a package or directory share was asked (C2 criterion 1).** The question named two files and "the package"; every answer gave per-file tables only and failed criterion 1 in nine of nine votes (round 7 failed the same criterion). The skill gives no rule about a wider scope.
6. **Grader noise, not fixed:** C4 criterion 3 (the answers say "the same owners in nearly the same proportions" and also name the different second owner; the wording is the agent's), C1 criterion 1 and 2 (borderline hedging on a passing share), the unparsed replies behind C1 err=5, and several D2 run 3 reasons that contradict their own verdict ("numbers pass"). No code change for these. Candidate causes checked and not supported by the failed reasons: R8-1 plain `-C` default (shares for the named people are inside tolerance in every C2, C4 and C5 vote except through blank lines), R9-4 table shape, R9-3 scope line, R9-1, hint changes, skill length.

Rules for iteration 1 (R9-2 stays not adopted):

- **R9-8** Blank (whitespace-only) lines are not counted: they are dropped from every blame result before counting, and the file size used in the header is the non-blank size of each blamed file.
- **R9-9** More automation identities are bots by address: hosted translation platforms (Weblate, Crowdin, Transifex, Lokalise), `<email redacted>`, and the default GitHub Actions address. A person on a similar address is not matched. The `bots excluded` line names the identities (at most three).
- **R9-10** Placeholder identities (git's template name "Your Name", an address on `localhost`, `localhost.localdomain`, `(none)` or a `.local`, `.localdomain` or `.lan` host) keep their lines in the shares but are never suggested as a reviewer, and one scope line states their lines and share as not attributable to a person. `example.org` alone is not a placeholder.
- **R9-11** (supersedes the "never set aside" part of R8-2 for one case) A mechanical-rewrite candidate with both signs, the same small change in at least 10 files and a formatter, lint fix or codemod named in the subject, is set aside automatically like a reformat commit; the scope line says the rewrite was looked through. A candidate with one sign stays a named candidate that is not set aside.
- **R9-12** Skill text: when the question names files and also the package, the repository or a directory, run the tool on the wider scope too; state the `placeholder identities` line; name the bots and the `rewrites looked through` commits.

Run the development gate again after these changes (iteration 2) before any new held-out measurement.

<!-- source: docs/HEAD-TO-HEAD.md at ca5b21c -->
## Round 9 development gate, iteration 2: diagnosis and rulings

Frozen 2026-10-23 before any iteration 2 code change. Ours (`c689450`) was run x3 on the seen set D (results: `<home>/claude-kredi-runs/2026-10-23/r9/dev2-D`; this section does not enter the score tables). Criteria, check scripts, tasks and the win rule are unchanged.

| Task | Iteration 1 (`09e09d9`) | Iteration 2 (`c689450`) | Best rival | Result |
| --- | --- | --- | --- | --- |
| D1 | 5.00 | 3.00 (err=5, unparsed replies) | - | regrade by the controller |
| D2 | 4.33 | 4.33 | 4.33 (ppi) | tie below the ceiling, fail |
| D3 | 2.00 | 2.00 | 0.33 | ok |
| D4 | 4.00 | 2.00 | 2.00 (base) | fail, regression |
| D5 | 3.67 | 4.33 (err=2, unparsed replies) | - | regrade by the controller |

Diagnosis from the failed-criterion reasons of all nine votes per task, the final answers, and a read-only run of the tool on the D4 and D2 fixtures.

1. **D4 regression comes from R9-8 (blank lines dropped).** Iteration 1 failed only criterion 3 (see class 3) and, in one vote, criterion 4. Iteration 2 fails criterion 4 in 8 of 9 votes and criterion 1 in 3, every time with the same reason: the answer says 2,941 lines, the criterion wants about 3,320 (accept 3,150 to 3,500). Counting the fixture directly: the seven files of `src/` hold 2,941 non-blank lines and 3,322 lines in all; the D truth counts all lines, the truth of the held-out sets C counts non-blank lines. The two truths disagree about what a "line" is, so dropping blank lines is not wrong in itself (it moved C4, C5 and C2 shares by up to 4 points) but giving only the non-blank total is not enough for a reader who counts the file the way `wc -l` does. R9-9 (bots), R9-10 (placeholders), R9-11 (set-aside) and R9-12 (skill text) are not implicated: D4 has no bot, placeholder or codemod candidate that was set aside (the answers report "set aside 0 commits"), and the shares of the named people moved only by the denominator (Andrew Gallant 75.5% against 76.9%, both inside the accepted range).
2. **D2: the same denominator effect plus a display-name choice.** D2 run 2 and 3 both fail criterion 3 for the same reason: after the merge the row is named `bogem` (27 commits) and not Albert Nigmatzianov, because the merged row takes the name of the address with the most commits. A handle with one word wins over a person's full name. The graders also say the total is 10,587 and not about 12,200 (criterion 1 and 2, 5 of 9 votes mention it, 2 fail on it). Iteration 1 failed D2 run 3 on the same denominator, so the D2 tie is not new. The Sam Okafor `interface{}` to `any` rewrite (49 lines, 39 files, tool name `gofmt -r` is in the body only) stays a named candidate that is not set aside (R9-11 needs the name in the subject); Sam holds 0.4%, inside the criterion, so nothing is lost there.
3. **Not fixed, no general fix (D4 criterion 3, 9 of 9 votes in both iterations).** The criterion wants the share of `src/error.rs` and Kaito Mori named. The question asks about `src/` as a whole; Kaito is absent from the table because he holds no lines. Reporting a per-file share for a file nobody asked about is not a general behaviour, and a rule that names every person with 0 lines is not either. Grader noise and question shape; no change.
4. **Not fixed:** D1 and D5 unparsed replies (the controller regrades), D2 run 1 criterion 2 and 3 reasons that contradict their own verdict.

Rules for iteration 2:

- **R9-13** (narrows R9-8) Blank lines stay out of every share and every count, and the header also states the size with them: `N of N lines attributed (non-blank; M with blank lines)`, printed only when a blank line was dropped. JSON: `sample.linesWithBlank`, integer, always present. The skill text tells the agent to give both numbers when it states a total.
- **R9-14** A merged row is named by the most complete personal name in the group (two or more alphabetic words, for example "Albert Nigmatzianov") before a one-word handle; within the same kind the address with the most commits still decides (R8-5 unchanged otherwise). The address list of the person still names every address.

Run the development gate again (iteration 3) after these changes before any new held-out measurement.
