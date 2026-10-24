// @ts-check
// Round 13, #6: the active bus factor is reported next to the bus factor of all lines, on its own base (the lines the
// active people hold), and each group block carries two separate labels, never one risk rank. One function counts it,
// so the default view, the brief, the group blocks and the JSON give the same numbers. Fixtures are tiny repositories
// with invented names and fixed dates. The ref date is 2026-03-10.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderGroups, renderJson, renderBrief, activeBusFactorOf, activeBusFactorLine, groupActivityOf } = await import("../bin/surviving-lines.js");

const BIN = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
/** @typedef {[string, string]} Id */
const ADA = /** @type {Id} */ (["Ada Quill", "ada@quill.example"]);
const BEA = /** @type {Id} */ (["Bea Marsh", "bea@marsh.example"]);
const BEA2 = /** @type {Id} */ (["Bea Marsh", "bea@home.example"]);
const CAL = /** @type {Id} */ (["Cal Dune", "cal@dune.example"]);
const DEE = /** @type {Id} */ (["Dee Fern", "dee@fern.example"]);

/** @param {string} dir @param {Id} who @param {string} date @param {string} subject @param {Record<string, string>} files */
const commit = (dir, who, date, subject, files) => commitAsIdentity(dir, who, `${date}T10:00:00Z`, subject, files);

/**
 * Ada (last commit 2023) holds lib/ (70 lines) and 50 lines of mixed/. Bea, Cal and Dee are active: src/ is 20 lines each,
 * Cal also holds docs/ (12) and 5 lines of mixed/. Whole repository: 197 lines, Ada 120 of them.
 * @param {string} dir
 */
function build(dir) {
  commit(dir, ADA, "2023-01-10", "ada: lib and mixed", { "lib/core.js": lines("core", 60), "lib/util.js": lines("util", 10), "mixed/old.js": lines("old", 50) });
  commit(dir, BEA, "2026-01-10", "bea: src", { "src/a.js": lines("a", 20) });
  commit(dir, CAL, "2026-02-01", "cal: src, docs, mixed", { "src/b.js": lines("b", 20), "docs/guide.md": lines("guide", 12), "mixed/new.js": lines("new", 5) });
  commit(dir, DEE, "2026-03-10", "dee: src", { "src/c.js": lines("c", 20) });
}

/** @param {(dir: string) => void} make @param {(dir: string) => Promise<void> | void} check */
async function withRepo(make, check) {
  const dir = createRepo("sl-abf-");
  try {
    make(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} [extra] */
const run = (dir, extra = []) => analyse(parseArgs(["--cwd", dir, "--quiet", ...extra]));
/** @param {string} dir @param {string[]} extra */
const cli = (dir, extra) => spawnSync(process.execPath, [BIN, "--cwd", dir, "--quiet", ...extra], { encoding: "utf8" });

test("the default view gives the active bus factor on its own base, right under the bus factor line", async () => {
  await withRepo(build, async (dir) => {
    const r = await run(dir);
    const text = renderTable(r, null);
    const all = text.split("\n");
    const at = all.findIndex((l) => l.startsWith("bus factor 1: "));
    assert.ok(at > 0, text);
    assert.match(all[at], /^bus factor 1: Ada Quill alone holds 60\.9% of 197 surviving lines/);
    assert.equal(all[at + 1], "active bus factor 2 (50% of the 77 lines held by the 3 authors active in the last 365 days): Cal Dune and Bea Marsh together; 60.9% of all lines belong to people with no commit in that window");
    assert.match(all[at + 2], /^bus factor = the smallest number of authors/);
    // The base is the active lines, and the headline's base is named in the other sentence: both figures are present.
    assert.equal(r.activeBusFactor?.activeLines, 77);
    assert.equal(r.activeBusFactor?.allLines, 197);
  });
});

test("--active-days and --bus-factor-threshold move the active figure", async () => {
  await withRepo(build, async (dir) => {
    const short = await run(dir, ["--active-days", "30"]);
    assert.equal(short.activeBusFactor?.activePeople, 1, "only Dee committed in the last 30 days");
    assert.match(activeBusFactorLine(short.activeBusFactor) ?? "", /^active bus factor 1 \(50% of the 20 lines held by the 1 author active in the last 30 days\): Dee Fern alone; 89\.8% of all lines/);
    const high = await run(dir, ["--bus-factor-threshold", "80"]);
    assert.equal(high.activeBusFactor?.value, 3);
    assert.match(activeBusFactorLine(high.activeBusFactor) ?? "", /^active bus factor 3 \(80% of the 77 lines/);
  });
});

test("nobody active holding lines says none, and everybody active says so instead of an inactive share", async () => {
  await withRepo(build, async (dir) => {
    const none = await run(dir, ["--active-days", "1", "--include", "lib/**"]);
    assert.equal(none.activeBusFactor?.value, null);
    assert.equal(activeBusFactorLine(none.activeBusFactor), "active bus factor none (no one who holds lines committed in the last 1 days); 100.0% of all lines belong to people with no commit in that window");
    const everyone = await run(dir, ["--include", "src/**"]);
    assert.equal(activeBusFactorLine(everyone.activeBusFactor), "active bus factor 2 (50% of the 60 lines held by the 3 authors active in the last 365 days): Bea Marsh and Cal Dune together; everyone who holds lines committed in that window");
  });
});

test("--merge-identities judges activity after the merge: one person with two addresses is one active person", async () => {
  await withRepo(
    (dir) => {
      commit(dir, BEA2, "2023-01-10", "bea: old address", { "lib/old.js": lines("old", 40) });
      commit(dir, BEA, "2026-02-01", "bea: new address", { "lib/new.js": lines("new", 30) });
      commit(dir, CAL, "2026-02-02", "cal", { "src/c.js": lines("c", 10) });
    },
    async (dir) => {
      for (const extra of [[], ["--merge-identities"]]) {
        const r = await run(dir, extra);
        // Two addresses under one name are one person, so the person is active with either address.
        assert.equal(r.activeBusFactor?.people, 2);
        assert.equal(r.activeBusFactor?.activePeople, 2);
        assert.equal(r.activeBusFactor?.inactiveShare, 0);
      }
    },
  );
});

test("the brief, the default view, the groups and the JSON use one function: the same numbers everywhere", async () => {
  await withRepo(build, async (dir) => {
    const r = await run(dir);
    const brief = (await run(dir, ["--brief"])).brief;
    const a = r.activeBusFactor;
    assert.ok(a && brief);
    assert.equal(brief.busFactor?.active?.value, a.value);
    assert.deepEqual(brief.busFactor?.active?.authors, a.authors);
    assert.equal(brief.busFactor?.active?.people, a.activePeople);
    const text = renderBrief(brief);
    assert.match(text, /active people only: 2 \(Cal Dune, Bea Marsh; counted on the lines of the 3 people with a commit in the last 365 days\)/);
    const json = JSON.parse(renderJson(r));
    assert.equal(json.activeBusFactor.value, a.value);
    // The same function applied to a group made of the whole repository gives the same figure.
    const whole = groupActivityOf({ lines: 197, authors: r.authors.map((x) => ({ author: x.author, lines: x.lines })) }, new Map(r.authors.map((x) => [x.author.toLowerCase(), { active: ["Bea Marsh", "Cal Dune", "Dee Fern"].includes(x.author) }])), 50, 365);
    assert.equal(whole.activeBusFactor?.value, a.value);
    assert.deepEqual(whole.activeBusFactor?.authors, a.authors);
    const cliBrief = cli(dir, ["--brief"]).stdout;
    assert.equal(cliBrief.trimEnd(), text.trimEnd());
  });
});

test("group blocks carry the pair and a verdict with two separate labels, never one rank", async () => {
  await withRepo(build, async (dir) => {
    const r = await run(dir, ["--group-by", "dir"]);
    const by = Object.fromEntries((r.grouping?.groups ?? []).map((g) => [g.key, g]));
    assert.deepEqual(by["lib"].verdict, ["orphaned"], "Ada alone, no commit since 2023, nobody active");
    assert.equal(by["lib"].activeBusFactor.value, null);
    assert.deepEqual(by["docs"].verdict, ["single point"], "Cal alone and active");
    assert.deepEqual(by["src"].verdict, [], "three active people with equal shares");
    assert.equal(by["src"].activeBusFactor.value, 2);
    assert.deepEqual(by["mixed"].verdict, ["single point", "orphaned"], "an inactive top owner and one active person with 9%: both findings, listed separately");
    const text = renderGroups(r, 10);
    // Each group is a paragraph with its title and table, then a paragraph with its bus factor lines.
    const paragraphs = text.split("\n\n");
    const block = (/** @type {string} */ key) => {
      const at = paragraphs.findIndex((p) => p.startsWith(`${key}  ·`));
      assert.ok(at >= 0, key);
      return paragraphs[at + 1];
    };
    assert.match(block("mixed"), /active bus factor 1 \(50% of the 5 lines held by the 1 author active in the last 365 days\): Cal Dune alone; 90\.9% of all lines belong to people with no commit in that window\nverdict: single point, orphaned \(separate findings, not one risk rank\)/);
    assert.match(block("lib"), /active bus factor none/);
    assert.match(block("lib"), /verdict: orphaned /);
    assert.doesNotMatch(block("src"), /verdict:/);
  });
});

test("the group blocks follow --bus-factor-threshold and --active-days", async () => {
  await withRepo(build, async (dir) => {
    const high = await run(dir, ["--group-by", "dir", "--bus-factor-threshold", "80"]);
    const src = high.grouping?.groups.find((g) => g.key === "src");
    assert.equal(src?.activeBusFactor?.value, 3, "80% of 60 lines needs all three");
    assert.equal(src?.activeBusFactor?.thresholdPercent, 80);
    const short = await run(dir, ["--group-by", "dir", "--active-days", "30"]);
    assert.deepEqual(short.grouping?.groups.find((g) => g.key === "docs")?.verdict, ["orphaned"], "Cal has no commit in the last 30 days, so docs/ has no active person");
    assert.equal(short.grouping?.groups.find((g) => g.key === "src")?.activeBusFactor?.activePeople, 1);
  });
});

test("the JSON validates against the schema, with the pair on the run and on every group", async () => {
  await withRepo(build, async (dir) => {
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    const doc = JSON.parse(renderJson(await run(dir, ["--group-by", "dir"])));
    assert.deepEqual(schemaErrors(schema, doc), []);
    assert.ok(doc.grouping.groups.every((/** @type {any} */ g) => "activeBusFactor" in g && Array.isArray(g.verdict)));
    assert.equal(doc.busFactor.value, 1, "the old key keeps its meaning");
    // A verdict that is one folded label is not accepted: the schema keeps the two labels apart.
    const bad = structuredClone(doc);
    bad.grouping.groups[0].verdict = ["single point and orphaned"];
    assert.ok(schemaErrors(schema, bad).length > 0);
  });
});

test("the active figure is on the lines of active people only, not a recount of the headline", () => {
  const people = new Map([
    ["a", { author: "A", lines: 60, active: false }],
    ["b", { author: "B", lines: 30, active: true }],
    ["c", { author: "C", lines: 10, active: true }],
  ]);
  const f = activeBusFactorOf(people, 50, 365);
  assert.equal(f?.value, 1);
  assert.deepEqual(f?.authors, ["B"]);
  assert.equal(f?.covered, 0.75);
  assert.equal(f?.activeLines, 40);
  assert.equal(f?.inactiveShare, 0.6);
  assert.equal(activeBusFactorOf(new Map(), 50, 365), null);
  assert.equal(activeBusFactorOf(new Map([["a", { author: "A", lines: 0, active: true }]]), 50, 365), null);
});
