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
