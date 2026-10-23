// @ts-check
// An author whose only surviving lines are blank gets a row only where the view prints the with-blank column.
// Repositories are tiny and built inside each test with invented names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRepo, commitAsIdentity, lines, removeRepo } from "../scripts/fixtures.mjs";

const { parseArgs, analyse, renderTable, renderGroups, renderReviewers, renderCodeowners } = await import("../bin/surviving-lines.js");

const OLD = "2025-01-02T00:00:00Z";
const NEW = "2026-01-01T00:00:00Z";

/**
 * Bob's only lines are blank, in src/blank.js and docs/b.txt, and he has no commit in the window used below.
 * @param {number} people how many people own six lines each in src
 * @param {(dir: string) => Promise<void>} fn
 */
async function withBlankOnly(people, fn) {
  const dir = createRepo("sl-blank-only-");
  try {
    commitAsIdentity(dir, ["Bob", "bob@x.org"], OLD, "b", { "src/blank.js": "\n\n\n", "docs/b.txt": "\n".repeat(10) });
    for (let i = 1; i <= people; i++) commitAsIdentity(dir, [`P${i}`, `p${i}@x.org`], NEW, `p${i}`, { [`src/p${i}.js`]: lines(`p${i}-`, 6) });
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

const SINCE = ["--since", "2025-12-01"];

test("blank-only: the default table lists the blank-only author by their with-blank share, not in a 0.0% tail", async () => {
  await withBlankOnly(11, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, ...SINCE]));
    const text = renderTable(r, null);
    assert.match(text, /^Bob +0 +0\.0% +13 +16\.5% +0 /m);
    assert.doesNotMatch(text, /more author/);
    // The totals still agree.
    assert.equal(r.authors.reduce((/** @type {number} */ s, /** @type {any} */ a) => s + a.linesWithBlank, 0), r.sample.linesWithBlank);
    assert.equal(r.busFactor?.withBlank?.total, r.sample.linesWithBlank);
  });
});

test("blank-only: a group that prints no with-blank column does not list or count the blank-only author", async () => {
  await withBlankOnly(3, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, ...SINCE, "--group-by", "dir"]));
    const text = renderGroups(r, 2);
    const src = text.slice(text.indexOf("src  ·"), text.indexOf("docs  ·"));
    assert.doesNotMatch(src, /Bob/);
    assert.match(src, /… 1 more author\n/);
    assert.doesNotMatch(src, /with blank/);
    // The group made only of blank lines keeps its row and its column.
    assert.match(text, /docs {2}· .*0 lines, 10 counting blank lines\nauthor.*with blank/s);
    assert.match(text, /^Bob +0 +0\.0% +10 +100\.0%$/m);
  });
});

test("blank-only: --reviewers on a path without the with-blank column neither lists nor counts the blank-only author", async () => {
  await withBlankOnly(3, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, ...SINCE, "--reviewers", "src"]));
    const text = renderReviewers(r, 2);
    assert.doesNotMatch(text, /Bob/);
    assert.match(text, /… 1 more author\n/);
    assert.doesNotMatch(text, /with blank {2}/);
  });
});

test("blank-only: --reviewers on a path where the column is printed lists the blank-only author", async () => {
  await withBlankOnly(1, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, ...SINCE, "--reviewers", "docs"]));
    const text = renderReviewers(r, 5);
    assert.match(text, /^Bob +0 +0\.0% +10 +100\.0% +0 /m);
  });
});

test("blank-only: --suggest-codeowners does not name a blank-only author as the top of a directory", async () => {
  await withBlankOnly(1, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, ...SINCE, "--group-by", "dir"]));
    const text = renderCodeowners(r);
    assert.match(text, /# \/docs\/ no surviving lines in 1 sampled file/);
    assert.doesNotMatch(text, /Bob/);
  });
});

test("blank-only: under --co-authors share the blank-only author has no row and the totals still agree", async () => {
  await withBlankOnly(2, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, ...SINCE, "--co-authors", "share"]));
    assert.deepEqual(r.authors.map((/** @type {any} */ a) => a.author), ["P1", "P2"]);
    assert.doesNotMatch(renderTable(r, null), /Bob/);
    assert.equal(r.authors.reduce((/** @type {number} */ s, /** @type {any} */ a) => s + a.linesWithBlank, 0), r.sample.linesAttributed);
  });
});

test("blank-only: the JSON authors keep the blank-only author whose with-blank figure makes the totals agree", async () => {
  await withBlankOnly(2, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, ...SINCE]));
    const bob = r.authors.find((/** @type {any} */ a) => a.author === "Bob");
    assert.equal(bob?.linesWithBlank, 13);
    assert.equal(r.authors.reduce((/** @type {number} */ s, /** @type {any} */ a) => s + a.linesWithBlank, 0), r.sample.linesWithBlank);
  });
});
