// @ts-check
// Round 13, rival #12: --timeline [<path>], who made most of the changes in each period, and the handovers between them.
// Fixtures are tiny repositories with invented names and fixed author dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAs, commitAsIdentity, createRepo, git, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTimeline, renderJson, timelineOf, timelineResolution } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  ada: ["Ada Quill", "ada@quill.example"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  bot: ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"],
};
/** One commit by `who` that appends a line to `path` (default f.js). @param {string} dir @param {string} who @param {string} stamp @param {string} [path] */
function touch(dir, who, stamp, path = "f.js") {
  const full = join(dir, path);
  const text = (existsSync(full) ? readFileSync(full, "utf8") : "") + `${who} ${stamp}\n`;
  return commitAsIdentity(dir, WHO[who], stamp.length === 10 ? `${stamp}T10:00:00Z` : stamp, `${who}: change`, { [path]: text });
}

/**
 * 2019 Ada 3, Bea 1. 2020 Ada 2, Bea 2 (a tie: the name that sorts first). 2021 Bea 3. 2022 nothing. 2023 Ada, Bea, Cal 1 each.
 * 2024 Cal 2, Ada 1, Bea 1 (Cal holds exactly half). 2025 nothing. 2026 Bea 2, Ada 1 (after the blank year, a handover from Cal).
 * Twenty-one commits to one file.
 * @param {string} dir
 */
function years(dir) {
  const plan = /** @type {[string, string[]][]} */ ([
    ["2019", ["ada", "ada", "ada", "bea"]],
    ["2020", ["ada", "bea", "ada", "bea"]],
    ["2021", ["bea", "bea", "bea"]],
    ["2023", ["ada", "bea", "cal"]],
    ["2024", ["cal", "ada", "cal", "bea"]],
    ["2026", ["bea", "bea", "ada"]],
  ]);
  for (const [year, who] of plan) who.forEach((w, i) => touch(dir, w, `${year}-0${i + 1}-10`));
}

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-timeline-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} extra */
const run = (dir, extra) => analyse(parseArgs(["--cwd", dir, "-q", "--timeline", ...extra]));
/** @param {Awaited<ReturnType<typeof run>>} r */
const rows = (r) => (r.timeline?.buckets ?? []).map((b) => [b.bucket, b.winner, b.count, b.total, b.handover ? `${b.handover.from} -> ${b.handover.to}` : null]);

test("yearly buckets: winner, count, total, ties to the first name, blank years, handovers at half or more", async () => {
  await withRepo(years, async (dir) => {
    const r = await run(dir, []);
    assert.deepEqual([r.timeline?.resolution, r.timeline?.first, r.timeline?.last, r.timeline?.commits, r.timeline?.by], ["yearly", "2019-01-10", "2026-03-10", 21, "commits"]);
    assert.deepEqual(rows(r), [
      ["2019", "Ada Quill", 3, 4, null],
      ["2020", "Ada Quill", 2, 4, null],
      ["2021", "Bea Marsh", 3, 3, "Ada Quill -> Bea Marsh"],
      ["2022", null, 0, 0, null],
      // Ada wins the three-way tie but holds a third: no handover from Bea.
      ["2023", "Ada Quill", 1, 3, null],
      // Cal holds exactly half: a handover from Ada.
      ["2024", "Cal Dune", 2, 4, "Ada Quill -> Cal Dune"],
      ["2025", null, 0, 0, null],
      // The handover is measured against the last non-empty bucket, across the blank year.
      ["2026", "Bea Marsh", 2, 3, "Cal Dune -> Bea Marsh"],
    ]);
    assert.equal(r.timeline?.buckets[0].share, 0.75);
    assert.equal(r.timeline?.buckets[3].share, null);
  });
});

test("the text view: header, one row per bucket, blank rows, handover marks, the label", async () => {
  await withRepo(years, async (dir) => {
    const text = renderTimeline(await run(dir, []));
    const out = text.split("\n");
    assert.ok(out.includes("whole repository (commits, yearly, 2019-2026)"), text);
    assert.ok(out.includes("2019  Ada Quill  3 of 4   75%"), text);
    assert.ok(out.includes("2021  Bea Marsh  3 of 3  100%   handover: Ada Quill -> Bea Marsh"), text);
    assert.ok(out.includes("2026  Bea Marsh  2 of 3   67%   handover: Cal Dune -> Bea Marsh"), text);
    assert.ok(out.includes("2022") && out.includes("2025"), "an empty bucket is a bare label");
    assert.match(text, /^Winners are counted in commits, not surviving lines\.$/m);
  });
});

test("the resolution follows the span: yearly above 5 years, monthly above 60 days, else daily", async () => {
  assert.deepEqual([timelineResolution(60), timelineResolution(61)], ["daily", "monthly"]);
  assert.deepEqual([timelineResolution(5 * 365), timelineResolution(5 * 365 + 1)], ["monthly", "yearly"]);
  await withRepo(
    (dir) => {
      touch(dir, "ada", "2026-01-01");
      touch(dir, "bea", "2026-03-02");
    },
    async (dir) => {
      // 60 days: daily, one row per day from the first to the last commit.
      const r = await run(dir, []);
      assert.equal(r.timeline?.resolution, "daily");
      assert.equal(r.timeline?.buckets.length, 61);
      assert.deepEqual([r.timeline?.buckets[0].bucket, r.timeline?.buckets[60].bucket, r.timeline?.buckets[1].winner], ["2026-01-01", "2026-03-02", null]);
      assert.match(renderTimeline(r), /^whole repository \(commits, daily, 2026-01-01 to 2026-03-02\)$/m);
    },
  );
  await withRepo(
    (dir) => {
      touch(dir, "ada", "2026-01-01");
      touch(dir, "ada", "2026-01-20");
      touch(dir, "bea", "2026-03-03");
    },
    async (dir) => {
      const r = await run(dir, []);
      assert.equal(r.timeline?.resolution, "monthly");
      assert.deepEqual(rows(r), [["2026-01", "Ada Quill", 2, 2, null], ["2026-02", null, 0, 0, null], ["2026-03", "Bea Marsh", 1, 1, "Ada Quill -> Bea Marsh"]]);
    },
  );
});

test("monthly buckets run across a year boundary", async () => {
  await withRepo(
    (dir) => {
      touch(dir, "ada", "2025-11-20");
      touch(dir, "bea", "2026-02-10");
    },
    async (dir) => {
      assert.deepEqual(rows(await run(dir, [])).map((r) => r[0]), ["2025-11", "2025-12", "2026-01", "2026-02"]);
    },
  );
});

test("the bucket is the author date in the author's zone", async () => {
  await withRepo(
    (dir) => {
      // 23:30 at UTC-5 on 31 January is already 1 February in UTC.
      touch(dir, "ada", "2025-01-31T23:30:00-05:00");
      touch(dir, "bea", "2025-04-20");
    },
    async (dir) => {
      assert.deepEqual(rows(await run(dir, [])).map((r) => r.slice(0, 2)), [["2025-01", "Ada Quill"], ["2025-02", null], ["2025-03", null], ["2025-04", "Bea Marsh"]]);
    },
  );
});

test("--by lines counts lines added plus removed", async () => {
  await withRepo(
    (dir) => {
      commitAs(dir, "ada", "2026-01-05T10:00:00Z", "ada: one", { "a.js": lines("a", 2) });
      commitAs(dir, "ada", "2026-01-06T10:00:00Z", "ada: two", { "a.js": lines("a", 4) });
      commitAs(dir, "ada", "2026-01-07T10:00:00Z", "ada: three", { "a.js": lines("a", 5) });
      commitAs(dir, "bob", "2026-01-08T10:00:00Z", "bob: big", { "b.js": lines("b", 20) });
      commitAs(dir, "ada", "2026-01-09T10:00:00Z", "ada: rewrite", { "a.js": lines("z", 3) });
    },
    async (dir) => {
      // By commits Ada has 4 of 5. By lines: 2 + 2 + 1 + (3 added + 5 removed) = 13 against Bob's 20.
      assert.deepEqual(rows(await run(dir, [])).map((r) => r.slice(0, 4)).filter((r) => r[1]), [["2026-01-05", "Ada", 1, 1], ["2026-01-06", "Ada", 1, 1], ["2026-01-07", "Ada", 1, 1], ["2026-01-08", "Bob", 1, 1], ["2026-01-09", "Ada", 1, 1]]);
      const monthly = await run(dir, ["--by", "lines", "--since", "2026-01-01"]);
      assert.equal(monthly.timeline?.by, "lines");
      assert.deepEqual(monthly.timeline?.buckets.filter((b) => b.winner).map((b) => [b.bucket, b.count]), [["2026-01-05", 2], ["2026-01-06", 2], ["2026-01-07", 1], ["2026-01-08", 20], ["2026-01-09", 8]]);
      assert.match(renderTimeline(monthly), /Winners are counted in lines added plus removed, not surviving lines\./);
    },
  );
  // Two people in one bucket: the lines decide, not the commits.
  const items = [
    { sha: "1", mail: "a@x", name: "Ann", time: 0, day: "2026-01-05", files: [{ path: "f", add: 1, del: 0 }] },
    { sha: "2", mail: "a@x", name: "Ann", time: 0, day: "2026-01-06", files: [{ path: "f", add: 1, del: 1 }] },
    { sha: "3", mail: "b@x", name: "Ben", time: 0, day: "2026-01-07", files: [{ path: "f", add: 10, del: 0 }] },
    { sha: "4", mail: "c@x", name: "Cy", time: 0, day: "2026-04-07", files: [{ path: "f", add: 1, del: 0 }] },
  ];
  const mk = (/** @type {"commits" | "lines"} */ by) => timelineOf({ changes: items, by, canonicalOf: new Map(), nameOf: new Map() }).buckets.filter((b) => b.winner).map((b) => [b.bucket, b.winner, b.count, b.total]);
  assert.deepEqual(mk("commits"), [["2026-01", "Ann", 2, 3], ["2026-04", "Cy", 1, 1]]);
  assert.deepEqual(mk("lines"), [["2026-01", "Ben", 10, 13], ["2026-04", "Cy", 1, 1]]);
});

test("a path limits the view; a file follows its renames; commits that touch only dropped files do not count", async () => {
  await withRepo(
    (dir) => {
      touch(dir, "ada", "2026-01-01", "src/old.js");
      touch(dir, "ada", "2026-01-02", "src/old.js");
      git(dir, ["mv", "src/old.js", "src/new.js"]);
      commitAsIdentity(dir, WHO.bea, "2026-01-03T10:00:00Z", "bea: rename", {});
      touch(dir, "bea", "2026-01-04", "src/new.js");
      touch(dir, "cal", "2026-01-05", "docs/n.md");
      touch(dir, "cal", "2026-01-06", "docs/n.md");
      touch(dir, "cal", "2026-01-07", "docs/n.md");
      touch(dir, "cal", "2026-01-08", "package-lock.json");
      touch(dir, "cal", "2026-01-09", "package-lock.json");
    },
    async (dir) => {
      const file = await run(dir, ["src/new.js"]);
      assert.equal(file.timeline?.path, "src/new.js");
      // The two commits under the old name count for the file; the rename commit itself changed 0 files' lines but touched it.
      assert.deepEqual(rows(file).filter((r) => r[1]).map((r) => [r[0], r[1]]), [["2026-01-01", "Ada Quill"], ["2026-01-02", "Ada Quill"], ["2026-01-03", "Bea Marsh"], ["2026-01-04", "Bea Marsh"]]);
      const dirOnly = await run(dir, ["docs"]);
      assert.equal(dirOnly.timeline?.commits, 3);
      assert.match(renderTimeline(dirOnly), /^docs \(commits, daily, 2026-01-05 to 2026-01-07\)$/m);
      // The whole repository: the lockfile commits are dropped files, so Cal has 3 commits and Ada 2, Bea 2.
      const all = await run(dir, []);
      assert.equal(all.timeline?.commits, 7);
      assert.ok(!rows(all).some((r) => r[0] === "2026-01-08" && r[1]));
    },
  );
});

test("bots, set-aside commits, --since and --until, and merged identities", async () => {
  await withRepo(
    (dir) => {
      touch(dir, "ada", "2025-12-01");
      touch(dir, "bot", "2026-01-02");
      const ignored = touch(dir, "bea", "2026-01-03");
      touch(dir, "ada", "2026-01-04");
      touch(dir, "cal", "2026-02-10");
      git(dir, ["tag", "ignored", ignored]);
    },
    async (dir) => {
      const sha = git(dir, ["rev-parse", "ignored"]).trim();
      assert.deepEqual(rows(await run(dir, ["--since", "2026-01-01", "--until", "2026-01-31"])).filter((r) => r[1]).map((r) => r[1]), ["Bea Marsh", "Ada Quill"]);
      assert.deepEqual(rows(await run(dir, ["--since", "2026-01-01", "--until", "2026-01-31", "--include-bots"])).filter((r) => r[1]).map((r) => r[1]), ["dependabot[bot]", "Bea Marsh", "Ada Quill"]);
      assert.deepEqual(rows(await run(dir, ["--since", "2026-01-01", "--until", "2026-01-31", "--ignore-rev", sha])).filter((r) => r[1]).map((r) => r[1]), ["Ada Quill"]);
    },
  );
  await withRepo(
    (dir) => {
      commitAs(dir, "ada", "2026-01-01T10:00:00Z", "ada: desktop", { "a.js": lines("a", 3) });
      commitAs(dir, "adaLaptop", "2026-01-02T10:00:00Z", "ada: laptop", { "b.js": lines("b", 3) });
      commitAs(dir, "bob", "2026-01-02T11:00:00Z", "bob", { "c.js": lines("c", 3) });
      commitAs(dir, "ada", "2026-01-02T12:00:00Z", "ada: desktop again", { "a.js": lines("a", 4) });
    },
    async (dir) => {
      const day2 = async (/** @type {string[]} */ x) => rows(await run(dir, x)).filter((r) => r[0] === "2026-01-02").map((r) => [r[1], r[2], r[3]]);
      // Unmerged, the day is a three-way tie of one commit each; merged, Ada's two addresses are one person with two of three.
      assert.deepEqual(await day2([]), [["Ada", 1, 3]]);
      assert.deepEqual(await day2(["--merge-identities"]), [["Ada", 2, 3]]);
    },
  );
});

test("--at runs the blame pass at the last commit before each date", async () => {
  await withRepo(years, async (dir) => {
    const r = await run(dir, ["--at", "2021-01-01,2022-01-01,2018-01-01,2031-01-01"]);
    const at = r.timeline?.at ?? [];
    assert.deepEqual(at.map((a) => a.date), ["2021-01-01", "2022-01-01", "2018-01-01", "2031-01-01"]);
    const before = (/** @type {string} */ d) => git(dir, ["rev-list", "-1", "--first-parent", `--before=${d}`, "HEAD"]).trim();
    assert.equal(at[0].commit, before("2021-01-01"));
    // At the end of 2020 Ada wrote 5 lines of f.js and Bea 3; at the end of 2021 Bea has 6 and Ada 5.
    assert.deepEqual([at[0].busFactor, at[0].top.map((t) => [t.author, t.lines, t.share])], [1, [["Ada Quill", 5, 5 / 8], ["Bea Marsh", 3, 3 / 8]]]);
    assert.deepEqual([at[1].busFactor, at[1].top.map((t) => [t.author, t.lines])], [1, [["Bea Marsh", 6], ["Ada Quill", 5]]]);
    assert.deepEqual([at[2].commit, at[2].busFactor, at[2].top], [null, null, []]);
    assert.equal(at[3].commit, before("2031-01-01"));
    const head = await analyse(parseArgs(["--cwd", dir, "-q"]));
    assert.equal(at[3].busFactor, head.busFactor?.value);
    const text = renderTimeline(r);
    assert.match(text, /^  2021-01-01 \([0-9a-f]{7}\): bus factor 1; Ada Quill 63%, Bea Marsh 38%$/m);
    assert.match(text, /^  2018-01-01: no commit before this date$/m);
  });
});

test("--at on a path that did not exist then reports it instead of failing", async () => {
  await withRepo(
    (dir) => {
      touch(dir, "ada", "2026-01-01", "a.js");
      touch(dir, "ada", "2026-02-01", "src/new.js");
    },
    async (dir) => {
      const at = (await run(dir, ["src", "--at", "2026-01-15"])).timeline?.at[0];
      assert.equal(at?.busFactor, null);
      assert.match(at?.note ?? "", /no files matched/);
    },
  );
});

test("a repository with one author has a winner in every bucket and no handover", async () => {
  await withRepo(
    (dir) => {
      for (const d of ["2019-01-05", "2021-03-05", "2026-02-05"]) touch(dir, "ada", d);
    },
    async (dir) => {
      const r = await run(dir, []);
      assert.equal(r.timeline?.buckets.filter((b) => b.winner).length, 3);
      assert.ok(r.timeline?.buckets.every((b) => b.handover === null));
    },
  );
});

test("a window with no commit prints a line that says so", async () => {
  await withRepo(years, async (dir) => {
    const r = await run(dir, ["--since", "2030-01-01"]);
    assert.deepEqual([r.timeline?.buckets, r.timeline?.resolution, r.timeline?.first], [[], null, null]);
    assert.match(renderTimeline(r), /^whole repository: no commits to count \(commits\) in the window$/m);
  });
});

test("a shallow clone is refused like every other view", async () => {
  await withRepo(years, async (dir) => {
    const clone = createRepo("sl-timeline-shallow-");
    try {
      git(clone, ["fetch", "-q", "--depth", "2", `file://${dir}`, "HEAD"]);
      git(clone, ["checkout", "-q", "FETCH_HEAD"]);
      await assert.rejects(() => run(clone, []), /shallow/i);
    } finally {
      removeRepo(clone);
    }
  });
});

test("options: --timeline takes an optional path, --by and --at need it, other views and formats are refused", () => {
  const bad = (/** @type {string[]} */ args, /** @type {RegExp} */ re) => assert.throws(() => parseArgs(args), re);
  assert.deepEqual([parseArgs(["--timeline"]).timeline, parseArgs(["--timeline"]).paths], ["", []]);
  const withJson = parseArgs(["--timeline", "--json"]);
  assert.deepEqual([withJson.timeline, withJson.json], ["", true]);
  const withPath = parseArgs(["--timeline", "src/engine/", "--by", "lines", "--at", "2024-01-01, 2025-01-01"]);
  assert.deepEqual([withPath.timeline, withPath.paths, withPath.by, withPath.at], ["src/engine/", ["src/engine/"], "lines", ["2024-01-01", "2025-01-01"]]);
  assert.deepEqual(parseArgs(["--timeline", "--", "src"]).paths, ["src"]);
  bad(["--timeline", "src", "--", "docs"], /takes its path as its own value/);
  bad(["--timeline", "--by", "weeks"], /--by must be commits or lines/);
  bad(["--by", "lines"], /--by and --at work with --timeline only/);
  bad(["--at", "2024-01-01"], /--by and --at work with --timeline only/);
  bad(["--timeline", "--at", ","], /--at needs at least one date/);
  bad(["--timeline", "--csv"], /--timeline prints its own view; it can be combined with --json only, not with --csv/);
  bad(["--timeline", "--written-since", "2025-01-01"], /prints its own view/);
  bad(["--timeline", "--tree"], /prints its own view/);
});

test("the JSON key is null unless asked and valid against the schema when asked", async () => {
  await withRepo(years, async (dir) => {
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    assert.equal(JSON.parse(renderJson(await analyse(parseArgs(["--cwd", dir, "-q"])))).timeline, null);
    for (const extra of [[], ["--by", "lines"], ["--at", "2021-01-01,2005-01-01"], ["--since", "2030-01-01"]]) {
      const json = JSON.parse(renderJson(await run(dir, extra)));
      assert.deepEqual(schemaErrors(schema, json), []);
      assert.equal(json.writtenSince, null);
    }
  });
});

test("unit: timelineOf ties go to the name that sorts first and a commit without lines does not make a bucket", () => {
  const c = (/** @type {string} */ mail, /** @type {string} */ name, /** @type {string} */ day, /** @type {number} */ add) => ({ sha: mail + day, mail, name, time: 0, day, files: [{ path: "f", add, del: 0 }] });
  const t = timelineOf({ changes: [c("b@x", "Bo", "2026-01-01", 1), c("a@x", "Al", "2026-01-01", 1), c("a@x", "Al", "2026-01-10", 0)], by: "lines", canonicalOf: new Map(), nameOf: new Map() });
  assert.deepEqual(t.buckets.map((b) => [b.bucket, b.winner, b.count, b.total]), [["2026-01-01", "Al", 1, 2]]);
  assert.equal(t.commits, 2);
});
