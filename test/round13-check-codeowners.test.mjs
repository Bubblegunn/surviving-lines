// @ts-check
// Round 13: --check-codeowners [<file>], a CODEOWNERS file compared with the evidence of the run. Fixtures are tiny
// repositories with invented names and fixed dates; the head commit is dated 2026-02-01.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { commitAsIdentity, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, parseCodeowners, codeownersMatcher, checkCodeownersOf, renderCodeownersCheck, renderJson, inSample, CODEOWNERS_WARN_BYTES, CODEOWNERS_LIMIT_BYTES } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  ada: ["Ada Quill", "7+adaq@users.noreply.github.com"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "5+cald@users.noreply.github.com"],
  dee: ["Dee Fern", "dee@fern.example"],
  eli: ["Eli Voss", "eli@voss.example"],
};
/** @param {string} dir @param {string} who @param {string} date @param {Record<string, string | null>} files */
const commit = (dir, who, date, files) => commitAsIdentity(dir, WHO[who], `${date}T10:00:00Z`, `${who}: change`, files);

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-codeowners-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}

const OWNERS_FILE = [
  "# comment line",
  "/src/pay/ @cald",
  "/src/web/ bea@marsh.example",
  "/docs/ @acme/docs-team",
  "/src/lead/ @adaq @ghost",
  "/old/ bea@marsh.example",
  "!/vendor/ bea@marsh.example",
  "*.[ch] bea@marsh.example",
  "/src/empty/",
  "",
].join("\n");

/**
 * Cal committed at src/pay/ in 2024 and Ada then replaced all of it, so Cal has no line there and no commit there since.
 * @param {string} dir
 * @param {string} [file] the CODEOWNERS text
 */
function drift(dir, file = OWNERS_FILE) {
  commit(dir, "cal", "2024-02-01", { "src/pay/tmp.js": lines("tmp", 15) });
  commit(dir, "ada", "2026-01-05", { "src/pay/core.js": lines("core", 50), "src/pay/tmp.js": null, "src/lead/l.js": lines("l", 30), "src/web/w1.js": lines("w1", 10) });
  commit(dir, "bea", "2026-01-10", { "src/web/w2.js": lines("w2", 30), "docs/a.md": lines("a", 12), "tools/t.sh": lines("t", 4), "tools/u.sh": lines("u", 4), "README.md": lines("r", 3) });
  commit(dir, "bea", "2026-02-01", { ".github/CODEOWNERS": file });
}

/** @param {string} dir @param {string[]} [extra] */
const check = async (dir, extra = []) => {
  const r = await analyse(parseArgs(["--cwd", dir, "-q", "--check-codeowners", ...extra]));
  return /** @type {NonNullable<typeof r.codeownersCheck>} */ (r.codeownersCheck);
};

// Each row: pattern, path, expected. The expectations come from GitHub's documented rules: last match wins is tested
// below; here only whether one pattern covers one path.
/** @type {[string, string, boolean][]} */
const MATCH_TABLE = [
  // a bare wildcard floats to any depth
  ["*", "a.txt", true],
  ["*", "dir/a.txt", true],
  ["*.js", "a.js", true],
  ["*.js", "src/deep/a.js", true],
  ["*.js", "a.jsx", false],
  ["*.js", "src/a.js/b", false],
  ["*.log", "out.log.bak", false],
  // a leading slash anchors at the root
  ["/*.js", "a.js", true],
  ["/*.js", "src/a.js", false],
  ["/README.md", "README.md", true],
  ["/README.md", "docs/README.md", false],
  ["README.md", "docs/README.md", true],
  ["README.md", "README.mdx", false],
  // a slash inside the pattern also anchors
  ["src/*.js", "src/a.js", true],
  ["src/*.js", "x/src/a.js", false],
  ["src/*.js", "src/d/a.js", false],
  ["a/b", "a/b", true],
  ["a/b", "x/a/b", false],
  ["a/b", "a/b/c", true],
  ["*/x", "a/x", true],
  ["*/x", "a/b/x", false],
  ["*/x", "x", false],
  // dir/* covers direct children only
  ["docs/*", "docs/a.md", true],
  ["docs/*", "docs/x/a.md", false],
  ["docs/*", "src/docs/a.md", false],
  ["/docs/*", "docs/x/a.md", false],
  ["/a/*/c.js", "a/b/c.js", true],
  ["/a/*/c.js", "a/b/d/c.js", false],
  ["/a/*/c.js", "a/c.js", false],
  // a trailing slash covers the files inside a directory
  ["/docs/", "docs/a.md", true],
  ["/docs/", "docs/x/a.md", true],
  ["/docs/", "docs-old/a.md", false],
  ["/docs/", "src/docs/a.md", false],
  ["docs/", "src/docs/a.md", true],
  ["docs/", "mydocs/a.md", false],
  ["src/pay/", "src/pay", false],
  ["/build/logs/", "x/build/logs/a", false],
  // a name without a slash is a file or a directory at any depth
  ["docs", "docs", true],
  ["docs", "docs/a", true],
  ["docs", "src/docs/a", true],
  ["docs", "docs2/a", false],
  ["src", ".src/y", false],
  ["/src", "src.js", false],
  ["/src/pay", "src/pay/a.js", true],
  ["/src/pay", "src/payments/a.js", false],
  // ** crosses directories
  ["docs/**", "docs/a.md", true],
  ["docs/**", "docs/x/a.md", true],
  ["docs/**", "docs", false],
  ["/**", "a/b/c", true],
  ["**", "a/b/c", true],
  ["**/logs", "logs", true],
  ["**/logs", "a/b/logs/x", true],
  ["**/logs", "a/mylogs", false],
  ["**/logs/*.txt", "x/logs/a.txt", true],
  ["**/logs/*.txt", "x/logs/y/a.txt", false],
  ["a/**/b", "a/b", true],
  ["a/**/b", "a/x/y/b", true],
  ["a/**/b", "ab", false],
  ["/docs/**/*.md", "docs/x/y/a.md", true],
  ["/docs/**/*.md", "docs/a.txt", false],
  ["src/**/test.js", "src/test.js", true],
  ["src/**/test.js", "lib/test.js", false],
  // * stays inside one segment, even when ** is not a whole segment
  ["a*b", "axxb", true],
  ["a*b", "a/b", false],
  ["foo**bar", "fooXbar", true],
  ["foo**bar", "foo/x/bar", false],
  // matching is case sensitive; a lone slash matches nothing
  ["Docs/", "docs/a", false],
  ["/", "a", false],
  // a backslash makes the next character literal
  ["file\\ name.txt", "file name.txt", true],
  ["file\\ name.txt", "file_name.txt", false],
  ["\\#notes.md", "#notes.md", true],
  ["\\*literal", "*literal", true],
  ["\\*literal", "xliteral", false],
  [".github/", ".github/workflows/ci.yml", true],
];

test("pattern matching table: GitHub's rules for one pattern against one path", () => {
  assert.ok(MATCH_TABLE.length >= 40);
  for (const [pattern, path, expected] of MATCH_TABLE) assert.equal(codeownersMatcher(pattern)(path), expected, `${pattern} against ${path}`);
});

test("parseCodeowners reads comments, escapes, tabs, owner-less rules and lines GitHub does not apply", () => {
  const text = ["# only a comment", "", "  /a/ @x\t@y  # trailing comment", "\\#hash.md @x", "file\\ name.txt @x", "/none/", "/crlf/ @x\r", "!/neg/ @x", "/r/[ab].js @x", "/esc/\\[x @x", "a#b @x"].join("\n");
  const { rules, unsupported } = parseCodeowners(text);
  assert.deepEqual(rules.map((r) => [r.line, r.pattern, r.owners]), [
    [3, "/a/", ["@x", "@y"]],
    [4, "\\#hash.md", ["@x"]],
    [5, "file\\ name.txt", ["@x"]],
    [6, "/none/", []],
    [7, "/crlf/", ["@x"]],
    [10, "/esc/\\[x", ["@x"]],
    [11, "a#b", ["@x"]],
  ]);
  assert.deepEqual(unsupported.map((u) => [u.line, u.reason]), [[8, "negation (!)"], [9, "character range ([...])"]]);
  assert.equal(rules[0].text, "/a/ @x @y");
});

test("the last matching rule wins, a more specific later rule overrides, an earlier one does not", async () => {
  // Line 1 is covered by lines 2 and 3 for the files below it; line 4 is fully overridden by line 5 but still matches files.
  const file = ["/src/ @cald", "/src/pay/ bea@marsh.example", "/src/web/ @cald", "/docs/ @adaq", "/docs/ @cald", ""].join("\n");
  await withRepo((dir) => drift(dir, file), async (dir) => {
    const c = await check(dir);
    // src/pay/ (line 2) overrides /src/ (line 1) for core.js; /src/web/ overrides it later; line 4 is overridden by
    // line 5 for every file it matches, which does not make it stale.
    assert.deepEqual(c.stale, []);
    assert.ok(!c.shadow.concat(c.changed, c.phantom, c.inactiveDeclared).some((x) => x.line === 4), "an overridden rule covers no file");
    const lead = c.shadow.find((s) => s.line === 1);
    assert.ok(lead, "the broad rule still covers src/lead/");
    assert.equal(lead.files, 1);
    assert.ok(c.shadow.some((s) => s.line === 2 && s.author === "Ada Quill"));
  });
});

test("every finding kind on one repository: missing, stale, changed, phantom, shadow, inactive declared", async () => {
  await withRepo(drift, async (dir) => {
    const c = await check(dir);
    assert.equal(c.file, ".github/CODEOWNERS");
    assert.equal(c.rules, 6);
    assert.equal(c.filesChecked, 9);
    assert.deepEqual(c.unsupported.map((u) => [u.line, u.pattern]), [[7, "!/vendor/"], [8, "*.[ch]"]]);
    assert.equal(c.filesWithoutRule, 4);
    assert.deepEqual(c.missing, [{ dir: "tools/", files: 2 }, { dir: ".github/", files: 1 }, { dir: "(root files)", files: 1 }]);
    assert.deepEqual(c.stale.map((s) => s.line), [6, 9]);
    assert.deepEqual(c.changed.map((x) => [x.line, x.declared, x.observed.map((o) => [o.name, o.share])]), [[2, ["@cald"], [["Ada Quill", 1]]]]);
    assert.deepEqual(c.phantom.map((x) => [x.line, x.owner, x.lastCommitAtPath, x.lines]), [[2, "@cald", null, 0]]);
    assert.deepEqual(c.shadow.map((x) => [x.line, x.author, x.share]), [[2, "Ada Quill", 1]]);
    assert.deepEqual(c.inactiveDeclared.map((x) => [x.line, x.owner, x.lastCommit]), [[2, "@cald", "2024-02-01"]]);
    // The bea rule is right (75% of src/web/), so it raises nothing.
    assert.ok(![...c.changed, ...c.phantom, ...c.shadow, ...c.inactiveDeclared].some((x) => x.line === 3));
  });
});

test("team handles and handles that map to nobody are listed as not comparable and never counted as drift", async () => {
  await withRepo(drift, async (dir) => {
    const c = await check(dir);
    assert.deepEqual(c.notComparable.map((x) => [x.line, x.owner, x.reason]), [
      [4, "@acme/docs-team", "team handle"],
      [5, "@ghost", "no noreply address for this handle in the history"],
    ]);
    // The team rule covers docs/a.md, written by Bea: no finding of any kind names line 4.
    assert.ok(![...c.changed, ...c.phantom, ...c.shadow, ...c.inactiveDeclared].some((x) => x.line === 4));
    // Line 5 names Ada (30 lines) and an unmappable handle: the unmappable one could be the observed person.
    assert.ok(![...c.changed, ...c.shadow].some((x) => x.line === 5));
  });
  // A rule that names an unmappable handle beside Cal is not checked for changed or shadow: the handle could be Ada.
  await withRepo((dir) => drift(dir, "/src/lead/ @cald @ghost\n"), async (dir) => {
    const c = await check(dir);
    assert.deepEqual([c.changed, c.shadow].map((l) => l.length), [0, 0]);
    assert.deepEqual(c.notComparable.map((x) => x.owner), ["@ghost"]);
    // Cal's own facts are still checked: he holds no line there and left in 2024.
    assert.deepEqual(c.phantom.map((x) => x.owner), ["@cald"]);
  });
  const onlyTeam = ["/src/ @acme/core", ""].join("\n");
  await withRepo((dir) => drift(dir, onlyTeam), async (dir) => {
    const c = await check(dir);
    assert.deepEqual([c.changed, c.phantom, c.shadow, c.inactiveDeclared].map((l) => l.length), [0, 0, 0, 0]);
    assert.equal(c.notComparable.length, 1);
  });
});

test("an address is compared by equality, and a noreply address by its login", async () => {
  const file = ["/src/web/ BEA@Marsh.example", "/src/lead/ ada@elsewhere.example", "/src/pay/ 99+adaq@users.noreply.github.com", "/docs/ @AdaQ", ""].join("\n");
  await withRepo((dir) => drift(dir, file), async (dir) => {
    const c = await check(dir);
    // BEA@Marsh.example is Bea in any case: nothing is reported for line 1.
    assert.ok(![...c.changed, ...c.shadow, ...c.phantom, ...c.inactiveDeclared].some((x) => x.line === 1));
    // An address nobody committed with cannot be mapped.
    assert.deepEqual(c.notComparable.map((x) => [x.line, x.reason]), [[2, "no commit under this address in the history"]]);
    // Line 3 is Ada's noreply address under another id, which names the same login: she holds all of src/pay/.
    assert.ok(![...c.changed, ...c.shadow, ...c.phantom].some((x) => x.line === 3));
    // Line 4 is the handle @AdaQ, compared without case: it maps to Ada, who wrote none of docs/ (Bea did).
    assert.ok(c.changed.some((x) => x.line === 4));
    assert.ok(!c.notComparable.some((x) => x.line === 3 || x.line === 4));
  });
});

test("an owner-less rule is intentional: its files are covered and it is not checked", async () => {
  const file = ["/src/ @cald", "/src/pay/", "/src/lead/", "/src/web/", "/docs/", "/tools/", "/README.md", "/.github/", ""].join("\n");
  await withRepo((dir) => drift(dir, file), async (dir) => {
    const c = await check(dir);
    assert.equal(c.filesWithoutRule, 0);
    assert.deepEqual([c.changed, c.phantom, c.shadow, c.inactiveDeclared, c.stale].map((l) => l.length), [0, 0, 0, 0, 0]);
  });
});

test("observed owners need 20% of the covered lines, at most three are named", async () => {
  // src/pay/: Ada 40 and Bea 10 (exactly 20% of 50). Declared Cal holds nothing there.
  const file = ["/src/pay/ @cald", ""].join("\n");
  /** @param {number} beaLines */
  const build = (beaLines) => (/** @type {string} */ dir) => {
    commit(dir, "cal", "2025-12-01", { "elsewhere.js": lines("e", 1) });
    commit(dir, "ada", "2026-01-05", { "src/pay/a.js": lines("a", 40) });
    commit(dir, "bea", "2026-01-06", { "src/pay/b.js": lines("b", beaLines) });
    commit(dir, "bea", "2026-02-01", { ".github/CODEOWNERS": file });
  };
  await withRepo(build(10), async (dir) => {
    const c = await check(dir);
    assert.deepEqual(c.changed[0].observed.map((o) => [o.name, o.lines]), [["Ada Quill", 40], ["Bea Marsh", 10]]);
  });
  await withRepo((dir) => {
    // Bea holds 19 of 100 lines: under a fifth.
    commit(dir, "cal", "2025-12-01", { "elsewhere.js": lines("e", 1) });
    commit(dir, "ada", "2026-01-05", { "src/pay/a.js": lines("a", 81) });
    commit(dir, "bea", "2026-01-06", { "src/pay/b.js": lines("b", 19) });
    commit(dir, "bea", "2026-02-01", { ".github/CODEOWNERS": "/src/pay/ @cald\n" });
  }, async (dir) => {
    assert.deepEqual((await check(dir)).changed[0].observed.map((o) => o.name), ["Ada Quill"]);
  });
  await withRepo(build(9), async (dir) => {
    // 9 of 49 lines is 18%: Bea is not an observed owner.
    const c = await check(dir);
    assert.deepEqual(c.changed[0].observed.map((o) => o.name), ["Ada Quill"]);
  });
  const four = (/** @type {string} */ dir) => {
    commit(dir, "cal", "2025-12-01", { "elsewhere.js": lines("e", 1) });
    for (const [who, n] of [["ada", 25], ["bea", 25], ["dee", 25], ["eli", 25]]) commit(dir, /** @type {string} */ (who), "2026-01-05", { [`src/pay/${who}.js`]: lines(String(who), /** @type {number} */ (n)) });
    commit(dir, "bea", "2026-02-01", { ".github/CODEOWNERS": file });
  };
  await withRepo(four, async (dir) => {
    const c = await check(dir);
    assert.equal(c.changed[0].observed.length, 3);
  });
});

test("shadow: an undeclared person with half of the covered lines, not with less", async () => {
  const file = ["/src/pay/ @cald", ""].join("\n");
  /** @param {number} adaLines */
  const build = (adaLines) => (/** @type {string} */ dir) => {
    commit(dir, "cal", "2025-12-01", { "elsewhere.js": lines("e", 1) });
    commit(dir, "ada", "2026-01-05", { "src/pay/a.js": lines("a", adaLines) });
    commit(dir, "bea", "2026-01-06", { "src/pay/b.js": lines("b", 50) });
    commit(dir, "dee", "2026-01-07", { "src/pay/d.js": lines("d", 50) });
    commit(dir, "bea", "2026-02-01", { ".github/CODEOWNERS": file });
  };
  // Ada 100 of 200 is exactly half; Ada 98 of 198 is 49.5%.
  await withRepo(build(100), async (dir) => {
    const c = await check(dir);
    assert.equal(c.shadow.length, 1);
    assert.equal(c.shadow[0].author, "Ada Quill");
  });
  await withRepo(build(98), async (dir) => assert.deepEqual((await check(dir)).shadow, []));
});

test("phantom: no line and no commit in the covered files for 365 days; a commit inside the window clears it", async () => {
  const file = ["/src/pay/ @cald", ""].join("\n");
  /** @param {string} calDay */
  const build = (calDay) => (/** @type {string} */ dir) => {
    commit(dir, "cal", calDay, { "src/pay/core.js": lines("old", 5) });
    commit(dir, "ada", "2026-01-05", { "src/pay/core.js": lines("new", 20) });
    commit(dir, "bea", "2026-02-01", { ".github/CODEOWNERS": file });
  };
  // The head commit is dated 2026-02-01, so the window starts on 2025-02-01.
  await withRepo(build("2025-02-01"), async (dir) => assert.deepEqual((await check(dir)).phantom, []));
  await withRepo(build("2025-01-31"), async (dir) => {
    const c = await check(dir);
    assert.deepEqual(c.phantom.map((p) => [p.owner, p.lastCommitAtPath]), [["@cald", "2025-01-31"]]);
    assert.match(renderCodeownersCheck({ codeownersCheck: c, shallow: false }), /@cald holds 0 lines there and has no commit since 2025-01-31 \(365-day window before 2026-02-01\)/);
  });
});

test("a declared owner who still holds lines is not a phantom, even without a recent commit", async () => {
  await withRepo((dir) => {
    commit(dir, "cal", "2024-02-01", { "src/pay/c.js": lines("c", 10) });
    commit(dir, "ada", "2026-01-05", { "src/pay/a.js": lines("a", 40) });
    commit(dir, "bea", "2026-02-01", { ".github/CODEOWNERS": "/src/pay/ @cald\n" });
  }, async (dir) => {
    const c = await check(dir);
    assert.deepEqual(c.phantom, []);
    assert.deepEqual(c.inactiveDeclared.map((x) => x.owner), ["@cald"]);
  });
});

test("inactive declared: no commit anywhere in --active-days before the ref date", async () => {
  const file = ["/src/pay/ @cald", ""].join("\n");
  const build = (/** @type {string} */ dir) => {
    commit(dir, "cal", "2025-09-01", { "src/pay/core.js": lines("c", 5) });
    commit(dir, "ada", "2026-01-05", { "src/pay/other.js": lines("o", 20) });
    commit(dir, "bea", "2026-02-01", { ".github/CODEOWNERS": file });
  };
  // 2025-09-01 to 2026-02-01 is 153 days.
  await withRepo(build, async (dir) => {
    assert.deepEqual((await check(dir, ["--active-days", "153"])).inactiveDeclared, []);
    const c = await check(dir, ["--active-days", "152"]);
    assert.deepEqual(c.inactiveDeclared.map((x) => [x.owner, x.lastCommit]), [["@cald", "2025-09-01"]]);
    assert.equal(c.activeDays, 152);
  });
});

test("the text view: counts, the worst ten of each kind with line numbers, and a more line", async () => {
  const stale = Array.from({ length: 12 }, (_, i) => `/gone${i}/ @cald`).join("\n");
  await withRepo((dir) => drift(dir, `${stale}\n/src/pay/ @cald\n`), async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q", "--check-codeowners"]));
    const text = renderCodeownersCheck(r);
    assert.match(text, /^CODEOWNERS \(\.github\/CODEOWNERS, 13 rules\), checked against 9 files at HEAD, as of 2026-02-01\.$/m);
    assert.match(text, /^Stale \(rules that match no file\): 12\.$/m);
    assert.equal((text.match(/^ {2}line \d+ "\/gone\d+\/ @cald"$/gm) ?? []).length, 10);
    assert.match(text, /^ {2}\.\.\. and 2 more \(--json lists all\)\.$/m);
    assert.match(text, /^Missing: 8 of 9 files have no rule \(/m);
    assert.match(text, /^ {2}line 13 "\/src\/pay\/ @cald": declared @cald; observed Ada Quill 100% of 50 lines in 1 file$/m);
    assert.match(text, /^ {2}line 13 "\/src\/pay\/ @cald": Ada Quill holds 100% and is not listed$/m);
  });
});

test("a sampled run says so in the text and the JSON", async () => {
  await withRepo(drift, async (dir) => {
    const files = ["src/pay/core.js", "src/lead/l.js", "src/web/w1.js", "src/web/w2.js", "docs/a.md", "tools/t.sh", "tools/u.sh", "README.md", ".github/CODEOWNERS"];
    const seed = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"].find((x) => files.some((f) => inSample(f, 2, x)));
    assert.ok(seed);
    const r = await analyse(parseArgs(["--cwd", dir, "-q", "--sample", "2", "--seed", /** @type {string} */ (seed), "--check-codeowners"]));
    assert.equal(r.codeownersCheck?.sampleEvery, 2);
    assert.match(renderCodeownersCheck(r), /files at HEAD \(sample 1 in 2\), as of 2026-02-01\./);
    const plain = await analyse(parseArgs(["--cwd", dir, "-q", "--check-codeowners"]));
    assert.doesNotMatch(renderCodeownersCheck(plain), /sample 1 in/);
  });
});

test("the default file is the first of .github/CODEOWNERS, CODEOWNERS, docs/CODEOWNERS at the ref; an explicit file wins", async () => {
  await withRepo((dir) => {
    commit(dir, "ada", "2026-01-05", { "a.js": lines("a", 5), "docs/CODEOWNERS": "/a.js @adaq\n", "CODEOWNERS": "/a.js @adaq\n/b/ @adaq\n" });
    commit(dir, "bea", "2026-02-01", { "x.txt": "x\n" });
  }, async (dir) => {
    assert.equal((await check(dir)).file, "CODEOWNERS");
    assert.equal((await check(dir)).rules, 2);
    commit(dir, "bea", "2026-02-02", { ".github/CODEOWNERS": "/a.js @adaq\n/b/ @adaq\n/c/ @adaq\n" });
    assert.equal((await check(dir)).file, ".github/CODEOWNERS");
    assert.equal((await check(dir, ["--ref", "HEAD~1"])).file, "CODEOWNERS");
    await writeFile(join(dir, "alt.txt"), "/a.js @adaq\n");
    const alt = await check(dir, ["alt.txt"]);
    assert.deepEqual([alt.file, alt.rules], ["alt.txt", 1]);
    assert.equal((await check(dir, ["docs/CODEOWNERS"])).file, "docs/CODEOWNERS");
  });
});

test("no CODEOWNERS file: an error that lists the locations tried, and exit status 1 on the command line", async () => {
  await withRepo((dir) => commit(dir, "ada", "2026-01-05", { "a.js": lines("a", 5) }), async (dir) => {
    await assert.rejects(check(dir), /--check-codeowners: no CODEOWNERS file found; tried \.github\/CODEOWNERS at HEAD, CODEOWNERS at HEAD, docs\/CODEOWNERS at HEAD$/);
    await assert.rejects(check(dir, ["nope.txt"]), /tried nope\.txt in the working tree, nope\.txt at HEAD$/);
    const run = spawnSync(process.execPath, [join(import.meta.dirname, "..", "bin", "surviving-lines.js"), "--cwd", dir, "--check-codeowners"], { encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /tried \.github\/CODEOWNERS at HEAD, CODEOWNERS at HEAD, docs\/CODEOWNERS at HEAD/);
  });
});

test("a file near or above GitHub's size limit gets a warning, and is still read", () => {
  const input = (/** @type {string} */ text) => ({ file: "CODEOWNERS", text, ref: "HEAD", asOf: "2026-02-01", activeDays: 365, sampleEvery: 1, files: [], names: new Map(), days: new Map(), keyOf: (/** @type {string} */ m) => m, lastTouch: new Map() });
  // One comment line of exactly this many bytes, then one rule.
  const sized = (/** @type {number} */ bytes) => `${"#".repeat(bytes - "\n/a/ @x\n".length)}\n/a/ @x\n`;
  assert.equal(Buffer.byteLength(sized(1000)), 1000);
  assert.deepEqual(checkCodeownersOf(input("/a/ @x\n")).warnings, []);
  assert.deepEqual(checkCodeownersOf(input(sized(CODEOWNERS_WARN_BYTES - 1))).warnings, []);
  const near = checkCodeownersOf(input(sized(CODEOWNERS_WARN_BYTES)));
  assert.equal(near.warnings.length, 1);
  assert.match(near.warnings[0], /^the file is 2,097,152 bytes, close to GitHub's limit of 3,145,728 bytes \(3 MB\)$/);
  assert.equal(near.rules, 1);
  const atLimit = checkCodeownersOf(input(sized(CODEOWNERS_LIMIT_BYTES)));
  assert.match(atLimit.warnings[0], /close to GitHub's limit/);
  const over = checkCodeownersOf(input(sized(CODEOWNERS_LIMIT_BYTES + 1)));
  assert.match(over.warnings[0], /^the file is 3,145,729 bytes, above GitHub's limit of 3,145,728 bytes \(3 MB\); GitHub does not read it at all$/);
  assert.equal(over.rules, 1);
  assert.match(renderCodeownersCheck({ codeownersCheck: over, shallow: false }), /^Warning: the file is 3,145,729 bytes/m);
});

test("the JSON key, the text and the schema agree; the key is null unless asked", async () => {
  await withRepo(drift, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q", "--check-codeowners"]));
    assert.deepEqual(schemaErrors(JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8")), JSON.parse(renderJson(r))), []);
    assert.equal(JSON.parse(renderJson(r)).codeownersCheck.rules, 6);
    const none = await analyse(parseArgs(["--cwd", dir, "-q"]));
    assert.equal(none.codeownersCheck, null);
    assert.deepEqual(schemaErrors(JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8")), JSON.parse(renderJson(none))), []);
  });
});

test("--check-codeowners takes an optional file and is its own view", () => {
  assert.equal(parseArgs(["--check-codeowners"]).checkCodeowners, "");
  assert.equal(parseArgs(["--check-codeowners", "--json"]).checkCodeowners, "");
  assert.equal(parseArgs(["--check-codeowners", "--", "src"]).checkCodeowners, "");
  assert.equal(parseArgs(["--check-codeowners", "docs/OWNERS"]).checkCodeowners, "docs/OWNERS");
  assert.equal(parseArgs([]).checkCodeowners, undefined);
  for (const extra of [["--csv"], ["--markdown"], ["--identities"], ["--group-by", "dir"], ["--files"], ["--orphans"], ["--without", "Ada"], ["--brief"], ["--for-diff", "a..b"], ["--owned-by", "Ada"], ["--why-not", "Ada", "--", "src"], ["--suggest-codeowners", "--group-by", "dir"]]) {
    assert.throws(() => parseArgs(["--check-codeowners", ...extra]), /prints its own view; it can be combined with --json only, not with |--suggest-codeowners/, extra.join(" "));
  }
  assert.doesNotThrow(() => parseArgs(["--check-codeowners", "--json", "--active-days", "30", "--ref", "HEAD"]));
});
