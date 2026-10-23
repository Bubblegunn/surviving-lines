// @ts-check
// Round 13, G6: a commit that only adds the same text to several existing files and deletes nothing (a licence,
// copyright or SPDX header, a banner) is set aside by default, the way a reformat is. A commit that adds files, adds
// the text to fewer than three files, or also changes code is not. Fixtures are tiny repositories with invented names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { commitAs, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";

const { parseArgs, analyse, mechanicalLine, isBoilerplatePatch, dropBlameLinesOf } = await import("../bin/surviving-lines.js");

const HEADER = "// Copyright 2026 Example Ltd.\n// All rights reserved.\n// SPDX-License-Identifier: MIT\n";
const BANNER = "// ==== module banner ====\n// keep this module small\n// =======================\n";

/**
 * Ada writes the base files, Bob commits the change. Returns the analysis.
 * @param {Record<string, string>} base
 * @param {Record<string, string>} change
 * @param {string[]} [args]
 */
async function run(base, change, args = []) {
  const dir = createRepo("sl-boiler-");
  try {
    commitAs(dir, "ada", "2026-01-01T10:00:00Z", "feat: add the modules", base);
    commitAs(dir, "bob", "2026-02-01T10:00:00Z", "chore: touch the modules", change);
    return await analyse(parseArgs(["--cwd", dir, ...args]));
  } finally {
    removeRepo(dir);
  }
}
/** Four existing files, each with its own body. @param {number} [n] */
const base = (n = 4) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`m/f${i}.js`, lines(`body${i}_`, 8)]));
/** The same files with `head` put on top. @param {string} head @param {number} [n] */
const withHead = (head, n = 4) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`m/f${i}.js`, head + lines(`body${i}_`, 8)]));
/** @param {any} r */
const aside = (r) => (r.mechanicalCheck.setAsideCommits ?? []).map((/** @type {any} */ c) => [c.subject, c.reason]);
/** @param {any} r @param {string} name */
const lineOf = (r, name) => r.authors.find((/** @type {any} */ a) => a.author === name)?.lines ?? 0;

test("a licence header added to four existing files is set aside and the lines stay with their writer", async () => {
  const r = await run(base(), withHead(HEADER));
  assert.deepEqual(aside(r), [["chore: touch the modules", "boilerplate"]]);
  assert.equal(r.mechanicalCheck.setAside, 1);
  assert.equal(lineOf(r, "Bob"), 0);
  assert.match(mechanicalLine(r) ?? "", /rewrites looked through .*chore: touch the modules.*boilerplate/);
});

test("identical banner lines that are not licence text are set aside too", async () => {
  const r = await run(base(), withHead(BANNER));
  assert.deepEqual(aside(r), [["chore: touch the modules", "boilerplate"]]);
});

test("a header whose year differs per file is set aside when every added line is licence text", async () => {
  const change = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`m/f${i}.js`, `// Copyright 202${i} Example Ltd.\n${lines(`body${i}_`, 8)}`]));
  const r = await run(base(), change);
  assert.deepEqual(aside(r), [["chore: touch the modules", "boilerplate"]]);
});

test("the same five lines added to only two files are not set aside", async () => {
  const text = "// one\n// two\n// three\n// four\n// five\n";
  const r = await run(base(2), withHead(text, 2));
  assert.deepEqual(aside(r), []);
  assert.ok(lineOf(r, "Bob") > 0);
});

test("a header commit that also changes code lines is not set aside", async () => {
  const change = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`m/f${i}.js`, HEADER + lines(`body${i}_`, 8).replace(`body${i}_ 3`, `changed${i}_ 3`)]));
  const r = await run(base(), change);
  assert.deepEqual(aside(r), []);
  assert.ok(lineOf(r, "Bob") > 0);
});

test("a header commit that adds a code line to one file only is not set aside", async () => {
  const change = withHead(HEADER);
  change["m/f0.js"] += "const extra = 1;\n";
  const r = await run(base(), change);
  assert.deepEqual(aside(r), []);
});

test("a commit that adds four new files with identical content is not set aside", async () => {
  const r = await run(base(1), Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`n/new${i}.js`, HEADER + lines("same_", 6)])));
  assert.deepEqual(aside(r), []);
  assert.equal(lineOf(r, "Bob"), 4 * 9);
});

test("a header commit that deletes a code line is not set aside", async () => {
  const change = Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`m/f${i}.js`, HEADER + lines(`body${i}_`, 8).split("\n").slice(1).join("\n")]));
  const r = await run(base(), change);
  assert.deepEqual(aside(r), []);
});

test("--keep-reformat keeps the boilerplate commit counted", async () => {
  const r = await run(base(), withHead(HEADER), ["--keep-reformat"]);
  assert.deepEqual(aside(r), []);
  assert.ok(lineOf(r, "Bob") > 0);
});

test("isBoilerplatePatch reads the patch: three files with one header", () => {
  const file = (/** @type {string} */ n) => `diff --git a/${n} b/${n}\nindex 1..2 100644\n--- a/${n}\n+++ b/${n}\n@@ -0,0 +1,2 @@\n+// same\n+// text\n`;
  assert.equal(isBoilerplatePatch(["a", "b", "c"].map(file).join("")), true);
  assert.equal(isBoilerplatePatch(["a", "b"].map(file).join("")), false);
  assert.equal(isBoilerplatePatch(["a", "b", "c"].map(file).join("").replace("index 1..2", "new file mode 100644\nindex 1..2")), false);
});

test("a header commit whose fourth file only gains blank lines is not set aside", async () => {
  const change = withHead(HEADER);
  change["m/f3.js"] = `\n\n${lines("body3_", 8)}`;
  const r = await run(base(), change);
  assert.deepEqual(aside(r), []);
});

test("dropBlameLinesOf removes only the entries of the named commits", () => {
  const entry = (/** @type {string} */ sha, /** @type {string} */ text) => `${sha} 1 1 1\nauthor A\nauthor-mail <a@x>\nfilename f\n\t${text}\n`;
  const out = dropBlameLinesOf(entry("a".repeat(40), "one") + entry("b".repeat(40), "two") + entry("a".repeat(40), "three"), new Set(["a".repeat(40)]));
  assert.equal(out.includes("one"), false);
  assert.equal(out.includes("three"), false);
  assert.equal(out.includes("two"), true);
  assert.equal(dropBlameLinesOf("x\n\ty\n", new Set()), "x\n\ty\n");
});

test("a banner in two files next to licence lines in two others is not set aside", async () => {
  const change = { ...withHead(BANNER, 2), "m/f2.js": `// Copyright 2026 A\n${lines("body2_", 8)}`, "m/f3.js": `// Copyright 2027 B\n${lines("body3_", 8)}` };
  const r = await run(base(), change);
  assert.deepEqual(aside(r), []);
});
