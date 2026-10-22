// @ts-check
// Round 9 development gate, iteration 1 (R9-8 to R9-11): blank lines are not counted, hosted automation identities are
// bots, placeholder identities are named and never suggested, a rewrite with both signs is set aside. Repositories are
// built inside the test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRepo, commitAsIdentity, removeRepo } from "../scripts/fixtures.mjs";

const { parseArgs, analyse, renderTable, renderReviewers, isBotIdentity, isPlaceholderIdentity, dropBlankBlameLines } = await import("../bin/surviving-lines.js");

/** @param {number} i */
const day = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().replace(/\.\d{3}Z$/, "Z");
/** @param {string[]} args @param {(dir: string) => Promise<void>} fn @param {(dir: string) => void} build */
async function withRepo(build, fn) {
  const dir = createRepo("sl-r9i1-");
  try {
    build(dir);
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} [args] */
const run = (dir, args = []) => analyse(parseArgs(["--cwd", dir, "-q", ...args]));

test("R9-8: blank lines are dropped from the porcelain entry by entry", () => {
  const sha = "a".repeat(40);
  const entry = (/** @type {string} */ content) => `${sha} 1 1 1\nauthor A\nauthor-mail <a@x.org>\nfilename f.js\n\t${content}`;
  const out = dropBlankBlameLines([entry("code"), entry(""), entry("   "), entry("more"), ""].join("\n"));
  assert.equal((out.match(/^author-mail /gm) ?? []).length, 2);
});

test("R9-8: blank lines hold no share and the file size is the non-blank size", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { "f.js": "a1\n\n\n\n\na2\n" });
      commitAsIdentity(dir, ["Bob", "bob@x.org"], day(1), "b", { "f.js": "a1\n\n\n\n\na2\nb1\nb2\n" });
    },
    async (dir) => {
      const r = await run(dir);
      assert.deepEqual(r.authors.map((/** @type {any} */ a) => [a.author, a.lines]), [["Ann", 2], ["Bob", 2]]);
      assert.equal(r.sample.linesInRef, 4, "a sampled file is counted without its blank lines");
      assert.equal(r.sample.linesAttributed, 4);
    },
  );
});

test("R9-9: hosted translation and CI identities are bots, a person on a similar address is not", () => {
  assert.equal(isBotIdentity("Weblate", "hosted@weblate.org"), true);
  assert.equal(isBotIdentity("Crowdin", "support@crowdin.com"), true);
  assert.equal(isBotIdentity("StyleCI Bot", "bot@styleci.io"), true);
  assert.equal(isBotIdentity("GitHub Action", "action@github.com"), true);
  assert.equal(isBotIdentity("Wendy", "wendy@weblate-fan.org"), false);
  assert.equal(isBotIdentity("Wen", "wen@weblate.org"), false, "a person at the vendor is a person");
  assert.equal(isBotIdentity("Aiko Tanaka", "aiko.tanaka@example.org"), false);
});

test("R9-9: the bots line names the identities left out", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { "f.js": "a1\na2\na3\n" });
      commitAsIdentity(dir, ["Weblate", "hosted@weblate.org"], day(1), "t", { "g.js": "t1\nt2\n" });
    },
    async (dir) => {
      const r = await run(dir);
      assert.match(renderTable(r, 10), /^bots excluded: 1 identity \(Weblate\), 2 lines, 1 commits/m);
      assert.deepEqual(r.authors.map((/** @type {any} */ a) => a.author), ["Ann"]);
    },
  );
});

test("R9-10: placeholder identities are told apart from people", () => {
  assert.equal(isPlaceholderIdentity("root", "root@localhost"), true);
  assert.equal(isPlaceholderIdentity("Your Name", "you@example.com"), true);
  assert.equal(isPlaceholderIdentity("dev", "dev@build.localdomain"), true);
  assert.equal(isPlaceholderIdentity("Aiko Tanaka", "aiko.tanaka@example.org"), false, "example.org is not a placeholder by itself");
  assert.equal(isPlaceholderIdentity("Ann", "ann@x.org"), false);
});

test("R9-10: a placeholder keeps its share, gets a scope line and is not suggested", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { "src/f.js": "a1\na2\na3\na4\n" });
      commitAsIdentity(dir, ["root", "root@localhost"], day(1), "r", { "src/g.js": "r1\nr2\nr3\nr4\nr5\nr6\n" });
    },
    async (dir) => {
      const r = await run(dir);
      assert.equal(r.authors[0].author, "root", "the lines stay in the table and the shares");
      assert.match(renderTable(r, 10), /^placeholder identities: root <root@localhost> hold 6 lines \(60\.0%\) that cannot be attributed to a person/m);
      const v = await run(dir, ["--reviewers", "src"]);
      assert.deepEqual(v.reviewers.suggested.map((/** @type {any} */ p) => p.author), ["Ann"]);
      assert.match(renderReviewers(v, 10), /^suggested by surviving lines: Ann /m);
    },
  );
});

test("R9-11: a commit with the same small change in 10 files and a tool in the subject is set aside", async () => {
  await withRepo(
    (dir) => {
      /** @type {Record<string, string>} */
      const first = {};
      /** @type {Record<string, string>} */
      const second = {};
      for (let i = 0; i < 10; i++) {
        first[`f${i}.go`] = `x${i} := interface{}\nkeep${i}\n`;
        second[`f${i}.go`] = `x${i} := any\nkeep${i}\n`;
      }
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "add", first);
      commitAsIdentity(dir, ["Dana", "dana@x.org"], day(1), "all: go fix ./... (interface{} -> any)", second);
      // One sign only: ten files, no tool in the subject. It stays a named candidate and is not set aside.
      /** @type {Record<string, string>} */
      const third = {};
      for (let i = 0; i < 10; i++) third[`g${i}.go`] = `y${i}\n`;
      commitAsIdentity(dir, ["Cy", "cy@x.org"], day(2), "add g", third);
      /** @type {Record<string, string>} */
      const fourth = {};
      for (let i = 0; i < 10; i++) fourth[`g${i}.go`] = `z${i}\n`;
      commitAsIdentity(dir, ["Eve", "eve@x.org"], day(3), "tidy g", fourth);
    },
    async (dir) => {
      const r = await run(dir);
      const dana = r.authors.find((/** @type {any} */ a) => a.author === "Dana");
      assert.equal(dana?.lines ?? 0, 0, "Dana holds no credit for the codemod");
      assert.equal(r.mechanicalCheck.setAside, 1);
      assert.equal(r.mechanicalCheck.setAsideCommits.length, 1);
      assert.deepEqual(r.mechanicalCheck.candidates.map((/** @type {any} */ c) => c.author), ["Eve"], "one sign only stays a candidate");
      assert.match(renderTable(r, 10), /rewrites looked through .*"all: go fix \.\/\.\.\. \(interface\{\} -> any\)" by Dana/);
      assert.equal(r.blame.autoIgnoredRevs.length, 1);
    },
  );
});

test("skill rules R9-8 to R9-11", async () => {
  const { readFileSync } = await import("node:fs");
  const skill = readFileSync(new URL("../skills/surviving-lines/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /also run the tool on that wider scope/);
  assert.match(skill, /`placeholder identities` line[^\n]*never name those identities/);
  assert.match(skill, /`rewrites looked through`/);
});

test("R9-11: a rewrite with both signs is not set aside under --keep-reformat or --no-detect-reformat, and no internal field reaches the JSON", async () => {
  await withRepo(
    (dir) => {
      /** @type {Record<string, string>} */
      const first = {};
      /** @type {Record<string, string>} */
      const second = {};
      for (let i = 0; i < 10; i++) {
        first[`f${i}.go`] = `x${i} := interface{}\nkeep${i}\n`;
        second[`f${i}.go`] = `x${i} := any\nkeep${i}\n`;
      }
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "add", first);
      commitAsIdentity(dir, ["Dana", "dana@x.org"], day(1), "all: go fix ./... (interface{} -> any)", second);
    },
    async (dir) => {
      for (const flag of ["--keep-reformat", "--no-detect-reformat"]) {
        const r = await run(dir, [flag]);
        const dana = r.authors.find((/** @type {any} */ a) => a.author === "Dana");
        assert.equal(dana?.lines, 10, `${flag}: Dana keeps the lines`);
        assert.equal(r.mechanicalCheck.setAside, 0);
        assert.equal(r.mechanicalCheck.candidates.length, 1, "still named as a candidate");
        assert.ok(!("both" in r.mechanicalCheck.candidates[0]), `${flag}: no internal field in the JSON`);
      }
      const set = await run(dir);
      assert.ok(set.mechanicalCheck.setAsideCommits.every((/** @type {any} */ c) => !("both" in c)));
    },
  );
});
