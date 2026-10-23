// @ts-check
// --reviewers <path>: who should review a path, by surviving lines, with each author's last commit there and whether
// that author was active in the year before the ref commit. The fixture is `owners` in scripts/fixtures.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PEOPLE, buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderReviewers, renderJson } = await import("../bin/surviving-lines.js");

const BIN = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
const COMBINED = "--reviewers prints its own view; it can be combined with --json only";

/** @param {keyof typeof PEOPLE} who */
const mailOf = (who) => PEOPLE[who][1];

/** @param {(dir: string) => Promise<void>} fn */
async function withOwners(fn) {
  const dir = buildFixture("owners");
  try {
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

test("the owners of a path are ranked by surviving lines, each with its commits, last commit and activity", async () => {
  await withOwners(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib"]));
    assert.equal(r.reviewers?.path, "lib");
    assert.equal(r.reviewers?.asOf, "2026-04-12");
    assert.equal(r.reviewers?.inactiveAfterDays, 365);
    // Charlie 40, Ada 26 (20 plus her 6 laptop lines), Bob 8. Dependabot's 12 lines are left out as a bot.
    assert.deepEqual(
      r.reviewers?.authors.map((a) => [a.author, a.lines, a.commits, a.lastCommit, a.active]),
      [
        [PEOPLE.charlie[0], 40, 1, "2024-01-05", false],
        [PEOPLE.ada[0], 26, 2, "2026-04-10", true],
        [PEOPLE.bob[0], 8, 1, "2026-04-01", true],
      ],
    );
  });
});

test("a second address that .mailmap folds into one person counts as that person, with its newest commit", async () => {
  await withOwners(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib"]));
    const mails = r.reviewers?.authors.map((a) => a.mail);
    assert.deepEqual(mails, [mailOf("charlie"), mailOf("ada"), mailOf("bob")]);
    assert.equal(r.reviewers?.authors.find((a) => a.mail === mailOf("ada"))?.lastCommit, "2026-04-10");
  });
});

test("an author whose last commit at the path is more than a year before the ref is not active, and is marked, not dropped", async () => {
  await withOwners(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib"]));
    const text = renderReviewers(r, 5);
    assert.ok(text.includes("not active in the year before 2026-04-12: Charlie"), text);
    assert.ok(!text.includes("prefer the active"), text);
    assert.match(text, /^Charlie +40 +54\.1% +1 +2024-01-05 +\d{4}-\d\d-\d\d +inactive$/m);
  });
});

test("the suggestion lists the three largest owners by lines, each with its share and activity, and the active-only cut next to it", async () => {
  await withOwners(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib"]));
    const text = renderReviewers(r, 5);
    // Total 74 lines: the inactive Charlie 54.1% stays first, then Ada 35.1% and Bob 10.8%.
    assert.ok(text.includes("suggested by surviving lines: Charlie (40 lines, 54.1%, last commit 2024-01-05, inactive), Ada (26 lines, 35.1%, last commit 2026-04-10, active), Bob (8 lines, 10.8%, last commit 2026-04-01, active)"), text);
    assert.ok(text.includes("active only (a cut by recent commits; the line-ranked list above is the ownership answer): Ada (26 lines, 35.1%, last commit 2026-04-10, active), Bob (8 lines, 10.8%, last commit 2026-04-01, active)"), text);
    assert.ok(text.includes("who should review lib  (surviving lines in lib, as of 2026-04-12)"), text);
  });
});

test("bots are left out of the reviewers view, and --include-bots puts them back", async () => {
  await withOwners(async (dir) => {
    const without = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib"]));
    assert.equal(without.reviewers?.authors.some((a) => a.author === "dependabot[bot]"), false);
    const withBots = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib", "--include-bots"]));
    assert.equal(withBots.reviewers?.authors.some((a) => a.author === "dependabot[bot]"), true);
  });
});

test("a single file is a valid path and lists only the authors of that file", async () => {
  await withOwners(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib/bob.js"]));
    assert.deepEqual(r.reviewers?.authors.map((a) => [a.author, a.lines]), [[PEOPLE.bob[0], 8]]);
  });
});

test("a path that only bots touched has no suggestion", async () => {
  await withOwners(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib/deps.txt"]));
    assert.deepEqual(r.reviewers?.authors, []);
    assert.ok(renderReviewers(r, 5).includes("suggested: none, no author holds a surviving line here"));
  });
});

test("the CLI prints the reviewers view, and --top limits its rows", async () => {
  await withOwners(async (dir) => {
    const run = (/** @type {string[]} */ extra) => spawnSync(process.execPath, [BIN, "--cwd", dir, "--reviewers", "lib", ...extra], { encoding: "utf8" });
    const full = run([]);
    assert.equal(full.status, 0, full.stderr);
    assert.ok(full.stdout.includes("who should review lib"), full.stdout);
    assert.ok(full.stdout.includes("author"), full.stdout);
    const one = run(["--top", "1"]);
    assert.equal(one.status, 0, one.stderr);
    assert.ok(one.stdout.includes("… 2 more authors"), one.stdout);
  });
});

test("--reviewers can be combined with --json only, and parseArgs says so for the other formats", () => {
  for (const extra of [["--csv"], ["--markdown"], ["--identities"], ["--group-by", "dir"], ["--suggest-codeowners", "--group-by", "dir"]]) {
    assert.throws(() => parseArgs(["--reviewers", "lib", ...extra]), { message: COMBINED }, extra.join(" "));
  }
  assert.equal(parseArgs(["--reviewers", "lib", "--json"]).json, true);
});

test("--top given is recorded, so the reviewers view can use its own default of five rows otherwise", () => {
  assert.equal(parseArgs([]).topGiven, false);
  assert.equal(parseArgs(["--top", "3"]).topGiven, true);
});

test("a path that matches no file gives the existing pathspec error", async () => {
  await withOwners(async (dir) => {
    await assert.rejects(analyse(parseArgs(["--cwd", dir, "--reviewers", "nope"])), /no files matched the pathspec after --: nope/);
  });
});

test("the JSON carries the reviewers object, which validates against the schema; without the flag it is null", async () => {
  await withOwners(async (dir) => {
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    const withFlag = JSON.parse(renderJson(await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib"]))));
    assert.deepEqual(schemaErrors(schema, withFlag), []);
    assert.equal(withFlag.reviewers.authors.length, 3);
    const without = JSON.parse(renderJson(await analyse(parseArgs(["--cwd", dir]))));
    assert.deepEqual(schemaErrors(schema, without), []);
    assert.equal(without.reviewers, null);
  });
});

/** @param {Parameters<typeof buildFixture>[0]} name @param {(dir: string) => Promise<void>} fn */
async function withFixture(name, fn) {
  const dir = buildFixture(name);
  try {
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

test("the table and the suggestion both leave out the suspected formatter commit, and the block gives its plain count", async () => {
  await withFixture("reviewFormat", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib"]));
    assert.equal(r.reformat.suspects.length, 1);
    // The table counts the corrected lines: the formatter's 30 lines are Ada's again, and Bob keeps a row with none.
    assert.deepEqual(r.reviewers?.authors.map((a) => [a.author, a.lines]), [[PEOPLE.ada[0], 40], [PEOPLE.charlie[0], 3], [PEOPLE.bob[0], 0]]);
    // The suggestion: Bob is gone and the shares are Ada 40 of 43, Charlie 3 of 43.
    assert.equal(r.reviewers?.suggestedBasis, "reformatIgnored");
    assert.deepEqual(r.reviewers?.suggested.map((p) => [p.author, p.lines]), [[PEOPLE.ada[0], 40], [PEOPLE.charlie[0], 3]]);
    const text = renderReviewers(r, 5);
    assert.ok(text.includes("suggested by surviving lines (with the suspected reformat commit ignored): Ada (40 lines, 93.0%, last commit 2026-03-01, active), Charlie (3 lines, 7.0%, last commit 2024-01-05, inactive)"), text);
    assert.ok(text.includes(`${PEOPLE.bob[0]}`), text);
    assert.ok(text.includes("Authors who gain lines from this: Ada 40 (93.0%) with the correction, 10 (23.3%) without."), text);
    assert.doesNotMatch(text, /69\.8%/, "no share of the plain count next to the committer's name");
    // The orphaned line also says "top owner", so only a line that starts with it counts.
    assert.doesNotMatch(text, /^top owner/m);
  });
});

test("one person on two addresses with the same name is one suggested entry, with its address count", async () => {
  await withFixture("split", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "src"]));
    assert.equal(r.reviewers?.authors.length, 3, "the table keeps the two addresses as two rows");
    assert.deepEqual(r.reviewers?.suggested.map((p) => [p.author, p.mails.length, p.lines]), [[PEOPLE.ada[0], 2, 20], [PEOPLE.bob[0], 1, 10]]);
    assert.deepEqual(r.reviewers?.suggested[0].mails, [mailOf("ada"), mailOf("adaLaptop")].sort());
    assert.ok(renderReviewers(r, 5).includes(`suggested by surviving lines: ${PEOPLE.ada[0]} (20 lines, 66.7%, 2 addresses, last commit`));
  });
});

test("the not-active line names at most three authors of the table, then the count of the rest, and no top-owner line without an active suggestion", async () => {
  await withFixture("staleOwners", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib"]));
    const text = renderReviewers(r, 5);
    assert.ok(text.includes(`not active in the year before 2026-04-12: ${PEOPLE.ada[0]}, ${PEOPLE.bob[0]}, ${PEOPLE.charlie[0]}, and 2 more`), text);
    assert.doesNotMatch(text, /^top owner/m, text);
    // Only the table's rows are named: with --top 2 the list is the two shown authors.
    assert.ok(renderReviewers(r, 2).includes(`not active in the year before 2026-04-12: ${PEOPLE.ada[0]}, ${PEOPLE.bob[0]}`), renderReviewers(r, 2));
  });
});

test("the not-active line judges a person: one name on a stale and an active address is not listed as inactive", async () => {
  await withFixture("twoAddressStale", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib"]));
    assert.deepEqual(r.reviewers?.authors.map((a) => [a.mail, a.active]), [[mailOf("ada"), false], [mailOf("adaLaptop"), true], [mailOf("bob"), false]]);
    assert.ok(renderReviewers(r, 5).split("\n").includes("not active in the year before 2026-04-12: Bob"), renderReviewers(r, 5));
  });
});
