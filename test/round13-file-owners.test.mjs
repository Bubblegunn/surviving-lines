// @ts-check
// Round 13, G7: --reviewers <dir> and --history <dir> name, under the table, the files each person owns and the files
// only one person has written. Fixtures are tiny repositories with invented names, built here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderReviewers, renderHistory, renderJson } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  ada: ["Ada Quill", "ada@quill.example"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  dee: ["Dee Fern", "dee@fern.example"],
  gus: ["Gus Holt", "gus@holt.example"],
};
let day = 0;
/** @param {string} dir @param {string} who @param {Record<string, string>} files */
const commit = (dir, who, files) => commitAsIdentity(dir, WHO[who], `2026-01-${String(++day).padStart(2, "0")}T10:00:00Z`, `${who}: change`, files);

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-owners-");
  day = 0;
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} extra */
const view = async (dir, extra = ["--reviewers", "lib"]) => analyse(parseArgs(["--cwd", dir, ...extra]));
/** @param {any} r */
const people = (r) => r.reviewers.fileOwners.people;

test("a person is listed from 10 lines, a smaller scope from 3% of it, and a person below both is not", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", { "lib/big.js": lines("a", 400) });
      commit(dir, "dee", { "lib/dee.js": lines("d", 10) });
      commit(dir, "cal", { "lib/cal.js": lines("c", 9) });
    },
    async (dir) => {
      const r = await view(dir);
      // Scope 419: 3% is 12.6, so the floor is 10. Dee (10) is in, Cal (9) is not.
      assert.deepEqual(people(r).map((/** @type {any} */ p) => p.author), ["Ada Quill", "Dee Fern"]);
    },
  );
  await withRepo(
    (dir) => {
      commit(dir, "ada", { "lib/a.js": lines("a", 100) });
      commit(dir, "gus", { "lib/g.js": lines("g", 4) });
      commit(dir, "cal", { "lib/c.js": lines("c", 2) });
    },
    async (dir) => {
      const r = await view(dir);
      // Scope 106: 3% is 3.18, below 10, so the floor is 3.18. Gus (4) is in although he has fewer than 10 lines; Cal (2) is not.
      assert.deepEqual(people(r).map((/** @type {any} */ p) => p.author), ["Ada Quill", "Gus Holt"]);
    },
  );
});

test("a file is listed under its top owner only when that person holds at least half of it", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "bea", { "lib/util.js": lines("u", 12) });
      commit(dir, "ada", { "lib/util.js": lines("u", 12) + lines("more", 4), "lib/split.js": lines("s", 4) });
      // split.js: Ada 4 lines, then Bea and Cal add 3 each below them, so the top owner holds 40%.
      commit(dir, "bea", { "lib/split.js": lines("s", 4) + lines("b", 3) });
      commit(dir, "cal", { "lib/split.js": lines("s", 4) + lines("b", 3) + lines("c", 3) });
    },
    async (dir) => {
      const r = await view(dir);
      const byName = Object.fromEntries(people(r).map((/** @type {any} */ p) => [p.author, p]));
      assert.deepEqual(byName["Bea Marsh"].files.map((/** @type {any} */ f) => [f.path, f.lines]), [["lib/util.js", 16]]);
      assert.equal(Math.round(byName["Bea Marsh"].files[0].share * 100), 75);
      // Ada's 4 lines of split.js are 40% of it: not a file she owns.
      assert.deepEqual(byName["Ada Quill"].files.map((/** @type {any} */ f) => f.path), []);
      const text = renderReviewers(r, 5);
      assert.match(text, /^files in lib by owner/m);
      assert.match(text, /Bea Marsh \(15 lines\): owns lib\/util\.js \(16 lines, 75\.0%\)/);
      assert.match(text, /Ada Quill \(8 lines\): no file where they hold half or more/);
    },
  );
});

test("single-owner files need 90% and 20 lines, are largest first, and are capped at eight with a count of the rest", async () => {
  await withRepo(
    (dir) => {
      /** @type {Record<string, string>} */
      const files = {};
      for (let i = 0; i < 10; i++) files[`lib/s${String(i).padStart(2, "0")}.js`] = lines(`s${i}`, 20 + i);
      commit(dir, "ada", files);
      // 19 lines: below the line floor. 18 of 20 lines is exactly 90%: in. 17 of 20 is 85%: out.
      commit(dir, "ada", { "lib/short.js": lines("x", 19), "lib/edge90.js": lines("e", 18), "lib/edge85.js": lines("f", 17) });
      commit(dir, "bea", { "lib/edge90.js": lines("e", 18) + lines("b", 2), "lib/edge85.js": lines("f", 17) + lines("b", 3) });
    },
    async (dir) => {
      const r = await view(dir);
      const one = r.reviewers?.fileOwners?.singleOwnerFiles;
      assert.equal(one?.files.length, 8);
      assert.equal(one?.more, 3);
      // 10 files of 20..29 lines plus edge90 (20 lines): the largest eight are s09 down to s02.
      assert.deepEqual(one?.files.map((f) => f.path), Array.from({ length: 8 }, (_, i) => `lib/s0${9 - i}.js`));
      const text = renderReviewers(r, 5);
      assert.match(text, /files only one person has written .*lib\/s09\.js \(Ada Quill, 29 lines, 100\.0%\), lib\/s08\.js/);
      assert.match(text, /, and 3 more\n?/);
      assert.ok(!text.includes("lib/edge85.js (") && !text.includes("lib/short.js ("));
    },
  );
  await withRepo(
    (dir) => {
      commit(dir, "ada", { "lib/edge90.js": lines("e", 18), "lib/edge85.js": lines("f", 17) });
      commit(dir, "bea", { "lib/edge90.js": lines("e", 18) + lines("b", 2), "lib/edge85.js": lines("f", 17) + lines("b", 3) });
    },
    async (dir) => {
      const r = await view(dir);
      assert.deepEqual(r.reviewers?.fileOwners?.singleOwnerFiles.files.map((f) => f.path), ["lib/edge90.js"]);
    },
  );
});

test("a person owns at most five files in the block, then 'and N more'; the block stays within about twenty lines", async () => {
  await withRepo(
    (dir) => {
      /** @type {Record<string, string>} */
      const files = {};
      for (let i = 0; i < 7; i++) files[`lib/g${i}.js`] = lines(`g${i}`, 6 + i);
      commit(dir, "gus", files);
      commit(dir, "ada", { "lib/a.js": lines("a", 300) });
    },
    async (dir) => {
      const r = await view(dir);
      const gus = people(r).find((/** @type {any} */ p) => p.author === "Gus Holt");
      assert.deepEqual(gus.files.map((/** @type {any} */ f) => f.path), ["lib/g6.js", "lib/g5.js", "lib/g4.js", "lib/g3.js", "lib/g2.js"]);
      assert.equal(gus.moreFiles, 2);
      const text = renderReviewers(r, 5);
      assert.match(text, /Gus Holt \(\d+ lines\): owns lib\/g6\.js .*, and 2 more\n/);
      const start = text.indexOf("files in lib by owner");
      const block = text.slice(start).split("\n\n")[0].split("\n");
      assert.ok(block.length <= 20, `block is ${block.length} lines`);
    },
  );
});

test("--history gets the same block, a run without the flag gets none, and the JSON validates", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", { "lib/a.js": lines("a", 30), "lib/b.js": lines("b", 12) });
      commit(dir, "bea", { "lib/c.js": lines("c", 15) });
    },
    async (dir) => {
      const h = await view(dir, ["--history", "lib"]);
      assert.match(renderHistory(h, 5), /^files in lib by owner/m);
      assert.match(renderHistory(h, 5), /files only one person has written .*lib\/a\.js \(Ada Quill, 30 lines, 100\.0%\)/);
      const plain = await view(dir, []);
      assert.equal(plain.reviewers, null);
      const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
      for (const extra of [["--reviewers", "lib"], ["--history", "lib"], []]) {
        const json = JSON.parse(renderJson(await view(dir, extra)));
        assert.deepEqual(schemaErrors(schema, json), []);
      }
      const json = JSON.parse(renderJson(await view(dir)));
      assert.equal(json.reviewers.fileOwners.scopeLines, 57);
      assert.equal(json.reviewers.fileOwners.people[0].author, "Ada Quill");
    },
  );
});

test("at most eight people are named, then 'and N more people', and the block is still within about twenty lines", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", { "lib/a.js": lines("a", 200) });
      for (let i = 0; i < 10; i++) commitAsIdentity(dir, [`Pat Number${i}`, `pat${i}@lane.example`], `2026-02-${String(i + 1).padStart(2, "0")}T10:00:00Z`, "add", { [`lib/p${i}.js`]: lines(`p${i}_`, 12) });
    },
    async (dir) => {
      const r = await view(dir);
      assert.equal(people(r).length, 11);
      const text = renderReviewers(r, 5);
      assert.match(text, /\n {2}and 3 more people\n/);
      const block = text.slice(text.indexOf("files in lib by owner")).split("\n\n")[0].split("\n");
      assert.ok(block.length <= 20, `block is ${block.length} lines`);
    },
  );
});
