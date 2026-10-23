// @ts-check
// Round 13, G14: a maintainer reverts a contributor's change and later re-applies it (a revert of a revert, a
// "Reapply" commit) or re-commits it with a `(cherry picked from commit ...)` trailer. Blame credits the person who
// re-applied it; the lines are credited to the author of the original commit instead. Fixtures are tiny repositories
// with invented names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, git, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderReviewers, renderJson, revertTargetOf, cherryPickSourceOf } = await import("../bin/surviving-lines.js");

/** @typedef {[string, string]} Id */
const COY = /** @type {Id} */ (["Coy Wren", "coy@wren.example"]);
const MAX = /** @type {Id} */ (["Max Orchard", "max@orchard.example"]);
let n = 0;
const date = () => `2026-02-01T${String(Math.floor(++n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}:00Z`;
/** @param {string} dir @param {Id} who @param {string[]} args */
const gitAs = (dir, who, args) => git(dir, args, { GIT_AUTHOR_NAME: who[0], GIT_AUTHOR_EMAIL: who[1], GIT_COMMITTER_NAME: who[0], GIT_COMMITTER_EMAIL: who[1], GIT_AUTHOR_DATE: date(), GIT_COMMITTER_DATE: date() });
/** @param {string} dir @param {Id} who @param {string} subject @param {Record<string, string>} files */
const commit = (dir, who, subject, files) => commitAsIdentity(dir, who, date(), subject, files);
/** @param {string} dir */
const head = (dir) => git(dir, ["rev-parse", "HEAD"]).trim();

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-reapply-");
  n = 0;
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}

/** @param {Awaited<ReturnType<typeof analyse>>} r @returns {Record<string, number>} */
const linesOf = (r) => Object.fromEntries(r.authors.filter((a) => a.lines > 0).map((a) => [a.author, a.lines]));

/** The contributor adds 12 lines, the maintainer owns 8 others and reverts the contributor's commit. @returns {string} the contributor's commit */
function contributorThenRevert(/** @type {string} */ dir) {
  commit(dir, MAX, "feat: base", { "src/base.js": lines("b", 8) });
  const original = commit(dir, COY, "feat: add the cache", { "src/cache.js": lines("c", 12) });
  gitAs(dir, MAX, ["revert", "--no-edit", original]);
  return original;
}

test("revertTargetOf and cherryPickSourceOf read the ids git writes", () => {
  assert.equal(revertTargetOf('Revert "x"\n\nThis reverts commit ABCDEF1234567890abcdef1234567890abcdef12.\n'), "abcdef1234567890abcdef1234567890abcdef12");
  assert.equal(revertTargetOf("no revert here"), null);
  assert.equal(revertTargetOf("This reverts commit aaaaaaa.\nThis reverts commit bbbbbbb.\n"), null);
  assert.equal(cherryPickSourceOf("fix\n\n(cherry picked from commit 0123456789abcdef0123456789abcdef01234567)\n"), "0123456789abcdef0123456789abcdef01234567");
  assert.equal(cherryPickSourceOf("fix"), null);
});

test("a revert of a revert by the maintainer credits the lines to the original author, in the table, JSON and other views", async () => {
  await withRepo(
    (dir) => {
      contributorThenRevert(dir);
      const revert = head(dir);
      gitAs(dir, MAX, ["revert", "--no-edit", "HEAD"]);
      // Older git writes `Revert "Revert ..."`, newer git writes `Reapply ...`; the literal form is set here either way.
      gitAs(dir, MAX, ["commit", "--amend", "-q", "-m", `Revert "Revert "feat: add the cache""\n\nThis reverts commit ${revert}.`]);
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(linesOf(r), { "Max Orchard": 8, "Coy Wren": 12 });
      assert.equal(r.reappliedCredit.total, 1);
      assert.deepEqual(r.reappliedCredit.commits.map((c) => [c.lines, c.credited, c.reappliedBy, c.via]), [[12, "Coy Wren", "Max Orchard", "revert"]]);
      const text = renderTable(r, 5);
      assert.match(text, /^re-applied work credited to the original author: 12 lines of [0-9a-f]{7} "Revert "Revert "feat: add the cache""" credited to Coy Wren \(re-applied by Max Orchard\)$/m);
      // The committer note does not fire for these lines: their credited author is not the commit's author.
      assert.ok(!text.includes("credited to the author:"));
      const rv = await analyse(parseArgs(["--cwd", dir, "--reviewers", "src"]));
      assert.match(renderReviewers(rv, 5), /re-applied work credited to the original author: 12 lines/);
      const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
      const json = JSON.parse(renderJson(r));
      assert.deepEqual(schemaErrors(schema, json), []);
      assert.equal(json.reappliedCredit.commits[0].creditedMail, "coy@wren.example");
      // The same lines are in the per-file view under the original author.
      const files = await analyse(parseArgs(["--cwd", dir, "--files", "5"]));
      const cache = files.files.find((f) => f.path === "src/cache.js");
      assert.equal(cache.owners[0].name, "Coy Wren");
    },
  );
});

test("a commit with a Reapply subject that names a reverted revert credits the original author", async () => {
  await withRepo(
    (dir) => {
      contributorThenRevert(dir);
      const revert = head(dir);
      commit(dir, MAX, 'Reapply "feat: add the cache"', { "src/cache.js": lines("c", 12) });
      // The body is what names the revert; amend it the way a hand-written Reapply message does.
      gitAs(dir, MAX, ["commit", "--amend", "-q", "-m", `Reapply "feat: add the cache"\n\nThis reverts commit ${revert}.`]);
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(linesOf(r), { "Max Orchard": 8, "Coy Wren": 12 });
      assert.equal(r.reappliedCredit.commits[0].subject, 'Reapply "feat: add the cache"');
    },
  );
});

test("a copy made by another author with a cherry-pick trailer credits the author of the source commit", async () => {
  await withRepo(
    (dir) => {
      commit(dir, MAX, "feat: base", { "src/base.js": lines("b", 8) });
      git(dir, ["checkout", "-q", "-b", "topic"]);
      const source = commit(dir, COY, "fix: handle the empty case", { "src/empty.js": lines("e", 9) });
      git(dir, ["checkout", "-q", "main"]);
      commit(dir, MAX, "fix: handle the empty case", { "src/empty.js": lines("e", 9) });
      gitAs(dir, MAX, ["commit", "--amend", "-q", "-m", `fix: handle the empty case\n\n(cherry picked from commit ${source})`]);
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(linesOf(r), { "Max Orchard": 8, "Coy Wren": 9 });
      assert.equal(r.reappliedCredit.commits[0].via, "cherry-pick");
      assert.match(renderTable(r, 5), /^re-applied work credited to the original author: 9 lines of [0-9a-f]{7} "fix: handle the empty case" credited to Coy Wren \(re-applied by Max Orchard\)$/m);
    },
  );
});

test("a cherry-pick trailer whose source has the same author changes nothing", async () => {
  await withRepo(
    (dir) => {
      commit(dir, COY, "feat: root", { "src/root.js": lines("r", 2) });
      git(dir, ["checkout", "-q", "-b", "topic"]);
      commit(dir, COY, "feat: base", { "src/base.js": lines("b", 8) });
      const source = head(dir);
      git(dir, ["checkout", "-q", "main"]);
      commit(dir, COY, "feat: base again", { "src/other.js": lines("o", 6) });
      gitAs(dir, COY, ["commit", "--amend", "-q", "-m", `feat: base again\n\n(cherry picked from commit ${source})`]);
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.reappliedCredit.total, 0);
      assert.deepEqual(linesOf(r), { "Coy Wren": 8 });
    },
  );
});

test("a chain that cannot be resolved leaves the credit as it is and prints nothing", async () => {
  await withRepo(
    (dir) => {
      commit(dir, MAX, "feat: base", { "src/base.js": lines("b", 8) });
      commit(dir, MAX, "Reapply the cache", { "src/cache.js": lines("c", 12) });
      gitAs(dir, MAX, ["commit", "--amend", "-q", "-m", "Reapply the cache\n\nThis reverts commit 1234567890abcdef1234567890abcdef12345678."]);
      commit(dir, MAX, "pick", { "src/pick.js": lines("p", 6) });
      gitAs(dir, MAX, ["commit", "--amend", "-q", "-m", "pick\n\n(cherry picked from commit fedcba0987654321fedcba0987654321fedcba09)"]);
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(linesOf(r), { "Max Orchard": 26 });
      assert.equal(r.reappliedCredit.total, 0);
      assert.ok(!renderTable(r, 5).includes("re-applied work"));
    },
  );
});

test("--no-reapply-credit keeps the lines with the commit's own author and prints no note", async () => {
  await withRepo(
    (dir) => {
      contributorThenRevert(dir);
      gitAs(dir, MAX, ["revert", "--no-edit", "HEAD"]);
    },
    async (dir) => {
      const o = parseArgs(["--cwd", dir, "--no-reapply-credit"]);
      assert.equal(o.reapplyCredit, false);
      const r = await analyse(o);
      assert.deepEqual(linesOf(r), { "Max Orchard": 20 });
      assert.equal(r.reappliedCredit.total, 0);
      assert.ok(!renderTable(r, 5).includes("re-applied work"));
      assert.equal(parseArgs(["--cwd", dir]).reapplyCredit, true);
    },
  );
});

test("an ordinary revert that stays reverted credits nobody", async () => {
  await withRepo(
    (dir) => {
      contributorThenRevert(dir);
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(linesOf(r), { "Max Orchard": 8 });
      assert.equal(r.reappliedCredit.total, 0);
    },
  );
});

test("a plain revert that restores deleted lines is not credited to the author of the deletion", async () => {
  await withRepo(
    (dir) => {
      commit(dir, MAX, "feat: base", { "src/base.js": lines("b", 8) });
      const removal = commit(dir, COY, "chore: drop the base", { "src/base.js": null });
      gitAs(dir, MAX, ["revert", "--no-edit", removal]);
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(linesOf(r), { "Max Orchard": 8 });
      assert.equal(r.reappliedCredit.total, 0);
    },
  );
});

test("a chain of three reverts brings back the lines of a deletion, not the work of the deleter", async () => {
  await withRepo(
    (dir) => {
      commit(dir, MAX, "feat: base", { "src/base.js": lines("b", 8) });
      const removal = commit(dir, COY, "chore: drop the base", { "src/base.js": null });
      gitAs(dir, MAX, ["revert", "--no-edit", removal]);
      gitAs(dir, MAX, ["revert", "--no-edit", "HEAD"]);
      gitAs(dir, MAX, ["revert", "--no-edit", "HEAD"]);
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(linesOf(r), { "Max Orchard": 8 });
      assert.equal(r.reappliedCredit.total, 0);
    },
  );
});

test("a re-applied change by the original author is not a different identity and prints nothing", async () => {
  await withRepo(
    (dir) => {
      commit(dir, MAX, "feat: base", { "src/base.js": lines("b", 8) });
      const original = commit(dir, COY, "feat: add the cache", { "src/cache.js": lines("c", 12) });
      gitAs(dir, COY, ["revert", "--no-edit", original]);
      gitAs(dir, COY, ["revert", "--no-edit", "HEAD"]);
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(linesOf(r), { "Max Orchard": 8, "Coy Wren": 12 });
      assert.equal(r.reappliedCredit.total, 0);
    },
  );
});

test("at most five re-applied commits are listed, then a count of the others", async () => {
  await withRepo(
    (dir) => {
      commit(dir, MAX, "feat: base", { "src/base.js": lines("b", 4) });
      for (let i = 0; i < 7; i++) {
        const original = commit(dir, COY, `feat: part ${i}`, { [`src/p${i}.js`]: lines(`p${i}_`, 10 + i) });
        gitAs(dir, MAX, ["revert", "--no-edit", original]);
        gitAs(dir, MAX, ["revert", "--no-edit", "HEAD"]);
      }
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.reappliedCredit.total, 7);
      assert.deepEqual(r.reappliedCredit.commits.map((c) => c.lines), [16, 15, 14, 13, 12]);
      const text = renderTable(r, 5);
      assert.equal(text.split("\n").filter((l) => l.startsWith("re-applied work credited")).length, 5);
      assert.match(text, /^and 2 more re-applied commits$/m);
    },
  );
});
