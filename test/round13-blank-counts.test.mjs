// @ts-check
// Round 13, G1: every per-author view carries the blank-inclusive count next to the non-blank one, and the default
// view, --history and --reviewers print one "top:" sentence with both numbers. Repositories are built inside each test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRepo, commitAsIdentity, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderJson, renderReviewers, renderHistory, renderGroups, renderFiles, topAuthorLine } = await import("../bin/surviving-lines.js");
const SCHEMA = JSON.parse(readFileSync(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));

/** @param {number} i */
const day = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().replace(/\.\d{3}Z$/, "Z");
/** @param {number} n @param {string} p */
const code = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`).join("\n") + "\n";
/** @param {number} n */
const blanks = (n) => "\n".repeat(n);

/**
 * Ann: 6 non-blank, 8 with blank. Bob: 5 and 5. Cy: 5 and 35. Totals: 16 non-blank, 48 with blank.
 * @param {string} dir
 * @param {string} where the directory the three files go in
 */
function build(dir, where = "src") {
  commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { [`${where}/a.js`]: code(6, "a") + blanks(2) });
  commitAsIdentity(dir, ["Bob", "bob@x.org"], day(1), "b", { [`${where}/b.js`]: code(5, "b") });
  commitAsIdentity(dir, ["Cy", "cy@x.org"], day(2), "c", { [`${where}/c.js`]: code(5, "c") + blanks(30) });
}

/** @param {(dir: string) => Promise<void>} fn @param {(dir: string) => void} [builder] */
async function withRepo(fn, builder = build) {
  const dir = createRepo("sl-r13-");
  try {
    builder(dir);
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

const TOP = "top: Ann holds 6 non-blank lines (37.5%), 8 counting blank lines (16.7%)";

test("G1: the default view prints the top author with both counts directly under the table", async () => {
  await withRepo(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    const lines = renderTable(r, null).split("\n");
    const at = lines.indexOf(TOP);
    assert.ok(at > 0, lines.join("\n"));
    assert.match(lines[at - 1], /^Cy\s+5\s+/, "the sentence follows the last row of the table");
    assert.equal(topAuthorLine(r), TOP);
  });
});

test("G1: --reviewers has the with-blank columns, the top sentence and the blank-inclusive figure of each suggested person", async () => {
  await withRepo(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "src"]));
    const text = renderReviewers(r, 5);
    assert.match(text, /author\s+lines\s+share\s+with blank\s+share\s+commits\s+last commit\s+last anywhere\s+activity/);
    assert.match(text, /^Cy\s+5\s+31\.3%\s+35\s+72\.9%\s+1\s+/m);
    const lines = text.split("\n");
    assert.equal(lines[lines.findIndex((l) => l.startsWith("Cy ")) + 1], TOP);
    assert.match(text, /suggested by surviving lines: Ann \(6 lines, 37\.5%, 8 with blank, 16\.7%, /);
    const a = /** @type {any} */ (r.reviewers).authors.find((/** @type {any} */ x) => x.author === "Cy");
    assert.equal(a.linesWithBlank, 35);
    assert.ok(Math.abs(a.shareWithBlank - 35 / 48) < 1e-9);
    const s = /** @type {any} */ (r.reviewers).suggested[0];
    assert.equal(s.linesWithBlank, 8);
  });
});

test("G1: --history has the with-blank columns and the top sentence", async () => {
  await withRepo(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "src"]));
    const text = renderHistory(r, 10);
    assert.match(text, /lines now\s+share\s+with blank\s+share/);
    assert.match(text, /^Cy\s+\S+\s+\S+\s+1\s+5\s+31\.3%\s+35\s+72\.9%$/m);
    const lines = text.split("\n");
    assert.equal(lines[lines.findIndex((l) => l.startsWith("Cy ")) + 1], TOP);
    const cy = /** @type {any} */ (r.history).authors.find((/** @type {any} */ x) => x.author === "Cy");
    assert.equal(cy.linesWithBlank, 35);
  });
});

test("G1: --group-by blocks and --files rows carry the with-blank counts", async () => {
  await withRepo(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--group-by", "dir"]));
    const g = /** @type {any} */ (r.grouping).groups[0];
    assert.equal(g.linesWithBlank, 48);
    assert.equal(g.lines, 16);
    const text = renderGroups(r, 10);
    assert.match(text, /16 lines, 48 counting blank lines/);
    assert.match(text, /^Cy\s+5\s+31\.3%\s+35\s+72\.9%$/m);
    const f = await analyse(parseArgs(["--cwd", dir, "--files", "5"]));
    const row = /** @type {any} */ (f.files).find((/** @type {any} */ x) => x.path === "src/c.js");
    assert.equal(row.lines, 5);
    assert.equal(row.linesWithBlank, 35);
    assert.equal(row.owners[0].linesWithBlank, 35, "the owner's lines in the file with blank lines counted");
    assert.match(renderFiles(f), /file\s+lines\s+with blank\s+top owner/);
    assert.match(renderFiles(f), /^src\/c\.js\s+5\s+35\s+Cy/m);
  });
});

test("G1: every changed JSON shape still validates against the schema, with the old keys kept", async () => {
  await withRepo(async (dir) => {
    for (const args of [["--reviewers", "src"], ["--history", "src"], ["--group-by", "dir"], ["--files", "5"]]) {
      const r = await analyse(parseArgs(["--cwd", dir, ...args]));
      const json = JSON.parse(renderJson(r));
      assert.deepEqual(schemaErrors(SCHEMA, json), [], args.join(" "));
    }
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "src"]));
    const a = JSON.parse(renderJson(r)).reviewers.authors[0];
    for (const key of ["author", "mail", "lines", "lineShare", "commits", "lastCommit", "active"]) assert.ok(key in a, key);
  });
});

test("G1: with no blank line dropped there is no new column, and the top sentence repeats the same figure", async () => {
  await withRepo(
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "src"]));
      const text = renderReviewers(r, 5);
      assert.doesNotMatch(text.split("\n").find((l) => l.startsWith("author")) ?? "", /with blank/);
      assert.match(text, /^top: Ann holds 6 non-blank lines \(40\.0%\), 6 counting blank lines \(40\.0%\)$/m);
    },
    (dir) => {
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { "src/a.js": code(6, "a") });
      commitAsIdentity(dir, ["Bob", "bob@x.org"], day(1), "b", { "src/b.js": code(5, "b") });
      commitAsIdentity(dir, ["Cy", "cy@x.org"], day(2), "c", { "src/c.js": code(4, "c") });
    },
  );
});
