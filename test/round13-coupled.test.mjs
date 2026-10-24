// @ts-check
// Round 13: --coupled <path>, the files that change together with one file. Fixtures are tiny repositories with invented
// names and fixed dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, git, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderCoupled, renderJson, coupledOf, changeIndexOf } = await import("../bin/surviving-lines.js");

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
 * Ref day 2026-03-01 (window from 2025-03-01). pay/ledger.js has 7 commits, all in the window. pay/rules.js has 5 in the window
 * (Cal's first commit is older), all with ledger: degree 5/5. test/pay.test.js has 8, 4 with ledger: degree 4/7. docs/notes.md
 * shares 2 (below 3) and lone/x.js none. Cal (no commit since 2024-06) wrote the first 20 lines of pay/rules.js.
 * @param {string} dir
 */
function pay(dir) {
  commit(dir, "cal", "2024-06-01", { "pay/rules.js": lines("rules", 20) });
  commit(dir, "ada", "2025-04-01", { "pay/ledger.js": lines("ledger", 10), "lone/x.js": lines("x", 5) });
  touch(dir, "ada", "2025-04-02", ["pay/ledger.js", "pay/rules.js", "test/pay.test.js"]);
  touch(dir, "ada", "2025-04-03", ["pay/ledger.js", "pay/rules.js", "test/pay.test.js"]);
  touch(dir, "bea", "2025-04-04", ["pay/ledger.js", "pay/rules.js", "test/pay.test.js", "docs/notes.md"]);
  touch(dir, "bea", "2025-04-05", ["pay/ledger.js", "pay/rules.js", "test/pay.test.js", "docs/notes.md"]);
  touch(dir, "ada", "2025-04-06", ["pay/ledger.js", "pay/rules.js"]);
  touch(dir, "ada", "2025-04-07", ["pay/ledger.js"]);
  for (let i = 8; i <= 11; i++) touch(dir, "bea", `2025-04-${String(i).padStart(2, "0")}`, ["test/pay.test.js"]);
  touch(dir, "bea", "2026-03-01", ["lone/x.js"]);
}

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-coupled-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} extra */
const run = (dir, extra) => analyse(parseArgs(["--cwd", dir, "-q", ...extra]));

test("partners with their shared commits, degree, jaccard and share of the target's commits, best first", async () => {
  await withRepo(pay, async (dir) => {
    const v = (await run(dir, ["--coupled", "pay/ledger.js"])).coupled;
    assert.ok(v);
    // ledger: 7 commits. rules: 5 in the window (Cal's is older), 5 with ledger. test: 8 commits, 4 with ledger.
    assert.deepEqual([v.commits, v.revisions, v.skippedCommits, v.enough], [7, 7, 0, true]);
    assert.deepEqual(v.partners.map((p) => [p.path, p.shared, p.commits]), [["pay/rules.js", 5, 5], ["test/pay.test.js", 4, 8]]);
    const [rules, test_] = v.partners;
    assert.deepEqual([rules.degree, rules.jaccard, rules.share], [1, 5 / 7, 5 / 7]);
    assert.deepEqual([test_.degree, test_.jaccard, test_.share], [4 / 7, 4 / 11, 4 / 7]);
    // docs/notes.md shares 2 commits (below 3) and lone/x.js none: not partners.
    assert.equal(v.partnersTotal, 2);
    assert.deepEqual(v.window.start, "2025-03-01");
  });
});

test("the text view: header, one line per partner with the top owner of the best five, skipped commits, reviewers, the degree definition", async () => {
  await withRepo(pay, async (dir) => {
    const text = renderCoupled(await run(dir, ["--coupled", "pay/ledger.js"]));
    assert.match(text, /^pay\/ledger\.js: 7 commits since 2025-03-01; changes together with:$/m);
    const rows = text.split("\n");
    assert.ok(rows.includes("  pay/rules.js        5 shared  degree 1.00  jaccard 0.71  top owner Cal Dune 80% (inactive)"), text);
    assert.ok(rows.includes("  test/pay.test.js    4 shared  degree 0.57  jaccard 0.36  top owner Bea Marsh 75% (active)"), text);
    assert.ok(rows.includes("reviewers across these files: Cal Dune 20 lines (inactive), Ada Quill 19 lines (active), Bea Marsh 10 lines (active)"), text);
    assert.match(text, /degree = commits that touched both files \/ the smaller commit count of the two \(code-maat divides by the average/);
    assert.doesNotMatch(text, /commits skipped/);
  });
});

test("only the five best partners get a top owner; reviewers are the people with the most lines across the target and those five", () => {
  /** @type {{ sha: string, touched: number, files: string[] }[]} */
  const sets = [];
  const names = ["t", "p1", "p2", "p3", "p4", "p5", "p6"];
  for (let i = 0; i < 4; i++) sets.push({ sha: `s${i}`, touched: 7, files: names });
  const index = changeIndexOf(sets, 3, 30);
  /** @type {Map<string, Map<string, { name: string, lines: number }>>} */
  const perFile = new Map();
  names.forEach((n, i) => perFile.set(n, new Map([["ada@quill.example", { name: "Ada Quill", lines: 10 }], ["bea@marsh.example", { name: "Bea Marsh", lines: i === 6 ? 500 : 3 }]])));
  const people = new Map([["ada quill", { author: "Ada Quill", lines: 1, lastCommit: "2026-01-01", active: true }]]);
  const v = coupledOf({ path: "t", index, perFile, includeBots: false, canonicalOf: new Map(), nameOf: new Map(), people, shown: 10 });
  assert.deepEqual(v.partners.map((p) => p.topOwner === null), [false, false, false, false, false, true]);
  // Ada: 10 in each of the six files (target + five partners) = 60. Bea: 3 each = 18; p6 (500 lines) is not among the five.
  assert.deepEqual(v.reviewers, [{ author: "Ada Quill", lines: 60, active: true }, { author: "Bea Marsh", lines: 18, active: false }]);
  const capped = coupledOf({ path: "t", index, perFile, includeBots: false, canonicalOf: new Map(), nameOf: new Map(), people, shown: 2 });
  assert.deepEqual([capped.partners.length, capped.more, capped.partnersTotal], [2, 4, 6]);
});

test("a file with fewer than 3 commits has not enough history for coupling", async () => {
  await withRepo(pay, async (dir) => {
    const v = (await run(dir, ["--coupled", "lone/x.js"])).coupled;
    // lone/x.js: created 2025-04-01 and touched 2026-03-01: 2 commits.
    assert.deepEqual([v?.commits, v?.enough, v?.partners.length], [2, false, 0]);
    assert.match(renderCoupled(await run(dir, ["--coupled", "lone/x.js"])), /^lone\/x\.js: 2 commits since 2025-03-01; not enough history for coupling/m);
  });
  // Exactly 3 commits is enough.
  await withRepo((dir) => {
    commit(dir, "ada", "2026-01-01", { "a.js": lines("a", 5), "b.js": lines("b", 5) });
    touch(dir, "ada", "2026-01-02", ["a.js", "b.js"]);
    touch(dir, "ada", "2026-01-03", ["a.js", "b.js"]);
  }, async (dir) => {
    const v = (await run(dir, ["--coupled", "a.js"])).coupled;
    assert.deepEqual([v?.commits, v?.enough, v?.partners.map((p) => [p.path, p.shared, p.degree])], [3, true, [["b.js", 3, 1]]]);
  });
});

test("a file with no partner says so, with the thresholds", async () => {
  await withRepo(pay, async (dir) => {
    const text = renderCoupled(await run(dir, ["--coupled", "pay/ledger.js", "--min-shared", "6"]));
    assert.match(text, /^pay\/ledger\.js: 7 commits since 2025-03-01; no other file shares at least 6 of them \(commits touching more than 30 files are skipped\)$/m);
    assert.equal((await run(dir, ["--coupled", "pay/ledger.js", "--min-shared", "5"])).coupled?.partners.length, 1);
    assert.equal((await run(dir, ["--coupled", "pay/ledger.js", "--min-shared", "2"])).coupled?.partners.length, 3);
  });
});

test("commits that touch more than --max-files-per-commit files are skipped, and the skipped ones are counted for the target", async () => {
  await withRepo((dir) => {
    commit(dir, "ada", "2026-01-01", { "a.js": lines("a", 5), "b.js": lines("b", 5) });
    touch(dir, "ada", "2026-01-02", ["a.js", "b.js"]);
    touch(dir, "ada", "2026-01-03", ["a.js", "b.js"]);
    /** @type {Record<string, string>} */
    const many = { "a.js": readFileSync(join(dir, "a.js"), "utf8") + "bea bulk\n", "b.js": readFileSync(join(dir, "b.js"), "utf8") + "bea bulk\n" };
    for (let i = 0; i < 28; i++) many[`gen/g${i}.txt`] = lines(`g${i}`, 1);
    commit(dir, "bea", "2026-01-04", many);
  }, async (dir) => {
    // The last commit touches 30 paths: used. With --max-files-per-commit 29 it is skipped and counted.
    const used = (await run(dir, ["--coupled", "a.js"])).coupled;
    assert.deepEqual([used?.commits, used?.revisions, used?.skippedCommits, used?.partners[0].shared], [4, 4, 0, 4]);
    const skipped = (await run(dir, ["--coupled", "a.js", "--max-files-per-commit", "29"])).coupled;
    assert.deepEqual([skipped?.commits, skipped?.revisions, skipped?.skippedCommits, skipped?.partners[0].shared], [4, 3, 1, 3]);
    assert.match(renderCoupled(await run(dir, ["--coupled", "a.js", "--max-files-per-commit", "29"])), /^commits skipped for touching more than 29 files: 1$/m);
  });
});

test("renames are followed, and bot commits are left out", async () => {
  await withRepo((dir) => {
    commit(dir, "ada", "2026-01-01", { "old.js": lines("o", 8), "b.js": lines("b", 8) });
    touch(dir, "ada", "2026-01-02", ["old.js", "b.js"]);
    git(dir, ["mv", "old.js", "new.js"]);
    commitAsIdentity(dir, WHO.ada, "2026-01-03T10:00:00Z", "ada: rename", {});
    touch(dir, "ada", "2026-01-04", ["new.js", "b.js"]);
    touch(dir, "bot", "2026-01-05", ["new.js", "b.js"]);
  }, async (dir) => {
    const v = (await run(dir, ["--coupled", "new.js"])).coupled;
    // Commits: create, touch, rename (new.js only), touch = 4; shared with b.js: 3 (the bot commit is not counted).
    assert.deepEqual([v?.commits, v?.partners[0].path, v?.partners[0].shared], [4, "b.js", 3]);
    const withBot = (await run(dir, ["--coupled", "new.js", "--include-bots"])).coupled;
    assert.deepEqual([withBot?.commits, withBot?.partners[0].shared], [5, 4]);
  });
});

test("a directory, an unknown file and a left-out file are errors that say why; ./ is accepted", async () => {
  await withRepo(pay, async (dir) => {
    await assert.rejects(run(dir, ["--coupled", "pay"]), /--coupled takes one file; "pay" is a directory, which is not supported yet/);
    await assert.rejects(run(dir, ["--coupled", "pay/"]), /is a directory/);
    await assert.rejects(run(dir, ["--coupled", "nope.js"]), /--coupled: "nope.js" is not a counted file at ref "HEAD"/);
    await assert.rejects(run(dir, ["--coupled", "pay/ledger.js", "--exclude", "pay/*"]), /not a counted file/);
    assert.equal((await run(dir, ["--coupled", "./pay/ledger.js"])).coupled?.path, "pay/ledger.js");
  });
});

test("--top caps the partners", async () => {
  await withRepo(pay, async (dir) => {
    const v = (await run(dir, ["--coupled", "pay/ledger.js", "--top", "1", "--min-shared", "2"])).coupled;
    assert.deepEqual([v?.partners.length, v?.partnersTotal, v?.more], [1, 3, 2]);
    assert.match(renderCoupled(await run(dir, ["--coupled", "pay/ledger.js", "--top", "1", "--min-shared", "2"])), /^ {2}\.\.\. 2 more$/m);
  });
});

test("--coupled prints its own view: only --json combines, no pathspecs, --sample refused", () => {
  assert.equal(parseArgs(["--coupled", "a.js"]).coupled, "a.js");
  assert.equal(parseArgs(["--coupled", "a.js", "--json", "--min-shared", "2", "--max-files-per-commit", "9"]).minShared, 2);
  for (const other of [["--csv"], ["--markdown"], ["--group-by", "dir"], ["--files"], ["--orphans"], ["--brief"], ["--tree"], ["--attention"], ["--sample", "2"]]) {
    assert.throws(() => parseArgs(["--coupled", "a.js", ...other]), /prints its own view; it can be combined with --json only, not with --/, other.join(" "));
  }
  assert.throws(() => parseArgs(["--coupled", "a.js", "--", "src"]), /takes its path as its own value/);
  assert.throws(() => parseArgs(["--coupled"]), /--coupled needs a value/);
  assert.throws(() => parseArgs(["--coupled", "  "]), /--coupled needs a file path/);
  assert.throws(() => parseArgs(["--min-commits", "2", "--coupled", "a.js"]), /--min-commits works with --attention only/);
});

test("JSON: coupled is null unless asked, and matches the published schema", async () => {
  const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
  await withRepo(pay, async (dir) => {
    assert.equal(JSON.parse(renderJson(await run(dir, []))).coupled, null);
    const asked = JSON.parse(renderJson(await run(dir, ["--coupled", "pay/ledger.js"])));
    assert.deepEqual(schemaErrors(schema, asked), []);
    assert.equal(asked.coupled.partners.length, 2);
    assert.equal(asked.attention, null);
  });
});

test("ten partners are listed by default; at most three reviewers are named", async () => {
  await withRepo((dir) => {
    const names = ["t.js", ...Array.from({ length: 11 }, (_, i) => `p${String(i).padStart(2, "0")}.js`)];
    /** @type {Record<string, string>} */
    const first = {};
    for (const n of names) first[n] = lines(n, 3);
    commit(dir, "ada", "2026-01-01", first);
    touch(dir, "bea", "2026-01-02", names);
    touch(dir, "cal", "2026-01-03", names);
    commit(dir, "bot", "2026-01-04", {});
  }, async (dir) => {
    const v = (await run(dir, ["--coupled", "t.js"])).coupled;
    assert.deepEqual([v?.partners.length, v?.partnersTotal, v?.more], [10, 11, 1]);
    // Ada 3 lines, Bea 1, Cal 1 in each of the six files: three people, all named.
    assert.equal(v?.reviewers.length, 3);
  });
  /** @type {{ sha: string, touched: number, files: string[] }[]} */
  const sets = Array.from({ length: 3 }, (_, i) => ({ sha: `s${i}`, touched: 2, files: ["t", "p"] }));
  const counts = new Map(["a", "b", "c", "d"].map((n, i) => [`${n}@x.example`, { name: `Person ${n}`, lines: 10 - i }]));
  const v = coupledOf({ path: "t", index: changeIndexOf(sets, 3, 30), perFile: new Map([["t", counts]]), includeBots: false, canonicalOf: new Map(), nameOf: new Map(), people: new Map(), shown: 10 });
  assert.deepEqual(v.reviewers.map((p) => p.author), ["Person a", "Person b", "Person c"]);
});

test("the target's own top owner is in the result; a --since that is not a date is printed as given; a trailing slash means a directory", async () => {
  await withRepo(pay, async (dir) => {
    const v = (await run(dir, ["--coupled", "pay/rules.js"])).coupled;
    assert.deepEqual(v?.owner, { author: "Cal Dune", share: 0.8, active: false });
    const text = renderCoupled(await run(dir, ["--coupled", "pay/ledger.js", "--since", "2025-04-02 12:00 +0300"]));
    assert.match(text, /^pay\/ledger\.js: 6 commits since 2025-04-02 12:00 \+0300; changes together with:$/m);
    await assert.rejects(run(dir, ["--coupled", "nope/"]), /is a directory/);
  });
});
