// @ts-check
// The correction: a detected reformat commit is ignored in the main numbers by default, and the block says so.
// --keep-reformat counts it again, and --co-authors share cannot take the correction. Fixtures: scripts/fixtures.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PEOPLE, buildFixture, commitAs, createRepo, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderGroups, renderMarkdown, renderReviewers, renderJson, inSample } = await import("../bin/surviving-lines.js");

const BIN = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
const SCHEMA_PATH = join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json");
/** @param {keyof typeof PEOPLE} who */
const mailOf = (who) => PEOPLE[who][1];
/** @param {any} r */
const linesByMail = (r) => Object.fromEntries(r.authors.map((/** @type {any} */ a) => [a.mail, a.lines]));
/** @param {string} name @param {(dir: string) => Promise<void>} fn */
async function withFixture(name, fn) {
  const dir = buildFixture(/** @type {Parameters<typeof buildFixture>[0]} */ (name));
  try {
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}
const APPLIED = "reformat commit ignored (looks like whitespace and quote changes only): 1 commit";
const SUSPECTED = "reformat suspected (looks like whitespace and quote changes only): 1 commit";

test("by default the main rows leave the reformat commit out, and the block says what it moved", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    // Ada's 30 lines of the reformat are hers again; Bob keeps a row with no lines, as the table always did.
    assert.deepEqual(linesByMail(r), { [mailOf("ada")]: 35, [mailOf("bob")]: 0 });
    assert.equal(r.sample.linesAttributed, 35);
    assert.equal(r.reformat.applied, true);
    assert.equal(r.reformat.suspects.length, 1);
    const [s] = r.reformat.suspects;
    assert.deepEqual(r.blame.autoIgnoredRevs, [s.sha]);
    assert.deepEqual(r.blame.flags, ["-w", "-M", "-C", "--ignore-rev", s.shortSha, "(auto)"]);
    assert.equal(r.busFactor.authors.length, 1);
    assert.equal(r.busFactor.authors[0], PEOPLE.ada[0]);
    // The first pass numbers, the ones a plain count gives: Bob 30, Ada 5.
    assert.equal(r.reformat.uncorrected.linesAttributed, 35);
    assert.deepEqual(
      r.reformat.uncorrected.authors.map((/** @type {any} */ a) => [a.author, a.mail, a.lines]),
      [
        [PEOPLE.bob[0], mailOf("bob"), 30],
        [PEOPLE.ada[0], mailOf("ada"), 5],
      ],
    );
    assert.equal(r.reformat.uncorrected.busFactor.value, 1);
    const text = renderTable(r, 10);
    assert.ok(text.includes(APPLIED), text);
    assert.ok(text.includes(`  commit ${s.shortSha} "style: switch app.js to double quotes" rewrote 30 lines in 1 file (formatting only)`), text);
    assert.doesNotMatch(text, /Bob[^\n]*30 lines in the plain count|Bob 30 \(/, "no line total next to the committer's name");
    assert.ok(text.includes(`  The table above does not count it. Authors who gain lines from this: Ada 35 (100.0%) with the correction, 5 (14.3%) without. --keep-reformat counts it; --ignore-rev ${s.shortSha} (or an entry in .git-blame-ignore-revs) sets it aside by hand.`), text);
    assert.ok(text.includes("  bus factor without the correction: 1 (Bob alone leads the plain count)"), text);
    assert.doesNotMatch(text, /the numbers above include|reformat suspected/);
    assert.ok(text.indexOf(APPLIED) > text.indexOf("author "), "the block comes after the table");
    assert.ok(text.indexOf(APPLIED) < text.indexOf("What this cannot show"), "the block comes before the closing lines");
  });
});

test("--keep-reformat counts the commit again and prints the round 1 wording", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--keep-reformat"]));
    assert.deepEqual(linesByMail(r), { [mailOf("bob")]: 30, [mailOf("ada")]: 5 });
    assert.equal(r.reformat.applied, false);
    assert.equal(r.reformat.suspects.length, 1);
    assert.equal(r.reformat.uncorrected, null);
    assert.deepEqual(r.blame.autoIgnoredRevs, []);
    assert.doesNotMatch(r.blame.flags.join(" "), /\(auto\)/);
    const [s] = r.reformat.suspects;
    const text = renderTable(r, 10);
    assert.ok(text.includes(SUSPECTED), text);
    assert.ok(text.includes(`  the numbers above include it. Re-run with --ignore-rev ${s.shortSha} to apply it, or add it to .git-blame-ignore-revs.`), text);
    assert.doesNotMatch(text, /reformat commit ignored|without the correction/);
  });
});

test("--keep-reformat with --no-detect-reformat: no detection wins, and the numbers are the plain ones", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--keep-reformat", "--no-detect-reformat"]));
    assert.deepEqual(r.reformat, { detection: false, applied: false, suspects: [], uncorrected: null });
    assert.deepEqual(r.blame.autoIgnoredRevs, []);
    assert.deepEqual(linesByMail(r), { [mailOf("bob")]: 30, [mailOf("ada")]: 5 });
    assert.doesNotMatch(renderTable(r, 10), /reformat/);
  });
});

test("--group-by is corrected: Bob has no lines in the src block, and the block appears once", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--group-by", "dir"]));
    const src = r.grouping.groups.find((/** @type {any} */ g) => g.key === "src");
    assert.ok(src, JSON.stringify(r.grouping.groups));
    assert.equal(src.authors.find((/** @type {any} */ a) => a.mail === mailOf("bob"))?.lines ?? 0, 0);
    assert.equal(r.reformat.applied, true);
    const text = renderGroups(r, 10);
    assert.equal(text.split(APPLIED).length - 1, 1, text);
    assert.ok(text.includes("  The table above does not count it. Authors who gain lines from this: "), text);
  });
});

test("--csv is corrected, and the stderr note names the commit that was ignored", async () => {
  await withFixture("quotes", async (dir) => {
    const run = spawnSync(process.execPath, [BIN, "--cwd", dir, "--csv"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const rows = run.stdout.trim().split("\n");
    assert.ok(rows.some((row) => row.startsWith(`${PEOPLE.bob[0]},${mailOf("bob")},0,0.0000,`)), run.stdout);
    assert.ok(rows.some((row) => row.startsWith(`${PEOPLE.ada[0]},${mailOf("ada")},35,1.0000,`)), run.stdout);
    assert.match(run.stderr, /^surviving-lines: reformat commit ignored \(looks like whitespace and quote changes only\): 1 commit\n(surviving-lines: {1,3}.*\n)*$/);
    assert.match(run.stderr, /surviving-lines:   commit [0-9a-f]{7} .* rewrote 30 lines in 1 file \(formatting only\).*--keep-reformat counts it/s);
  });
});

test("--co-authors share is not corrected: the numbers include the commit and one line says so", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--co-authors", "share"]));
    assert.equal(r.reformat.applied, false);
    assert.equal(r.reformat.uncorrected, null);
    assert.deepEqual(linesByMail(r), { [mailOf("bob")]: 30, [mailOf("ada")]: 5 });
    const text = renderTable(r, 10);
    assert.ok(text.includes(SUSPECTED), text);
    assert.equal(text.split("\n").filter((/** @type {string} */ l) => l.includes("the correction is not applied with --co-authors share")).length, 1, text);
    assert.doesNotMatch(text, /without the correction|reformat commit ignored/);
  });
});

test("--sample: a sampled run that holds the formatted file is corrected the same way", async () => {
  await withFixture("quotes", async (dir) => {
    // A seed under which src/app.js is sampled and docs/notes.md is not, so the formatter's file is in the run.
    const seed = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"].find(
      (s) => inSample("src/app.js", 2, s) && !inSample("docs/notes.md", 2, s),
    );
    assert.ok(seed, "a seed that samples the formatted file alone");
    const r = await analyse(parseArgs(["--cwd", dir, "--sample", "2", "--seed", seed]));
    assert.equal(r.sample.filesSampled, 1);
    assert.equal(r.reformat.applied, true);
    // Ada's 30 original lines are hers again; the notes file is out of this sample, so it does not count.
    assert.deepEqual(linesByMail(r), { [mailOf("ada")]: 30, [mailOf("bob")]: 0 });
    assert.equal(r.sample.linesAttributed, 30);
  });
});

test("the JSON validates against the schema in every mode, and the correction fields follow the mode", async () => {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
  const modes = [
    { args: [], applied: true },
    { args: ["--keep-reformat"], applied: false },
    { args: ["--no-detect-reformat"], applied: false },
    { args: ["--keep-reformat", "--no-detect-reformat"], applied: false },
    { args: ["--co-authors", "share"], applied: false },
    { args: ["--group-by", "dir"], applied: true },
    { args: ["--group-by", "dir", "--keep-reformat"], applied: false },
    { args: ["--reviewers", "src/app.js"], applied: true },
    { args: ["--reviewers", "src/app.js", "--keep-reformat"], applied: false },
    { args: ["--sample", "2", "--seed", "a"], applied: null },
  ];
  await withFixture("quotes", async (dir) => {
    for (const { args, applied } of modes) {
      const r = await analyse(parseArgs(["--cwd", dir, "--json", ...args]));
      assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), [], args.join(" "));
      if (applied !== null) assert.equal(r.reformat.applied, applied, args.join(" "));
      assert.equal(r.reformat.uncorrected === null, !applied, args.join(" "));
      assert.equal(r.blame.autoIgnoredRevs.length, applied ? 1 : 0, args.join(" "));
      assert.equal(Object.hasOwn(r.reformat, "ifIgnored"), false);
    }
  });
});

test("a feature commit is not a suspect, so nothing is corrected and no auto revision is passed", async () => {
  await withFixture("feature", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.equal(r.reformat.applied, false);
    assert.equal(r.reformat.uncorrected, null);
    assert.deepEqual(r.blame.autoIgnoredRevs, []);
    assert.deepEqual(linesByMail(r), { [mailOf("bob")]: 290, [mailOf("ada")]: 20, [mailOf("charlie")]: 30 });
    assert.doesNotMatch(renderTable(r, 10), /reformat/);
  });
});

test("the reviewers suggestion reads the corrected rows and keeps its heading", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "src/app.js"]));
    assert.equal(r.reviewers?.suggestedBasis, "reformatIgnored");
    assert.deepEqual(
      r.reviewers?.suggested.map((/** @type {any} */ p) => [p.author, p.lines]),
      [[PEOPLE.ada[0], 30]],
    );
    const text = renderReviewers(r, 5);
    assert.ok(text.includes("suggested by surviving lines (with the suspected reformat commit ignored): Ada (30 lines, 100.0%"), text);
    assert.ok(text.includes(APPLIED), text);
  });
});

test("the markdown output carries the same corrected block", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    const md = renderMarkdown(r, 10);
    assert.ok(md.includes(APPLIED), md);
    assert.ok(md.indexOf("| Ada |") < md.indexOf(APPLIED), "the block comes after the table");
  });
});

test("--keep-reformat with two suspects lists both and the re-run hint names both full ids", async () => {
  const dir = createRepo("sl-keep-two-");
  try {
    const quoted = (/** @type {string} */ q) => Array.from({ length: 25 }, (_, i) => `x(${q}${i}${q});`).join("\n") + "\n";
    commitAs(dir, "ada", "2026-01-10T10:00:00Z", "ada: two files", { "src/a.js": quoted("'"), "src/b.js": quoted("'").replace(/x\(/g, "y(") });
    commitAs(dir, "bob", "2026-02-01T10:00:00Z", "style: quotes a", { "src/a.js": quoted('"') });
    commitAs(dir, "charlie", "2026-02-02T10:00:00Z", "style: quotes b", { "src/b.js": quoted('"').replace(/x\(/g, "y(") });
    const r = await analyse(parseArgs(["--cwd", dir, "--keep-reformat"]));
    assert.equal(r.reformat.suspects.length, 2);
    const [first, second] = r.reformat.suspects.map((/** @type {any} */ x) => x.sha);
    const text = renderTable(r, 10);
    assert.ok(text.includes(`reformat suspected (looks like whitespace and quote changes only): 2 commits`), text);
    assert.ok(text.includes(`  the numbers above include them. Re-run with --ignore-rev ${first} --ignore-rev ${second} to apply them, or add them to .git-blame-ignore-revs.`), text);
  } finally {
    removeRepo(dir);
  }
});
