// @ts-check
// Round 13 review fixes: `git ls-tree --full-tree`, the NUL scan's failure modes, and when the binary extension list applies.
// Repositories are tiny and built inside each test with invented names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { schemaErrors } from "../scripts/schema-check.mjs";
import { createRepo, commitAsIdentity, git, lines, removeRepo, SKIP_ON_WINDOWS_SHIM } from "../scripts/fixtures.mjs";

const { parseArgs, analyse, listNonRegularPaths } = await import("../bin/surviving-lines.js");

const DATE = "2026-01-01T00:00:00Z";
const ANN = /** @type {[string, string]} */ (["Ann", "ann@x.org"]);

test("the list of links and submodules is the whole tree's, whatever directory the run starts in", async () => {
  const dir = createRepo("sl-fulltree-");
  try {
    commitAsIdentity(dir, ANN, DATE, "code", { "real.js": lines("r", 5), "sub/inner.js": lines("i", 4) });
    symlinkSync("real.js", join(dir, "link.js"));
    symlinkSync("inner.js", join(dir, "sub/inner-link.js"));
    git(dir, ["add", "link.js", "sub/inner-link.js"]);
    git(dir, ["commit", "-q", "-m", "link"], { GIT_AUTHOR_NAME: "Ann", GIT_AUTHOR_EMAIL: "ann@x.org", GIT_COMMITTER_NAME: "Ann", GIT_COMMITTER_EMAIL: "ann@x.org", GIT_AUTHOR_DATE: DATE, GIT_COMMITTER_DATE: DATE });
    // Running the whole tool from a subdirectory is not supported (paths are blamed as the diff names them, from the
    // repository root), so the function is called directly with a working directory below the root.
    const fromRoot = await listNonRegularPaths(parseArgs(["--cwd", dir]));
    const fromSub = await listNonRegularPaths(parseArgs(["--cwd", join(dir, "sub")]));
    assert.deepEqual([...fromRoot].sort(), ["link.js", "sub/inner-link.js"]);
    assert.deepEqual([...fromSub].sort(), [...fromRoot].sort());
  } finally {
    removeRepo(dir);
  }
});

/**
 * A directory with a `git` that behaves like the real one except that `git grep -P` exits with the code in
 * FAKE_GREP_EXIT. Returns the directory to put first on PATH.
 */
function fakeGitDir() {
  const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const bin = mkdtempSync(join(tmpdir(), "sl-fakegit-"));
  mkdirSync(bin, { recursive: true });
  const script = `#!/bin/sh
case " $* " in
  *" grep "*" -P "*) [ -n "$FAKE_GREP_EXIT" ] && { echo "fatal: fake grep" >&2; exit "$FAKE_GREP_EXIT"; } ;;
esac
exec "${real}" "$@"
`;
  writeFileSync(join(bin, "git"), script);
  chmodSync(join(bin, "git"), 0o755);
  return bin;
}

/**
 * Run `fn` with the fake git first on PATH and `FAKE_GREP_EXIT` set.
 * @param {string} exitCode
 * @param {() => Promise<void>} fn
 */
async function withFakeGrep(exitCode, fn) {
  const bin = fakeGitDir();
  const saved = { PATH: process.env.PATH, FAKE: process.env.FAKE_GREP_EXIT };
  process.env.PATH = `${bin}${process.platform === "win32" ? ";" : ":"}${saved.PATH}`;
  process.env.FAKE_GREP_EXIT = exitCode;
  try {
    await fn();
  } finally {
    process.env.PATH = saved.PATH;
    if (saved.FAKE === undefined) delete process.env.FAKE_GREP_EXIT;
    else process.env.FAKE_GREP_EXIT = saved.FAKE;
    rmSync(bin, { recursive: true, force: true });
  }
}

/** @param {string[]} extra @param {string} dir */
async function runCapturingStderr(dir, extra) {
  /** @type {string[]} */
  const chunks = [];
  const o = parseArgs(["--cwd", dir, ...extra]);
  o.stderr = /** @type {any} */ ({ write: (/** @type {string} */ c) => (chunks.push(c), true), isTTY: false });
  const r = await analyse(o);
  return { r, stderr: chunks.join("") };
}

/** @param {(dir: string) => Promise<void>} fn */
async function withDocRepo(fn) {
  const dir = createRepo("sl-nulscan-");
  try {
    commitAsIdentity(dir, ANN, DATE, "files", { "plain.txt": lines("p", 8), "doc.pdf": "text only\n" });
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

test("when the NUL scan cannot run, the extension list stands in for it and one note says so", SKIP_ON_WINDOWS_SHIM, async () => {
  await withDocRepo(async (dir) => {
    await withFakeGrep("128", async () => {
      const { r, stderr } = await runCapturingStderr(dir, []);
      assert.equal(r.dropped.classes.binary.files, 1);
      assert.equal(r.sample.filesTotal, 1);
      assert.equal(stderr.match(/NUL scan skipped: git grep -P unavailable/g)?.length, 1);
      const quiet = await runCapturingStderr(dir, ["--quiet"]);
      assert.equal(quiet.stderr, "");
      assert.equal(quiet.r.dropped.classes.binary.files, 1);
    });
  });
});

test("a NUL scan that finds nothing (exit 1) is an empty result: no note, and a text-only .pdf is counted", async () => {
  await withDocRepo(async (dir) => {
    await withFakeGrep("1", async () => {
      const { r, stderr } = await runCapturingStderr(dir, []);
      assert.equal(stderr, "");
      assert.equal(r.dropped.classes.binary.files, 0);
      assert.equal(r.sample.filesTotal, 2);
    });
  });
});

test("when the NUL scan ran, a .pdf holding only text is counted; a real NUL beyond git's probe is still left out", async () => {
  const dir = createRepo("sl-nulscan-real-");
  try {
    const late = Buffer.concat([Buffer.from("line\n".repeat(1800)), Buffer.from([0]), Buffer.from("tail\n".repeat(50))]);
    commitAsIdentity(dir, ANN, DATE, "files", { "plain.txt": lines("p", 8), "doc.pdf": "text only\n", "late.dat": late });
    const { r, stderr } = await runCapturingStderr(dir, []);
    if (stderr) return; // this git has no git grep -P: the extension list applies and the other tests cover it
    assert.equal(r.dropped.classes.binary.files, 1);
    assert.equal(r.dropped.paths[0].path, "late.dat");
    assert.equal(r.sample.filesTotal, 2);
  } finally {
    removeRepo(dir);
  }
});

test("without the NUL scan every listed document extension is left out, in any letter case", SKIP_ON_WINDOWS_SHIM, async () => {
  const dir = createRepo("sl-nulscan-ext-");
  try {
    commitAsIdentity(dir, ANN, DATE, "files", { "plain.txt": lines("p", 8), "doc.PDF": "text only\n", "art.ai": "text only\n", "page.html.br": "text only\n", "pic.eps": "x\n", "img.psd": "x\n" });
    await withFakeGrep("128", async () => {
      const { r } = await runCapturingStderr(dir, ["--quiet"]);
      assert.equal(r.sample.filesTotal, 1);
      assert.equal(r.dropped.classes.binary.files, 5);
    });
  } finally {
    removeRepo(dir);
  }
});

test("the schema accepts JSON from before the binary class existed, and the tool still writes the class", async () => {
  const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
  const dir = createRepo("sl-schema-binary-");
  try {
    commitAsIdentity(dir, ANN, DATE, "files", { "plain.txt": lines("p", 8) });
    const run = spawnSync(process.execPath, [join(import.meta.dirname, "..", "bin", "surviving-lines.js"), "--cwd", dir, "--json", "-q"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const doc = JSON.parse(run.stdout);
    assert.deepEqual(schemaErrors(schema, doc), []);
    assert.deepEqual(doc.dropped.classes.binary, { files: 0, lines: 0 });
    delete doc.dropped.classes.binary;
    assert.deepEqual(schemaErrors(schema, doc), [], "older output without the binary class still validates");
    delete doc.dropped.classes.lockfile;
    assert.deepEqual(schemaErrors(schema, doc), ["$.dropped.classes: missing key lockfile"], "the other classes stay required");
  } finally {
    removeRepo(dir);
  }
});
