// @ts-check
// Round 13: --for-diff <base>..<head>, who should review a change. Fixtures are tiny repositories with invented names
// and fixed dates. The base history ends on 2026-02-01; the change is on a branch and ends on 2026-03-06.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitAsIdentity, createRepo, git, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderForDiff, renderJson, parseDiffRange, parseChangedFiles, touchedRanges } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  cy: ["Cy Dunn", "cy@dunn.example"],
  ada: ["Ada Quill", "ada@quill.example"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  dee: ["Dee Fern", "dee@fern.example"],
  ben: ["Ben Ng", "ben@ng.example"],
};
/** @param {string} dir @param {string} who @param {string} date @param {Record<string, string | null>} files */
const commit = (dir, who, date, files) => commitAsIdentity(dir, WHO[who], `${date}T10:00:00Z`, `${who}: change`, files);
/** @param {string} prefix @param {number} from @param {number} to the lines `prefix from` .. `prefix to-1` */
const slice = (prefix, from, to) => Array.from({ length: to - from }, (_, i) => `${prefix} ${from + i}`).join("\n") + "\n";

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-fordiff-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} extra */
const run = (dir, extra) => analyse(parseArgs(["--cwd", dir, "-q", ...extra]));

/**
 * The base: Cy (last commit 2024) wrote ledger.js, legacy.js and part of spread.js; the others wrote the rest in 2026.
 * The change (branch feature): Ben and Ada are its authors.
 *   pay.js      replaces 10 lines of Ada's
 *   ledger.js   replaces 6 lines of Cy's
 *   shared.js   replaces 2 lines of Ada's and 2 of Bea's (two owners in one hunk)
 *   pure.js     inserts 3 lines and removes none
 *   fresh.js    is new
 *   old-name.js is renamed to new-name.js with 3 lines replaced (Bea's)
 *   gone.js     is deleted (8 lines of Ada's)
 *   spread.js   replaces 3 lines of Bea's
 *   legacy.js   replaces 2 lines of Ada's
 *   own.js      has 4 of Ada's lines replaced by Ada herself
 *   package-lock.json and bundle.min.js change too and are left out.
 * @param {string} dir
 * @param {{ laterMain?: boolean }} [opts] laterMain: main gets a commit by Cal after the branch point
 */
function team(dir, opts = {}) {
  commit(dir, "cy", "2024-01-10", { "src/ledger.js": lines("led", 30), "src/legacy.js": lines("leg", 25), "src/spread.js": lines("spr", 10) });
  commit(dir, "ada", "2026-01-05", {
    "src/pay.js": lines("pay", 40),
    "src/gone.js": lines("gone", 8),
    "src/pure.js": lines("pure", 20),
    "src/shared.js": lines("sha", 10),
    "src/own.js": lines("own", 12),
    "package-lock.json": lines("lock", 5),
    "bundle.min.js": lines("min", 3),
    "src/legacy.js": lines("leg", 25) + lines("lega", 2),
    "src/spread.js": lines("spr", 10) + lines("spra", 3),
  });
  commit(dir, "bea", "2026-01-12", { "src/shared.js": lines("sha", 10) + lines("shb", 10), "src/old-name.js": lines("old", 30), "src/spread.js": lines("spr", 10) + lines("spra", 3) + lines("sprb", 3) });
  commit(dir, "cal", "2026-01-20", { "src/spread.js": lines("spr", 10) + lines("spra", 3) + lines("sprb", 3) + lines("sprc", 2) });
  commit(dir, "dee", "2026-02-01", { "src/spread.js": lines("spr", 10) + lines("spra", 3) + lines("sprb", 3) + lines("sprc", 2) + lines("sprd", 2) });
  git(dir, ["checkout", "-q", "-b", "feature"]);
  commit(dir, "ben", "2026-03-05", {
    "src/pay.js": lines("newpay", 10) + slice("pay", 10, 40),
    "src/ledger.js": slice("led", 0, 5) + lines("newled", 6) + slice("led", 11, 30),
    "src/shared.js": slice("sha", 0, 8) + lines("newsh", 4) + slice("shb", 2, 10),
    "src/pure.js": slice("pure", 0, 10) + lines("added", 3) + slice("pure", 10, 20),
    "src/fresh.js": lines("fresh", 6),
    "src/old-name.js": null,
    "src/new-name.js": lines("newold", 3) + slice("old", 3, 30),
    "src/gone.js": null,
    "src/spread.js": lines("spr", 10) + lines("spra", 3) + lines("newspr", 3) + lines("sprc", 2) + lines("sprd", 2),
    "src/legacy.js": lines("leg", 25) + lines("newleg", 2),
    "package-lock.json": slice("lock", 0, 3) + lines("newlock", 2),
    "bundle.min.js": lines("newmin", 3),
  });
  commit(dir, "ada", "2026-03-06", { "src/own.js": lines("newown", 4) + slice("own", 4, 12) });
  git(dir, ["checkout", "-q", "main"]);
  if (opts.laterMain) commit(dir, "cal", "2026-02-20", { "src/pay.js": slice("pay", 0, 20) + lines("calpay", 5) + slice("pay", 25, 40) });
}

test("the reviewers are the people whose lines the change replaces, the change authors are not suggested, and the numbers add up", async () => {
  await withRepo(team, async (dir) => {
    const r = await run(dir, ["--for-diff", "main...feature"]);
    const d = r.forDiff;
    assert.ok(d);
    assert.equal(d.range, "main...feature");
    assert.equal(d.mergeBase, true);
    assert.deepEqual([d.files, d.replacedLines, d.addedLines, d.newFiles, d.deletedFiles, d.renamedFiles], [10, 40, 41, 1, 1, 1]);
    assert.deepEqual(d.leftOut.files, 2);
    assert.equal(d.leftOut.classes.lockfile, 1);
    assert.equal(d.leftOut.classes.generated, 1);
    assert.deepEqual([...d.changeAuthors].sort(), ["Ada Quill", "Ben Ng"]);
    // Touched lines: Ada 10+2+8+2+4 = 26 (an author, not suggested), Bea 2+3+3 = 8, Cy 6. Total 40.
    assert.equal(d.touchedLines, 40);
    assert.deepEqual(d.reviewers.map((x) => [x.author, x.touchedLines, x.files, x.filesMostTouched, x.active]), [["Bea Marsh", 8, 3, 3, true], ["Cy Dunn", 6, 1, 1, false]]);
    assert.equal(Math.round(d.reviewers[0].touchedShare * 1000), 200);
    assert.equal(Math.round(d.reviewers[1].touchedShare * 1000), 150);
    // Whole-file lines at the base commit across the blamed files: Bea 10 (shared) + 30 (old-name) + 3 (spread), Cy 30 (ledger).
    assert.deepEqual(d.reviewers.map((x) => x.wholeFileLines), [43, 30 + 25 + 10]);
    assert.equal(d.reviewers[1].lastCommit, "2024-01-10");
    assert.equal(d.asOf, "2026-03-06");
    assert.deepEqual(schemaErrors(JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8")), JSON.parse(renderJson(r))), []);
  });
});

test("a pure insertion replaces nothing, a new file has no earlier owner, a rename is blamed at its old path, a deleted file counts all its lines", async () => {
  await withRepo(team, async (dir) => {
    const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
    assert.ok(d);
    const flags = Object.fromEntries(d.flaggedFiles.map((f) => [f.path, f.flags.map((x) => x.code)]));
    // pure.js: nothing replaced, so it has no touched line; it is listed only for its whole-file flag.
    assert.deepEqual(flags["src/pure.js"], ["singleOwner"]);
    assert.equal(d.flaggedFiles.find((f) => f.path === "src/pure.js")?.touchedLines, 0);
    assert.deepEqual(flags["src/fresh.js"], ["newFile"]);
    assert.deepEqual(flags["src/new-name.js"], ["singleOwner", "renamed"]);
    assert.equal(d.flaggedFiles.find((f) => f.path === "src/new-name.js")?.oldPath, "src/old-name.js");
    assert.equal(d.flaggedFiles.find((f) => f.path === "src/new-name.js")?.touchedLines, 3);
    assert.deepEqual(flags["src/gone.js"], ["singleOwner", "authorOnly", "deleted"]);
    assert.equal(d.flaggedFiles.find((f) => f.path === "src/gone.js")?.touchedLines, 8);
    // shared.js has two owners and no flag at all.
    assert.equal(flags["src/shared.js"], undefined);
  });
});

test("the file flags follow their priority, and the headline is the worst file", async () => {
  await withRepo(team, async (dir) => {
    const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
    assert.ok(d);
    const flags = Object.fromEntries(d.flaggedFiles.map((f) => [f.path, f.flags.map((x) => x.code)]));
    assert.deepEqual(flags["src/ledger.js"], ["inactiveOwners", "orphaned", "singleOwner"]);
    assert.deepEqual(flags["src/legacy.js"], ["orphaned", "singleOwner", "authorOnly"]);
    // spread.js: Cy 10 of 20 is inactive and no active author holds 20%; the touched lines are Bea's, who is active.
    assert.deepEqual(flags["src/spread.js"], ["orphaned"]);
    assert.deepEqual(flags["src/pay.js"], ["singleOwner", "authorOnly"]);
    assert.deepEqual(flags["src/own.js"], ["singleOwner", "authorOnly"]);
    assert.deepEqual(d.worstFile, { path: "src/ledger.js", flags: ["all 6 touched lines belong to Cy Dunn (inactive)", "no active author holds 20% of the file", "single owner Cy Dunn holds 100.0% of the file"] });
    // Files are ordered by their first flag, then by touched lines.
    assert.deepEqual(d.flaggedFiles.map((f) => f.path).slice(0, 3), ["src/ledger.js", "src/spread.js", "src/legacy.js"]);
  });
});

test("A...B starts at the merge base, A..B compares the two tips, and A alone is A..HEAD", async () => {
  await withRepo((dir) => team(dir, { laterMain: true }), async (dir) => {
    const three = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
    const two = (await run(dir, ["--for-diff", "main..feature"])).forDiff;
    assert.ok(three && two);
    assert.equal(three.mergeBase, true);
    assert.equal(two.mergeBase, false);
    // Cal's later commit on main is not part of the change from the merge base; between the tips it is replaced.
    assert.equal(three.reviewers.some((x) => x.author === "Cal Dune"), false);
    assert.deepEqual(two.reviewers.find((x) => x.author === "Cal Dune")?.touchedLines, 5);
    assert.equal(two.replacedLines, three.replacedLines + 5);
    // HEAD is main here: "feature" alone reads as feature..HEAD, the change from feature to main.
    const single = (await run(dir, ["--for-diff", "feature"])).forDiff;
    const explicit = (await run(dir, ["--for-diff", "feature..main"])).forDiff;
    assert.ok(single && explicit);
    assert.equal(single.range, "feature..HEAD");
    assert.deepEqual({ ...single, range: "" }, { ...explicit, range: "" });
  });
});

test("a file in the change that the table leaves out, or that --exclude removes, is not counted", async () => {
  await withRepo(team, async (dir) => {
    const kept = await run(dir, ["--for-diff", "main...feature", "--keep-generated"]);
    assert.equal(kept.forDiff?.leftOut.files, 0);
    assert.equal(kept.forDiff?.files, 12);
    const excluded = await run(dir, ["--for-diff", "main...feature", "--exclude", "src/ledger.js"]);
    assert.equal(excluded.forDiff?.files, 9);
    assert.equal(excluded.forDiff?.reviewers.some((x) => x.author === "Cy Dunn"), false);
    const scoped = await run(dir, ["--for-diff", "main...feature", "--", "src/ledger.js", "src/pay.js"]);
    assert.equal(scoped.forDiff?.files, 2);
  });
});

test("an inactive owner is flagged in the reviewer rows and in the text", async () => {
  await withRepo(team, async (dir) => {
    const r = await run(dir, ["--for-diff", "main...feature"]);
    const text = renderForDiff(r, 5);
    assert.match(text, /^change main\.\.\.feature \(from the merge base\): 10 files, 40 lines replaced or deleted, 41 lines added, 1 new file, 1 deleted file, 1 renamed file; 2 files left out \(1 lockfile, 1 generated;/m);
    assert.match(text, /^change authors: .*Ben Ng/m);
    assert.match(text, /Bea Marsh .*8 \(20\.0%\)\s+3 files\s+active/);
    assert.match(text, /Cy Dunn .*6 \(15\.0%\)\s+1 file\s+inactive \(last commit anywhere 2024-01-10\)/);
    assert.match(text, /^worst file: src\/ledger\.js: all 6 touched lines belong to Cy Dunn \(inactive\); no active author holds 20% of the file; single owner Cy Dunn holds 100\.0% of the file$/m);
    assert.match(text, /not who understands the change/);
    // --top limits the reviewer rows.
    assert.match(renderForDiff(r, 1), /… 1 more/);
  });
});

test("an empty diff prints that there are no changed files", async () => {
  await withRepo(team, async (dir) => {
    const r = await run(dir, ["--for-diff", "main..main"]);
    assert.equal(r.forDiff?.files, 0);
    assert.equal(renderForDiff(r, 5), "change main..main: no changed files");
  });
});

test("a change that only adds files has no reviewers and says why", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2026-01-05", { "src/a.js": lines("a", 20) });
      git(dir, ["checkout", "-q", "-b", "feature"]);
      commit(dir, "ben", "2026-03-05", { "src/b.js": lines("b", 7) });
    },
    async (dir) => {
      const r = await run(dir, ["--for-diff", "main...feature"]);
      assert.deepEqual([r.forDiff?.files, r.forDiff?.newFiles, r.forDiff?.reviewers.length, r.forDiff?.touchedLines], [1, 1, 0, 0]);
      assert.match(renderForDiff(r, 5), /suggested reviewers: none, this change replaces or deletes no counted line/);
      // A new file is described, not ranked: it is no risk, so there is no worst file.
      assert.equal(r.forDiff?.worstFile, null);
    },
  );
});

test("a mode-only change has no hunks: no touched line, and it is counted as a file", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2026-01-05", { "run.sh": lines("r", 12), "other.js": lines("o", 12) });
      git(dir, ["checkout", "-q", "-b", "feature"]);
      git(dir, ["update-index", "--chmod=+x", "run.sh"]);
      commitAsIdentity(dir, WHO.ben, "2026-03-05T10:00:00Z", "mode", {});
    },
    async (dir) => {
      const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
      assert.deepEqual([d?.files, d?.replacedLines, d?.addedLines, d?.touchedLines, d?.reviewers.length], [1, 0, 0, 0, 0]);
    },
  );
});

test("more than 300 changed files: only the 300 that replace the most lines are blamed, and the output says so", async () => {
  await withRepo(
    (dir) => {
      /** @type {Record<string, string>} */
      const base = {};
      for (let i = 0; i < 303; i++) base[`f/${String(i).padStart(3, "0")}.js`] = lines("v", 4);
      commit(dir, "ada", "2026-01-05", base);
      git(dir, ["checkout", "-q", "-b", "feature"]);
      /** @type {Record<string, string>} */
      const next = {};
      for (let i = 0; i < 303; i++) next[`f/${String(i).padStart(3, "0")}.js`] = i < 3 ? lines("w", 4) : lines("v", 3) + lines("w", 1);
      commit(dir, "ben", "2026-03-05", next);
    },
    async (dir) => {
      const r = await run(dir, ["--for-diff", "main...feature"]);
      const d = r.forDiff;
      assert.ok(d);
      assert.deepEqual(d.blamedLimit, { blamed: 300, of: 303 });
      assert.equal(d.filesBlamed, 300);
      // The three skipped files are the ones that replace one line each, the last by path; the three that replace four lines are blamed.
      assert.equal(d.touchedLines, 3 * 4 + 297 * 1);
      assert.match(renderForDiff(r, 5), /only 300 of 303 files with a pre-image were blamed/);
      assert.equal(d.flaggedFiles.filter((f) => f.flags.some((x) => x.code === "notBlamed")).length, 3);
    },
  );
});

test("a shallow clone is refused, as for every other view", async () => {
  await withRepo(team, async (dir) => {
    const parent = mkdtempSync(join(tmpdir(), "sl-fordiff-shallow-"));
    try {
      const clone = join(parent, "clone");
      execFileSync("git", ["clone", "-q", "--depth", "1", "--no-single-branch", `file://${dir}`, clone]);
      await assert.rejects(run(clone, ["--for-diff", "origin/main...origin/feature"]), /shallow clone/);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

test("--for-diff is its own view: only --json may combine, and an unknown revision is an error", async () => {
  for (const extra of [["--csv"], ["--markdown"], ["--identities"], ["--group-by", "dir"], ["--files"], ["--reviewers", "src"], ["--history", "src"], ["--orphans"], ["--without", "Ada"], ["--brief"], ["--sample", "2"], ["--ref", "HEAD"]]) {
    assert.throws(() => parseArgs(["--for-diff", "a..b", ...extra]), /--for-diff prints its own view; it can be combined with --json only, not with /, extra.join(" "));
  }
  assert.doesNotThrow(() => parseArgs(["--for-diff", "a..b", "--json", "--top", "3", "--exclude", "x", "--", "src"]));
  assert.throws(() => parseArgs(["--for-diff", " "]), /needs a revision range/);
  await withRepo(team, async (dir) => {
    await assert.rejects(run(dir, ["--for-diff", "main..nope"]), /--for-diff: "nope" does not resolve to a commit/);
  });
});

test("the range is read as A..B, A...B or A alone, and the changed files and hunks are parsed", () => {
  assert.deepEqual(parseDiffRange("a..b"), { kind: "range", left: "a", right: "b" });
  assert.deepEqual(parseDiffRange("a...b"), { kind: "mergeBase", left: "a", right: "b" });
  assert.deepEqual(parseDiffRange("a"), { kind: "single", left: "a", right: "HEAD" });
  assert.deepEqual(parseDiffRange("a.."), { kind: "range", left: "a", right: "HEAD" });
  assert.deepEqual(touchedRanges("@@ -3,2 +3,4 @@\n@@ -10 +12 @@\n@@ -20,0 +22,3 @@\n@@ -30,1 +33,0 @@\n"), [[3, 4], [10, 10], [30, 30]]);
  const files = parseChangedFiles("M\0a.js\0A\0b.js\0D\0c.js\0R087\0d.js\0e.js\0", "1\t2\ta.js\0\x32\t0\tb.js\0" + "0\t5\tc.js\0" + "3\t3\t\0d.js\0e.js\0");
  assert.deepEqual(files.map((f) => [f.status, f.oldPath, f.newPath, f.added, f.deleted]), [["M", "a.js", "a.js", 1, 2], ["A", null, "b.js", 2, 0], ["D", "c.js", null, 0, 5], ["R", "d.js", "e.js", 3, 3]]);
});

/** Ada wrote every file in 2026-01; Ben's change on the branch then replaces `replaced` lines at the start of each. */
const THRESHOLD = {
  b80: 10, // Ada 8 of 10 lines: exactly 80%
  b70: 10, // Ada 7 of 10 lines: 70%
};

test("one owner at exactly 80% of a changed file is flagged, 70% is not", async () => {
  await withRepo(
    (dir) => {
      for (const [path, n] of Object.entries(THRESHOLD)) {
        const adaLines = path === "b80" ? 8 : 7;
        commit(dir, "ada", "2026-01-05", { [`${path}.js`]: lines(path, adaLines) });
        commit(dir, "bea", "2026-01-06", { [`${path}.js`]: lines(path, adaLines) + lines(`${path}x`, n - adaLines) });
      }
      git(dir, ["checkout", "-q", "-b", "feature"]);
      commit(dir, "ben", "2026-03-05", { "b80.js": lines("new", 1) + slice("b80", 1, 8) + lines("b80x", 2), "b70.js": lines("new", 1) + slice("b70", 1, 7) + lines("b70x", 3) });
    },
    async (dir) => {
      const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
      assert.ok(d);
      const flags = Object.fromEntries(d.flaggedFiles.map((f) => [f.path, f.flags.map((x) => x.code)]));
      assert.deepEqual(flags["b80.js"], ["singleOwner"]);
      assert.equal(flags["b70.js"], undefined);
    },
  );
});

test("touched lines are counted on the table's basis: blank lines out, bots out; the headline counts keep the blank lines", async () => {
  await withRepo(
    (dir) => {
      // Ada's 6 lines include 2 blank ones; a bot wrote 4 lines of the same file.
      commit(dir, "ada", "2026-01-05", { "mix.js": "a 0\n\na 1\n\na 2\na 3\n" });
      commitAsIdentity(dir, ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"], "2026-01-06T10:00:00Z", "bump", { "mix.js": "a 0\n\na 1\n\na 2\na 3\nbot 0\nbot 1\nbot 2\nbot 3\n" });
      git(dir, ["checkout", "-q", "-b", "feature"]);
      commit(dir, "ben", "2026-03-05", { "mix.js": "n 0\nn 1\nn 2\nn 3\nn 4\nn 5\nn 6\nn 7\nn 8\nn 9\n" });
    },
    async (dir) => {
      const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
      assert.ok(d);
      assert.equal(d.replacedLines, 10);
      // 10 lines are replaced; the 2 blank ones and the 4 bot lines are not counted: Ada has 4.
      assert.equal(d.touchedLines, 4);
      assert.deepEqual(d.reviewers.map((x) => [x.author, x.touchedLines]), [["Ada Quill", 4]]);
      const withBots = (await run(dir, ["--for-diff", "main...feature", "--include-bots"])).forDiff;
      assert.deepEqual(withBots?.reviewers.map((x) => [x.author, x.touchedLines]), [["dependabot[bot]", 4], ["Ada Quill", 4]]);
    },
  );
});

test("activity is counted back from the head commit: an owner active at the base date can be inactive at the head", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "dee", "2025-02-15", { "old.js": lines("old", 10) });
      commit(dir, "ada", "2026-02-01", { "new.js": lines("new", 10) });
      git(dir, ["checkout", "-q", "-b", "feature"]);
      commit(dir, "ben", "2026-03-05", { "old.js": lines("x", 3) + slice("old", 3, 10) });
    },
    async (dir) => {
      const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
      assert.ok(d);
      assert.equal(d.asOf, "2026-03-05");
      // 2025-02-15 is 378 days before the head date (inactive), 351 days before the base date (active).
      assert.deepEqual(d.reviewers.map((x) => [x.author, x.active]), [["Dee Fern", false]]);
      assert.deepEqual(d.flaggedFiles[0].flags.map((x) => x.code), ["inactiveOwners", "orphaned", "singleOwner"]);
      const wide = (await run(dir, ["--for-diff", "main...feature", "--active-days", "400"])).forDiff;
      assert.deepEqual(wide?.reviewers.map((x) => x.active), [true]);
    },
  );
});

test("the blame rules of the run apply to the touched lines: --ignore-rev moves the credit back", async () => {
  let sha = "";
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2026-01-05", { "f.js": lines("low", 12) });
      sha = commit(dir, "bea", "2026-01-06", { "f.js": lines("LOW", 12) });
      git(dir, ["checkout", "-q", "-b", "feature"]);
      commit(dir, "ben", "2026-03-05", { "f.js": lines("new", 5) + slice("LOW", 5, 12) });
    },
    async (dir) => {
      const plain = (await run(dir, ["--for-diff", "main...feature", "--no-detect-reformat"])).forDiff;
      assert.deepEqual(plain?.reviewers.map((x) => [x.author, x.touchedLines]), [["Bea Marsh", 5]]);
      const ignored = (await run(dir, ["--for-diff", "main...feature", "--no-detect-reformat", "--ignore-rev", sha])).forDiff;
      assert.deepEqual(ignored?.reviewers.map((x) => [x.author, x.touchedLines]), [["Ada Quill", 5]]);
    },
  );
});

test("reviewers with equal touched lines are ordered by the lines they hold in the changed files, then by address", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2026-01-05", { "a.js": lines("a", 10) });
      commit(dir, "bea", "2026-01-06", { "b.js": lines("b", 10), "c.js": lines("c", 30) });
      commit(dir, "cal", "2026-01-07", { "d.js": lines("d", 10) });
      commit(dir, "dee", "2026-01-08", { "e.js": lines("e", 10), "f.js": lines("f", 20) });
      git(dir, ["checkout", "-q", "-b", "feature"]);
      // Three lines of each of Ada, Bea, Cal, Dee are replaced: Bea holds 40 lines in the changed files, the others 10; Ada, Cal and Dee tie and go by address.
      commit(dir, "ben", "2026-03-05", { "a.js": lines("x", 3) + slice("a", 3, 10), "b.js": lines("x", 3) + slice("b", 3, 10), "c.js": lines("c2", 30), "d.js": lines("x", 3) + slice("d", 3, 10), "e.js": lines("x", 3) + slice("e", 3, 10), "f.js": lines("f", 20) + lines("tail", 1) });
    },
    async (dir) => {
      const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
      assert.ok(d);
      // c.js is replaced whole, so Bea has 33 touched lines and leads; the other three tie on 3 touched lines. Dee also holds the 20 lines of f.js, which the change only extends, so she goes before Ada and Cal, who tie again and go by address.
      assert.deepEqual(d.reviewers.map((x) => x.author), ["Bea Marsh", "Dee Fern", "Ada Quill", "Cal Dune"]);
      assert.deepEqual(d.reviewers.slice(1).map((x) => [x.touchedLines, x.wholeFileLines]), [[3, 30], [3, 10], [3, 10]]);
    },
  );
});

test("an owner who committed inside the range is active at the head, and does not make the file an inactive one", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "dee", "2024-02-15", { "old.js": lines("old", 10) });
      commit(dir, "ada", "2026-02-01", { "new.js": lines("new", 10) });
      git(dir, ["checkout", "-q", "-b", "feature"]);
      commit(dir, "dee", "2026-03-01", { "old.js": lines("x", 3) + slice("old", 3, 10) });
    },
    async (dir) => {
      const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
      assert.ok(d);
      // Dee's last commit before the range was in 2024, but she committed in the range: active at the head, and the author.
      assert.deepEqual(d.changeAuthors, ["Dee Fern"]);
      assert.deepEqual(d.flaggedFiles[0].flags.map((x) => x.code), ["singleOwner", "authorOnly"]);
    },
  );
});

test("touched lines of an inactive and an active owner together are not 'all inactive'", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "cal", "2024-02-01", { "mix.js": lines("cal", 10) });
      commit(dir, "bea", "2026-02-01", { "mix.js": lines("cal", 10) + lines("bea", 10) });
      git(dir, ["checkout", "-q", "-b", "feature"]);
      commit(dir, "ben", "2026-03-05", { "mix.js": lines("n", 3) + slice("cal", 3, 10) + slice("bea", 0, 7) + lines("m", 3) });
    },
    async (dir) => {
      const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
      assert.ok(d);
      assert.deepEqual(d.reviewers.map((x) => [x.author, x.touchedLines, x.active]), [["Bea Marsh", 3, true], ["Cal Dune", 3, false]]);
      assert.equal(d.flaggedFiles.some((f) => f.flags.some((x) => x.code === "inactiveOwners")), false);
    },
  );
});

test("a new file that the table would leave out is left out here too", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2026-01-05", { "src/a.js": lines("a", 20) });
      git(dir, ["checkout", "-q", "-b", "feature"]);
      commit(dir, "ben", "2026-03-05", { "dist/app.min.js": lines("min", 3), "src/b.js": lines("b", 5) });
    },
    async (dir) => {
      const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
      assert.ok(d);
      assert.deepEqual([d.files, d.newFiles, d.leftOut.files, d.leftOut.classes.generated, d.addedLines], [1, 1, 1, 1, 5]);
      assert.deepEqual(d.flaggedFiles.map((f) => f.path), ["src/b.js"]);
    },
  );
});

test("merge commits in the range are not change authors: a person who only merged can still be a reviewer", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "cal", "2026-01-05", { "c.js": lines("c", 10), "other.js": lines("o", 5) });
      git(dir, ["checkout", "-q", "-b", "feature"]);
      commit(dir, "ben", "2026-03-01", { "c.js": lines("n", 4) + slice("c", 4, 10) });
      git(dir, ["checkout", "-q", "main"]);
      commit(dir, "dee", "2026-03-02", { "other.js": lines("o", 5) + lines("d", 2) });
      git(dir, ["checkout", "-q", "feature"]);
      git(dir, ["merge", "-q", "--no-ff", "-m", "merge main", "main"], { GIT_AUTHOR_NAME: WHO.cal[0], GIT_AUTHOR_EMAIL: WHO.cal[1], GIT_COMMITTER_NAME: WHO.cal[0], GIT_COMMITTER_EMAIL: WHO.cal[1], GIT_AUTHOR_DATE: "2026-03-03T10:00:00Z", GIT_COMMITTER_DATE: "2026-03-03T10:00:00Z" });
    },
    async (dir) => {
      const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
      assert.ok(d);
      assert.deepEqual(d.changeAuthors, ["Ben Ng"]);
      assert.deepEqual(d.reviewers.map((x) => [x.author, x.touchedLines]), [["Cal Dune", 4]]);
    },
  );
});

test("a file with more than 100 hunks is blamed in several processes and every touched line is counted", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2026-01-05", { "big.js": lines("b", 300) });
      git(dir, ["checkout", "-q", "-b", "feature"]);
      const next = Array.from({ length: 300 }, (_, i) => (i < 250 && i % 2 === 0 ? `changed ${i}` : `b ${i}`)).join("\n") + "\n";
      commit(dir, "ben", "2026-03-05", { "big.js": next });
    },
    async (dir) => {
      const d = (await run(dir, ["--for-diff", "main...feature"])).forDiff;
      assert.deepEqual([d?.replacedLines, d?.touchedLines, d?.reviewers[0]?.touchedLines], [125, 125, 125]);
    },
  );
});
