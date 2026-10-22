// @ts-check
// Round 9 development gate, iteration 2 (R9-13, R9-14): both line totals are stated, a merged row takes a full
// personal name before a handle. Repositories are built inside the test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRepo, commitAsIdentity, removeRepo } from "../scripts/fixtures.mjs";

const { parseArgs, analyse, renderTable, hasFullName } = await import("../bin/surviving-lines.js");

/** @param {number} i */
const day = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().replace(/\.\d{3}Z$/, "Z");

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} fn */
async function withRepo(build, fn) {
  const dir = createRepo("sl-r9i2-");
  try {
    build(dir);
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

test("R9-13: the header states the size with blank lines when blank lines were dropped, and not otherwise", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { "f.js": "a1\n\n\na2\n", "g.js": "g1\ng2\n" });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.sample.linesInRef, 4);
      assert.equal(r.sample.linesWithBlank, 6);
      assert.match(renderTable(r), /4 of 4 lines attributed \(non-blank; 6 with blank lines\)/);
    },
  );
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { "f.js": "a1\na2\n" });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.sample.linesWithBlank, 2);
      assert.doesNotMatch(renderTable(r), /with blank lines/);
    },
  );
});

test("R9-14: hasFullName tells a personal name from a handle", () => {
  assert.equal(hasFullName("Albert Nigmatzianov"), true);
  assert.equal(hasFullName("Jos van den Oever"), true);
  assert.equal(hasFullName("bogem"), false);
  assert.equal(hasFullName("dependabot[bot]"), false);
  assert.equal(hasFullName("user 42"), false);
});

test("R9-14: an address that committed under a handle and a personal name is shown by the personal name", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["handle", "same@x.org"], day(0), "h1", { "a.js": "h1\nh2\n" });
      commitAsIdentity(dir, ["handle", "same@x.org"], day(1), "h2", { "b.js": "h3\nh4\n" });
      commitAsIdentity(dir, ["Pat Lovelace", "same@x.org"], day(2), "p1", { "c.js": "p1\n" });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.authors.length, 1);
      assert.equal(r.authors[0].author, "Pat Lovelace");
    },
  );
});
