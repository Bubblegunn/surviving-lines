# t1 criteria (scope: lib/, tj/commander.js base plus synthetic commits). Check against t1/truth.txt.

Pitfalls combined: quote-style reformat commit, bot-generated bundle, human-committed vendored copy, one contributor under three identities (two names, two emails), rename of a module, merge commit.

1. Names John Gee as the top owner of surviving lines in lib/ with a share within 2 percentage points of truth (89.3%), counting both John Gee emails as one person. FAIL if the top owner is release-bot, Dana Importer or Pat Prettier.
2. Excludes or discounts lib/generated/typings.bundle.js (bot, @generated) and lib/vendor/ (vendored leven copy), and says so. FAIL if either is counted as authorship, or if bot or Dana Importer appears among owners.
3. States that the quote-style reformat commit (subject "style: switch to double quotes (prettier)", sha c48d035b01...) does not count as authorship, or equivalently that Pat Prettier owns about 0 lines. FAIL if Pat Prettier owns more than 1%.
4. Identifies that Wee Bit appears under three identities (Wee Bit <aweebit64@gmail.com>, Wee Bit <wee.bit@example.net>, aweebit <aweebit64@gmail.com>) and merges them, giving about 161 lines (3.7%, tolerance 1 point) and rank 2 ahead of TJ Holowaychuk (117 lines).
5. Bus factor: says it is 1 (one person holds more than 50%, and also at least 80%). FAIL if it reports 2 or more, or bases it on commit counts.
