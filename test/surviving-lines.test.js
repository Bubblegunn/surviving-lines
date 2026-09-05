// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const bin = pathToFileURL(join(import.meta.dirname, "..", "bin", "surviving-lines.js")).href;
const { parseArgs, fnv1a, inSample, globToRegExp, selected, countBlameLines, analyse, renderTable, renderCsv, renderMarkdown, displayWidth, foldIdentity, githubLogin, linkIdentities, renderIdentities } = await import(bin);

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
/**
 * A repository whose paths are stored decomposed (NFD), which is what a checkout authored on
 * Linux carries for Korean, French, Turkish, Vietnamese, Portuguese and Spanish names. macOS
 * normalises filenames on the filesystem, so the entries are written straight into the index.
 * @returns {Promise<string>}
 */
async function nfdRepo() {
  const dir = await mkdtemp(join(tmpdir(), "surviving-lines-nfd-"));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Ada",
    GIT_AUTHOR_EMAIL: "ada@example.com",
    GIT_COMMITTER_NAME: "Ada",
    GIT_COMMITTER_EMAIL: "ada@example.com",
    GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
    GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  };
  const g = (/** @type {string[]} */ args, /** @type {Buffer|undefined} */ input) =>
    execFileSync("git", args, { cwd: dir, env, input, encoding: "buffer" });
  g(["init", "-q", "-b", "main"]);
  const names = ["café.ts", "모듈.ts", "İstanbul.ts", "plain.ts"].map((n) => n.normalize("NFD"));
  const entries = [];
  for (const [i, name] of names.entries()) {
    const body = Buffer.from(Array.from({ length: 10 }, (_, j) => `line ${j} of ${i}`).join("\n") + "\n");
    const blob = String(g(["hash-object", "-w", "--stdin"], body)).trim();
    entries.push(Buffer.concat([Buffer.from(`100644 ${blob}\t`), Buffer.from(name, "utf8"), Buffer.from("\n")]));
  }
  g(["update-index", "--add", "--index-info"], Buffer.concat(entries));
  const tree = String(g(["write-tree"])).trim();
  const commit = String(g(["commit-tree", tree, "-m", "init"])).trim();
  g(["update-ref", "refs/heads/main", commit]);
  g(["symbolic-ref", "HEAD", "refs/heads/main"]);
  return dir;
}

test("a repository whose paths are decomposed still produces a report", async () => {
  // git precomposes command-line arguments on macOS, so a path read from the tree and handed
  // back to blame no longer matched it: "fatal: no such path café.ts in HEAD", and the run
  // ended with no report at all.
  const dir = await nfdRepo();
  try {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.equal(r.sample.filesTotal, 4);
    assert.equal(r.sample.filesSampled, 4);
    assert.equal(r.sample.linesAttributed, 40);
    assert.equal(r.authors.length, 1);
    assert.equal(r.authors[0]?.lines, 40);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--version prints the package version, which the release smoke test reads", async () => {
  const binPath = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
  const out = execFileSync(process.execPath, [binPath, "--version"], { encoding: "utf8" }).trim();
  const { version } = JSON.parse(await readFile(join(import.meta.dirname, "..", "package.json"), "utf8"));
  assert.equal(out, version);
});

test("the table is padded by terminal columns, not code units", () => {
  // East Asian characters are drawn two columns wide and combining marks none at all, so
  // padding by String.length pushed the numbers right for Chinese, Japanese and Korean names
  // and pulled them left for a decomposed Latin one. No column in the table lined up.
  assert.equal(displayWidth("Ada Lovelace"), 12);
  assert.equal(displayWidth("José Álvarez".normalize("NFD")), 12);
  assert.equal(displayWidth("José Álvarez".normalize("NFC")), 12);
  assert.equal(displayWidth("张伟"), 4);
  assert.equal(displayWidth("김민준"), 6);
  assert.equal(displayWidth("田中太郎"), 8);

  const authors = ["Ada Lovelace", "张伟", "김민준", "田中太郎", "José Álvarez".normalize("NFD")].map((author, i) => ({
    author,
    mail: `a${i}@example.com`,
    lines: 10,
    lineShare: 0.2,
    commits: 1,
    commitShare: 0.2,
  }));
  const table = renderTable(
    { ref: "HEAD", authors, sample: { filesSampled: 5, filesTotal: 5, every: 1, seed: "", linesAttributed: 50, linesInRef: 50 }, commitWindow: { commits: 5 }, blame: { flags: ["-w", "-M"] } },
    10,
  );
  // Every row must place its first digit in the same column, measured the way a terminal does.
  const rows = table.split("\n").filter((l) => /\d+\s+\d+\.\d%/.test(l) && !l.startsWith("ref "));
  assert.equal(rows.length, 5);
  const columns = rows.map((r) => displayWidth(r.slice(0, r.search(/\d/))));
  assert.equal(new Set(columns).size, 1, `name fields differ in width: ${JSON.stringify(columns)}`);
});

test("linkIdentities groups one person's addresses and leaves separate people alone", () => {
  const authors = [
    { author: "Efe Genc", mail: "50203466+bubblegunn@users.noreply.github.com", lines: 100, commits: 9 },
    { author: "Efe Genc", mail: "efegenc95@gmail.com", lines: 345, commits: 6 },
    { author: "Ada Lovelace", mail: "ada@example.com", lines: 40, commits: 3 },
    { author: "dependabot[bot]", mail: "49699333+dependabot[bot]@users.noreply.github.com", lines: 0, commits: 3 },
  ];
  const groups = linkIdentities(authors);
  assert.equal(groups.length, 1, JSON.stringify(groups));
  const g = groups[0];
  assert.deepEqual(g.members.map((m) => m.mail).sort(), ["50203466+bubblegunn@users.noreply.github.com", "efegenc95@gmail.com"]);
  // The address with the most commits is proposed as canonical, not the one with the most lines.
  assert.equal(g.canonical.mail, "50203466+bubblegunn@users.noreply.github.com");
  assert.ok(g.reasons.some((r) => /name/.test(r)), JSON.stringify(g.reasons));
});

test("linkIdentities matches a GitHub noreply address to the same login used elsewhere", () => {
  const groups = linkIdentities([
    { author: "S. Gupta", mail: "12345+shivam-070208@users.noreply.github.com", lines: 10, commits: 2 },
    { author: "Shivam", mail: "shivam-070208@fastmail.com", lines: 5, commits: 1 },
  ]);
  assert.equal(groups.length, 1);
  assert.ok(groups[0].reasons.some((r) => /login/.test(r)), JSON.stringify(groups[0].reasons));
});

test("linkIdentities does not merge two people who share a generic local part", () => {
  const groups = linkIdentities([
    { author: "Ada", mail: "dev@one.example", lines: 10, commits: 2 },
    { author: "Bob", mail: "dev@two.example", lines: 10, commits: 2 },
  ]);
  assert.deepEqual(groups, []);
});

test("foldIdentity makes a Turkish name match itself in any case", () => {
  assert.equal(foldIdentity("İSMAİL YILMAZ"), foldIdentity("İsmail Yılmaz"));
  assert.equal(foldIdentity("Jose\u0301"), foldIdentity("Jos\u00e9"));
});

test("renderIdentities prints mailmap lines and says nothing was found when nothing was", () => {
  const groups = linkIdentities([
    { author: "Efe Genc", mail: "50203466+bubblegunn@users.noreply.github.com", lines: 100, commits: 9 },
    { author: "Efe Genc", mail: "efegenc95@gmail.com", lines: 345, commits: 6 },
  ]);
  const out = renderIdentities(groups);
  assert.match(out, /Efe Genc <50203466\+bubblegunn@users\.noreply\.github\.com> <efegenc95@gmail\.com>/);
  assert.match(out, /only you\s+can tell/i);
  assert.match(renderIdentities([]), /No split identities/);
});

test("--identities is exclusive with the other output formats", () => {
  assert.equal(parseArgs(["--identities"]).identities, true);
  assert.throws(() => parseArgs(["--json", "--identities"]), /mutually exclusive/);
  assert.throws(() => parseArgs(["--markdown", "--identities"]), /mutually exclusive/);
});
