# t2 criteria (scope: whole repo, expressjs/morgan base plus synthetic commits). Check against t2/truth.txt.

Pitfalls combined: whitespace-only reindent of all JS, directory rename test/ to tests/, vendored directory, bot-generated bundle and lockfile, merge commit, one maintainer under two names and two emails.
Scope note: truth.txt prints a PRIMARY scope (.js files) and a SECONDARY scope (all first-party text). A share is correct if it is within 3 points of the figure for either printed scope, and the answer states which scope it used.

1. Names Douglas Christopher Wilson as the top owner of surviving lines with a share within 3 points of 74.7% (js) or 61.8% (all text). FAIL if the top owner is dependabot[bot], Tab Lover or Dana Importer, or if the answer ranks by commit count.
2. States that the four-space indentation commit (sha f4ce92f2dd..., "style: four-space indentation") is whitespace only and does not change authorship, or shows Tab Lover with about 0 lines. FAIL if Tab Lover is credited with more than 1%.
3. Excludes or discounts dist/morgan.bundle.js (generated), package-lock.json (lockfile) and vendor/on-finished (vendored), and says so. FAIL if any of them is counted, or if dependabot[bot] or Dana Importer is listed as an owner.
4. Detects that Ulises Gascon / Ulises Gascón / ulises are one person (shared email ulisesgascongonzalez@gmail.com, shared normalised name with ugascon@example.com), merges them, and ranks them second with about 12.6% (js) or 14.3% (all text), tolerance 2 points. FAIL if they are reported as separate people, or if Jon Church is ranked second.
5. Bus factor: fewest people holding more than 50% is 1; holding at least 80% is 2 (js scope) or 3 (all-text scope). The answer must give a number consistent with its stated scope and threshold. FAIL if it says 1 with no concentration detail, or gives a number derived from commits.
