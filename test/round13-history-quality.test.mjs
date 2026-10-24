// @ts-check
// Round 13, #5: history-quality and workflow caveats. The first commit that adds most of the files is an import, a short
// history is young (a separate cause), and the merge workflow says who the table names. Fixtures are tiny repositories
// with invented names and fixed dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, git, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderJson, renderBrief, renderReviewers, renderHistory, historyQualityOf, historyLines } = await import("../bin/surviving-lines.js");

const BIN = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
const ADA = /** @type {[string, string]} */ (["Ada Quill", "ada@quill.example"]);
const BEA = /** @type {[string, string]} */ (["Bea Marsh", "bea@marsh.example"]);

/** @param {string} dir @param {[string, string]} who @param {string} date @param {string} subject @param {Record<string, string>} files */
const commit = (dir, who, date, subject, files) => commitAsIdentity(dir, who, `${date}T10:00:00Z`, subject, files);
/** @param {number} n @param {string} dir */
const filesOf = (n, dir = "src") => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${dir}/f${i}.js`, lines(`f${i}`, 3)]));
/** @param {string} dir @param {string[]} [extra] */
const run = (dir, extra = []) => analyse(parseArgs(["--cwd", dir, "--quiet", ...extra]));
/** @param {string} dir @param {string[]} extra */
const cli = (dir, extra) => spawnSync(process.execPath, [BIN, "--cwd", dir, "--quiet", ...extra], { encoding: "utf8" });

/** @param {(dir: string) => void} make @param {(dir: string) => Promise<void> | void} check */
async function withRepo(make, check) {
  const dir = createRepo("sl-hq-");
  try {
    make(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}

/** A repository whose first commit adds 20 of the 22 files, in 2026. */
const imported = (/** @type {string} */ dir) => {
  commit(dir, ADA, "2026-01-05", "import the tree", filesOf(20));
  commit(dir, BEA, "2026-02-01", "bea: one file", { "lib/b.js": lines("b", 5) });
  commit(dir, BEA, "2026-02-02", "bea: another", { "lib/c.js": lines("c", 5) });
};

/** An old repository whose first commit adds 2 of 12 files. */
const ordinary = (/** @type {string} */ dir) => {
  commit(dir, ADA, "2020-01-05", "start", filesOf(2));
  commit(dir, BEA, "2022-02-01", "more", filesOf(10, "lib"));
  commit(dir, ADA, "2026-02-02", "late", { "docs/a.md": lines("a", 4) });
};

test("an imported tree: the first commit adds most of the files, the ratio is printed and the table is said to describe the work since", async () => {
  await withRepo(imported, async (dir) => {
    const r = await run(dir);
    const h = r.historyQuality;
    assert.ok(h);
    assert.equal(h.oldestRoot.importLikely, true);
    assert.equal(h.oldestRoot.filesAdded, 20);
    assert.equal(h.oldestRoot.filesAtRef, 22);
    assert.equal(h.youngHistory, false, "an import is never also called young");
    const text = renderTable(r, null);
    assert.match(text, /^history: begins 2026-01-05 with a commit that adds 20 of 22 files \(91%\); lines older than that are credited to whoever imported them, so the table describes work since the import$/m);
    assert.doesNotMatch(text, /a short window/);
    // The history lines sit under the header, before the table.
    const at = (/** @type {RegExp} */ re) => text.split("\n").findIndex((l) => re.test(l));
    assert.ok(at(/^history:/) > at(/^git blame/) && at(/^history:/) < at(/^author/));
  });
});

test("a young history is a short window and is never called an import", async () => {
  await withRepo(
    (dir) => {
      commit(dir, ADA, "2026-01-05", "start", filesOf(2));
      commit(dir, BEA, "2026-02-01", "more", filesOf(10, "lib"));
      commit(dir, ADA, "2026-04-15", "late", { "docs/a.md": lines("a", 4) });
    },
    async (dir) => {
      const r = await run(dir);
      assert.equal(r.historyQuality?.youngHistory, true);
      assert.equal(r.historyQuality?.oldestRoot.importLikely, false);
      assert.equal(r.historyQuality?.ageDays, 100);
      const text = renderTable(r, null);
      assert.match(text, /^history: 100 days old \(3 commits\); a short window, not an import$/m);
      assert.doesNotMatch(text, /imported/);
    },
  );
});

test("an old history with a small first commit is neither an import nor young: one line says where it begins", async () => {
  await withRepo(ordinary, async (dir) => {
    const r = await run(dir);
    assert.equal(r.historyQuality?.youngHistory, false);
    assert.equal(r.historyQuality?.oldestRoot.importLikely, false);
    assert.match(renderTable(r, null), /^history: begins 2020-01-05; its first commit adds 2 of 13 files \(15%\), which is not an import$/m);
  });
});

test("the thresholds: an import needs more than 25% of the files, young is under 550 days", () => {
  const base = { rootDate: "2024-01-01", rootEpoch: 0, roots: 1, rootFiles: 25, tracked: 100, refEpoch: 1000 * 86400, commits: 10, workflow: { all: 10, merges: 0, squashSubjects: 0 } };
  assert.equal(historyQualityOf(base).oldestRoot.importLikely, false, "exactly 25% is not an import");
  assert.equal(historyQualityOf({ ...base, rootFiles: 26 }).oldestRoot.importLikely, true);
  assert.equal(historyQualityOf({ ...base, tracked: 0, rootFiles: 0 }).oldestRoot.importLikely, false, "no file at the ref is no ratio");
  assert.equal(historyQualityOf({ ...base, tracked: 0, rootFiles: 0 }).oldestRoot.ratio, null);
  assert.equal(historyQualityOf({ ...base, refEpoch: 549 * 86400 }).youngHistory, true);
  assert.equal(historyQualityOf({ ...base, refEpoch: 550 * 86400 }).youngHistory, false, "550 days is not young");
  assert.equal(historyQualityOf({ ...base, refEpoch: 100 * 86400, rootFiles: 26 }).youngHistory, false, "an import is not also young");
});

test("a ratio under half a percent is printed as <1%, not as 0%", () => {
  const h = historyQualityOf({ rootDate: "2019-01-01", rootEpoch: 0, roots: 1, rootFiles: 1, tracked: 400, refEpoch: 2000 * 86400, commits: 50, workflow: { all: 50, merges: 0, squashSubjects: 0 } });
  assert.match(historyLines({ historyQuality: h })[0], /adds 1 of 400 files \(<1%\), which is not an import$/);
  const half = historyQualityOf({ rootDate: "2019-01-01", rootEpoch: 0, roots: 1, rootFiles: 2, tracked: 400, refEpoch: 2000 * 86400, commits: 50, workflow: { all: 50, merges: 0, squashSubjects: 0 } });
  assert.match(historyLines({ historyQuality: half })[0], /adds 2 of 400 files \(1%\)/);
});

test("squash merges: subjects ending in (#N) name the squasher; exactly half is enough, less is a rebase workflow", async () => {
  const make = (/** @type {string[]} */ subjects) => (/** @type {string} */ dir) => {
    subjects.forEach((s, i) => commit(dir, i % 2 ? BEA : ADA, `2026-01-${String(5 + i).padStart(2, "0")}`, s, i === 0 ? filesOf(1) : { [`lib/x${i}.js`]: lines(`x${i}`, 3) }));
  };
  await withRepo(make(["start", "add a (#11)", "add b (#12)", "add c"]), async (dir) => {
    const r = await run(dir);
    assert.equal(r.historyQuality?.workflow?.strategy, "squash", "2 of 4 subjects is half");
    assert.match(renderTable(r, null), /^workflow: squash merges \(50% of subjects end in "\(#NNN\)"\); the table names the squasher or PR author; only Co-authored-by trailers name anyone else$/m);
  });
  await withRepo(make(["start", "add a (#11)", "add b", "add c"]), async (dir) => {
    const r = await run(dir);
    assert.equal(r.historyQuality?.workflow?.strategy, "rebase", "1 of 4 is below half");
    assert.match(renderTable(r, null), /^workflow: rebase or direct commits \(0 merge commits, 25% of subjects end in "\(#NNN\)"\); lines are credited to the commit authors$/m);
  });
  await withRepo(make(["start", "mentions (#11) in the middle", "a #12", "add (#x)"]), async (dir) => {
    assert.equal((await run(dir)).historyQuality?.workflow?.squashSubjects, 0, "only a trailing (#digits) counts");
  });
});

test("merge commits: a real merge is read from the parents, and the table says it names the branch authors", async () => {
  await withRepo(
    (dir) => {
      commit(dir, ADA, "2026-01-05", "start", filesOf(1));
      git(dir, ["checkout", "-q", "-b", "feature"]);
      commit(dir, BEA, "2026-01-06", "feature work", { "lib/f.js": lines("f", 4) });
      git(dir, ["checkout", "-q", "main"]);
      commit(dir, ADA, "2026-01-07", "main work", { "lib/m.js": lines("m", 4) });
      const when = "2026-01-08T10:00:00Z";
      git(dir, ["merge", "--no-ff", "-q", "-m", "Merge feature", "feature"], { GIT_AUTHOR_NAME: "Ada Quill", GIT_AUTHOR_EMAIL: "ada@quill.example", GIT_COMMITTER_NAME: "Ada Quill", GIT_COMMITTER_EMAIL: "ada@quill.example", GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
    },
    async (dir) => {
      const r = await run(dir);
      const w = r.historyQuality?.workflow;
      assert.equal(w?.strategy, "merge");
      assert.equal(w?.merges, 1);
      assert.equal(w?.commits, 4);
      assert.match(renderTable(r, null), /^workflow: merge commits \(25% of the commits are merges\); lines are credited to the authors of the commits on the merged branches, not to whoever merged$/m);
    },
  );
});

test("the merge threshold is 5% of all commits, and a merge beats a squash subject", () => {
  const base = { rootDate: "2024-01-01", rootEpoch: 0, roots: 1, rootFiles: 1, tracked: 100, refEpoch: 1000 * 86400, commits: 20 };
  const flow = (/** @type {number} */ all, /** @type {number} */ merges, /** @type {number} */ squashSubjects) => historyQualityOf({ ...base, workflow: { all, merges, squashSubjects } }).workflow?.strategy;
  assert.equal(flow(20, 1, 0), "merge", "1 of 20 is exactly 5%");
  assert.equal(flow(21, 1, 0), "rebase", "1 of 21 is below 5%");
  assert.equal(flow(21, 1, 20), "squash", "below 5% merges, most subjects squash");
  assert.equal(flow(20, 1, 19), "merge", "5% merges wins over the squash subjects");
  assert.equal(historyQualityOf({ ...base, workflow: { all: 0, merges: 0, squashSubjects: 0 } }).workflow, null, "no commit in the window, no workflow");
});

test("several roots are counted, the oldest by author date is read, and the line says so", async () => {
  await withRepo(
    (dir) => {
      commit(dir, ADA, "2026-03-01", "start", filesOf(1));
      git(dir, ["checkout", "-q", "--orphan", "older"]);
      git(dir, ["rm", "-rfq", "."]);
      commit(dir, BEA, "2024-01-10", "the older project", filesOf(3, "old"));
      git(dir, ["checkout", "-q", "main"]);
      const env = { GIT_AUTHOR_NAME: "Ada Quill", GIT_AUTHOR_EMAIL: "ada@quill.example", GIT_COMMITTER_NAME: "Ada Quill", GIT_COMMITTER_EMAIL: "ada@quill.example", GIT_AUTHOR_DATE: "2026-03-02T10:00:00Z", GIT_COMMITTER_DATE: "2026-03-02T10:00:00Z" };
      git(dir, ["merge", "--allow-unrelated-histories", "--no-ff", "-q", "-m", "Join the older project", "older"], env);
    },
    async (dir) => {
      const r = await run(dir);
      assert.equal(r.historyQuality?.oldestRoot.roots, 2);
      assert.equal(r.historyQuality?.oldestRoot.date, "2024-01-10");
      assert.match(historyLines(r)[0], /; 2 root commits \(joined histories\), the oldest by author date is read$/);
    },
  );
});

test("--since and --until limit the workflow reading only, and the line says so", async () => {
  await withRepo(
    (dir) => {
      commit(dir, ADA, "2020-01-05", "start", filesOf(2));
      commit(dir, BEA, "2020-02-01", "old a", { "lib/a.js": lines("a", 3) });
      commit(dir, BEA, "2026-02-01", "new a (#1)", { "lib/b.js": lines("b", 3) });
      commit(dir, BEA, "2026-02-02", "new b (#2)", { "lib/c.js": lines("c", 3) });
    },
    async (dir) => {
      const all = await run(dir);
      assert.equal(all.historyQuality?.workflow?.commits, 4);
      assert.equal(all.historyQuality?.workflow?.strategy, "squash", "2 of 4 subjects is half");
      const windowed = await run(dir, ["--since", "2026-01-01"]);
      assert.equal(windowed.historyQuality?.workflow?.commits, 2);
      assert.equal(windowed.historyQuality?.workflow?.squashShare, 1);
      assert.equal(windowed.historyQuality?.oldestRoot.date, "2020-01-05", "the start of the history ignores the window");
      assert.match(historyLines(windowed)[1], /^workflow in the --since\/--until window: squash merges \(100% of subjects/);
      const empty = await run(dir, ["--since", "2030-01-01"]);
      assert.equal(empty.historyQuality?.workflow, null);
      assert.equal(historyLines(empty).length, 1, "no commit in the window, no workflow line");
    },
  );
});

test("the lines appear in the default view, --reviewers, --history and --brief (one short line), and the JSON validates", async () => {
  await withRepo(imported, async (dir) => {
    const r = await run(dir, ["--reviewers", "lib"]);
    assert.match(renderReviewers(r, 5), /^history: begins 2026-01-05 with a commit that adds 20 of 22 files/m);
    const h = await run(dir, ["--history", "lib"]);
    assert.match(renderHistory(h, 5), /^history: begins 2026-01-05 with a commit that adds 20 of 22 files/m);
    const brief = cli(dir, ["--brief"]);
    assert.equal(brief.status, 0, brief.stderr);
    const briefLines = brief.stdout.split("\n").filter((l) => l.startsWith("history:"));
    assert.equal(briefLines.length, 1);
    assert.ok(briefLines[0].length <= 160, briefLines[0]);
    assert.match(briefLines[0], /^history: begins 2026-01-05 with an import \(91% of the files\); rebase or direct commits; the table describes work since then$/);
    assert.ok(brief.stdout.split("\n").length <= 40 && brief.stdout.length <= 3000);
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    const doc = JSON.parse(renderJson(await run(dir)));
    assert.deepEqual(schemaErrors(schema, doc), []);
    assert.equal(doc.historyQuality.oldestRoot.importLikely, true);
    assert.equal(doc.history, null, "the --history view keeps its own key");
    const bj = JSON.parse(cli(dir, ["--brief", "--json"]).stdout);
    assert.deepEqual(schemaErrors(schema.$defs.brief, bj), []);
    assert.equal(bj.history, "begins 2026-01-05 with an import (91% of the files); rebase or direct commits");
    // A schema that forbids a wrong shape proves the check is not vacuous.
    assert.ok(schemaErrors(schema, { ...doc, historyQuality: { ...doc.historyQuality, workflow: { strategy: "other" } } }).length > 0);
  });
});

test("a repository the brief reads as ordinary says so in a short line", async () => {
  await withRepo(ordinary, async (dir) => {
    const out = cli(dir, ["--brief"]).stdout;
    assert.match(out, /^history: begins 2020-01-05, not an import; rebase or direct commits$/m);
    assert.equal(renderBrief(/** @type {any} */ ((await run(dir, ["--brief"])).brief)).includes("history:"), true);
  });
});
