// @ts-check
// Round 13, G12: blame credits the author. When the committer of a blamed commit is someone else (after .mailmap and
// identity merging) and the commit holds at least five surviving lines, the output names it, so the reader does not
// take the committer for the writer. Fixtures are tiny repositories with invented names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderReviewers, renderJson, countBlameByCommit } = await import("../bin/surviving-lines.js");

/** @typedef {[string, string]} Id */
const ADA = /** @type {Id} */ (["Ada Quill", "ada@quill.example"]);
const BEA = /** @type {Id} */ (["Bea Marsh", "bea@marsh.example"]);
const CAL = /** @type {Id} */ (["Cal Dune", "cal@dune.example"]);
const WEB = /** @type {Id} */ (["Web Merger", "noreply@merger.example"]);
let n = 0;
/** @param {string} dir @param {Id} author @param {Id | undefined} committer @param {string} subject @param {Record<string, string>} files */
const commit = (dir, author, committer, subject, files) => commitAsIdentity(dir, author, `2026-01-${String(++n).padStart(2, "0")}T10:00:00Z`, subject, files, committer);

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-committer-");
  n = 0;
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}

test("countBlameByCommit keeps the committer headers of each commit", () => {
  const sha = "a".repeat(40);
  const porcelain = [`${sha} 1 1 1`, "author Ada", "author-mail <ada@x.example>", "committer Bob", "committer-mail <BOB@x.example>", "filename f.js", "\tone"].join("\n");
  assert.deepEqual([...countBlameByCommit(porcelain)], [[sha, { name: "Ada", mail: "ada@x.example", lines: 1, committer: "Bob", committerMail: "bob@x.example" }]]);
});

test("a commit written by one person and committed by another is named, with its lines, author and committer", async () => {
  await withRepo(
    (dir) => {
      commit(dir, ADA, WEB, "feat: add the parser", { "src/parser.js": lines("p", 20) });
      commit(dir, BEA, BEA, "feat: add the lexer", { "src/lexer.js": lines("l", 30) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.committedByOthers.total, 1);
      assert.deepEqual(r.committedByOthers.commits.map((c) => [c.lines, c.subject, c.author, c.committer]), [[20, "feat: add the parser", "Ada Quill", "Web Merger"]]);
      const text = renderTable(r, 5);
      assert.match(text, /^credited to the author: 20 lines of [0-9a-f]{7} "feat: add the parser" are credited to Ada Quill, committed by Web Merger$/m);
      assert.ok(!text.includes("add the lexer"));
      // The note belongs to every view that shows lines, not only the table.
      const rv = await analyse(parseArgs(["--cwd", dir, "--reviewers", "src"]));
      assert.match(renderReviewers(rv, 5), /credited to the author: 20 lines of [0-9a-f]{7} "feat: add the parser"/);
    },
  );
});

test("a commit with fewer than five surviving lines, the same person under two spellings, and a mailmap-merged committer are not named", async () => {
  await withRepo(
    (dir) => {
      commit(dir, ADA, WEB, "small", { "src/small.js": lines("s", 4) });
      commit(dir, BEA, ["B. Marsh", BEA[1]], "same address", { "src/b1.js": lines("b", 10) });
      commit(dir, CAL, [CAL[0], "cal@home.example"], "same name", { "src/c1.js": lines("c", 10) });
      commit(dir, ["Eve Old", "eve@old.example"], ["Eve New", "eve@new.example"], "before the map", { "src/e1.js": lines("e", 10) });
      commit(dir, ["Fay Lone", "fay@lone.example"], undefined, "map", { ".mailmap": "Eve New <eve@new.example> <eve@old.example>\n" });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(r.committedByOthers, { total: 0, commits: [] });
      assert.ok(!renderTable(r, 5).includes("credited to the author"));
    },
  );
});

test("exactly five lines are named, and a bot as author is not", async () => {
  await withRepo(
    (dir) => {
      commit(dir, ADA, WEB, "five lines", { "src/five.js": lines("f", 5) });
      commit(dir, ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"], WEB, "bump", { "src/bump.js": lines("d", 12) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(r.committedByOthers.commits.map((c) => [c.lines, c.subject]), [[5, "five lines"]]);
    },
  );
});

test("at most five commits are listed, largest first, then a count of the others", async () => {
  await withRepo(
    (dir) => {
      for (let i = 0; i < 7; i++) commit(dir, ADA, WEB, `change ${i}`, { [`src/f${i}.js`]: lines(`f${i}_`, 10 + i) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.committedByOthers.total, 7);
      assert.deepEqual(r.committedByOthers.commits.map((c) => c.lines), [16, 15, 14, 13, 12]);
      const text = renderTable(r, 5);
      assert.equal(text.split("\n").filter((l) => l.startsWith("credited to the author:")).length, 5);
      assert.match(text, /^and 2 more commits committed by someone else$/m);
    },
  );
});

test("the JSON carries committedByOthers and validates against the schema", async () => {
  await withRepo(
    (dir) => {
      commit(dir, ADA, WEB, "feat: add the parser", { "src/parser.js": lines("p", 20) });
    },
    async (dir) => {
      const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
      const json = JSON.parse(renderJson(await analyse(parseArgs(["--cwd", dir]))));
      assert.deepEqual(schemaErrors(schema, json), []);
      assert.equal(json.committedByOthers.commits[0].committerMail, "noreply@merger.example");
    },
  );
});
