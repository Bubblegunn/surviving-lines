// @ts-check
// Bus factor: the fewest authors whose surviving lines reach a share of the lines counted (--bus-factor-threshold,
// 50 by default). The fixture is `busfactor` in scripts/fixtures.mjs: Ada 60 lines, Bob 25, Charlie 15, and a bot
// with 50 that is left out, so the run counts 100 lines, src/ counts 85 and docs/ counts 15.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, busFactor, busFactorLine, renderTable, renderGroups, renderMarkdown, renderReviewers, renderJson } = await import("../bin/surviving-lines.js");

const BIN = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
const DEFINITION = "bus factor = the smallest number of authors whose surviving lines together reach 50% of the lines counted (change with --bus-factor-threshold). It measures how concentrated the code that is left is, not who understands it.";
const ADA_ALONE = "bus factor 1: Ada alone holds 60.0% of 100 surviving lines";

/** @param {string} text @param {string} part */
const count = (text, part) => text.split(part).length - 1;

/** @param {(dir: string) => Promise<void>} fn */
async function withBusFactor(fn) {
  const dir = buildFixture("busfactor");
  try {
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

test("one author holding most of the lines is a bus factor of one", () => {
  assert.deepEqual(busFactor([{ author: "Ada", lines: 80 }, { author: "Bob", lines: 20 }], 50), { value: 1, authors: ["Ada"], covered: 0.8, total: 100 });
});

test("an author who reaches the threshold exactly is enough on their own", () => {
  assert.deepEqual(busFactor([{ author: "Ada", lines: 50 }, { author: "Bob", lines: 50 }], 50), { value: 1, authors: ["Ada"], covered: 0.5, total: 100 });
});

test("three equal authors: two reach 50 percent, all three are needed for 80", () => {
  const three = [{ author: "Ada", lines: 10 }, { author: "Bob", lines: 10 }, { author: "Cem", lines: 10 }];
  assert.equal(busFactor(three, 50)?.value, 2);
  assert.equal(busFactor(three, 50)?.covered, 0.666667, "two of three hold 2/3, rounded to six places");
  assert.equal(busFactor(three, 80)?.value, 3);
});

test("no lines counted gives no bus factor", () => {
  assert.equal(busFactor([], 50), null);
  assert.equal(busFactor([{ author: "Ada", lines: 0 }], 50), null);
});

test("the threshold moves the answer: 80 percent needs the first two authors here", () => {
  assert.deepEqual(busFactor([{ author: "Ada", lines: 70 }, { author: "Bob", lines: 20 }, { author: "Cem", lines: 10 }], 80), { value: 2, authors: ["Ada", "Bob"], covered: 0.9, total: 100 });
});

test("fractional lines from --co-authors share compare after rounding", () => {
  assert.deepEqual(busFactor([{ author: "Ada", lines: 10.5 }, { author: "Bob", lines: 4.5 }], 50), { value: 1, authors: ["Ada"], covered: 0.7, total: 15 });
});

test("the bus factor line names one author alone, or the first authors together, with their share", () => {
  assert.equal(busFactorLine({ value: 1, authors: ["Troy Goode"], covered: 0.668, total: 238 }), "bus factor 1: Troy Goode alone holds 66.8% of 238 surviving lines");
  assert.equal(
    busFactorLine({ value: 2, authors: ["Troy Goode", "Douglas Christopher Wilson"], covered: 0.711, total: 630 }),
    "bus factor 2: Troy Goode and Douglas Christopher Wilson together hold 71.1% of 630 surviving lines",
  );
});

test("the line lists at most three names and then counts the rest", () => {
  assert.equal(
    busFactorLine({ value: 4, authors: ["Ada", "Bob", "Cem", "Deniz"], covered: 0.9, total: 40 }),
    "bus factor 4: Ada, Bob, Cem and 1 more together hold 90.0% of 40 surviving lines",
  );
  assert.equal(busFactorLine({ value: 3, authors: ["Ada", "Bob", "Cem"], covered: 1, total: 3 }), "bus factor 3: Ada, Bob and Cem together hold 100.0% of 3 surviving lines");
});

test("no bus factor gives no line", () => {
  assert.equal(busFactorLine(null), null);
});

test("the main table prints the line once, under the author table, with the definition once before the cannot-show lines", async () => {
  await withBusFactor(async (dir) => {
    const text = renderTable(await analyse(parseArgs(["--cwd", dir])), 10);
    assert.equal(count(text, "bus factor 1: "), 1);
    assert.ok(text.includes(ADA_ALONE));
    assert.equal(count(text, DEFINITION), 1);
    assert.ok(text.indexOf(ADA_ALONE) > text.indexOf("Charlie"), "the line follows the author table");
    assert.ok(text.indexOf(DEFINITION) < text.indexOf("What this cannot show"), "the definition comes before the cannot-show lines");
  });
});

test("every --group-by block prints its own line under its table, and the definition is printed once", async () => {
  await withBusFactor(async (dir) => {
    const text = renderGroups(await analyse(parseArgs(["--cwd", dir, "--group-by", "dir"])), 10);
    assert.equal(count(text, "bus factor 1: "), 2);
    assert.ok(text.includes("bus factor 1: Ada alone holds 70.6% of 85 surviving lines"), "src");
    assert.ok(text.includes("bus factor 1: Charlie alone holds 100.0% of 15 surviving lines"), "docs");
    assert.equal(count(text, DEFINITION), 1);
    assert.ok(text.indexOf("bus factor 1: Ada alone") > text.indexOf("src  ·"));
    assert.ok(text.indexOf("bus factor 1: Ada alone") < text.indexOf("docs  ·"), "the src line sits under the src table");
    assert.ok(text.indexOf(DEFINITION) > text.indexOf("bus factor 1: Charlie alone"), "the definition follows the last group");
  });
});

test("the Markdown output carries the same line and definition as plain text lines after the table", async () => {
  await withBusFactor(async (dir) => {
    const text = renderMarkdown(await analyse(parseArgs(["--cwd", dir, "--markdown"])), 10);
    assert.equal(count(text, ADA_ALONE), 1);
    assert.equal(count(text, DEFINITION), 1);
    assert.ok(text.includes(`\n\n${ADA_ALONE} · to reach 80%: `), "a blank line keeps the line out of the Markdown table");
  });
});

test("--bus-factor-threshold 80 changes the number and the definition in the printed table", async () => {
  await withBusFactor(async (dir) => {
    const run = spawnSync(process.execPath, [BIN, "--cwd", dir, "--bus-factor-threshold", "80", "-q"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(run.stdout.includes("bus factor 2: Ada and Bob together hold 85.0% of 100 surviving lines"));
    assert.ok(run.stdout.includes("reach 80% of the lines counted"));
  });
});

test("--bus-factor-threshold accepts a number above 0 and at most 100, and refuses anything else", () => {
  const message = "--bus-factor-threshold must be a number above 0 and at most 100";
  assert.equal(parseArgs(["--bus-factor-threshold", "100"]).busFactorThreshold, 100);
  assert.equal(parseArgs(["--bus-factor-threshold", "0.5"]).busFactorThreshold, 0.5);
  assert.equal(parseArgs([]).busFactorThreshold, 50);
  for (const bad of ["0", "-5", "100.5", "101", "abc", ""]) {
    assert.throws(() => parseArgs(["--bus-factor-threshold", bad]), { message });
  }
});

test("the --json output validates against the schema, with the bus factor on the run and on every group", async () => {
  await withBusFactor(async (dir) => {
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    const parsed = JSON.parse(renderJson(await analyse(parseArgs(["--cwd", dir, "--group-by", "dir"]))));
    assert.deepEqual(schemaErrors(schema, parsed), []);
    assert.equal(parsed.busFactor.value, 1);
    assert.equal(parsed.busFactor.thresholdPercent, 50);
    assert.deepEqual(parsed.busFactor.authors, ["Ada"]);
    assert.equal(parsed.busFactor.total, 100);
    assert.deepEqual(parsed.grouping.groups.map((/** @type {{ busFactor: { total: number } }} */ g) => g.busFactor.total), [85, 15]);
  });
});

test("bots are left out of the denominator unless --include-bots counts them", async () => {
  await withBusFactor(async (dir) => {
    const without = await analyse(parseArgs(["--cwd", dir]));
    assert.equal(without.busFactor?.total, 100);
    assert.equal(without.busFactor?.value, 1);
    const withBots = await analyse(parseArgs(["--cwd", dir, "--include-bots"]));
    assert.equal(withBots.busFactor?.total, 150);
    assert.equal(withBots.busFactor?.value, 2);
  });
});

test("--co-authors share runs with the bus factor and validates against the schema", async () => {
  const dir = buildFixture("pairing");
  try {
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    const r = await analyse(parseArgs(["--cwd", dir, "--co-authors", "share"]));
    assert.equal(r.busFactor?.total, r.sample.linesAttributed);
    assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), []);
  } finally {
    removeRepo(dir);
  }
});

test("the --reviewers view prints the bus factor of the path under its table", async () => {
  await withBusFactor(async (dir) => {
    const text = renderReviewers(await analyse(parseArgs(["--cwd", dir, "--reviewers", "src"])), 5);
    assert.ok(text.includes("bus factor 1: Ada alone holds 70.6% of 85 surviving lines"));
    assert.equal(count(text, DEFINITION), 1);
  });
});

const PLAIN_LINE = "  bus factor without the correction: 2 (Bob and Ada together lead the plain count)";

/** @param {(dir: string) => Promise<void>} fn */
async function withReformatBus(fn) {
  const dir = buildFixture("reformatBus");
  try {
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

test("with a suspected reformat, the main bus factor is the corrected one, and the block gives the plain count's", async () => {
  await withReformatBus(async (dir) => {
    const text = renderTable(await analyse(parseArgs(["--cwd", dir])), 10);
    assert.ok(text.includes("bus factor 1: Ada alone holds 68.8% of 80 surviving lines"), text);
    assert.equal(count(text, PLAIN_LINE), 1, text);
    assert.ok(text.indexOf(PLAIN_LINE) > text.indexOf("Authors who gain lines from this:"), "it follows the comparison line");
  });
});

test("the Markdown output and the --reviewers view show the plain count's bus factor", async () => {
  await withReformatBus(async (dir) => {
    const md = renderMarkdown(await analyse(parseArgs(["--cwd", dir, "--markdown"])), 10);
    assert.equal(count(md, PLAIN_LINE), 1);
    const reviewers = renderReviewers(await analyse(parseArgs(["--cwd", dir, "--reviewers", "src"])), 5);
    assert.equal(count(reviewers, PLAIN_LINE), 1);
  });
});

test("with no suspected reformat, no plain-count bus factor is printed or computed", async () => {
  await withBusFactor(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.equal(r.reformat.uncorrected, null, "there is no second count without suspects");
    assert.doesNotMatch(renderTable(r, 10), /bus factor without the correction/);
  });
});

test("the --json output carries the plain count's bus factor and validates", async () => {
  await withReformatBus(async (dir) => {
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    const parsed = JSON.parse(renderJson(await analyse(parseArgs(["--cwd", dir]))));
    assert.deepEqual(schemaErrors(schema, parsed), []);
    assert.equal(parsed.reformat.uncorrected.busFactor.value, 2);
    assert.equal(parsed.reformat.uncorrected.busFactor.thresholdPercent, 50);
    assert.equal(parsed.busFactor.value, 1);
  });
});

test("the bus factor follows the lines when the rows are sorted by commits or by the gap", async () => {
  const dir = buildFixture("busSort");
  try {
    for (const sort of ["lines", "commits", "gap"]) {
      const r = await analyse(parseArgs(["--cwd", dir, "--sort", sort]));
      assert.equal(r.authors[0]?.author, sort === "commits" ? "Ada" : "Bob", `rows sorted by ${sort}`);
      assert.equal(r.busFactor?.value, 1, `bus factor under --sort ${sort}`);
      assert.deepEqual(r.busFactor?.authors, ["Bob"], `bus factor authors under --sort ${sort}`);
    }
  } finally {
    removeRepo(dir);
  }
});
