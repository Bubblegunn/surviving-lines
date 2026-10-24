// @ts-check
// Round 13, rival #10: --written-since <date>, ownership of recent code, with inserted lines, the kept ratio and --churn.
// Fixtures are tiny repositories with invented names and fixed author dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAs, commitAsIdentity, createRepo, git, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderWrittenSince, renderJson, writtenSinceOf, fileChangesOf, countBlameWritten, parseWrittenDate, inSample } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  ada: ["Ada Quill", "ada@quill.example"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  bot: ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"],
};
/** @param {string} dir @param {string} who @param {string} stamp @param {Record<string, string | null>} files */
const commit = (dir, who, stamp, files) => commitAsIdentity(dir, WHO[who], stamp.length === 10 ? `${stamp}T10:00:00Z` : stamp, `${who}: change`, files);

/**
 * Ada writes a.js (10 lines, January 2025) and, on 1 July 2025, c.js (6 lines) which she rewrites to 3 lines the next day.
 * Bea writes b.js (10 lines, June 2025) and e.js (4 lines, 1 August), which Cal rewrites to 2 lines on 15 August.
 * Surviving: Ada 13 (10 old, 3 new), Bea 10, Cal 2. All 25 lines; from 2025-07-01 Ada's 3 and Cal's 2 are in the window.
 * Inserted from 2025-07-01: Ada 6 + 3 = 9, Bea 4, Cal 2. All time: Ada inserted 19, deleted 6; Bea inserted 14; Cal inserted 2, deleted 4.
 * @param {string} dir
 */
function recent(dir) {
  commit(dir, "ada", "2025-01-10", { "a.js": lines("a", 10) });
  commit(dir, "bea", "2025-06-10", { "b.js": lines("b", 10) });
  commit(dir, "ada", "2025-07-01", { "c.js": lines("c", 6) });
  commit(dir, "ada", "2025-07-02", { "c.js": lines("n", 3) });
  commit(dir, "bea", "2025-08-01", { "e.js": lines("e", 4) });
  commit(dir, "cal", "2025-08-15", { "e.js": lines("k", 2) });
}

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-written-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} extra */
const run = (dir, extra) => analyse(parseArgs(["--cwd", dir, "-q", ...extra]));

test("written, inserted and kept per person, and the share of all lines", async () => {
  await withRepo(recent, async (dir) => {
    const v = (await run(dir, ["--written-since", "2025-07-01"])).writtenSince;
    assert.ok(v);
    assert.deepEqual([v.lines, v.linesTotal, v.insertedTotal], [5, 25, 15]);
    assert.equal(v.share, 5 / 25);
    assert.deepEqual(v.authors.map((p) => [p.author, p.lines, p.written, p.inserted, p.kept, p.checkFilters, p.churn]), [
      ["Ada Quill", 13, 3, 9, 1 / 3, false, null],
      ["Cal Dune", 2, 2, 2, 1, false, null],
      ["Bea Marsh", 10, 0, 4, 0, false, null],
    ]);
    const text = renderWrittenSince(await run(dir, ["--written-since", "2025-07-01"]));
    assert.match(text, /^lines last changed between 2025-07-01 and \d{4}-\d{2}-\d{2}: 5 of 25 \(20\.0%\)$/m);
    assert.match(text, /^Ada Quill\s+13\s+3\s+9\s+33\.3%$/m);
    assert.match(text, /^Bea Marsh\s+10\s+0\s+4\s+0\.0%$/m);
    assert.match(text, /author date, not the committer date/);
  });
});

test("--churn adds all-time inserted and deleted lines and the survival ratio", async () => {
  await withRepo(recent, async (dir) => {
    const v = (await run(dir, ["--written-since", "2025-07-01", "--churn"])).writtenSince;
    assert.deepEqual(v?.authors.map((p) => p.churn), [
      { inserted: 19, deleted: 6, survival: 13 / 19 },
      { inserted: 2, deleted: 4, survival: 1 },
      { inserted: 14, deleted: 0, survival: 10 / 14 },
    ]);
    const text = renderWrittenSince(await run(dir, ["--written-since", "2025-07-01", "--churn"]));
    assert.match(text, /all inserted\s+all deleted\s+survival/);
    assert.match(text, /^Ada Quill\s+13\s+3\s+9\s+33\.3%\s+19\s+6\s+68\.4%$/m);
  });
});

test("the window is since <= author time < until, to the second", async () => {
  await withRepo(recent, async (dir) => {
    const w = async (/** @type {string[]} */ args) => (await run(dir, ["--written-since", ...args])).writtenSince?.lines;
    // Ada's rewrite is at 2025-07-02T10:00:00Z.
    assert.equal(await w(["2025-07-02T10:00:00Z", "--written-until", "2025-08-01"]), 3, "since is inclusive");
    assert.equal(await w(["2025-07-02T10:00:01Z", "--written-until", "2025-08-01"]), 0, "one second later it is out");
    assert.equal(await w(["2025-07-01", "--written-until", "2025-07-02T10:00:00Z"]), 0, "until is exclusive");
    assert.equal(await w(["2025-07-01", "--written-until", "2025-07-02T10:00:01Z"]), 3);
    // Inserted follows the same bounds: the 2025-07-01 commit (6 lines) is inside until 2025-07-02, the rewrite is not.
    const v = (await run(dir, ["--written-since", "2025-07-01", "--written-until", "2025-07-02"])).writtenSince;
    assert.equal(v?.authors.find((p) => p.author === "Ada Quill")?.inserted, 6);
    assert.equal(v?.until, "2025-07-02");
    // The same bound to the second for inserted: a commit made at the until instant is out, one second later it is in.
    const insertedAt = async (/** @type {string} */ until) => (await run(dir, ["--written-since", "2025-07-01", "--written-until", until])).writtenSince?.authors.find((p) => p.author === "Ada Quill")?.inserted;
    assert.equal(await insertedAt("2025-07-02T10:00:00Z"), 6);
    assert.equal(await insertedAt("2025-07-02T10:00:01Z"), 9);
  });
});

test("the author date decides, not the committer date", async () => {
  await withRepo(
    (dir) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "x.js"), lines("x", 5));
      git(dir, ["add", "x.js"]);
      git(dir, ["commit", "-q", "-m", "x"], { GIT_AUTHOR_NAME: "Ada Quill", GIT_AUTHOR_EMAIL: "ada@quill.example", GIT_AUTHOR_DATE: "2025-01-01T10:00:00Z", GIT_COMMITTER_NAME: "Ada Quill", GIT_COMMITTER_EMAIL: "ada@quill.example", GIT_COMMITTER_DATE: "2025-09-01T10:00:00Z" });
    },
    async (dir) => {
      const v = (await run(dir, ["--written-since", "2025-06-01"])).writtenSince;
      assert.deepEqual([v?.lines, v?.insertedTotal, v?.authors.length], [0, 0, 0]);
      assert.equal((await run(dir, ["--written-since", "2024-12-31"])).writtenSince?.lines, 5);
    },
  );
});

test("a re-applied change keeps the author time of the commit it is credited to", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "bea", "2025-01-01", { "base.js": lines("b", 4) });
      const original = commit(dir, "ada", "2025-02-01", { "f.js": lines("f", 3) });
      const env = (/** @type {string} */ d) => ({ GIT_AUTHOR_NAME: "Bea Marsh", GIT_AUTHOR_EMAIL: "bea@marsh.example", GIT_COMMITTER_NAME: "Bea Marsh", GIT_COMMITTER_EMAIL: "bea@marsh.example", GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d });
      git(dir, ["revert", "--no-edit", original], env("2025-03-01T10:00:00Z"));
      const revert = git(dir, ["rev-parse", "HEAD"]).trim();
      git(dir, ["revert", "--no-edit", "HEAD"], env("2025-09-01T10:00:00Z"));
      git(dir, ["commit", "--amend", "-q", "-m", `Revert "Revert "ada: change""\n\nThis reverts commit ${revert}.`], env("2025-09-01T10:00:00Z"));
    },
    async (dir) => {
      const v = (await run(dir, ["--written-since", "2025-06-01"])).writtenSince;
      // The lines are Ada's (credited), written in February: not in a window that starts in June. Bea only re-applied them.
      assert.equal(v?.lines, 0);
      assert.equal((await run(dir, ["--written-since", "2025-01-15"])).writtenSince?.authors.find((p) => p.author === "Ada Quill")?.written, 3);
    },
  );
});

test("renames are not insertions, and older history under the old name counts for the current file", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2025-01-10", { "old.js": lines("o", 10) });
      git(dir, ["mv", "old.js", "new.js"]);
      commit(dir, "bea", "2025-09-01", {});
    },
    async (dir) => {
      const v = (await run(dir, ["--written-since", "2025-08-01", "--churn"])).writtenSince;
      // The rename adds and removes nothing: Bea has no row. Ada's 10 lines under the old name belong to new.js.
      assert.deepEqual(v?.authors, []);
      const all = (await run(dir, ["--written-since", "2025-01-01", "--churn"])).writtenSince;
      assert.deepEqual(all?.authors.map((p) => [p.author, p.written, p.inserted, p.churn]), [["Ada Quill", 10, 10, { inserted: 10, deleted: 0, survival: 1 }]]);
    },
  );
});

test("bots are left out of the table and the numstat unless --include-bots; --ignore-rev leaves the commit out of inserted", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2025-01-10", { "a.js": lines("a", 4) });
      commit(dir, "bot", "2025-09-01", { "lock.js": lines("l", 7) });
      commit(dir, "bea", "2025-09-02", { "b.js": lines("b", 3) });
      commit(dir, "bea", "2025-09-03", { "c.js": lines("c", 2) });
    },
    async (dir) => {
      const v = (await run(dir, ["--written-since", "2025-08-01"])).writtenSince;
      assert.deepEqual(v?.authors.map((p) => [p.author, p.written, p.inserted]), [["Bea Marsh", 5, 5]]);
      assert.equal(v?.linesTotal, 9);
      const withBots = (await run(dir, ["--written-since", "2025-08-01", "--include-bots"])).writtenSince;
      assert.deepEqual(withBots?.authors.map((p) => [p.author, p.written, p.inserted]), [["dependabot[bot]", 7, 7], ["Bea Marsh", 5, 5]]);
      const sha = git(dir, ["rev-parse", "HEAD"]).trim();
      const ignored = (await run(dir, ["--written-since", "2025-08-01", "--ignore-rev", sha])).writtenSince;
      // The ignored commit's two lines are blamed on it anyway, but they are not insertions of the numstat.
      const bea = ignored?.authors.find((p) => p.author === "Bea Marsh");
      assert.equal(bea?.inserted, 3);
      assert.equal(bea?.written, 5);
      assert.equal(bea?.checkFilters, true);
      assert.match(renderWrittenSince(await run(dir, ["--written-since", "2025-08-01", "--ignore-rev", sha])), /Bea Marsh\s+5\s+5\s+3\s+100%\*[\s\S]*check filters/);
    },
  );
});

test("with --sample, blame and numstat read the same files", async () => {
  await withRepo(
    (dir) => {
      const files = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((n) => [`${n}.js`, lines(n, 4)]));
      commit(dir, "ada", "2025-09-01", files);
    },
    async (dir) => {
      const r = await run(dir, ["--written-since", "2025-08-01", "--sample", "2"]);
      const sampled = ["a", "b", "c", "d", "e", "f"].filter((n) => inSample(`${n}.js`, 2, "")).length;
      assert.ok(sampled > 0 && sampled < 6, `${sampled} files sampled`);
      assert.deepEqual([r.writtenSince?.lines, r.writtenSince?.insertedTotal], [sampled * 4, sampled * 4]);
    },
  );
});

test("--merge-identities folds the addresses of one person in written and inserted", async () => {
  await withRepo(
    (dir) => {
      commitAs(dir, "ada", "2025-09-01T10:00:00Z", "ada: desktop", { "a.js": lines("a", 5) });
      commitAs(dir, "adaLaptop", "2025-09-02T10:00:00Z", "ada: laptop", { "b.js": lines("b", 3) });
      commitAs(dir, "bob", "2025-09-03T10:00:00Z", "bob", { "c.js": lines("c", 4) });
    },
    async (dir) => {
      const merged = (await run(dir, ["--written-since", "2025-08-01", "--merge-identities"])).writtenSince;
      assert.deepEqual(merged?.authors.map((p) => [p.author, p.written, p.inserted]), [["Ada", 8, 8], ["Bob", 4, 4]]);
      assert.equal((await run(dir, ["--written-since", "2025-08-01"])).writtenSince?.authors.length, 3);
    },
  );
});

test("a window before the first commit prints no rows and says so; a window after it says another thing", async () => {
  await withRepo(recent, async (dir) => {
    const before = await run(dir, ["--written-since", "2020-01-01", "--written-until", "2020-06-01"]);
    assert.deepEqual([before.writtenSince?.authors, before.writtenSince?.beforeHistory, before.writtenSince?.firstCommit], [[], true, "2025-01-10"]);
    assert.match(renderWrittenSince(before), /^no rows: the history starts 2025-01-10, after this window$/m);
    const after = await run(dir, ["--written-since", "2030-01-01"]);
    assert.equal(after.writtenSince?.beforeHistory, false);
    assert.match(renderWrittenSince(after), /^no rows: no surviving line was written and no line was inserted in this window$/m);
    // The window ends on the first commit's day (exclusive): the history starts after it.
    assert.equal((await run(dir, ["--written-since", "2020-01-01", "--written-until", "2025-01-10"])).writtenSince?.beforeHistory, true);
    assert.equal((await run(dir, ["--written-since", "2020-01-01", "--written-until", "2025-01-11"])).writtenSince?.beforeHistory, false);
  });
});

test("options: dates are validated, the flags need --written-since, --co-authors share and other views are refused", () => {
  const bad = (/** @type {string[]} */ args, /** @type {RegExp} */ re) => assert.throws(() => parseArgs(args), re);
  bad(["--written-since", "last week"], /--written-since needs a date like 2026-04-24/);
  bad(["--written-since", "2025-02-30x"], /needs a date/);
  bad(["--written-since", "2025"], /needs a date/);
  bad(["--written-since", "June 1, 2025"], /needs a date/);
  bad(["--written-since", "2025-06-01T10:00:00"], /needs a date/);
  bad(["--written-since", "2025-01-01", "--written-until", "soon"], /--written-until needs a date/);
  bad(["--written-until", "2025-01-01"], /--written-until works with --written-since only/);
  bad(["--churn"], /--churn works with --written-since only/);
  bad(["--written-since", "2025-02-01", "--written-until", "2025-02-01"], /--written-until must be later/);
  bad(["--written-since", "2025-02-01", "--co-authors", "share"], /prints its own view; it can be combined with --json only, not with --co-authors share/);
  bad(["--written-since", "2025-02-01", "--csv"], /--written-since prints its own view; it can be combined with --json only, not with --csv/);
  bad(["--written-since", "2025-02-01", "--tree"], /prints its own view/);
  assert.equal(parseArgs(["--written-since", "2025-02-01", "--json", "--sample", "3"]).sample, 3);
  assert.equal(parseWrittenDate("2025-02-01", "x"), Date.UTC(2025, 1, 1) / 1000);
  assert.equal(parseWrittenDate("2025-02-01T10:00:00+02:00", "x"), Date.UTC(2025, 1, 1, 8) / 1000);
});

test("the JSON key is null unless asked and valid against the schema when asked", async () => {
  await withRepo(recent, async (dir) => {
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    const plain = JSON.parse(renderJson(await run(dir, [])));
    assert.equal(plain.writtenSince, null);
    for (const extra of [[], ["--churn"], ["--written-until", "2025-07-02"]]) {
      const json = JSON.parse(renderJson(await run(dir, ["--written-since", "2025-07-01", ...extra])));
      assert.deepEqual(schemaErrors(schema, json), []);
      assert.equal(json.writtenSince.churn, extra[0] === "--churn");
    }
  });
});

test("unit: writtenSinceOf caps nothing in the data, flags kept above 1, keeps a person with no line, folds identities", () => {
  const rows = [{ author: "Ada", mail: "ada@x", lines: 10 }, { author: "Bea", mail: "bea@x", lines: 0 }];
  const change = (/** @type {string} */ mail, /** @type {number} */ time, /** @type {number} */ add, /** @type {number} */ del) => ({ sha: "s", mail, name: mail, time, day: "", files: [{ path: "f", add, del }] });
  const v = writtenSinceOf({
    rows, written: new Map([["ada@x", 6], ["ada@old", 2], ["ghost@x", 9]]), attributed: 10,
    changes: [change("ada@x", 100, 4, 1), change("ada@old", 100, 1, 0), change("bea@x", 100, 3, 0), change("bea@x", 50, 8, 0), change("zed@x", 100, 0, 5)],
    from: 100, to: 200, canonicalOf: new Map([["ada@old", { author: "Ada", mail: "ada@x" }]]), nameOf: new Map(), churn: true,
  });
  // Ada: written 6 + 2 (folded), inserted 4 + 1; kept 8/5 is above 1. Bea: nothing written, inserted 3 in the window, 11 all time.
  assert.deepEqual(v.authors.map((p) => [p.mail, p.written, p.inserted, p.kept, p.checkFilters]), [["ada@x", 8, 5, 8 / 5, true], ["bea@x", 0, 3, 0, false]]);
  assert.deepEqual(v.authors[1].churn, { inserted: 11, deleted: 0, survival: 0 });
  // A person with deletions only has neither written nor inserted lines in the window: no row. A written count of an unknown address is dropped.
  assert.ok(!v.authors.some((p) => p.mail === "zed@x" || p.mail === "ghost@x"));
  assert.equal(v.lines, 8);
  const none = writtenSinceOf({ rows: [{ author: "Ada", mail: "ada@x", lines: 1 }], written: new Map([["ada@x", 1]]), attributed: 1, changes: [], from: 0, to: null, canonicalOf: new Map(), nameOf: new Map(), churn: true });
  assert.deepEqual(none.authors.map((p) => [p.kept, p.checkFilters, p.churn]), [[null, false, { inserted: 0, deleted: 0, survival: null }]]);
});

test("unit: countBlameWritten reads author-time per line; fileChangesOf replays renames, adds, bots and skips", () => {
  const block = (/** @type {string} */ mail, /** @type {number} */ time) => `${"a".repeat(40)} 1 1 1\nauthor X\nauthor-mail <${mail}>\nauthor-time ${time}\nauthor-tz +0000\nfilename f\n\tcontent\n`;
  const porcelain = block("A@X", 99) + block("a@x", 100) + block("b@x", 199) + block("b@x", 200);
  assert.deepEqual([...countBlameWritten(porcelain, 100, 200)], [["a@x", 1], ["b@x", 1]]);
  assert.deepEqual([...countBlameWritten(porcelain, 100, null)], [["a@x", 1], ["b@x", 2]]);

  const rec = (/** @type {string} */ sha, /** @type {string} */ who, /** @type {string[]} */ entries) => `\x01${sha}\x1f${who}@x\x1f${who}\x1f1000\x1f2025-01-01\n\n${entries.join("\n")}\n`;
  const raw = (/** @type {string} */ status, /** @type {string[]} */ paths) => `:100644 100644 1 2 ${status}\t${paths.join("\t")}`;
  // Newest first. c3 renames b -> c and changes 2 lines; c2 (a bot) touches b; c1 adds b; an older add of b is another file.
  const log = [
    rec("c3", "ada", [raw("R090", ["b", "c"]), "1\t1\tb => c"]),
    rec("c2", "dependabot[bot]", [raw("M", ["b"]), "5\t0\tb"]),
    rec("c1", "bea", [raw("A", ["b"]), "7\t0\tb"]),
    rec("c0", "cal", [raw("M", ["b"]), "9\t0\tb"]),
  ].join("");
  const out = fileChangesOf(log, new Set(["c"]), new Set(), false);
  assert.deepEqual(out.map((c) => [c.sha, c.files]), [["c3", [{ path: "c", add: 1, del: 1 }]], ["c1", [{ path: "c", add: 7, del: 0 }]], ["c0", []]]);
  assert.deepEqual(fileChangesOf(log, new Set(["c"]), new Set(["c1"]), true).map((c) => c.sha), ["c3", "c2", "c0"]);
  assert.deepEqual(fileChangesOf(log, new Set(["c"]), new Set(), true).map((c) => c.files[0]?.add), [1, 5, 7, undefined]);
  // A binary file (numstat "-") counts 0 lines.
  assert.deepEqual(fileChangesOf(rec("c9", "ada", [raw("M", ["x.bin"]), "-\t-\tx.bin"]), new Set(["x.bin"]), new Set(), false)[0].files, [{ path: "x.bin", add: 0, del: 0 }]);
});

test("a file that no longer exists at the ref adds no inserted lines: the numstat covers the same files as the blame", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2025-01-10", { "a.js": lines("a", 5) });
      commit(dir, "bea", "2025-08-01", { "gone.js": lines("g", 4), "b.js": lines("b", 2) });
      commit(dir, "cal", "2025-08-15", { "gone.js": null });
    },
    async (dir) => {
      const v = (await run(dir, ["--written-since", "2025-07-01"])).writtenSince;
      assert.deepEqual(v?.authors.map((p) => [p.author, p.written, p.inserted]), [["Bea Marsh", 2, 2]]);
    },
  );
});
