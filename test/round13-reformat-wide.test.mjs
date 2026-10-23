// @ts-check
// Round 13, G3: a commit whose changed lines equal their parent lines after layout and quote folding is set aside by
// default when its subject names a formatter, it touches 10 files, or the proof covers 50 changed lines. Formatter
// configuration files do not break the proof, Lua and Dart quote changes are layout, and a run scoped to paths judges
// a commit that holds a single surviving line. Fixtures are tiny repositories with invented names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PEOPLE, commitAs, createRepo, removeRepo } from "../scripts/fixtures.mjs";

const { parseArgs, analyse, FORMATTER_CONFIG_FILES } = await import("../bin/surviving-lines.js");

const D = (/** @type {string} */ d) => `2026-0${d}T10:00:00Z`;
/** n lines of code in one quote style; the first `changed` lines use the other style when `flip` is set. */
const code = (/** @type {number} */ n, /** @type {"'" | '"'} */ q, /** @type {number} */ changed = n, flip = false, kw = "local") =>
  Array.from({ length: n }, (_, i) => {
    const quote = flip && i < changed ? (q === "'" ? '"' : "'") : q;
    return `${kw} item${i} = ${quote}value ${i}${quote}`;
  }).join("\n") + "\n";

/**
 * Ada writes `before`, Bob commits `after` with `subject`. Returns the analysis of that repository.
 * @param {Record<string, string>} before
 * @param {Record<string, string | null>} after
 * @param {string} subject
 * @param {string[]} [args]
 */
async function run(before, after, subject, args = []) {
  const dir = createRepo("sl-wide-");
  try {
    commitAs(dir, "ada", D("1-01"), "feat: add the files", before);
    commitAs(dir, "bob", D("2-01"), subject, after);
    return await analyse(parseArgs(["--cwd", dir, ...args]));
  } finally {
    removeRepo(dir);
  }
}
/** @param {any} r */
const setAside = (r) => r.reformat.suspects.map((/** @type {any} */ s) => s.subject);
/** @param {any} r */
const listed = (/** @type {any} */ r) => r.mechanicalCheck.candidates.map((/** @type {any} */ c) => [c.subject, c.reason]);

test("a formatter commit that also adds a configuration file is set aside", async () => {
  const r = await run({ "src/app.js": code(25, "'") }, { "src/app.js": code(25, '"'), ".prettierrc": "{}\n" }, "chore: run the formatter");
  assert.deepEqual(setAside(r), ["chore: run the formatter"]);
  assert.equal(r.reformat.suspects[0].filesChanged, 2);
  assert.equal(r.reformat.suspects[0].changedLines, 50, "the proof covers the source file only");
});

test("a commit that edits a configuration file and also changes code is not set aside", async () => {
  const real = code(25, '"').replace("value 3", "value three");
  const r = await run({ "src/app.js": code(25, "'") }, { "src/app.js": real, ".prettierrc": "{}\n" }, "chore: run the formatter");
  assert.deepEqual(setAside(r), []);
});

test("a commit that touches only configuration files is not a rewrite", async () => {
  const r = await run({ "src/app.js": code(25, "'"), ".editorconfig": "root = true\n" }, { ".editorconfig": "root = false\n" }, "chore: run the formatter");
  assert.deepEqual(setAside(r), []);
});

test("the configuration list names the usual formatter files by base name, and nothing broader", () => {
  for (const name of ["stylua.toml", ".formatter.exs", "analysis_options.yaml", "rustfmt.toml", ".prettierrc", ".prettierrc.json", ".clang-format", ".editorconfig", "pyproject.toml", "sub/dir/.editorconfig"]) {
    assert.ok(FORMATTER_CONFIG_FILES.test(name.slice(name.lastIndexOf("/") + 1)), name);
  }
  for (const name of ["package.json", "app.js", "prettier.js", "config.toml"]) assert.ok(!FORMATTER_CONFIG_FILES.test(name), name);
});

for (const [ext, kw] of [["lua", "local"], ["dart", "final"]]) {
  test(`a ${ext} quote-style commit is set aside`, async () => {
    const r = await run({ [`src/a.${ext}`]: code(25, "'", 25, false, kw) }, { [`src/a.${ext}`]: code(25, '"', 25, false, kw) }, "style: use double quotes");
    assert.deepEqual(setAside(r), ["style: use double quotes"]);
  });
}

test("a quote change in shell is still a real change", async () => {
  const r = await run({ "src/a.sh": code(25, "'", 25, false, "X=") }, { "src/a.sh": code(25, '"', 25, false, "X=") }, "style: use double quotes");
  assert.deepEqual(setAside(r), []);
});

test("a scoped run judges a 15-line reformat inside a 478-line file; the whole-repository run does not", async () => {
  const before = { "src/big.js": code(478, "'", 0, false, "const"), "other/lib.js": code(2000, "'", 0, false, "var") };
  const after = { "src/big.js": code(478, "'", 15, true, "const") };
  const subject = "format with prettier";
  const scoped = await run(before, after, subject, ["--", "src"]);
  assert.deepEqual(setAside(scoped), [subject]);
  assert.equal(scoped.reformat.suspects[0].survivingLines, 15);
  const whole = await run(before, after, subject);
  assert.deepEqual(setAside(whole), [], "15 lines are under 20 lines and under 5% of the attributed lines");
});

test("a scoped run with --reviewers also judges a one-line scope holder", async () => {
  const before = { "src/big.js": code(400, "'", 0, false, "const"), "other/lib.js": code(2000, "'", 0, false, "var") };
  const after = { "src/big.js": code(400, "'", 1, true, "const") };
  const r = await run(before, after, "run prettier", ["--reviewers", "src"]);
  assert.deepEqual(setAside(r), ["run prettier"]);
});

test("a commit with a formatter subject and real code changes is not set aside", async () => {
  const real = code(25, '"').replace("value 3", "value three");
  const r = await run({ "src/app.js": code(25, "'") }, { "src/app.js": real }, "format", ["--", "src"]);
  assert.deepEqual(setAside(r), []);
  assert.equal(r.reformat.suspects.length, 0);
});

test("a content-equal commit with no formatter subject, two files and ten lines stays listed", async () => {
  const r = await run({ "src/a.js": code(5, "'"), "src/b.js": code(5, "'", 5, false, "var") }, { "src/a.js": code(5, '"'), "src/b.js": code(5, '"', 5, false, "var") }, "tweak spacing", ["--", "src"]);
  assert.deepEqual(setAside(r), []);
  assert.deepEqual(listed(r), [["tweak spacing", "content"]]);
});

test("a content-equal commit with no formatter subject is set aside from 50 changed lines, not from 48", async () => {
  const at50 = await run({ "src/a.js": code(25, "'") }, { "src/a.js": code(25, '"') }, "tweak spacing", ["--", "src"]);
  assert.deepEqual(setAside(at50), ["tweak spacing"]);
  const at48 = await run({ "src/a.js": code(24, "'") }, { "src/a.js": code(24, '"') }, "tweak spacing", ["--", "src"]);
  assert.deepEqual(setAside(at48), []);
});

test("a content-equal commit with no formatter subject is set aside from 10 files, not from 9", async () => {
  const many = (/** @type {number} */ n, /** @type {"'" | '"'} */ q) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`src/f${i}.js`, code(1, q, 1, false, `var f${i}`)]));
  const ten = await run(many(10, "'"), many(10, '"'), "tweak spacing", ["--", "src"]);
  assert.deepEqual(setAside(ten), ["tweak spacing"]);
  const nine = await run(many(9, "'"), many(9, '"'), "tweak spacing", ["--", "src"]);
  assert.deepEqual(setAside(nine), []);
});

const PHRASES = [
  "mix format", "dart format", "stylua", "rustfmt", "gofmt", "clang-format", "prettier", "autopep8", "yapf", "ktlint", "spotless",
  "scalafmt", "dotnet format", "lint --fix", "autofix", "apply formatting", "format code", "reformat", "fix style", "line_length",
  "run black", "cargo fmt", "ruff format", "auto-format", "style: format", "chore: format", "black",
];
for (const phrase of PHRASES) {
  test(`the subject "${phrase}" with a passing proof is set aside, and without a proof is not`, async () => {
    const proved = await run({ "src/a.js": code(8, "'") }, { "src/a.js": code(8, '"') }, phrase, ["--", "src"]);
    assert.deepEqual(setAside(proved), [phrase]);
    const real = await run({ "src/a.js": code(8, "'") }, { "src/a.js": code(8, '"').replace("value 3", "value three") }, phrase, ["--", "src"]);
    assert.deepEqual(setAside(real), []);
  });
}

test("plain subjects that only share a word with the vocabulary do not count as a formatter", async () => {
  for (const subject of ["make the theme black", "update the format of the config key", "fix the style guide link"]) {
    const r = await run({ "src/a.js": code(8, "'") }, { "src/a.js": code(8, '"') }, subject, ["--", "src"]);
    assert.deepEqual(setAside(r), [], subject);
  }
});

test("a widened-vocabulary subject with the same small change in 10 files but no content proof is listed, never set aside", async () => {
  const many = (/** @type {string} */ v) => Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`src/f${i}.js`, `var f${i} = ${v}\n`]));
  const r = await run(many("1"), many("2"), "mix format", ["--", "src"]);
  assert.deepEqual(setAside(r), []);
  assert.equal(r.mechanicalCheck.setAside, 0);
  assert.deepEqual(listed(r), [["mix format", "files"]]);
});
