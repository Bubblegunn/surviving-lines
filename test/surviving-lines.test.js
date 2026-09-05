// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const bin = pathToFileURL(join(import.meta.dirname, "..", "bin", "surviving-lines.js")).href;
const { parseArgs, fnv1a, inSample, globToRegExp, selected, countBlameLines, analyse, renderTable, renderCsv, renderMarkdown } = await import(bin);

/** Build a small repository with two authors, a rewrite, a rename and a binary file. */
async function fixtureRepo() {
  const dir = await mkdtemp(join(tmpdir(), "surviving-lines-"));
  const g = (/** @type {string[]} */ args, who = "ada") => {
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: who === "ada" ? "Ada" : "Bob",
      GIT_AUTHOR_EMAIL: who === "ada" ? "ada@example.com" : "bob@example.com",
      GIT_COMMITTER_NAME: "CI",
      GIT_COMMITTER_EMAIL: "ci@example.com",
      GIT_AUTHOR_DATE: who === "ada" ? "2026-01-10T10:00:00Z" : "2026-03-10T10:00:00Z",
      GIT_COMMITTER_DATE: who === "ada" ? "2026-01-10T10:00:00Z" : "2026-03-10T10:00:00Z",
    };
    return execFileSync("git", args, { cwd: dir, env, encoding: "utf8" });
  };
  g(["init", "-q", "-b", "main"]);
  g(["config", "core.autocrlf", "false"]);
  await mkdir(join(dir, "src"));
  // Ada writes two files: 10 lines and 5 lines.
  await writeFile(join(dir, "src", "a.js"), Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n") + "\n");
  await writeFile(join(dir, "src", "b.js"), Array.from({ length: 5 }, (_, i) => `b ${i}`).join("\n") + "\n");
  await writeFile(join(dir, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]));
  g(["add", "."]);
  g(["commit", "-q", "-m", "ada: initial"]);
  // Bob rewrites 4 of Ada's 10 lines in a.js and adds a 6-line file; then renames b.js.
  await writeFile(join(dir, "src", "a.js"), ["line 0", "line 1", "line 2", "line 3", "line 4", "line 5", "bob 6", "bob 7", "bob 8", "bob 9"].join("\n") + "\n");
  await writeFile(join(dir, "src", "c.js"), Array.from({ length: 6 }, (_, i) => `c ${i}`).join("\n") + "\n");
  g(["add", "."], "bob");
  g(["commit", "-q", "-m", "bob: rewrite tail, add c"], "bob");
  g(["mv", "src/b.js", "src/renamed.js"], "bob");
  g(["commit", "-q", "-m", "bob: rename b"], "bob");
  return dir;
}

test("fnv1a is stable and inSample is deterministic", () => {
  assert.equal(fnv1a("hello"), 0x4f9f2cab);
  assert.equal(inSample("any/path.ts", 1, ""), true);
  const a = inSample("src/x.ts", 7, "s1");
  assert.equal(inSample("src/x.ts", 7, "s1"), a);
  const paths = Array.from({ length: 7000 }, (_, i) => `src/file-${i}.ts`);
  const picked = paths.filter((p) => inSample(p, 7, "")).length;
  assert.ok(picked > 800 && picked < 1200, `1-in-7 sample of 7000 picked ${picked}`);
});

test("globs: ** crosses directories, * stays in a segment, bare patterns match basenames", () => {
  assert.equal(globToRegExp("src/**/*.ts").test("src/a/b/c.ts"), true);
  assert.equal(globToRegExp("src/**/*.ts").test("src/c.ts"), true);
  assert.equal(globToRegExp("src/*.ts").test("src/a/c.ts"), false);
  assert.equal(globToRegExp("*.test.ts").test("deep/x.test.ts"), false);
  assert.equal(selected("deep/x.test.ts", [], [globToRegExp("*.test.ts")], [], [true]), false);
  assert.equal(selected("deep/x.ts", [globToRegExp("**/*.ts")], [], [false], []), true);
  assert.equal(selected("deep/x.md", [globToRegExp("**/*.ts")], [], [false], []), false);
});

test("countBlameLines reads --line-porcelain and lowercases mails", () => {
  const porcelain = [
    "abc 1 1 2", "author Ada", "author-mail <Ada@Example.com>", "\tline 1",
    "abc 2 2", "author Ada", "author-mail <Ada@Example.com>", "\tline 2",
    "def 1 3 1", "author Bob", "author-mail <bob@example.com>", "\tline 3",
  ].join("\n");
  const m = countBlameLines(porcelain);
  assert.equal(m.get("ada@example.com")?.lines, 2);
  assert.equal(m.get("bob@example.com")?.lines, 1);
});

test("parseArgs validates and collects repeatable options", () => {
  const o = parseArgs(["--sample", "7", "--include", "**/*.ts", "--include", "**/*.tsx", "--exclude", "*.test.ts", "--json", "--", "src", "app"]);
  assert.equal(o.sample, 7);
  assert.deepEqual(o.include, ["**/*.ts", "**/*.tsx"]);
  assert.deepEqual(o.exclude, ["*.test.ts"]);
  assert.equal(o.json, true);
  assert.deepEqual(o.paths, ["src", "app"]);
  assert.throws(() => parseArgs(["--sample", "0"]), /--sample/);
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
});

test("analyse attributes surviving lines, follows renames, skips binaries, and counts commits", async () => {
  const dir = await fixtureRepo();
  try {
    const r = await analyse(parseArgs(["--cwd", dir]));
    // a.js: 6 Ada + 4 Bob; renamed.js: 5 Ada (rename followed by -M); c.js: 6 Bob. logo.png skipped.
    assert.equal(r.sample.filesTotal, 3);
    assert.equal(r.sample.linesAttributed, 21);
    const ada = r.authors.find((/** @type {{mail:string}} */ a) => a.mail === "ada@example.com");
    const bob = r.authors.find((/** @type {{mail:string}} */ a) => a.mail === "bob@example.com");
    assert.equal(ada?.lines, 11);
    assert.equal(bob?.lines, 10);
    assert.equal(ada?.commits, 1);
    assert.equal(bob?.commits, 2);
    assert.equal(r.commitWindow.commits, 3);
    assert.ok(Math.abs(ada.lineShare - 11 / 21) < 1e-9);

    // Window that only contains Bob's commits: blame shares unchanged, commit shares move.
    const w = await analyse(parseArgs(["--cwd", dir, "--since", "2026-02-01", "--until", "2026-04-01"]));
    assert.equal(w.commitWindow.commits, 2);
    assert.equal(w.authors.find((/** @type {{mail:string}} */ a) => a.mail === "ada@example.com")?.commits, 0);
    assert.equal(w.authors.find((/** @type {{mail:string}} */ a) => a.mail === "ada@example.com")?.lines, 11);

    // Include filter and pathspec both narrow the file set.
    const only = await analyse(parseArgs(["--cwd", dir, "--include", "src/c.js"]));
    assert.equal(only.sample.filesTotal, 1);
    assert.equal(only.sample.linesAttributed, 6);

    const table = renderTable(r, 10);
    assert.match(table, /files 3\/3 sampled/);
    const dup = renderTable({ ...r, authors: [{ ...r.authors[0], author: "Same" }, { ...r.authors[1], author: "Same" }] }, 10);
    assert.match(dup, /Same <ada@example.com>/);
    assert.match(table, /Ada\s+11\s+52\.4%\s+1\s+33\.3%/);
    assert.match(table, /What this cannot show/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("clear errors outside a repository and for a missing ref", async () => {
  const dir = await mkdtemp(join(tmpdir(), "surviving-lines-norepo-"));
  try {
    await assert.rejects(analyse(parseArgs(["--cwd", dir])), /not inside a git repository/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const repo = await fixtureRepo();
  try {
    await assert.rejects(analyse(parseArgs(["--cwd", repo, "--ref", "no-such-branch"])), /does not resolve to a commit/);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("sampling with --sample reports the sampled subset and never exceeds the total", async () => {
  const dir = await fixtureRepo();
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--sample", "2", "--seed", "x"]));
    assert.ok(r.sample.filesSampled <= r.sample.filesTotal);
    assert.equal(r.sample.every, 2);
    const again = await analyse(parseArgs(["--cwd", dir, "--sample", "2", "--seed", "x"]));
    assert.deepEqual(again.authors, r.authors);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--csv prints one row per author with fractional shares and quotes commas", async () => {
  const dir = await fixtureRepo();
  try {
    assert.equal(parseArgs(["--csv"]).csv, true);
    const r = await analyse(parseArgs(["--cwd", dir]));
    const csv = renderCsv(r);
    const lines = csv.split("\n");
    assert.equal(lines[0], "author,mail,lines,line_share,commits,commit_share");
    assert.equal(lines.length, 3);
    assert.match(lines[1], /^Ada,ada@example\.com,11,0\.5238,1,0\.3333$/);
    const quoted = renderCsv({ ...r, authors: [{ ...r.authors[0], author: 'Smith, "Ada"' }] }).split("\n")[1];
    assert.ok(quoted.startsWith('"Smith, ""Ada""",'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--markdown renders a Markdown table", async () => {
  const dir = await fixtureRepo();
  try {
    assert.equal(parseArgs(["--markdown"]).markdown, true);
    assert.throws(() => parseArgs(["--json", "--markdown"]), /mutually exclusive/);
    assert.throws(() => parseArgs(["--csv", "--markdown"]), /mutually exclusive/);
    const r = await analyse(parseArgs(["--cwd", dir]));
    const markdown = renderMarkdown(r, 10);
    assert.match(markdown, /ref HEAD.*files 3\/3 sampled \(1 in 1\).*21 of 21 lines attributed/);
    assert.match(
      markdown,
      /\| author \| lines \| line share \| commits \| commit share \|/
    );
    assert.match(
      markdown,
      /\| --- \| ---: \| ---: \| ---: \| ---: \|/
    );
    assert.match(
      markdown,
      /\| Ada \| 11 \| 52\.4% \| 1 \| 33\.3% \|/
    );
    assert.match(markdown, /What this cannot show/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});