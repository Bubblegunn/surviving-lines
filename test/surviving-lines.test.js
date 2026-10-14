// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, readFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const bin = pathToFileURL(join(import.meta.dirname, "..", "bin", "surviving-lines.js")).href;
const { parseArgs, fnv1a, inSample, globToRegExp, selected, countBlameLines, analyse, renderTable, renderCsv, renderMarkdown, displayWidth, isolate, foldIdentity, githubLogin, linkIdentities, renderIdentities, gitVersionProblem, MIN_GIT } = await import(bin);

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

test("empty sample and empty include reject with clear error", async () => {
  const dir = await fixtureRepo();
  try {
    await assert.rejects(
      analyse(parseArgs(["--cwd", dir, "--sample", "100000", "--seed", "x"])),
      /no files sampled.*--sample 100000.*--seed "x"/
    );
    await assert.rejects(
      analyse(parseArgs(["--cwd", dir, "--include", "no-such-pattern-*.xyz"])),
      /no files matched include pattern/
    );
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
test("--markdown escapes backslashes before pipes, so a name cannot add a table cell", async () => {
  const dir = await fixtureRepo();
  try {
    const r = await analyse(parseArgs(["--cwd", dir]));
    // A name containing `\|`: escaping only the pipe turns it into `\\|`, which Markdown reads
    // as an escaped backslash followed by a cell separator. The mail column is reached by giving
    // two authors the same name.
    const a = { ...r.authors[0], author: "Ada\\|x", mail: "ada\\|@example.com" };
    const b = { ...r.authors[1], author: "Ada\\|x" };
    const rows = renderMarkdown({ ...r, authors: [a, b] }, 10)
      .split("\n")
      .filter((l) => l.startsWith("| Ada"));
    assert.equal(rows.length, 2);
    // A cell separator is a pipe preceded by an even number of backslashes.
    const separators = (/** @type {string} */ l) => (l.match(/(?<!\\)(?:\\\\)*\|/g) ?? []).length;
    for (const row of rows) assert.equal(separators(row), 6, row);
    assert.ok(rows[0].startsWith("| Ada\\\\\\|x <ada\\\\\\|@example.com> |"), rows[0]);
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
  // The width table is the standard's, not a hand-written list: emoji are Wide in UAX #11 and
  // the hand-written one called 8,645 assigned code points narrow that the standard calls wide.
  assert.equal(displayWidth("🚀"), 2);
  assert.equal(displayWidth("⚡"), 2);
  assert.equal(displayWidth("⌚"), 2);
  // Default-ignorable code points cost no column, which is what the bidi isolates are.
  assert.equal(displayWidth("\u2068Ada\u2069"), 3);

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

test("a right-to-left name is isolated so the row does not reorder around it", () => {
  // Without an isolate, an Arabic or Hebrew name sets the direction of the whole line: the name
  // moves to the right edge, the numbers after it reverse, and each percent sign lands before its
  // number. U+2068 and U+2069 are what UAX #9 provides for this, and they cost no column.
  assert.equal(isolate("Ada Lovelace"), "Ada Lovelace");
  assert.equal(isolate("محمد علي"), "\u2068محمد علي\u2069");
  assert.equal(isolate("דוד כהן"), "\u2068דוד כהן\u2069");
  assert.equal(isolate("\u2068already\u2069"), "\u2068already\u2069");
  assert.equal(displayWidth(isolate("محمد")), displayWidth("محمد"));

  const authors = [
    { author: "محمد علي", mail: "a@example.com", lines: 10, lineShare: 0.5, commits: 1, commitShare: 0.5 },
    { author: "Ada Lovelace", mail: "b@example.com", lines: 10, lineShare: 0.5, commits: 1, commitShare: 0.5 },
  ];
  const table = renderTable(
    { ref: "HEAD", authors, sample: { filesSampled: 2, filesTotal: 2, every: 1, seed: "", linesAttributed: 20, linesInRef: 20 }, commitWindow: { commits: 2 }, blame: { flags: ["-w"] } },
    10,
  );
  const rtl = table.split("\n").find((l) => l.includes("محمد"));
  assert.ok(rtl, table);
  assert.ok(rtl.startsWith("\u2068محمد علي\u2069"), JSON.stringify(rtl));
  // The Latin row is untouched: only names carrying strong right-to-left characters are wrapped.
  assert.ok(table.split("\n").some((l) => l.startsWith("Ada Lovelace ")), table);
  const columns = table
    .split("\n")
    .filter((l) => /\d+\s+\d+\.\d%/.test(l) && !l.startsWith("ref "))
    .map((r) => displayWidth(r.slice(0, r.search(/\d/))));
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

test("foldIdentity folds the sharp s and fullwidth letters, which decide a count", () => {
  // These are the only locale findings that can change a number rather than a column: before
  // this, one person who signs "Weiß" and "WEISS" was two rows, and a name typed on a Japanese
  // keyboard without leaving fullwidth mode never matched the same name typed in ASCII.
  assert.equal(foldIdentity("Weiß"), foldIdentity("WEISS"));
  assert.equal(foldIdentity("Straße"), foldIdentity("STRASSE"));
  assert.equal(foldIdentity("\uff25\uff46\uff45"), foldIdentity("Efe"));
  assert.equal(foldIdentity("\ufb01nn"), foldIdentity("finn"));
  // Different people still differ: the fold must not collapse names that are not the same name.
  assert.notEqual(foldIdentity("Weiss"), foldIdentity("Weis"));
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

/**
 * A depth-1 clone of the fixture: one commit, so every surviving line blames to the HEAD author.
 * `file://` is needed, because git ignores --depth for a plain local path.
 * @param {string} source
 */
async function shallowClone(source) {
  const dir = await mkdtemp(join(tmpdir(), "surviving-lines-shallow-"));
  execFileSync("git", ["clone", "-q", "--depth", "1", pathToFileURL(source).href, dir]);
  return dir;
}

test("a shallow clone is refused, because every line would blame to the HEAD author", async () => {
  const full = await fixtureRepo();
  const shallow = await shallowClone(full);
  const binPath = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
  try {
    await assert.rejects(analyse(parseArgs(["--cwd", shallow])), /shallow clone[\s\S]*git fetch --unshallow/);
    const run = spawnSync(process.execPath, [binPath, "--cwd", shallow], { encoding: "utf8" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /git fetch --unshallow/);
    assert.equal(run.stdout, "");

    // The full repository is not shallow and is not refused.
    const r = await analyse(parseArgs(["--cwd", full]));
    assert.equal(r.shallow, false);
    assert.doesNotMatch(renderTable(r, 10).split("\n")[0], /shallow/);
  } finally {
    await rm(full, { recursive: true, force: true });
    await rm(shallow, { recursive: true, force: true });
  }
});

test("--allow-shallow runs anyway and marks every output format", async () => {
  const full = await fixtureRepo();
  const shallow = await shallowClone(full);
  const binPath = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
  try {
    assert.equal(parseArgs(["--allow-shallow"]).allowShallow, true);
    const r = await analyse(parseArgs(["--cwd", shallow, "--allow-shallow"]));
    assert.equal(r.shallow, true);
    assert.match(renderTable(r, 10).split("\n")[0], /shallow clone/);
    assert.match(renderMarkdown(r, 10).split("\n")[0], /shallow clone/);

    const run = (/** @type {string[]} */ extra) => spawnSync(process.execPath, [binPath, "--cwd", shallow, "--allow-shallow", ...extra], { encoding: "utf8" });
    const table = run([]);
    assert.equal(table.status, 0, table.stderr);
    assert.match(table.stdout.split("\n")[0], /shallow clone/);
    const json = run(["--json"]);
    assert.equal(json.status, 0, json.stderr);
    assert.equal(JSON.parse(json.stdout).shallow, true);
    const md = run(["--markdown"]);
    assert.match(md.stdout.split("\n")[0], /shallow clone/);
    const ids = run(["--identities"]);
    assert.match(ids.stdout.split("\n")[0], /shallow clone/);
    // CSV has no header line of its own beyond the column names, which parsers read, so the
    // mark goes to stderr and the CSV stays parseable.
    const csv = run(["--csv"]);
    assert.equal(csv.stdout.split("\n")[0], "author,mail,lines,line_share,commits,commit_share");
    assert.match(csv.stderr, /shallow clone/);
  } finally {
    await rm(full, { recursive: true, force: true });
    await rm(shallow, { recursive: true, force: true });
  }
});

/**
 * The part of JSON Schema that schema/surviving-lines.schema.json uses, checked by hand so the test
 * needs no dependency: type, const, required, properties, additionalProperties false, items, minimum
 * and maximum. Returns every violation with its path; an empty list means the value conforms.
 * @param {any} schema
 * @param {any} value
 * @param {string} [path]
 * @returns {string[]}
 */
function schemaErrors(schema, value, path = "$") {
  /** @type {string[]} */
  const errors = [];
  const typeOf = (/** @type {any} */ v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  if (schema.type) {
    const types = [].concat(schema.type);
    const actual = typeOf(value);
    if (!types.includes(actual) && !(actual === "integer" && types.includes("number"))) {
      return [`${path}: expected ${types.join(" or ")}, got ${actual}`];
    }
  }
  if ("const" in schema && value !== schema.const) errors.push(`${path}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${value} < ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${value} > ${schema.maximum}`);
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}: missing key ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...schemaErrors(schema.properties[key], v, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}: key ${key} is not in the schema`);
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => errors.push(...schemaErrors(schema.items, v, `${path}[${i}]`)));
  return errors;
}

test("--json carries schemaVersion and the tool version, and matches the published schema", async () => {
  const root = join(import.meta.dirname, "..");
  const schema = JSON.parse(await readFile(join(root, "schema", "surviving-lines.schema.json"), "utf8"));
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  // The schema ships with the package; a schema that is not in the tarball helps nobody.
  assert.ok(pkg.files.includes("schema"), "package.json files must include schema");

  const dir = await fixtureRepo();
  try {
    const run = spawnSync(process.execPath, [join(root, "bin", "surviving-lines.js"), "--cwd", dir, "--json", "--since", "2026-02-01"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const out = JSON.parse(run.stdout);
    assert.equal(out.schemaVersion, schema.properties.schemaVersion.const);
    assert.deepEqual(out.tool, { name: "surviving-lines", version: pkg.version });
    assert.deepEqual(schemaErrors(schema, out), []);
    assert.ok(out.authors.length > 0, "no author rows, so the row schema was not exercised");

    // Every key the schema requires is checked: removing any one of them must be reported. This is
    // what fails when the tool stops emitting a key that consumers read.
    /** @type {[any, any, string][]} */
    const objects = [[schema, out, "$"]];
    for (const [s, v] of objects) {
      for (const key of s.required ?? []) {
        const copy = structuredClone(out);
        const parent = v === out ? copy : path(copy, objectPath(out, v));
        delete parent[key];
        assert.ok(schemaErrors(schema, copy).some((e) => e.includes(`missing key ${key}`)), `removing ${key} was not reported`);
        if (s.properties?.[key]?.type === "object") objects.push([s.properties[key], v[key], key]);
      }
    }
    for (const key of schema.properties.authors.items.required) {
      const copy = structuredClone(out);
      delete copy.authors[0][key];
      assert.ok(schemaErrors(schema, copy).some((e) => e.includes(`missing key ${key}`)), `removing authors[0].${key} was not reported`);
    }
    // A key added to the output without a line in the schema is reported too, so the schema cannot fall behind.
    assert.ok(schemaErrors(schema, { ...out, extra: 1 }).some((e) => e.includes("extra")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** @param {any} root @param {any} target @returns {string[]} */
function objectPath(root, target) {
  for (const [k, v] of Object.entries(root)) {
    if (v === target) return [k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sub = objectPath(v, target);
      if (sub.length) return [k, ...sub];
    }
  }
  return [];
}

/** @param {any} root @param {string[]} keys */
function path(root, keys) {
  return keys.reduce((o, k) => o[k], root);
}

test("gitVersionProblem names the minimum and passes anything at or above it", () => {
  assert.deepEqual(MIN_GIT, [2, 15]);
  assert.match(gitVersionProblem("git version 2.14.6") ?? "", /^git 2\.15 or newer is required \(found 2\.14\.6\)/);
  assert.match(gitVersionProblem("git version 1.9.5") ?? "", /git 2\.15 or newer is required/);
  assert.equal(gitVersionProblem("git version 2.15.0"), null);
  assert.equal(gitVersionProblem("git version 2.50.1 (Apple Git-155)"), null);
  assert.equal(gitVersionProblem("git version 2.45.1.windows.1"), null);
  assert.equal(gitVersionProblem("git version 3.0.0"), null);
  // A version string this cannot read is not a reason to refuse: the check only blocks a git it knows is too old.
  assert.equal(gitVersionProblem("something else"), null);
});

test("an old git on PATH stops the run with the minimum version", { skip: process.platform === "win32" ? "a shell-script git cannot stand in for git.exe on Windows" : false }, async () => {
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const fakeBin = await mkdtemp(join(tmpdir(), "surviving-lines-fakegit-"));
  const repo = await fixtureRepo();
  const binPath = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
  const withGit = async (/** @type {string} */ version) => {
    const script = `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "git version ${version}"; exit 0; fi\nexec "${realGit}" "$@"\n`;
    await writeFile(join(fakeBin, "git"), script);
    await chmod(join(fakeBin, "git"), 0o755);
    return spawnSync(process.execPath, [binPath, "--cwd", repo], { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` } });
  };
  try {
    const old = await withGit("2.14.6");
    assert.notEqual(old.status, 0);
    assert.match(old.stderr, /git 2\.15 or newer is required/);
    assert.equal(old.stdout, "");
    // The same fake, reporting the minimum, runs: the refusal comes from the version and nothing else.
    const ok = await withGit("2.15.0");
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /files 3\/3 sampled/);
  } finally {
    await rm(fakeBin, { recursive: true, force: true });
    await rm(repo, { recursive: true, force: true });
  }
});
