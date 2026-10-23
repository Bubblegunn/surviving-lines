// @ts-check
// Round 13, G13: a path view of a single file follows renames, and the reviewers table carries the repository-wide last
// commit date of each person beside the path-scoped one. Fixtures are tiny repositories with invented names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, git, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderReviewers, renderJson } = await import("../bin/surviving-lines.js");

const ADA = /** @type {[string, string]} */ (["Ada Quill", "ada@quill.example"]);
const BEA = /** @type {[string, string]} */ (["Bea Marsh", "bea@marsh.example"]);
const CAL = /** @type {[string, string]} */ (["Cal Dune", "cal@dune.example"]);

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-paths-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** A file written by Ada, extended by Bea, then renamed by Cal in a commit that changes no line. @param {string} dir */
function renamed(dir) {
  commitAsIdentity(dir, ADA, "2026-01-01T10:00:00Z", "add old", { "lib/old.js": lines("a", 20) });
  commitAsIdentity(dir, BEA, "2026-02-01T10:00:00Z", "extend old", { "lib/old.js": lines("a", 20) + lines("b", 5) });
  git(dir, ["mv", "lib/old.js", "lib/new.js"]);
  commitAsIdentity(dir, CAL, "2026-03-01T10:00:00Z", "rename old to new", {});
}

test("--history of a single file follows renames, so the commits before the rename are counted", async () => {
  await withRepo(renamed, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "lib/new.js"]));
    assert.deepEqual(
      r.history?.authors.map((a) => [a.author, a.firstCommit, a.commits]),
      [["Ada Quill", "2026-01-01", 1], ["Bea Marsh", "2026-02-01", 1], ["Cal Dune", "2026-03-01", 1]],
    );
  });
});

test("--reviewers of a single file counts the commits before the rename and the last commit date survives it", async () => {
  await withRepo(renamed, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib/new.js"]));
    const ada = r.reviewers?.authors.find((a) => a.author === "Ada Quill");
    assert.equal(ada?.commits, 1);
    assert.equal(ada?.lastCommit, "2026-01-01");
    assert.equal(r.reviewers?.authors.find((a) => a.author === "Bea Marsh")?.lastCommit, "2026-02-01");
  });
});

test("a directory path keeps its commits as the plain path log gives them", async () => {
  await withRepo(renamed, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "lib"]));
    // Git log at the directory sees the old file inside it before the rename and the new file after it.
    assert.deepEqual(r.history?.authors.map((a) => [a.author, a.commits]), [["Ada Quill", 1], ["Bea Marsh", 1], ["Cal Dune", 1]]);
  });
});

test("'last anywhere' tells a person who left the path from one who left the project", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ADA, "2025-01-01T10:00:00Z", "add lib", { "lib/a.js": lines("a", 20) });
      commitAsIdentity(dir, BEA, "2025-02-01T10:00:00Z", "add lib b", { "lib/b.js": lines("b", 10) });
      commitAsIdentity(dir, ADA, "2026-03-02T10:00:00Z", "docs", { "docs/readme.md": "text\n" });
      commitAsIdentity(dir, CAL, "2026-03-05T10:00:00Z", "add lib c", { "lib/c.js": lines("c", 5) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "lib"]));
      const row = (/** @type {string} */ name) => r.reviewers?.authors.find((a) => a.author === name);
      // Ada: old at the path, recent elsewhere. Bea: old everywhere. Cal: recent at the path.
      assert.deepEqual([row("Ada Quill")?.lastCommit, row("Ada Quill")?.lastAnywhere, row("Ada Quill")?.active], ["2025-01-01", "2026-03-02", false]);
      assert.deepEqual([row("Bea Marsh")?.lastCommit, row("Bea Marsh")?.lastAnywhere], ["2025-02-01", "2025-02-01"]);
      assert.deepEqual([row("Cal Dune")?.lastCommit, row("Cal Dune")?.lastAnywhere], ["2026-03-05", "2026-03-05"]);
      const text = renderReviewers(r, 5);
      assert.match(text, /last commit +last anywhere +activity/);
      assert.match(text, /^Ada Quill +20 +\S+ +1 +2025-01-01 +2026-03-02 +inactive$/m);
      assert.match(text, /^Bea Marsh +10 +\S+ +1 +2025-02-01 +2025-02-01 +inactive$/m);
      const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
      assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), []);
    },
  );
});
