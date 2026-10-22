// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixture, removeRepo, FIXTURES, git } from "../scripts/fixtures.mjs";
import { compact, sameNumbers } from "../scripts/compare/adapters.mjs";
import { CLAIMABLE, renderComparison } from "../scripts/compare/report.mjs";

const { analyse, parseArgs } = await import("../bin/surviving-lines.js");

test("a fixture built twice has the same commit ids, so the comparison is reproducible", () => {
  for (const name of /** @type {(keyof typeof FIXTURES)[]} */ (Object.keys(FIXTURES))) {
    const a = buildFixture(name);
    const b = buildFixture(name);
    try {
      assert.equal(git(a, ["rev-parse", "HEAD"]).trim(), git(b, ["rev-parse", "HEAD"]).trim(), name);
    } finally {
      removeRepo(a);
      removeRepo(b);
    }
  }
});

test("the fixtures hold the numbers their comments state", async () => {
  /** @type {Record<string, [string, number, number][]>} */
  const expected = {
    basic: [["ada@example.com", 11, 1], ["bob@example.com", 10, 2]],
    split: [["ada@example.com", 12, 1], ["bob@example.com", 10, 1], ["ada@laptop.example.org", 8, 1]],
    pairing: [["bob@example.com", 27, 4], ["ada@example.com", 11, 1]],
    coauthor: [["bob@example.com", 31, 5], ["ada@example.com", 11, 1]],
  };
  for (const [name, rows] of Object.entries(expected)) {
    const dir = buildFixture(/** @type {keyof typeof FIXTURES} */ (name));
    try {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(r.authors.map((a) => [a.mail, a.lines, a.commits]), rows, name);
    } finally {
      removeRepo(dir);
    }
  }
  const wide = buildFixture("wide");
  try {
    const r = await analyse(parseArgs(["--cwd", wide, "--no-copies"]));
    assert.equal(r.sample.filesTotal, 120);
    assert.deepEqual(r.authors.map((a) => a.lines), [1600, 1600, 1600]);
  } finally {
    removeRepo(wide);
  }
});

test("compact and sameNumbers read rows by address and treat a missing row as zero", () => {
  const a = new Map([["ada@x", { lines: 3 }], ["bob@x", { lines: 0 }]]);
  const b = new Map([["ada@x", { lines: 3 }]]);
  assert.equal(compact(a, "lines"), "ada=3, bob=0");
  assert.equal(compact(undefined, "lines"), "-");
  assert.equal(sameNumbers(a, b, "lines"), true);
  assert.equal(sameNumbers(a, new Map([["ada@x", { lines: 4 }]]), "lines"), false);
  assert.equal(sameNumbers(a, undefined, "lines"), false);
  assert.equal(sameNumbers(new Map([["a", { lines: 1 }]]), new Map([["a", { lines: 1.0000001 }]]), "lines", { tolerance: 1e-6 }), true);
});

test("renderComparison states the run date, every version and licence, keeps a loss visible, and claims only ties and wins", () => {
  const doc = renderComparison({
    date: "2026-10-20",
    machine: "test machine",
    tools: [{ name: "git-fame", version: "4.2.1", license: "MPL-2.0", note: "oracle only" }],
    results: [
      { probe: { id: "P01", feature: "Surviving lines", competitor: "git-fame", fixture: "basic" }, outcome: { verdict: "tie", ours: "a=1", theirs: "a=1", note: "same" } },
      { probe: { id: "P02", feature: "SVG output", competitor: "git-fame", fixture: "basic" }, outcome: { verdict: "ours-lacks", ours: "none", theirs: "svg", note: "stated loss | pipe" } },
      { probe: { id: "P03", feature: "Timing", competitor: "git-fame", fixture: "wide" }, outcome: { verdict: "info", ours: "1 s", theirs: "2 s", note: "machine specific" } },
    ],
    losses: [{ feature: "A hosted badge", who: "git-fame", issue: "Not planned." }],
  });
  assert.match(doc, /on 2026-10-20\./);
  assert.match(doc, /\| git-fame \| 4\.2\.1 \| MPL-2\.0 \| oracle only \|/);
  assert.match(doc, /\| P02 \| SVG output .* \| ours lacks \(stated loss\) \| stated loss \\\| pipe \|/);
  assert.match(doc, /- A hosted badge \(git-fame\)\. Not planned\./);
  const claims = doc.split("## What a launch text may claim")[1];
  assert.match(claims, /P01/);
  assert.doesNotMatch(claims, /P02|P03/);
  assert.deepEqual([...CLAIMABLE].sort(), ["ours-only", "tie"]);
});
