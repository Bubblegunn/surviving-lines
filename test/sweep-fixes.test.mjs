// @ts-check
// Round 13 sweep fixes: submodules and symlinks, binary-like files, copy detection on long histories, bot names, and
// authors who hold only blank lines. Repositories are tiny and built inside each test with invented names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo, commitAsIdentity, git, lines, removeRepo } from "../scripts/fixtures.mjs";

const mod = await import("../bin/surviving-lines.js");
const { parseArgs, analyse, renderTable } = mod;

const DATE = "2026-01-01T00:00:00Z";
const ANN = /** @type {[string, string]} */ (["Ann", "ann@x.org"]);

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} fn */
async function withRepo(build, fn) {
  const dir = createRepo("sl-sweep-");
  try {
    build(dir);
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

/** Commit the staged index (a gitlink or symlink added by hand) as Ann. @param {string} dir @param {string} message */
function commitIndex(dir, message) {
  const env = { GIT_AUTHOR_NAME: "Ann", GIT_AUTHOR_EMAIL: "ann@x.org", GIT_COMMITTER_NAME: "CI", GIT_COMMITTER_EMAIL: "ci@example.com", GIT_AUTHOR_DATE: DATE, GIT_COMMITTER_DATE: DATE };
  git(dir, ["commit", "-q", "-m", message], env);
}

for (const extra of [[], ["--keep-generated"]]) {
  test(`S1: a submodule outside a vendor directory does not stop the run (${extra.join(" ") || "default options"})`, async () => {
    await withRepo(
      (dir) => {
        commitAsIdentity(dir, ANN, DATE, "code", { "src/a.js": lines("a", 6) });
        git(dir, ["update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},thirdparty/lib`]);
        git(dir, ["update-index", "--add", "--cacheinfo", `160000,${"2".repeat(40)},vendor/dep`]);
        commitIndex(dir, "add submodules");
      },
      async (dir) => {
        const r = await analyse(parseArgs(["--cwd", dir, ...extra]));
        assert.equal(r.sample.filesTotal, 1);
        assert.equal(r.sample.linesInRef, 6);
        assert.equal(r.authors[0].lines, 6);
      },
    );
  });
}

test("S1: a real submodule added with git submodule add is not counted", async () => {
  const sub = createRepo("sl-sweep-sub-");
  try {
    commitAsIdentity(sub, ["Sue", "sue@x.org"], DATE, "lib", { "lib.js": lines("lib", 9) });
    await withRepo(
      (dir) => {
        commitAsIdentity(dir, ANN, DATE, "code", { "a.js": lines("a", 4) });
        git(dir, ["-c", "protocol.file.allow=always", "submodule", "add", "-q", sub, "third_lib"]);
        commitIndex(dir, "add submodule");
      },
      async (dir) => {
        for (const extra of [[], ["--keep-generated"]]) {
          const r = await analyse(parseArgs(["--cwd", dir, ...extra]));
          // a.js and .gitmodules; the submodule entry itself is not a file.
          assert.equal(r.sample.filesTotal, 2);
          assert.equal(r.sample.linesInRef, 4 + 3);
        }
      },
    );
  } finally {
    removeRepo(sub);
  }
});

test("S6: a symbolic link is not blamed and not counted as one line", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ANN, DATE, "code", { "real.js": lines("r", 5) });
      symlinkSync("real.js", join(dir, "link.js"));
      git(dir, ["add", "link.js"]);
      commitIndex(dir, "add link");
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.sample.filesTotal, 1);
      assert.equal(r.sample.linesInRef, 5);
      assert.equal(r.authors[0].lines, 5);
    },
  );
});

test("S1: --files, --group-by, --reviewers and --history run on a repository with a submodule and a link", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ANN, DATE, "code", { "src/a.js": lines("a", 6), "src/b.js": lines("b", 6) });
      symlinkSync("a.js", join(dir, "src/link.js"));
      git(dir, ["add", "src/link.js"]);
      git(dir, ["update-index", "--add", "--cacheinfo", `160000,${"3".repeat(40)},src/sub`]);
      commitIndex(dir, "add link and submodule");
    },
    async (dir) => {
      for (const extra of [["--files"], ["--group-by", "dir"], ["--reviewers", "src"], ["--history", "src"], ["--copies", "deep"], ["--sample", "2"]]) {
        const r = await analyse(parseArgs(["--cwd", dir, ...extra]));
        assert.ok(renderTable(r, null).length > 0, extra.join(" "));
        assert.equal(r.sample.linesInRef, 12, extra.join(" "));
      }
    },
  );
});

/** @param {number} head text bytes before the NUL */
const nulFile = (head) => Buffer.concat([Buffer.from("line\n".repeat(Math.ceil(head / 5))), Buffer.from([0]), Buffer.from("tail\n".repeat(50))]);

test("S2: a file with a NUL byte beyond git's probe is left out and reported as binary; a plain text file counts", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ANN, DATE, "files", { "plain.txt": lines("p", 8), "late-nul.dat": nulFile(9000) });
    },
    async (dir) => {
      const numstat = git(dir, ["diff", "--numstat", git(dir, ["hash-object", "-t", "tree", "--stdin"]).trim(), "HEAD"]);
      assert.match(numstat, /late-nul\.dat/, "git itself calls the file text, so the NUL is beyond its probe");
      assert.doesNotMatch(numstat, /^-\t-\tlate-nul\.dat/m);
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.sample.filesTotal, 1);
      assert.equal(r.sample.linesInRef, 8);
      assert.equal(r.dropped.classes.binary.files, 1);
      assert.ok(r.dropped.classes.binary.lines > 50);
      assert.equal(r.dropped.paths[0].path, "late-nul.dat");
      const line = mod.droppedLine(r);
      assert.match(line ?? "", /binary 1 file [\d,]+ lines/);
      assert.match(renderTable(r, null), /dropped: 1 file, .*binary 1 file/);
      const kept = await analyse(parseArgs(["--cwd", dir, "--keep-generated"]));
      assert.equal(kept.sample.filesTotal, 2);
      assert.equal(kept.dropped.classes.binary.files, 0);
    },
  );
});

test("S2: well-known binary document extensions are left out even without a NUL in the file", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ANN, DATE, "files", { "plain.txt": lines("p", 8), "doc.PDF": "text only\n", "art.ai": "text only\n", "page.html.br": "text only\n" });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.sample.filesTotal, 1);
      assert.equal(r.dropped.classes.binary.files, 3);
    },
  );
});
