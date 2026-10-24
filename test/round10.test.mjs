// @ts-check
// Round 10 (R10-1 to R10-5): both line bases side by side, the --files view, whitespace-only commits, and the git
// settings pinned on every call. Repositories are built inside each test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo, commitAsIdentity, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderCsv, renderMarkdown, renderJson, renderFiles, busFactorLine, findWhitespaceOnlyCommits, whitespaceOnlyLine } = await import("../bin/surviving-lines.js");
const SCHEMA = JSON.parse(readFileSync(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));

/** @param {number} i */
const day = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().replace(/\.\d{3}Z$/, "Z");
/** @param {number} n @param {string} p */
const code = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`).join("\n") + "\n";
/** @param {number} n */
const blanks = (n) => "\n".repeat(n);

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} fn */
async function withRepo(build, fn) {
  const dir = createRepo("sl-r10-");
  try {
    build(dir);
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

test("R10-1: blank lines dropped, so the table, CSV, Markdown and the bus factor line carry both bases", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { "a.js": code(6, "a") });
      commitAsIdentity(dir, ["Bob", "bob@x.org"], day(1), "b", { "b.js": code(5, "b") });
      commitAsIdentity(dir, ["Cy", "cy@x.org"], day(2), "c", { "c.js": code(5, "c") + blanks(30) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      const cy = r.authors.find((a) => a.author === "Cy");
      assert.equal(cy?.lines, 5);
      assert.equal(cy?.linesWithBlank, 35);
      assert.ok(Math.abs((cy?.shareWithBlank ?? 0) - 35 / 46) < 1e-9);
      // The rows stay ordered by non-blank lines.
      assert.deepEqual(r.authors.map((a) => a.author), ["Ann", "Bob", "Cy"]);
      assert.equal(r.busFactor?.value, 2);
      assert.equal(r.busFactor?.withBlank?.value, 1);
      assert.equal(r.busFactor?.withBlank?.total, 46);
      const text = renderTable(r, null);
      assert.match(text, /author\s+lines\s+share\s+with blank\s+share\s+commits\s+share/);
      assert.match(text, /Cy\s+5\s+31\.3%\s+35\s+76\.1%/);
      const bus = text.split("\n").find((l) => l.startsWith("bus factor"));
      assert.match(bus ?? "", /^bus factor 2: Ann and Bob together hold 68\.8% of 16 non-blank lines \(23\.9% of 46 lines with blank lines\) · to reach 80%: 3 authors · counting blank lines: bus factor 1, to reach 80%: 2 authors$/);
      assert.match(renderCsv(r), /^author,mail,lines,line_share,commits,commit_share,lines_with_blank,line_share_with_blank\n/);
      assert.match(renderCsv(r), /Cy,cy@x\.org,5,0\.3125,1,0\.3333,35,0\.7609/);
      assert.match(renderMarkdown(r, 10), /\| author \| lines \| line share \| with blank \| share with blank \| commits \| commit share \|/);
      assert.deepEqual(schemaErrors(SCHEMA, JSON.parse(renderJson(r))), []);
    },
  );
});

test("R10-1: the with-blank count follows --exclude, bots and merged identities like the other count", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { "a.js": code(4, "a") + blanks(2), "skip.js": code(3, "s") + blanks(7) });
      commitAsIdentity(dir, ["ci[bot]", "bot@x.org"], day(1), "bot", { "bot.js": code(2, "t") + blanks(9) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir, "--exclude", "skip.js"]));
      assert.equal(r.authors.length, 1);
      const ann = r.authors.find((a) => a.author === "Ann");
      assert.equal(ann?.lines, 4);
      assert.equal(ann?.linesWithBlank, 6);
      assert.equal(ann?.shareWithBlank, 1);
    },
  );
});

test("R10-1: with no dropped blank line the text output has no new column and the old bus factor wording", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { "a.js": code(6, "a") });
      commitAsIdentity(dir, ["Bob", "bob@x.org"], day(1), "b", { "b.js": code(2, "b") });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      const text = renderTable(r, null);
      assert.doesNotMatch(text, /with blank/);
      assert.match(text, /^bus factor 1: Ann alone holds 75\.0% of 8 surviving lines · to reach 80%: 2 authors$/m);
      assert.match(renderCsv(r), /^author,mail,lines,line_share,commits,commit_share\n/);
      assert.match(renderMarkdown(r, 10), /\| author \| lines \| line share \| commits \| commit share \|/);
      assert.equal(r.authors[0].linesWithBlank, r.authors[0].lines);
      assert.equal(r.authors[0].shareWithBlank, r.authors[0].lineShare);
      assert.deepEqual(r.busFactor?.withBlank?.authors, r.busFactor?.authors);
      assert.equal(busFactorLine(r.busFactor, r.authors), "bus factor 1: Ann alone holds 75.0% of 8 surviving lines · to reach 80%: 2 authors");
      assert.deepEqual(schemaErrors(SCHEMA, JSON.parse(renderJson(r))), []);
    },
  );
});

test("R10-2: --files prints one row per file with the top owner and the next two, and a summary line", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { "big.js": code(10, "x"), "solo.js": code(5, "s"), "small.js": code(2, "m") });
      commitAsIdentity(dir, ["Bob", "bob@x.org"], day(1), "b", { "big.js": code(10, "x").replace("x0\n", "y0\n").replace("x1\n", "y1\n").replace("x2\n", "y2\n") + code(8, "z") });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir, "--files", "3"]));
      assert.deepEqual(r.files?.map((f) => f.path), ["big.js", "solo.js", "small.js"].slice(0, 3));
      assert.equal(r.files?.[0].lines, 18);
      assert.deepEqual(r.files?.[0].owners.map((o) => o.name), ["Bob", "Ann"]);
      assert.equal(r.filesSummary?.total, 3);
      const text = renderFiles(r);
      assert.match(text, /^big\.js\s+18\s+Bob\s+61\.1%\s+Ann 38\.9%$/m);
      assert.match(text, /^solo\.js\s+5\s+Ann\s+100\.0%$/m);
      assert.match(text, /^files: 3; one owner above 80% in 2; no owner above 50% in 0$/m);
      assert.deepEqual(schemaErrors(SCHEMA, JSON.parse(renderJson(r))), []);
      const one = await analyse(parseArgs(["--cwd", dir, "--files", "1"]));
      assert.equal(one.files?.length, 1);
      assert.match(renderFiles(one), /^… 2 more files$/m);
      const plain = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(plain.files, null);
    },
  );
});

test("R10-2: --files defaults to 25 rows and is refused with the views that print their own table", () => {
  assert.equal(parseArgs(["--files"]).files, 25);
  assert.equal(parseArgs(["--files", "4", "--json"]).files, 4);
  assert.deepEqual(parseArgs(["--files", "--", "src"]).paths, ["src"]);
  for (const other of [["--group-by", "dir"], ["--csv"], ["--markdown"], ["--identities"], ["--reviewers", "src"], ["--history", "src"], ["--co-authors", "share"]]) {
    assert.throws(() => parseArgs(["--files", ...other]), /--files prints its own view/);
  }
  assert.throws(() => parseArgs(["--files", "0"]), /--files must be an integer >= 1/);
});

/** @param {string} dir */
function lineEndingFixture(dir) {
  commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "write", { "src/e.js": code(30, "e"), "src/f.js": code(30, "f") });
  commitAsIdentity(dir, ["Kai", "kai@x.org"], day(1), "Fix line endings in e.js", { "src/e.js": code(30, "e").replace(/\n/g, "\r\n") });
  // Changes code in one line as well as the endings: -w still sees it, so it is not whitespace-only.
  commitAsIdentity(dir, ["Lee", "lee@x.org"], day(2), "Endings and a fix in f.js", { "src/f.js": code(30, "f").replace("f3\n", "g3\n").replace(/\n/g, "\r\n") });
}

test("R10-3: a commit that only changed line endings is listed with who holds the file now; one that also changed code is not", async () => {
  await withRepo(lineEndingFixture, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.equal(r.whitespaceOnlyCommits.length, 1);
    const c = r.whitespaceOnlyCommits[0];
    assert.equal(c.author, "Kai");
    assert.equal(c.subject, "Fix line endings in e.js");
    assert.equal(c.lines, 30);
    assert.deepEqual(c.files[0], { path: "src/e.js", lines: 30, topOwner: "Ann", topShare: 1, topOwnerLines: 30, fileLines: 30 });
    assert.equal(r.authors.find((a) => a.author === "Kai")?.lines, 0);
    const text = renderTable(r, null);
    assert.match(text, /^whitespace-only commits \(git blame -w gives them no lines\): [0-9a-f]{7} "Fix line endings in e\.js" by Kai, 30 lines in src\/e\.js \(now: Ann 100\.0%, 30 of 30 lines\)$/m);
    assert.deepEqual(schemaErrors(SCHEMA, JSON.parse(renderJson(r))), []);
  });
});

test("R10-3: a history with no such commit adds no line, and a bot's commit is not listed", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "write", { "e.js": code(30, "e") });
      commitAsIdentity(dir, ["fmt[bot]", "bot@x.org"], day(1), "endings", { "e.js": code(30, "e").replace(/\n/g, "\r\n") });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(r.whitespaceOnlyCommits, []);
      assert.doesNotMatch(renderTable(r, null), /whitespace-only/);
      assert.equal(whitespaceOnlyLine(r), null);
    },
  );
});

test("R10-3: the check stops at its time limit and says so, and changes no number", async () => {
  // A git that takes a second on `log`, so the 50 ms limit is reached on any machine (a 1 ms limit is not reliable:
  // on a fast Linux container a small `git log` can finish first).
  const bin = mkdtempSync(join(tmpdir(), "sl-r10-slow-"));
  const real = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  writeFileSync(join(bin, "git"), `#!/bin/sh\ncase " $* " in *" log "*) sleep 1;; esac\nexec "${real}" "$@"\n`);
  chmodSync(join(bin, "git"), 0o755);
  const oldPath = process.env.PATH;
  try {
    await withRepo(lineEndingFixture, async (dir) => {
      const o = parseArgs(["--cwd", dir]);
      process.env.PATH = `${bin}:${oldPath}`;
      const res = await findWhitespaceOnlyCommits(o, new Set(["src/e.js"]), new Set(), { blameArgs: ["blame", "--line-porcelain"], perFile: new Map(), nameOf: new Map(), canonicalOf: new Map() }, { timeoutMs: 50 });
      process.env.PATH = oldPath;
      assert.equal(res.skipped, true);
      assert.deepEqual(res.commits, []);
      assert.equal(whitespaceOnlyLine({ whitespaceOnlySkipped: true }), "whitespace-only check skipped (history too large)");
    });
  } finally {
    process.env.PATH = oldPath;
    rmSync(bin, { recursive: true, force: true });
  }
});

test("R10-5: every git call passes core.quotepath=off, log.showSignature=false and color.ui=never", async () => {
  const bin = mkdtempSync(join(tmpdir(), "sl-r10-bin-"));
  const logFile = join(bin, "calls.log");
  const real = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  writeFileSync(join(bin, "git"), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${logFile}"\nexec "${real}" "$@"\n`);
  chmodSync(join(bin, "git"), 0o755);
  const oldPath = process.env.PATH;
  const dir = createRepo("sl-r10-cfg-");
  try {
    commitAsIdentity(dir, ["Ann", "ann@x.org"], day(0), "a", { "café.js": code(3, "a") });
    process.env.PATH = `${bin}:${oldPath}`;
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.equal(r.authors[0].lines, 3);
    const mine = readFileSync(logFile, "utf8").split("\n").filter((l) => l.startsWith("-c core.precomposeunicode=false"));
    assert.ok(mine.length > 3);
    for (const l of mine) assert.match(l, /^-c core\.precomposeunicode=false -c core\.quotepath=off -c log\.showSignature=false -c color\.ui=never /);
  } finally {
    process.env.PATH = oldPath;
    removeRepo(dir);
    rmSync(bin, { recursive: true, force: true });
  }
});
