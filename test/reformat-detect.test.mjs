// @ts-check
// Reformat detection: a commit that only changed whitespace or quotes is listed under the table, and --ignore-rev
// applies a revision to the blame. Fixtures are in scripts/fixtures.mjs (quotes, indent, pureIndent, feature).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PEOPLE, buildFixture, commitAs, createRepo, git, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderGroups, renderMarkdown, renderJson, normaliseForFormat, isFormatOnlyChange, findReformatSuspects } = await import("../bin/surviving-lines.js");

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
/** @param {string} dir @param {string} rev */
const shaOf = (dir, rev) => git(dir, ["rev-parse", rev]).trim();
/** The block's header when the correction is applied (the default). */
const TITLE = "reformat commit ignored (looks like whitespace and quote changes only): 1 commit";
/** The block's header when the suspects are only listed (--keep-reformat, --co-authors share). */
const LISTED = "reformat suspected (looks like whitespace and quote changes only): 1 commit";

test("a quote-only reformat is flagged: the rows keep its author, the ignored view gives the lines back", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    // Bob's 30 quote changes are not counted: Ada's 30 original lines are hers again. Ada's notes file is 5 lines.
    assert.deepEqual(linesByMail(r), { [mailOf("ada")]: 35, [mailOf("bob")]: 0 });
    assert.equal(r.reformat.detection, true);
    assert.equal(r.reformat.suspects.length, 1);
    const [s] = r.reformat.suspects;
    assert.equal(s.sha, shaOf(dir, "HEAD~1"));
    assert.equal(s.shortSha, s.sha.slice(0, 7));
    assert.equal(s.subject, "style: switch app.js to double quotes");
    assert.equal(s.author, PEOPLE.bob[0]);
    assert.equal(s.mail, mailOf("bob"));
    assert.equal(s.date, "2026-02-01");
    assert.equal(s.filesChanged, 1);
    assert.equal(s.changedLines, 60);
    assert.equal(s.survivingLines, 30);
    assert.equal(r.reformat.uncorrected.linesAttributed, 35);
    assert.deepEqual(r.reformat.uncorrected.authors.map((/** @type {any} */ a) => [a.author, a.lines]), [
      [PEOPLE.bob[0], 30],
      [PEOPLE.ada[0], 5],
    ]);
    const text = renderTable(r, 10);
    assert.ok(text.includes(TITLE), text);
    assert.ok(text.includes(`  commit ${s.shortSha} "style: switch app.js to double quotes" rewrote 30 lines in 1 file (formatting only)`), text);
    assert.doesNotMatch(text, /Bob[^\n]*30 lines in the plain count|Bob 30 \(/, "no line total next to the committer's name");
    assert.ok(text.includes(`  The table above does not count it. Authors who gain lines from this: Ada 35 (100.0%) with the correction, 5 (14.3%) without. --keep-reformat counts it; --ignore-rev ${s.shortSha} (or an entry in .git-blame-ignore-revs) sets it aside by hand.`), text);
    assert.ok(text.indexOf(TITLE) > text.indexOf("author "), "the block comes after the table");
    assert.ok(text.indexOf(TITLE) < text.indexOf("What this cannot show"), "the block comes before the closing lines");
  });
});

test("a reformat that also re-indents and breaks long calls over lines is flagged", async () => {
  await withFixture("indent", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.equal(r.reformat.suspects.length, 1);
    const [s] = r.reformat.suspects;
    assert.equal(s.sha, shaOf(dir, "HEAD"));
    assert.equal(s.author, PEOPLE.bob[0]);
    assert.equal(s.survivingLines, 100);
    assert.ok(renderTable(r, 10).includes(TITLE));
  });
});

test("a pure re-indentation is not flagged: blame -w already gives those lines to their author, so nothing changes", async () => {
  await withFixture("pureIndent", async (dir) => {
    const on = await analyse(parseArgs(["--cwd", dir]));
    const off = await analyse(parseArgs(["--cwd", dir, "--no-detect-reformat"]));
    assert.deepEqual(on.reformat.suspects, []);
    assert.equal(on.reformat.uncorrected, null, "the suspects are listed, and there is no second count");
    assert.deepEqual(linesByMail(on), linesByMail(off));
    // Bob keeps a row with no lines: the row is his commit count, which the table has always shown.
    assert.deepEqual(linesByMail(on), { [mailOf("ada")]: 30, [mailOf("bob")]: 0 });
    assert.doesNotMatch(renderTable(on, 10), /reformat suspected/);
  });
});

test("a feature commit and a rename are not flagged, though each keeps 20 or more surviving lines", async () => {
  await withFixture("feature", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    // The guard is only meaningful if the commits were candidates: Bob 90 + 200 lines, Charlie 30 lines, Ada 20 lines.
    assert.deepEqual(linesByMail(r), { [mailOf("bob")]: 290, [mailOf("ada")]: 20, [mailOf("charlie")]: 30 });
    assert.deepEqual(r.reformat.suspects, []);
    assert.doesNotMatch(renderTable(r, 10), /reformat suspected/);
  });
});

test("--ignore-rev gives a revision's lines back, is repeatable, and is printed with its short id", async () => {
  await withFixture("quotes", async (dir) => {
    const bob = shaOf(dir, "HEAD~1");
    const notes = shaOf(dir, "HEAD");
    const r = await analyse(parseArgs(["--cwd", dir, "--ignore-rev", bob, "--ignore-rev", notes]));
    assert.deepEqual(linesByMail(r), { [mailOf("ada")]: 35, [mailOf("bob")]: 0 });
    assert.deepEqual(r.blame.ignoreRevs, [bob, notes]);
    assert.deepEqual(r.blame.flags, ["-w", "-M", "-C", "--ignore-rev", bob.slice(0, 7), "--ignore-rev", notes.slice(0, 7)]);
    // A revision that the blame already skips is not a candidate again.
    assert.deepEqual(r.reformat.suspects, []);
  });
});

test("--ignore-rev with a name that is not a commit stops the run, and the option needs a value", async () => {
  await withFixture("quotes", async (dir) => {
    await assert.rejects(analyse(parseArgs(["--cwd", dir, "--ignore-rev", "no-such-rev"])), /--ignore-rev no-such-rev does not resolve to a commit/);
  });
  assert.throws(() => parseArgs(["--ignore-rev"]), /--ignore-rev needs a value/);
  assert.deepEqual(parseArgs(["--ignore-rev", "a", "--ignore-rev", "b"]).ignoreRevs, ["a", "b"]);
});

test("--no-detect-reformat prints no block and leaves the suspects empty, and detection is on by default", async () => {
  assert.equal(parseArgs([]).detectReformat, true);
  assert.equal(parseArgs(["--no-detect-reformat"]).detectReformat, false);
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--no-detect-reformat"]));
    assert.deepEqual(r.reformat, { detection: false, applied: false, suspects: [], uncorrected: null });
    assert.doesNotMatch(renderTable(r, 10), /reformat suspected/);
    assert.deepEqual(linesByMail(r), { [mailOf("bob")]: 30, [mailOf("ada")]: 5 });
  });
});

/** The bots table as it printed before the reformat feature existed. Changing it means changing what users see. */
const SNAPSHOT_BOTS_TABLE = [
  `ref HEAD  ·  files 8/8 sampled (1 in 1)  ·  23 of 43 lines attributed`,
  `git blame -w -M -C  ·  commits 5, merges excluded`,
  `history: 25 days old (8 commits); a short window, not an import`,
  `workflow: rebase or direct commits (0 merge commits, 0% of subjects end in "(#NNN)"); lines are credited to the commit authors`,
  ``,
  `author           lines   share  commits   share`,
  `-----------------------------------------------`,
  `Ada                 11   47.8%        2   40.0%`,
  `Bob                  6   26.1%        1   20.0%`,
  `Botticelli           4   17.4%        1   20.0%`,
  `Bot Hawkins          2    8.7%        1   20.0%`,
  `top: Ada holds 11 non-blank lines (47.8%), 11 counting blank lines (47.8%)`,
  ``,
  `bus factor 2: Ada and Bob together hold 73.9% of 23 surviving lines · to reach 80%: 3 authors`,
  `active bus factor 2 (50% of the 23 lines held by the 4 authors active in the last 365 days): Ada and Bob together; everyone who holds lines committed in that window`,
  `bus factor = the smallest number of authors whose surviving lines together reach 50% of the lines counted (change with --bus-factor-threshold). It measures how concentrated the code that is left is, not who understands it.`,
  ``,
  `bots excluded: 2 identities (dependabot[bot], renovate[bot]), 20 lines, 3 commits (--include-bots counts them)`,
  ``,
  `mechanical rewrites checked: examined 8 commits holding surviving lines, set aside 0; no other commit looks mechanical (at least 10 files with the same small change, or a formatter, lint fix, codemod or rename tool in the subject).`,
  ``,
  `What this cannot show: quality of the lines, review work, design done in documents,`,
  `or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit.`,
].join("\n");

test("a repository with no suspect prints the same table as before the feature", async () => {
  await withFixture("bots", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.equal(renderTable(r, 10), SNAPSHOT_BOTS_TABLE);
  });
});

test("the JSON validates against the published schema with and without a suspect", async () => {
  const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), []);
  });
  await withFixture("bots", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), []);
  });
});

test("--group-by prints only the header and the hint of the block, not the comparison", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--group-by", "dir"]));
    const text = renderGroups(r, 10);
    assert.ok(text.includes(TITLE), text);
    assert.ok(text.includes("  The table above does not count it. Authors who gain lines from this: "), text);
    assert.doesNotMatch(text, /the numbers above include/);
    assert.equal(r.reformat.suspects.length, 1);
    assert.equal(r.reformat.applied, true);
    assert.ok(r.reformat.uncorrected, "the plain count is kept for the block");
  });
});

test("--csv keeps stdout to the data and names the suspects on stderr", async () => {
  await withFixture("quotes", async (dir) => {
    const bin = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
    const run = spawnSync(process.execPath, [bin, "--cwd", dir, "--csv"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.doesNotMatch(run.stdout, /reformat/);
    assert.match(run.stderr, /^surviving-lines: reformat commit ignored \(looks like whitespace and quote changes only\): 1 commit\n(surviving-lines: {1,3}.*\n)*$/);
    assert.match(run.stderr, /surviving-lines:   commit [0-9a-f]{7} .* rewrote 30 lines in 1 file \(formatting only\).*--keep-reformat counts it/s);
  });
});

test("normaliseForFormat drops every whitespace character and turns single quotes into double, and nothing else", () => {
  assert.equal(normaliseForFormat("a = 'x';\n  b"), 'a="x";b');
  assert.equal(normaliseForFormat("\t// `a`;\r\n"), "//`a`;");
});

test("isFormatOnlyChange accepts a quote or spacing change and rejects a token change or an identical text", () => {
  assert.equal(isFormatOnlyChange("const a = 'x';", 'const a = "x";'), true);
  assert.equal(isFormatOnlyChange("f(a,\n  b)", "f(a, b)"), true);
  assert.equal(isFormatOnlyChange("const a = 1;", "const b = 1;"), false, "a changed identifier is a code change");
  assert.equal(isFormatOnlyChange("a;", "a"), false, "a removed semicolon is a code change");
  assert.equal(isFormatOnlyChange("x = 1", "x = 1"), false, "an identical text is not a change");
});


/** Two formatters on two files, one quote change each, so two suspects with 25 surviving lines apiece. */
function twoFormatters() {
  const dir = createRepo("sl-two-formatters-");
  const quoted = (/** @type {string} */ q) => Array.from({ length: 25 }, (_, i) => `x(${q}${i}${q});`).join("\n") + "\n";
  commitAs(dir, "ada", "2026-01-10T10:00:00Z", "ada: two files", { "src/a.js": quoted("'"), "src/b.js": quoted("'").replace(/x\(/g, "y(") });
  const bob = commitAs(dir, "bob", "2026-02-01T10:00:00Z", "style: quotes a", { "src/a.js": quoted('"') });
  const charlie = commitAs(dir, "charlie", "2026-02-02T10:00:00Z", "style: quotes b", { "src/b.js": quoted('"').replace(/x\(/g, "y(") });
  return { dir, bob, charlie };
}

test("two suspects at once: the header counts both and the hint names both full ids", async () => {
  const { dir, bob, charlie } = twoFormatters();
  try {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.deepEqual(r.reformat.suspects.map((s) => s.sha).sort(), [bob, charlie].sort());
    const text = renderTable(r, 10);
    assert.ok(text.includes("reformat commits ignored (looks like whitespace and quote changes only): 2 commits"), text);
    assert.ok(text.includes("  The table above does not count them. Authors who gain lines from this: "), text);
    assert.equal(r.reformat.uncorrected.linesAttributed, 50);
    assert.equal(r.sample.linesAttributed, 50);
  } finally {
    removeRepo(dir);
  }
});

test("--markdown prints the same block under the table", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    const md = renderMarkdown(r, 10);
    assert.ok(md.includes(TITLE), md);
    assert.ok(md.includes("  The table above does not count it. Authors who gain lines from this: "), md);
    assert.ok(md.indexOf("| Bob |") < md.indexOf(TITLE), "the block comes after the table");
  });
});

test("--co-authors share lists the suspect, leaves the numbers alone, and says so in one line", async () => {
  await withFixture("quotes", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--co-authors", "share"]));
    assert.equal(r.reformat.suspects.length, 1);
    assert.equal(r.reformat.applied, false);
    assert.equal(r.reformat.uncorrected, null);
    const text = renderTable(r, 10);
    assert.ok(text.includes(LISTED), text);
    assert.doesNotMatch(text, /without the correction/);
  });
});

test("a result from before the reformat key existed renders with no block and no error", () => {
  const authors = [{ author: "Ada", mail: "a@example.com", lines: 10, lineShare: 1, commits: 1, commitShare: 1 }];
  const old = { ref: "HEAD", authors, sample: { filesSampled: 1, filesTotal: 1, every: 1, seed: "", linesAttributed: 10, linesInRef: 10 }, commitWindow: { commits: 1, since: null, until: null }, blame: { flags: ["-w"] }, grouping: null };
  assert.doesNotMatch(renderTable(/** @type {any} */ (old), 10), /reformat/);
  assert.doesNotMatch(renderMarkdown(/** @type {any} */ (old), 10), /reformat/);
  assert.doesNotMatch(renderGroups(/** @type {any} */ ({ ...old, grouping: { by: "dir:1", groups: [] } }), 10), /reformat/);
});

test("a git failure while judging one candidate leaves that candidate out and the run goes on", async () => {
  const { dir, bob, charlie } = twoFormatters();
  try {
    const blamed = new Map([
      [bob, { name: "Bob", mail: "bob@example.com", lines: 25 }],
      [charlie, { name: "Charlie", mail: "charlie@example.com", lines: 25 }],
    ]);
    // Every git call about Charlie's commit fails: its subject, its file list, its file contents.
    const run = async (/** @type {string[]} */ args) => {
      if (args.some((a) => a.includes(charlie))) throw new Error("fatal: bad object");
      return git(dir, args);
    };
    const suspects = await findReformatSuspects({ cwd: dir, ref: "HEAD", jobs: 1 }, blamed, 50, run);
    assert.deepEqual(suspects.map((s) => s.sha), [bob]);
  } finally {
    removeRepo(dir);
  }
});

test("a candidate whose line counts git does not give is not a suspect, and does not stop the others", async () => {
  const { dir, bob, charlie } = twoFormatters();
  try {
    const blamed = new Map([
      [bob, { name: "Bob", mail: "bob@example.com", lines: 25 }],
      [charlie, { name: "Charlie", mail: "charlie@example.com", lines: 25 }],
    ]);
    // Charlie's numstat comes back empty: the file is in the name list with no count.
    const run = async (/** @type {string[]} */ args) => {
      if (args.includes("--numstat") && args.includes(charlie)) return "";
      return git(dir, args);
    };
    const suspects = await findReformatSuspects({ cwd: dir, ref: "HEAD", jobs: 1 }, blamed, 50, run);
    assert.deepEqual(suspects.map((s) => s.sha), [bob]);
  } finally {
    removeRepo(dir);
  }
});
