// @ts-check
// Round 13, G2: the applied reformat block describes the rewrite itself (lines and files), prints no line total next to
// the name of the person who committed it, and lists the before/after comparison only for the people who gain lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PEOPLE, buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderJson, reformatBlock } = await import("../bin/surviving-lines.js");
const SCHEMA = JSON.parse(readFileSync(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));

/** @param {string} name @param {(dir: string) => Promise<void>} fn */
async function withFixture(name, fn) {
  const dir = buildFixture(/** @type {Parameters<typeof buildFixture>[0]} */ (name));
  try {
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

test("G2: the block says what the commit rewrote and keeps the committer's name free of a line total", async () => {
  await withFixture("reformatBus", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    const [s] = r.reformat.suspects;
    assert.equal(s.addedLines, 30);
    const block = (reformatBlock(r) ?? []).join("\n");
    assert.match(block, new RegExp(`^  commit ${s.shortSha} "style: switch app\\.js to double quotes" rewrote 30 lines in 1 file \\(formatting only\\)$`, "m"));
    // The committer is Bob. No line of the block puts a figure next to his name, and no "in the plain count" total remains.
    for (const line of block.split("\n")) {
      if (line.includes(PEOPLE.bob[0])) assert.doesNotMatch(line, /\d[\d,]* lines|\d%/, line);
    }
    assert.doesNotMatch(block, /lines in the plain count|Without the correction:/);
    // Ada gains lines, so she is listed with both numbers; Charlie's count does not move, so he is not.
    assert.match(block, /Authors who gain lines from this: Ada 55 \(68\.8%\) with the correction, 25 \(31\.3%\) without\./);
    assert.doesNotMatch(block, /Charlie/);
    // The way to reproduce it stays.
    assert.match(block, new RegExp(`--ignore-rev ${s.shortSha}`));
    assert.match(block, /--keep-reformat counts it/);
  });
});

test("G2: the plain count's bus factor line names the committer without a share of lines", async () => {
  await withFixture("reformatBus", async (dir) => {
    const text = renderTable(await analyse(parseArgs(["--cwd", dir])), 10);
    assert.match(text, /^  bus factor without the correction: 2 \(Bob and Ada together lead the plain count\)$/m);
  });
});

test("G2: a suspect from an older record without addedLines is described with half its changed lines", () => {
  const suspect = { sha: "a".repeat(40), shortSha: "aaaaaaa", subject: "style: tidy", author: "Fiona", mail: "f@x.example", date: "2026-01-01", filesChanged: 2, changedLines: 60, survivingLines: 25, files: ["a.js", "b.js"] };
  const author = (/** @type {string} */ name, /** @type {number} */ lines) => ({ author: name, mail: `${name.toLowerCase()}@x.example`, lines, lineShare: lines / 50 });
  const r = /** @type {any} */ ({
    sample: { linesAttributed: 50 },
    coAuthors: "off",
    authors: [author("Ada", 40), author("Fiona", 10)],
    reformat: { applied: true, suspects: [suspect], uncorrected: { linesAttributed: 50, authors: [author("Fiona", 25), author("Ada", 25)], busFactor: null } },
  });
  const block = (reformatBlock(r) ?? []).join("\n");
  assert.match(block, /rewrote 30 lines in 2 files \(formatting only\)/);
  assert.match(block, /Authors who gain lines from this: Ada 40 \(80\.0%\) with the correction, 25 \(50\.0%\) without\./);
  assert.doesNotMatch(block, /Fiona/);
});

test("G2: the committer is never listed as a gainer, even when the committer holds more lines with the correction", () => {
  const suspect = { sha: "b".repeat(40), shortSha: "bbbbbbb", subject: "style: tidy", author: "Fiona", mail: "fiona@x.example", date: "2026-01-01", filesChanged: 1, changedLines: 20, addedLines: 10, survivingLines: 10, files: ["a.js"] };
  const author = (/** @type {string} */ name, /** @type {number} */ lines) => ({ author: name, mail: `${name.toLowerCase()}@x.example`, lines, lineShare: lines / 40 });
  const r = /** @type {any} */ ({
    sample: { linesAttributed: 40 },
    coAuthors: "off",
    authors: [author("Fiona", 20), author("Ada", 20)],
    reformat: { applied: true, suspects: [suspect], uncorrected: { linesAttributed: 40, authors: [author("Fiona", 15), author("Ada", 25)], busFactor: null } },
  });
  const block = (reformatBlock(r) ?? []).join("\n");
  assert.match(block, /rewrote 10 lines in 1 file \(formatting only\)/);
  assert.doesNotMatch(block, /Fiona/, "Fiona gains 5 lines here, and is still not listed");
  assert.doesNotMatch(block, /Authors who gain lines/, "Ada loses lines, so nobody is left to list");
});

test("G2: nobody gaining lines means no comparison sentence, and the JSON carries addedLines and validates", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    const json = JSON.parse(renderJson(r));
    assert.equal(json.reformat.suspects[0].addedLines, 30);
    assert.equal(json.reformat.suspects[0].changedLines, 60, "changedLines keeps its meaning");
    assert.deepEqual(schemaErrors(SCHEMA, json), []);
    const quiet = /** @type {any} */ ({ ...r, authors: r.reformat.uncorrected.authors });
    assert.doesNotMatch((reformatBlock(quiet) ?? []).join("\n"), /Authors who gain lines/);
  });
});
