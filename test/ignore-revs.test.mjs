// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, supportsIgnoreRevs, MIN_GIT_IGNORE_REVS } = await import("../bin/surviving-lines.js");
const linesOf = (/** @type {any} */ r) => Object.fromEntries(r.authors.map((/** @type {any} */ a) => [a.mail, a.lines]));

test("a repository's .git-blame-ignore-revs is read by default and named in the output", async () => {
  const dir = buildFixture("reformat");
  try {
    const r = await analyse(parseArgs(["--cwd", dir]));
    // Bob's formatter commit is listed, so its 20 lines go back to Ada (20 + 10 extra + 2 in the ignore file itself).
    assert.deepEqual(linesOf(r), { "ada@example.com": 32, "bob@example.com": 0 });
    assert.equal(r.blame.ignoreRevsFile, ".git-blame-ignore-revs");
    assert.deepEqual(r.blame.flags, ["-w", "-M", "-C", "--ignore-revs-file", ".git-blame-ignore-revs"]);
    assert.match(renderTable(r, 10), /git blame -w -M -C --ignore-revs-file \.git-blame-ignore-revs {2}·/);
  } finally {
    removeRepo(dir);
  }
});

test("--no-ignore-revs reads nothing, and the run says so by printing no ignore file", async () => {
  const dir = buildFixture("reformat");
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--no-ignore-revs"]));
    assert.deepEqual(linesOf(r), { "bob@example.com": 20, "ada@example.com": 12 });
    assert.equal(r.blame.ignoreRevsFile, null);
    assert.deepEqual(r.blame.flags, ["-w", "-M", "-C"]);
  } finally {
    removeRepo(dir);
  }
});

test("--ignore-revs-file names a file other than the default, relative to --cwd", async () => {
  const dir = buildFixture("reformat");
  try {
    const sha = (await readFile(join(dir, ".git-blame-ignore-revs"), "utf8")).split("\n")[1];
    await writeFile(join(dir, "skip.txt"), `${sha}\n`);
    const r = await analyse(parseArgs(["--cwd", dir, "--ignore-revs-file", "skip.txt"]));
    assert.equal(r.blame.ignoreRevsFile, "skip.txt");
    assert.equal(linesOf(r)["bob@example.com"], 0);
    await assert.rejects(analyse(parseArgs(["--cwd", dir, "--ignore-revs-file", "nope.txt"])), /--ignore-revs-file nope\.txt does not exist/);
  } finally {
    removeRepo(dir);
  }
});

test("a revision in the file that is not in the repository is ignored by git and does not stop the run", async () => {
  const dir = buildFixture("basic");
  try {
    await writeFile(join(dir, "stale.txt"), `# a rewritten history\n${"deadbeef".repeat(5)}\n`);
    const withFile = await analyse(parseArgs(["--cwd", dir, "--ignore-revs-file", "stale.txt"]));
    const without = await analyse(parseArgs(["--cwd", dir]));
    assert.deepEqual(linesOf(withFile), linesOf(without));
  } finally {
    removeRepo(dir);
  }
});

test("the two ignore options exclude each other", () => {
  assert.throws(() => parseArgs(["--ignore-revs-file", "x", "--no-ignore-revs"]), /mutually exclusive/);
  assert.throws(() => parseArgs(["--ignore-revs-file"]), /needs a value/);
});

test("the sample is the same with and without an ignore file: it depends on paths, not on blame", async () => {
  const dir = buildFixture("reformat");
  try {
    const a = await analyse(parseArgs(["--cwd", dir, "--sample", "2", "--seed", "k"]));
    const b = await analyse(parseArgs(["--cwd", dir, "--sample", "2", "--seed", "k", "--no-ignore-revs"]));
    assert.deepEqual(a.sample, b.sample);
  } finally {
    removeRepo(dir);
  }
});

test("an old git is refused with the fix, only when an ignore file would be used", () => {
  assert.equal(supportsIgnoreRevs("git version 2.22.9"), false);
  assert.equal(supportsIgnoreRevs("git version 2.23.0"), true);
  assert.equal(supportsIgnoreRevs("git version 3.0.0"), true);
  assert.equal(supportsIgnoreRevs("not a version"), true);
  assert.deepEqual(MIN_GIT_IGNORE_REVS, [2, 23]);
});

test("the JSON for a run with an ignore file matches the published schema", async () => {
  const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
  const dir = buildFixture("reformat");
  try {
    const r = await analyse(parseArgs(["--cwd", dir]));
    const doc = JSON.parse(JSON.stringify({ schemaVersion: 1, tool: { name: "surviving-lines", version: "0.0.0" }, ...r }));
    assert.deepEqual(schemaErrors(schema, doc), []);
  } finally {
    removeRepo(dir);
  }
});
