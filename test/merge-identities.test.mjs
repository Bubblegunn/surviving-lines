// @ts-check
// --merge-identities: the addresses that linkIdentities groups as one person become one row, in memory only. The table,
// the group blocks, the bus factor, the reviewers view, the reformat comparison and the JSON all read the merged rows.
// Fixtures are in scripts/fixtures.mjs (troySplit, groupSplit, splitBus, reformatSplit, basic).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderGroups, renderMarkdown, renderReviewers, renderCsv, renderJson, foldAddresses, identityMergeLine } = await import("../bin/surviving-lines.js");

const MERGED_LINE = "identities merged in memory (nothing written): ";
/** @param {keyof typeof import("../scripts/fixtures.mjs").FIXTURES} name @param {(dir: string) => Promise<void>} fn */
async function withFixture(name, fn) {
  const dir = buildFixture(name);
  try {
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}
const SCHEMA = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
/** @param {any} r */
const linesByMail = (r) => Object.fromEntries(r.authors.map((/** @type {any} */ a) => [a.mail, a.lines]));

test("merged table: one row per person, labelled with the address count, and the headline total is unchanged", async () => {
  await withFixture("troySplit", async (dir) => {
    const plain = await analyse(parseArgs(["--cwd", dir]));
    const r = await analyse(parseArgs(["--cwd", dir, "--merge-identities"]));
    assert.equal(plain.authors.length, 4);
    assert.equal(r.authors.length, 2);
    assert.deepEqual(
      r.authors.map((/** @type {any} */ a) => [a.author, a.mail, a.lines, a.addresses]),
      [
        ["Ada", "ada@example.com", 20, 2],
        ["Troy Goode", "troy@laptop.example", 16, 2],
      ],
    );
    const sum = r.authors.reduce((s, a) => s + a.lines, 0);
    assert.equal(sum, r.sample.linesAttributed, "the merged rows add up to the headline figure");
    assert.equal(sum, plain.sample.linesAttributed);
    const table = renderTable(r, 10);
    assert.match(table, /^Ada \(2 addresses\) +20 +55\.6% +2 +50\.0%$/m);
    assert.match(table, /^Troy Goode \(2 addresses\) +16 +44\.4% +2 +50\.0%$/m);
  });
});

test("merged rows sum the commits and recompute both shares on the table's own totals", async () => {
  await withFixture("troySplit", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--merge-identities"]));
    assert.equal(r.commitWindow.commits, 4);
    const [ada] = r.authors;
    assert.equal(ada.commits, 2, "Ada's two single-commit addresses make two commits");
    assert.equal(ada.commitShare, 0.5);
    assert.equal(ada.lineShare, 20 / 36);
    assert.equal(r.authors[1].commitShare, 0.5);
  });
});

test("--group-by blocks merge the addresses of a person inside each block", async () => {
  await withFixture("groupSplit", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--group-by", "dir", "--merge-identities"]));
    const lib = r.grouping?.groups.find((g) => g.key === "lib");
    const docs = r.grouping?.groups.find((g) => g.key === "docs");
    assert.ok(lib && docs);
    assert.deepEqual(lib.authors, [{ author: "Ada", mail: "ada@example.com", lines: 20, lineShare: 1, linesWithBlank: 20, shareWithBlank: 1, addresses: 2 }]);
    assert.equal(lib.busFactor?.value, 1);
    assert.equal(docs.authors.length, 1, "Bob has one address and no block change");
    assert.equal(docs.authors[0].addresses, undefined);
    const text = renderGroups(r, 10);
    assert.match(text, /^Ada \(2 addresses\) +20 +100\.0%$/m);
  });
});

test("the bus factor is computed on the merged rows, so a person split in two counts as one", async () => {
  await withFixture("splitBus", async (dir) => {
    const plain = await analyse(parseArgs(["--cwd", dir]));
    const r = await analyse(parseArgs(["--cwd", dir, "--merge-identities"]));
    assert.deepEqual(plain.busFactor?.authors, ["Bob", "Charlie"], "unmerged, Ada's two addresses are two small authors");
    assert.deepEqual(r.busFactor?.authors, ["Ada", "Bob"], "merged, Ada's 12 lines are one author of the top two");
    assert.match(renderTable(r, 10), /^bus factor 2: Ada \(2 addresses\) and Bob together hold/m);
  });
});

test("the reviewers view merges a person's addresses, takes the newest commit of either, and lists both", async () => {
  await withFixture("troySplit", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "src", "--merge-identities"]));
    const reviewers = r.reviewers;
    assert.ok(reviewers);
    assert.equal(reviewers.authors.length, 2);
    const ada = reviewers.authors[0];
    assert.equal(ada.mail, "ada@example.com");
    assert.equal(ada.addresses, 2);
    assert.equal(ada.lastCommit, "2026-01-11", "the laptop address committed a day after the desktop one");
    assert.deepEqual(reviewers.suggested[0].mails, ["ada@example.com", "ada@laptop.example.org"]);
    assert.match(renderReviewers(r, 5), /^Ada \(2 addresses\) +20 +55\.6% +2 +2026-01-11 +2026-01-11 +active$/m);
  });
});

test("the reformat comparison lists the plain count merged too, and the block names the merged author", async () => {
  await withFixture("reformatSplit", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--merge-identities"]));
    assert.equal(r.reformat.applied, true);
    assert.deepEqual(
      r.reformat.uncorrected?.authors.map((/** @type {any} */ a) => [a.author, a.mail, a.lines, a.addresses]),
      [
        ["Bob", "bob@example.com", 20, undefined],
        ["Ada", "ada@example.com", 13, 2],
      ],
    );
    assert.deepEqual(r.reformat.uncorrected?.busFactor?.authors, ["Bob"]);
    assert.ok(renderTable(r, 10).includes("Authors who gain lines from this: Ada (2 addresses) 33 (100.0%) with the correction, 13 (39.4%) without."), renderTable(r, 10));
  });
});

test("a run without the flag keeps every address as its own row, and says so in the JSON", async () => {
  await withFixture("troySplit", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.equal(r.authors.length, 4);
    assert.deepEqual(r.identityMerge, { applied: false, groups: [] });
    assert.deepEqual(r.authors.map((/** @type {any} */ a) => a.addresses), [undefined, undefined, undefined, undefined]);
  });
});

test("the JSON names each merged person with every address, its lines and commits; identityHints stay unmerged", async () => {
  await withFixture("troySplit", async (dir) => {
    const plain = await analyse(parseArgs(["--cwd", dir]));
    const r = await analyse(parseArgs(["--cwd", dir, "--merge-identities"]));
    assert.deepEqual(r.identityMerge, {
      applied: true,
      groups: [
        {
          name: "Ada",
          mail: "ada@example.com",
          addresses: [
            { mail: "ada@example.com", lines: 12, commits: 1 },
            { mail: "ada@laptop.example.org", lines: 8, commits: 1 },
          ],
          lines: 20,
          commits: 2,
        },
        {
          name: "Troy Goode",
          mail: "troy@laptop.example",
          addresses: [
            { mail: "troy@laptop.example", lines: 10, commits: 1 },
            { mail: "troy@work.example", lines: 6, commits: 1 },
          ],
          lines: 16,
          commits: 2,
        },
      ],
    });
    assert.deepEqual(r.identityHints, plain.identityHints);
    assert.equal(r.identityHints.count, 2);
  });
});

test("the table names the merge in one line under it, and prints no identity hint in its place", async () => {
  await withFixture("troySplit", async (dir) => {
    const text = renderTable(await analyse(parseArgs(["--cwd", dir, "--merge-identities"])), 10);
    const expected =
      "identities merged in memory (nothing written): Ada = ada@example.com 12 lines 1 commit, ada@laptop.example.org 8 lines 1 commit; " +
      "Troy Goode = troy@laptop.example 10 lines 1 commit, troy@work.example 6 lines 1 commit; " +
      "this is a guess from names and addresses; leave out --merge-identities for the unmerged table.";
    assert.ok(text.split("\n").includes(expected), text);
    assert.doesNotMatch(text, /identity hint:/);
  });
});

test("with no suggested identities the flag says none were found, and the table is the plain one", async () => {
  await withFixture("basic", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--merge-identities"]));
    assert.equal(r.identityMerge.applied, true);
    assert.deepEqual(r.identityMerge.groups, []);
    const text = renderTable(r, 10);
    assert.ok(text.split("\n").includes("identities merged in memory: none found"), text);
  });
});

test("the merge line caps people and addresses, then counts the rest", () => {
  const address = (/** @type {number} */ i) => ({ mail: `p${i}@x.example`, lines: 1, commits: 1 });
  const person = (/** @type {number} */ i, /** @type {number} */ n) => ({ name: `Person ${i}`, mail: `p${i}@x.example`, addresses: Array.from({ length: n }, (_, k) => address(i * 10 + k)), lines: n, commits: n });
  const four = identityMergeLine({ applied: true, groups: [person(1, 2), person(2, 2), person(3, 2), person(4, 2)] });
  assert.ok(four.startsWith(`${MERGED_LINE}Person 1 = p10@x.example 1 line 1 commit, p11@x.example 1 line 1 commit; Person 2 = `), four);
  assert.ok(four.includes("; Person 3 = p30@x.example 1 line 1 commit, p31@x.example 1 line 1 commit; and 1 more; this is a guess"), four);
  const many = identityMergeLine({ applied: true, groups: [person(1, 4)] });
  assert.ok(many.includes("Person 1 = p10@x.example 1 line 1 commit, p11@x.example 1 line 1 commit, p12@x.example 1 line 1 commit, and 1 more; this is a guess"), many);
});

test("the figures use thousands separators and singular nouns only for one", () => {
  const line = identityMergeLine({ applied: true, groups: [{ name: "Troy Goode", mail: "troy@laptop.example", addresses: [{ mail: "troy@laptop.example", lines: 667, commits: 93 }, { mail: "troy@work.example", lines: 1, commits: 1 }], lines: 668, commits: 94 }] });
  assert.ok(line.includes("Troy Goode = troy@laptop.example 667 lines 93 commits, troy@work.example 1 line 1 commit; this is a guess"), line);
  assert.equal(identityMergeLine({ applied: true, groups: [{ name: "Big", mail: "b@x.example", addresses: [{ mail: "b@x.example", lines: 12345, commits: 2 }, { mail: "c@x.example", lines: 1, commits: 1 }], lines: 12346, commits: 3 }] }).includes("12,345 lines 2 commits"), true);
});

test("foldAddresses sums lines and commits into the canonical address and marks only rows that hold several", () => {
  const canonicalOf = new Map([
    ["a@x.example", { author: "Ada", mail: "a@x.example" }],
    ["b@x.example", { author: "Ada", mail: "a@x.example" }],
  ]);
  const folded = foldAddresses(
    [
      { author: "Ada", mail: "b@x.example", lines: 4, commits: 1 },
      { author: "Bob", mail: "bob@x.example", lines: 3, commits: 2 },
      { author: "Ada", mail: "a@x.example", lines: 5, commits: 2 },
    ],
    canonicalOf,
  );
  assert.deepEqual(folded, [
    { author: "Ada", mail: "a@x.example", lines: 9, commits: 3, addresses: 2 },
    { author: "Bob", mail: "bob@x.example", lines: 3, commits: 2 },
  ]);
});

test("--merge-identities cannot be combined with --co-authors share or --identities", () => {
  assert.throws(() => parseArgs(["--merge-identities", "--co-authors", "share"]), /--merge-identities cannot be combined with --co-authors share/);
  assert.throws(() => parseArgs(["--merge-identities", "--identities"]), /--merge-identities cannot be combined with --identities/);
  assert.equal(parseArgs(["--merge-identities", "--json"]).mergeIdentities, true);
});

test("CSV and Markdown carry the merged rows, and the Markdown names the merge", async () => {
  await withFixture("troySplit", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--merge-identities", "--csv"]));
    const csv = renderCsv(r).split("\n");
    assert.equal(csv.length, 3);
    assert.match(csv[1], /^Ada,ada@example\.com,20,/);
    const md = renderMarkdown(await analyse(parseArgs(["--cwd", dir, "--merge-identities"])), 10);
    assert.match(md, /^\| Ada \(2 addresses\) \| 20 \|/m);
    assert.ok(md.includes(MERGED_LINE), md);
  });
});

test("every merged mode validates against the JSON schema", async () => {
  for (const [name, argv] of /** @type {const} */ ([
    ["troySplit", ["--merge-identities"]],
    ["troySplit", ["--merge-identities", "--reviewers", "src"]],
    ["groupSplit", ["--merge-identities", "--group-by", "dir"]],
    ["reformatSplit", ["--merge-identities"]],
    ["basic", ["--merge-identities"]],
  ])) {
    await withFixture(name, async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir, ...argv]));
      assert.deepEqual(schemaErrors(SCHEMA, JSON.parse(renderJson(r))), [], `${name} ${argv.join(" ")}`);
    });
  }
});

test("a result from before --merge-identities existed still renders its hint line", async () => {
  await withFixture("troySplit", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    const old = /** @type {any} */ ({ ...r });
    delete old.identityMerge;
    const text = renderTable(old, 10);
    assert.match(text, /^identity hint: 2 people may be counted twice/m);
    assert.doesNotMatch(text, /identities merged in memory/);
  });
});
