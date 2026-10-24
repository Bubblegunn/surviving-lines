// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, parseGroupBy, groupKey, renderGroups, renderCodeowners, OWNER_THRESHOLD } = await import("../bin/surviving-lines.js");
const summary = (/** @type {any} */ r) => Object.fromEntries(r.grouping.groups.map((/** @type {any} */ g) => [g.key, [g.filesSampled, g.lines, g.authors.map((/** @type {any} */ a) => `${a.mail.split("@")[0]}:${a.lines}`).join(",")]]));

test("parseGroupBy reads dir, dir:<n> and ext, and refuses everything else", () => {
  assert.deepEqual(parseGroupBy("dir"), { kind: "dir", depth: 1 });
  assert.deepEqual(parseGroupBy("dir:3"), { kind: "dir", depth: 3 });
  assert.deepEqual(parseGroupBy("ext"), { kind: "ext" });
  for (const bad of ["dir:0", "dir:", "dir:-1", "dir:x", "path", "", "ext:1"]) assert.throws(() => parseGroupBy(bad), /--group-by must be/);
  assert.throws(() => parseArgs(["--group-by", "nope"]), /--group-by must be/);
});

test("groupKey puts root files in '.', cuts directories at the depth, and lowercases extensions", () => {
  const d1 = { kind: "dir", depth: 1 };
  const d2 = { kind: "dir", depth: 2 };
  assert.equal(groupKey("README.md", /** @type {any} */ (d1)), ".");
  assert.equal(groupKey("src/a/x.js", /** @type {any} */ (d1)), "src");
  assert.equal(groupKey("src/a/x.js", /** @type {any} */ (d2)), "src/a");
  assert.equal(groupKey("src/x.js", /** @type {any} */ (d2)), "src");
  assert.equal(groupKey("a/B.TXT", { kind: "ext" }), ".txt");
  assert.equal(groupKey("a/Makefile", { kind: "ext" }), "(none)");
  assert.equal(groupKey(".gitignore", { kind: "ext" }), "(none)");
  assert.equal(groupKey("a/archive.tar.gz", { kind: "ext" }), ".gz");
});

test("--group-by dir:1 gives one block per top-level directory with its own shares and file count", async () => {
  const dir = buildFixture("dirs");
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--group-by", "dir"]));
    assert.equal(r.grouping.by, "dir:1");
    assert.deepEqual(summary(r), {
      src: [3, 24, "bob:14,ada:10"],
      docs: [1, 6, "ada:6"],
      lib: [1, 5, "bob:5"],
      ".": [1, 3, "ada:3"],
    });
    // Groups are ordered by lines, and the groups together hold every attributed line.
    assert.deepEqual(r.grouping.groups.map((/** @type {any} */ g) => g.key), ["src", "docs", "lib", "."]);
    assert.equal(r.grouping.groups.reduce((/** @type {number} */ s, /** @type {any} */ g) => s + g.lines, 0), r.sample.linesAttributed);
    const g = r.grouping.groups[0];
    assert.ok(Math.abs(g.authors[0].lineShare - 14 / 24) < 1e-12);
  } finally {
    removeRepo(dir);
  }
});

test("--group-by dir:2 splits deeper, and ext groups by extension", async () => {
  const dir = buildFixture("dirs");
  try {
    const two = await analyse(parseArgs(["--cwd", dir, "--group-by", "dir:2"]));
    assert.deepEqual(Object.keys(summary(two)).sort(), [".", "docs", "lib/deep", "src/a", "src/b"]);
    assert.deepEqual(summary(two)["src/a"], [2, 14, "ada:10,bob:4"]);
    const ext = await analyse(parseArgs(["--cwd", dir, "--group-by", "ext"]));
    assert.equal(ext.grouping.by, "ext");
    assert.deepEqual(summary(ext), { ".js": [4, 29, "bob:19,ada:10"], ".md": [2, 9, "ada:9"] });
  } finally {
    removeRepo(dir);
  }
});

test("a group resting on one file says so in the table", async () => {
  const dir = buildFixture("dirs");
  try {
    const out = renderGroups(await analyse(parseArgs(["--cwd", dir, "--group-by", "dir"])), 10);
    assert.match(out, /^docs {2}· {2}1 file sampled {2}· {2}6 lines$/m);
    assert.match(out, /^src {2}· {2}3 files sampled {2}· {2}24 lines$/m);
    assert.match(out, /^Ada\s+6\s+100\.0%$/m);
  } finally {
    removeRepo(dir);
  }
});

test("bots are left out of a group's denominator unless asked for", async () => {
  const dir = buildFixture("bots");
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--group-by", "dir"]));
    const docs = r.grouping.groups.find((/** @type {any} */ g) => g.key === "docs");
    assert.deepEqual([docs.filesSampled, docs.lines, docs.authors], [3, 0, []]);
    const all = await analyse(parseArgs(["--cwd", dir, "--group-by", "dir", "--include-bots"]));
    assert.equal(all.grouping.groups.find((/** @type {any} */ g) => g.key === "docs").lines, 20);
  } finally {
    removeRepo(dir);
  }
});

test("--suggest-codeowners prints lines, never writes, and says why a directory has no owner", async () => {
  const dir = buildFixture("dirs");
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--group-by", "dir:2"]));
    const text = renderCodeowners(r);
    assert.match(text, /^# CODEOWNERS suggestions .* nothing was written\.$/m);
    // Round 13 (#11): Bob holds 28.6% of src/a/ and is active, so he is named beside Ada (a second owner needs 20%).
    assert.match(text, /^\/src\/a\/ ada@example\.com bob@example\.com {2}# Ada 71\.4%, Bob 28\.6% of 14 lines in 2 sampled files$/m);
    assert.match(text, /^# Only people with a commit in the 365 days before 2026-01-11 are named as owners\.$/m);
    assert.match(text, /^\/src\/b\/ bob@example\.com {2}# Bob holds 100\.0% of 10 lines in 1 sampled file$/m);
    assert.match(text, /^# \(files at the repository root\) skipped/m);
    assert.equal(OWNER_THRESHOLD, 0.5);
  } finally {
    removeRepo(dir);
  }
});

test("renderCodeowners orders parents before children, uses GitHub logins, and comments a split directory", () => {
  const author = (/** @type {string} */ name, /** @type {string} */ mail, /** @type {number} */ lines, /** @type {number} */ share) => ({ author: name, mail, lines, lineShare: share });
  const fake = /** @type {any} */ ({
    activity: { asOf: "2026-02-01", activeDays: 365 },
    lastCommits: { "1+ada-l@users.noreply.github.com": "2026-01-01", "bob@example.com": "2026-01-01", "cy@example.com": "2026-01-01" },
    grouping: {
      by: "dir:2",
      groups: [
        { key: "src/a", filesSampled: 2, lines: 10, authors: [author("Ada", "1+ada-l@users.noreply.github.com", 10, 1)] },
        { key: "src", filesSampled: 1, lines: 10, authors: [author("Bob", "bob@example.com", 5, 0.5), author("Cy", "cy@example.com", 5, 0.5)] },
        { key: "split", filesSampled: 1, lines: 10, authors: [author("Bob", "bob@example.com", 4, 0.4), author("Cy", "cy@example.com", 3, 0.3)] },
        { key: "empty", filesSampled: 1, lines: 0, authors: [] },
      ],
    },
  });
  // Round 13 (#11): the header has a third line (who is named) and src/ names both of its 50% authors.
  const lines = renderCodeowners(fake).split("\n").slice(3);
  assert.deepEqual(lines.map((l) => l.split(" ")[0] + " " + l.split(" ")[1]), ["# /empty/", "# /split/", "/src/ bob@example.com", "/src/a/ @ada-l"]);
  assert.match(lines[0], /no surviving lines in 1 sampled file/);
  assert.match(lines[1], /no author holds half of 10 lines in 1 sampled file; top is Bob at 40\.0%/);
});

test("the options that cannot work together are refused with the reason", () => {
  assert.throws(() => parseArgs(["--suggest-codeowners"]), /needs --group-by dir/);
  assert.throws(() => parseArgs(["--suggest-codeowners", "--group-by", "ext"]), /needs --group-by dir/);
  assert.throws(() => parseArgs(["--group-by", "dir", "--csv"]), /cannot be combined with --csv/);
  assert.throws(() => parseArgs(["--group-by", "dir", "--markdown"]), /cannot be combined/);
  assert.throws(() => parseArgs(["--group-by", "dir", "--identities"]), /cannot be combined/);
  assert.throws(() => parseArgs(["--group-by", "dir", "--suggest-codeowners", "--json"]), /cannot be combined with --json/);
});

test("the CLI prints blocks and the suggestions; --json nests the groups and matches the schema", async () => {
  const root = join(import.meta.dirname, "..");
  const schema = JSON.parse(await readFile(join(root, "schema", "surviving-lines.schema.json"), "utf8"));
  const bin = join(root, "bin", "surviving-lines.js");
  const dir = buildFixture("dirs");
  try {
    const text = spawnSync(process.execPath, [bin, "--cwd", dir, "--group-by", "dir", "--suggest-codeowners", "-q"], { encoding: "utf8" });
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /^src {2}· {2}3 files sampled/m);
    assert.match(text.stdout, /^\/src\/ bob@example\.com/m);
    const json = spawnSync(process.execPath, [bin, "--cwd", dir, "--group-by", "ext", "--json", "-q"], { encoding: "utf8" });
    assert.equal(json.status, 0, json.stderr);
    const doc = JSON.parse(json.stdout);
    assert.equal(doc.grouping.groups.length, 2);
    assert.deepEqual(schemaErrors(schema, doc), []);
    const plain = JSON.parse(spawnSync(process.execPath, [bin, "--cwd", dir, "--json", "-q"], { encoding: "utf8" }).stdout);
    assert.equal(plain.grouping, null);
    assert.deepEqual(schemaErrors(schema, plain), []);
  } finally {
    removeRepo(dir);
  }
});

test("a group with more authors than --top says how many are left out", async () => {
  const dir = buildFixture("dirs");
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--group-by", "dir"]));
    const src = r.grouping.groups.find((/** @type {any} */ g) => g.key === "src");
    assert.ok(src.authors.length > 1);
    const left = src.authors.length - 1;
    assert.match(renderGroups(r, 1), new RegExp(`^… ${left} more author${left === 1 ? "" : "s"}$`, "m"));
  } finally {
    removeRepo(dir);
  }
});
