// @ts-check
// Round 13: --attention, files that change often and are orphaned, single-owner or coupled. Fixtures are tiny repositories
// with invented names and fixed dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, git, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderAttention, renderJson, attentionOf, changeSetsOf, changeIndexOf, changeWindowOf } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  ada: ["Ada Quill", "ada@quill.example"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  bot: ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"],
};
/** @param {string} dir @param {string} who @param {string} date @param {Record<string, string | null>} files */
const commit = (dir, who, date, files) => commitAsIdentity(dir, WHO[who], `${date}T10:00:00Z`, `${who}: change`, files);
/** One commit that appends one line, written by `who`, to each path. @param {string} dir @param {string} who @param {string} date @param {string[]} paths */
function touch(dir, who, date, paths) {
  /** @type {Record<string, string>} */
  const files = {};
  for (const p of paths) files[p] = (existsSync(join(dir, p)) ? readFileSync(join(dir, p), "utf8") : "") + `${who} ${date} ${p}\n`;
  return commit(dir, who, date, files);
}

/**
 * Ref day 2026-03-01, so the window starts 2025-03-01. Cal (no commit since 2024-06) wrote old/legacy.js (30 lines); Ada
 * touched it 3 times in the window: orphaned and single owner, 3 commits in the window. solo/mine.js: Ada, 3 commits, alone.
 * pair/a.js and pair/b.js: created by Ada (10 lines), 10 lines added to both by Bea, then one touch each by Ada and Bea, always
 * together: 4 commits each, 11 lines each, coupled. few/f.js: 2 commits.
 * @param {string} dir
 */
function mixed(dir) {
  commit(dir, "cal", "2024-06-01", { "old/legacy.js": lines("legacy", 30) });
  commit(dir, "ada", "2025-06-01", { "pair/a.js": lines("a", 10), "pair/b.js": lines("b", 10), "solo/mine.js": lines("m", 10), "few/f.js": lines("f", 10) });
  touch(dir, "ada", "2025-06-10", ["old/legacy.js", "solo/mine.js", "few/f.js"]);
  commit(dir, "bea", "2025-06-20", { "pair/a.js": lines("a", 10) + lines("ab", 10), "pair/b.js": lines("b", 10) + lines("bb", 10) });
  touch(dir, "ada", "2025-07-01", ["old/legacy.js", "solo/mine.js", "pair/a.js", "pair/b.js"]);
  touch(dir, "ada", "2025-08-01", ["old/legacy.js"]);
  touch(dir, "bea", "2026-03-01", ["pair/a.js", "pair/b.js"]);
}

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-attn-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} extra */
const run = (dir, extra) => analyse(parseArgs(["--cwd", dir, "-q", ...extra]));
/** @param {string} dir @param {string[]} extra */
const items = async (dir, extra = []) => (await run(dir, ["--attention", ...extra])).attention?.items ?? [];

test("files are ranked by score, then commits, then path; each reason carries its numbers", async () => {
  await withRepo(mixed, async (dir) => {
    const v = (await run(dir, ["--attention"])).attention;
    assert.ok(v);
    assert.deepEqual(v.items.map((i) => [i.file, i.commits, i.score]), [["old/legacy.js", 3, 4], ["pair/a.js", 4, 1], ["pair/b.js", 4, 1], ["solo/mine.js", 3, 1]]);
    const legacy = v.items[0];
    assert.deepEqual(legacy.reasons.map((r) => r.kind), ["orphaned", "singleOwner"]);
    assert.deepEqual(legacy.reasons[0], { kind: "orphaned", weight: 3, owner: "Cal Dune", share: 30 / 33, lastCommit: "2024-06-01" });
    assert.deepEqual(legacy.reasons[1], { kind: "singleOwner", weight: 1, owner: "Cal Dune", share: 30 / 33 });
    assert.deepEqual(v.items[1].reasons, [{ kind: "coupled", weight: 1, partner: "pair/b.js", degree: 1, shared: 4 }]);
    assert.deepEqual(v.items[3].reasons, [{ kind: "singleOwner", weight: 1, owner: "Ada Quill", share: 1 }]);
    assert.equal(v.filesConsidered, 4);
    assert.equal(v.filesAssessed, 4);
    assert.equal(v.window.label, "12 months");
    assert.equal(v.window.start, "2025-03-01");
  });
});

test("the text view lists one line per file with the numbers, and closes with the scope", async () => {
  await withRepo(mixed, async (dir) => {
    const text = renderAttention(await run(dir, ["--attention"]));
    assert.match(text, /^attention \(12 months, files with at least 3 commits\):$/m);
    assert.match(text, /^1\. old\/legacy\.js: 3 commits; orphaned \(Cal Dune, last commit 2024-06-01, holds 91%\); single owner \(Cal Dune 91%\)$/m);
    assert.match(text, /^2\. pair\/a\.js: 4 commits; changes with pair\/b\.js \(degree 1\.00\)$/m);
    assert.match(text, /^4\. solo\/mine\.js: 3 commits; single owner \(Ada Quill 100%\)$/m);
    assert.doesNotMatch(text, /^none:/m);
    assert.match(text, /Coupling: files that change together in at least 3 commits, commits touching more than 30 files skipped/);
  });
});

test("a file needs --min-commits commits in the window (default 3)", async () => {
  await withRepo(mixed, async (dir) => {
    assert.ok(!(await items(dir)).some((i) => i.file === "few/f.js"));
    const two = await items(dir, ["--min-commits", "2"]);
    assert.deepEqual(two.find((i) => i.file === "few/f.js")?.reasons.map((r) => r.kind), ["singleOwner"]);
    assert.ok(!(await items(dir, ["--min-commits", "5"])).length);
  });
});

test("none: the negative result names the scope, in both cases", async () => {
  await withRepo(mixed, async (dir) => {
    const noRisk = renderAttention(await run(dir, ["--attention", "--min-commits", "5"]));
    assert.match(noRisk, /^none: no file has at least 5 commits in the window$/m);
  });
  await withRepo((dir) => {
    commit(dir, "ada", "2026-01-01", { "x.js": lines("x", 10), "y.js": lines("y", 10) });
    commit(dir, "bea", "2026-01-02", { "x.js": lines("x", 10) + lines("xb", 10), "y.js": lines("y", 10) + lines("yb", 10) });
    touch(dir, "ada", "2026-01-03", ["x.js"]);
    touch(dir, "bea", "2026-01-04", ["x.js", "y.js"]);
    touch(dir, "ada", "2026-01-05", ["y.js"]);
    touch(dir, "bea", "2026-01-06", ["x.js"]);
    touch(dir, "ada", "2026-01-07", ["y.js"]);
  }, async (dir) => {
    // x.js has 5 commits and y.js 4, they share 3, and each is held by two people: nothing to report.
    assert.deepEqual(await items(dir, ["--min-shared", "4"]), []);
    assert.match(renderAttention(await run(dir, ["--attention", "--min-shared", "4"])), /^none: no file with at least 3 commits in the window is orphaned, single-owner or coupled$/m);
  });
});

test("the window is 12 months before the ref's commit date; --since replaces it; a young history says so", async () => {
  await withRepo(mixed, async (dir) => {
    // Cal's commit is 2024-06-01; the window starts 2025-03-01, so legacy.js has 3 commits, not 4.
    assert.equal((await items(dir)).find((i) => i.file === "old/legacy.js")?.commits, 3);
    const wide = await items(dir, ["--since", "2024-01-01"]);
    assert.equal(wide.find((i) => i.file === "old/legacy.js")?.commits, 4);
    // After 2025-06-15 only the later commits count: solo/mine.js has 1 commit left.
    assert.deepEqual(await items(dir, ["--since", "2025-06-15", "--min-commits", "1"]).then((l) => l.map((i) => [i.file, i.commits])), [["old/legacy.js", 2], ["pair/a.js", 3], ["pair/b.js", 3], ["solo/mine.js", 1]]);
    const text = renderAttention(await run(dir, ["--attention", "--since", "2025-06-15"]));
    assert.match(text, /^attention \(since 2025-06-15, files with at least 3 commits\):$/m);
    // The first commit of mixed is 2024-06-01, before the window start: not a young history.
    assert.doesNotMatch(renderAttention(await run(dir, ["--attention"])), /history starts/);
  });
  await withRepo((dir) => {
    commit(dir, "ada", "2026-01-01", { "x.js": lines("x", 10) });
    touch(dir, "ada", "2026-01-02", ["x.js"]);
    touch(dir, "ada", "2026-01-03", ["x.js"]);
  }, async (dir) => {
    const v = (await run(dir, ["--attention"])).attention;
    assert.equal(v?.window.youngerThanWindow, true);
    assert.match(renderAttention(await run(dir, ["--attention"])), /The history starts 2026-01-01, inside the window, so all of it is used\./);
  });
});

test("the young-history edge: a history that starts on the first day of the window is young; one day earlier is not", () => {
  assert.equal(changeWindowOf(undefined, "2026-03-01", "2025-03-01").youngerThanWindow, true);
  assert.equal(changeWindowOf(undefined, "2026-03-01", "2025-02-28").youngerThanWindow, false);
  assert.equal(changeWindowOf("2025-06-15", "2026-03-01", "2025-06-15").youngerThanWindow, true);
  assert.equal(changeWindowOf("last year", "2026-03-01", "2025-06-15").youngerThanWindow, null);
  assert.equal(changeWindowOf(undefined, "2026-02-28", "2024-01-01").start, "2025-02-28");
});

test("renames are followed: commits under the old name count for the new one, and an older file of the same name does not", async () => {
  await withRepo((dir) => {
    commit(dir, "ada", "2026-01-01", { "old-name.js": lines("n", 12) });
    touch(dir, "ada", "2026-01-02", ["old-name.js"]);
    touch(dir, "ada", "2026-01-03", ["old-name.js"]);
    git(dir, ["mv", "old-name.js", "new-name.js"]);
    commitAsIdentity(dir, WHO.ada, "2026-01-04T10:00:00Z", "ada: rename", {});
    touch(dir, "ada", "2026-01-05", ["new-name.js"]);
  }, async (dir) => {
    const list = await items(dir);
    assert.equal(list.find((i) => i.file === "new-name.js")?.commits, 5);
    assert.ok(!list.some((i) => i.file === "old-name.js"));
  });
  // Unit: a file deleted and a different file added under the same name later.
  const log = [
    "\x01cccccccc\x1fada@quill.example\x1fAda Quill\nM\tf.js\n",
    "\x01bbbbbbbb\x1fada@quill.example\x1fAda Quill\nA\tf.js\n",
    "\x01aaaaaaaa\x1fada@quill.example\x1fAda Quill\nD\tf.js\n",
    "\x01a0000000\x1fada@quill.example\x1fAda Quill\nM\tf.js\n",
  ].join("");
  const sets = changeSetsOf(log, new Set(["f.js"]), new Set(), false);
  assert.deepEqual(sets.map((s) => [s.sha, s.files]), [["cccccccc", ["f.js"]], ["bbbbbbbb", ["f.js"]], ["aaaaaaaa", []], ["a0000000", []]]);
});

test("bot commits and set-aside or ignored commits are not counted; --include-bots counts the bot", async () => {
  /** @type {string} */
  let ignored = "";
  await withRepo((dir) => {
    commit(dir, "ada", "2026-01-01", { "x.js": lines("x", 10) });
    touch(dir, "ada", "2026-01-02", ["x.js"]);
    touch(dir, "bot", "2026-01-03", ["x.js"]);
    ignored = touch(dir, "ada", "2026-01-04", ["x.js"]);
  }, async (dir) => {
    const considered = async (/** @type {string[]} */ extra) => (await run(dir, ["--attention", ...extra])).attention?.filesConsidered;
    // Ada has three commits and a bot one: without the bot x.js has 3 commits (one single-owner reason), with it 4.
    assert.deepEqual((await items(dir)).map((i) => [i.file, i.commits]), [["x.js", 3]]);
    assert.equal(await considered(["--min-commits", "4"]), 0);
    assert.equal(await considered(["--include-bots", "--min-commits", "4"]), 1);
    // One of Ada's commits is ignored by the user: 2 commits are left, below the default of 3.
    assert.equal(await considered(["--ignore-rev", ignored]), 0);
  });
});

test("coupling: 3 shared commits, degree 0.5 or more, skipping commits with more than 30 files", async () => {
  // a.js and b.js: 6 commits each, 3 together (degree 0.5). a.js and c.js: 9 and 9, 3 together (0.33).
  await withRepo((dir) => {
    commit(dir, "ada", "2026-01-01", { "a.js": lines("a", 12), "b.js": lines("b", 12), "c.js": lines("c", 12) });
    commit(dir, "bea", "2026-01-02", { "a.js": lines("a", 12) + lines("ab", 12), "b.js": lines("b", 12) + lines("bb", 12), "c.js": lines("c", 12) + lines("cb", 12) });
    // shared: commits 1 and 2 (a, b, c) plus one more of a and b -> a,b share 3; a,c share 2 unless the third commit includes c.
    touch(dir, "ada", "2026-01-03", ["a.js", "b.js"]);
    for (let i = 4; i <= 6; i++) touch(dir, i % 2 ? "ada" : "bea", `2026-01-0${i}`, ["a.js"]);
    for (let i = 7; i <= 9; i++) touch(dir, i % 2 ? "ada" : "bea", `2026-01-0${i}`, ["b.js"]);
  }, async (dir) => {
    // a.js: 7 commits, b.js: 6, shared 3: degree 3/6 = 0.5, exactly the edge.
    const list = await items(dir, ["--min-commits", "3"]);
    const a = list.find((i) => i.file === "a.js");
    assert.deepEqual(a?.reasons.find((r) => r.kind === "coupled"), { kind: "coupled", weight: 1, partner: "b.js", degree: 0.5, shared: 3 });
    // c.js has 2 commits and no coupling reason of its own at 3 shared.
    assert.ok(!list.some((i) => i.file === "c.js"));
  });
  // One commit too many shared at the other side: degree 3/7.
  await withRepo((dir) => {
    commit(dir, "ada", "2026-01-01", { "a.js": lines("a", 12), "b.js": lines("b", 12) });
    commit(dir, "bea", "2026-01-02", { "a.js": lines("a", 12) + lines("ab", 12), "b.js": lines("b", 12) + lines("bb", 12) });
    touch(dir, "ada", "2026-01-03", ["a.js", "b.js"]);
    for (let i = 4; i <= 7; i++) touch(dir, i % 2 ? "ada" : "bea", `2026-01-0${i}`, ["a.js"]);
    for (let i = 4; i <= 7; i++) touch(dir, i % 2 ? "ada" : "bea", `2026-01-1${i}`, ["b.js"]);
  }, async (dir) => {
    // a.js 7 commits, b.js 7, shared 3: degree 3/7, below 0.5: no coupled reason (owners are shared, so no other reason).
    assert.deepEqual(await items(dir), []);
  });
});

test("a commit that touches more than --max-files-per-commit files is skipped for coupling, exactly 30 is not", async () => {
  /** @param {number} bulk */
  const build = (bulk) => (/** @type {string} */ dir) => {
    commit(dir, "ada", "2026-01-01", { "a.js": lines("a", 12), "b.js": lines("b", 12) });
    commit(dir, "bea", "2026-01-02", { "a.js": lines("a", 12) + lines("ab", 12), "b.js": lines("b", 12) + lines("bb", 12) });
    touch(dir, "ada", "2026-01-03", ["a.js", "b.js"]);
    /** @type {Record<string, string>} */
    const many = {};
    for (let i = 0; i < bulk - 2; i++) many[`gen/g${i}.txt`] = lines(`g${i}`, 2);
    many["a.js"] = readFileSync(join(dir, "a.js"), "utf8") + "bea bulk\n";
    many["b.js"] = readFileSync(join(dir, "b.js"), "utf8") + "bea bulk\n";
    commit(dir, "bea", "2026-01-04", many);
  };
  // Four commits touch both files; the last one touches `bulk` paths.
  await withRepo(build(30), async (dir) => {
    assert.deepEqual((await items(dir, ["--min-commits", "4"])).map((i) => [i.file, i.reasons.map((r) => r.kind)]), [["a.js", ["coupled"]], ["b.js", ["coupled"]]]);
  });
  await withRepo(build(31), async (dir) => {
    // The 31-path commit is skipped: 3 shared commits of 3 each remain (degree 1), so still coupled; raise --min-shared to 4 to see the difference.
    assert.deepEqual((await items(dir, ["--min-commits", "4", "--min-shared", "4"])).length, 0);
    assert.equal((await items(dir, ["--min-commits", "4", "--min-shared", "3"])).length, 2);
    assert.equal((await items(dir, ["--min-commits", "4", "--min-shared", "4", "--max-files-per-commit", "31"])).length, 2);
  });
  await withRepo(build(30), async (dir) => {
    assert.equal((await items(dir, ["--min-commits", "4", "--min-shared", "4"])).length, 2);
    assert.equal((await items(dir, ["--min-commits", "4", "--min-shared", "4", "--max-files-per-commit", "29"])).length, 0);
  });
});

test("--top caps the list and counts the rest; JSON keeps total and more", async () => {
  await withRepo(mixed, async (dir) => {
    const v = (await run(dir, ["--attention", "--top", "2"])).attention;
    assert.deepEqual([v?.items.length, v?.total, v?.more], [2, 4, 2]);
    assert.match(renderAttention(await run(dir, ["--attention", "--top", "2"])), /^\.\.\. 2 more$/m);
  });
});

test("only the 200 files with the most commits are assessed, and the result says so", () => {
  /** @type {{ sha: string, touched: number, files: string[] }[]} */
  const sets = [];
  /** @type {Map<string, Map<string, { name: string, lines: number }>>} */
  const perFile = new Map();
  for (let i = 0; i < 205; i++) {
    const f = `f${String(i).padStart(3, "0")}.js`;
    perFile.set(f, new Map([["ada@quill.example", { name: "Ada Quill", lines: 10 }]]));
    const n = i === 204 ? 5 : 3;
    for (let k = 0; k < n; k++) sets.push({ sha: `${i}-${k}`, touched: 1, files: [f] });
  }
  const people = new Map([["ada quill", { author: "Ada Quill", lines: 2050, lastCommit: "2026-01-01", active: true }]]);
  const v = attentionOf({ sets, perFile, includeBots: false, canonicalOf: new Map(), nameOf: new Map([["ada@quill.example", "Ada Quill"]]), people, minCommits: 3, minShared: 3, maxFiles: 30, shown: 300 });
  assert.deepEqual([v.filesConsidered, v.filesAssessed, v.total], [205, 200, 200]);
  assert.equal(v.items[0].file, "f204.js");
  // The files with equal commits are cut by path: f000 to f198 stay, f199 to f203 are not assessed.
  assert.ok(v.items.some((i) => i.file === "f198.js") && !v.items.some((i) => i.file === "f199.js"));
});

test("changeIndexOf: degree, jaccard and the share of the target's commits", () => {
  const sets = [
    { sha: "1", touched: 2, files: ["a", "b"] },
    { sha: "2", touched: 2, files: ["a", "b"] },
    { sha: "3", touched: 2, files: ["a", "b"] },
    { sha: "4", touched: 1, files: ["a"] },
    { sha: "5", touched: 1, files: ["b"] },
    { sha: "6", touched: 1, files: ["b"] },
    { sha: "7", touched: 99, files: ["a", "b"] },
  ];
  const index = changeIndexOf(sets, 3, 30);
  const [p] = index.partners("a");
  assert.deepEqual([p.path, p.shared, p.degree, p.jaccard, p.share, p.commits], ["b", 3, 3 / 4, 3 / 6, 3 / 4, 6]);
  assert.deepEqual([index.commits.get("a"), index.revisions.get("a"), index.skipped.get("a"), index.skippedTotal], [5, 4, 1, 1]);
  assert.deepEqual(changeIndexOf(sets, 4, 30).partners("a"), []);
});

test("--attention prints its own view: only --json combines, thresholds need it, --sample is refused", () => {
  assert.equal(parseArgs(["--attention"]).attention, true);
  assert.equal(parseArgs(["--attention", "--json", "--min-commits", "4", "--min-shared", "2", "--max-files-per-commit", "10"]).minShared, 2);
  for (const other of [["--csv"], ["--markdown"], ["--group-by", "dir"], ["--files"], ["--orphans"], ["--brief"], ["--tree"], ["--owned-by", "Ada"], ["--sample", "2"]]) {
    assert.throws(() => parseArgs(["--attention", ...other]), /prints its own view; it can be combined with --json only, not with --/, other.join(" "));
  }
  assert.throws(() => parseArgs(["--min-commits", "3"]), /--min-commits works with --attention only/);
  assert.throws(() => parseArgs(["--min-shared", "3"]), /work with --attention/);
  assert.throws(() => parseArgs(["--attention", "--min-commits", "0"]), /--min-commits must be an integer >= 1/);
  assert.throws(() => parseArgs(["--attention", "--min-shared", "x"]), /--min-shared must be an integer >= 1/);
  assert.throws(() => parseArgs(["--attention", "--max-files-per-commit", "0"]), /--max-files-per-commit must be an integer >= 1/);
});

test("JSON: attention is null unless asked, and matches the published schema", async () => {
  const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
  await withRepo(mixed, async (dir) => {
    assert.equal(JSON.parse(renderJson(await run(dir, []))).attention, null);
    const asked = JSON.parse(renderJson(await run(dir, ["--attention"])));
    assert.deepEqual(schemaErrors(schema, asked), []);
    assert.equal(asked.attention.items.length, 4);
  });
});

test("ten files are listed by default and the rest is counted", async () => {
  await withRepo((dir) => {
    /** @type {Record<string, string>} */
    const first = {};
    const names = Array.from({ length: 11 }, (_, i) => `m${String(i).padStart(2, "0")}.js`);
    for (const n of names) first[n] = lines(n, 5);
    commit(dir, "ada", "2026-01-01", first);
    touch(dir, "ada", "2026-01-02", names);
    touch(dir, "ada", "2026-01-03", names);
  }, async (dir) => {
    const v = (await run(dir, ["--attention", "--max-files-per-commit", "5", "--min-shared", "9"])).attention;
    assert.deepEqual([v?.items.length, v?.total, v?.more], [10, 11, 1]);
  });
});

test("the coupled reason names the partner with the highest degree", () => {
  /** @type {{ sha: string, touched: number, files: string[] }[]} */
  const sets = [];
  // a: 8 commits. b: 8 commits, 4 with a (degree 0.5). c: 4 commits, 3 with a (degree 0.75).
  for (let i = 0; i < 4; i++) sets.push({ sha: `ab${i}`, touched: 2, files: i < 3 ? ["a", "b", "c"] : ["a", "b"] });
  for (let i = 0; i < 4; i++) sets.push({ sha: `b${i}`, touched: 1, files: ["b"] }, { sha: `a${i}`, touched: 1, files: ["a"] });
  sets.push({ sha: "c3", touched: 1, files: ["c"] });
  const perFile = new Map([["a", new Map([["ada@quill.example", { name: "Ada Quill", lines: 5 }], ["bea@marsh.example", { name: "Bea Marsh", lines: 5 }]])]]);
  const v = attentionOf({ sets, perFile, includeBots: false, canonicalOf: new Map(), nameOf: new Map(), people: new Map([["ada quill", { author: "Ada Quill", lines: 5, lastCommit: "2026-01-01", active: true }], ["bea marsh", { author: "Bea Marsh", lines: 5, lastCommit: "2026-01-01", active: true }]]), minCommits: 3, minShared: 3, maxFiles: 30, shown: 10 });
  assert.deepEqual(v.items.find((i) => i.file === "a")?.reasons, [{ kind: "coupled", weight: 1, partner: "c", degree: 0.75, shared: 3 }]);
});

test("--until ends the window; a copy entry counts the new path only", async () => {
  await withRepo(mixed, async (dir) => {
    assert.equal((await items(dir, ["--until", "2025-06-30"])).length, 0);
    assert.equal((await items(dir, ["--until", "2025-06-30", "--min-commits", "1"])).find((i) => i.file === "solo/mine.js")?.commits, 2);
  });
  const log = "\x01cccccccc\x1fada@quill.example\x1fAda Quill\nC75\torig.js\tcopy.js\n";
  assert.deepEqual(changeSetsOf(log, new Set(["orig.js", "copy.js"]), new Set(), false).map((s) => s.files), [["copy.js"]]);
});
