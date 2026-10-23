// @ts-check
// The copy-detection default weighs the files that are blamed against the commits that touch the run's paths.
// Repositories are tiny and built inside each test with invented names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRepo, commitAsIdentity, lines, removeRepo } from "../scripts/fixtures.mjs";

const { parseArgs, analyse, renderTable, renderMarkdown } = await import("../bin/surviving-lines.js");

const ANN = /** @type {[string, string]} */ (["Ann", "ann@x.org"]);

/** @param {(dir: string) => Promise<void>} fn @param {(dir: string) => void} build */
async function withRepo(build, fn) {
  const dir = createRepo("sl-copydef-");
  try {
    build(dir);
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

/** @param {string} dir @param {string[]} args @param {number} limit */
async function runWithLimit(dir, args, limit) {
  const o = parseArgs(["--cwd", dir, ...args]);
  o.copyWorkLimit = limit;
  return analyse(o);
}

test("copy detection default: the work is the files blamed (the sample), not every file", async () => {
  await withRepo(
    (dir) => {
      for (let i = 0; i < 3; i++) {
        const files = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((n) => [`${n}.js`, lines(n, 3 + i)]));
        commitAsIdentity(dir, ANN, `2026-01-0${i + 1}T00:00:00Z`, `c${i}`, files);
      }
    },
    async (dir) => {
      const probe = await analyse(parseArgs(["--cwd", dir, "--sample", "2"]));
      const sampled = probe.sample.filesSampled;
      assert.ok(sampled > 0 && sampled < probe.sample.filesTotal, `sample of ${sampled} out of ${probe.sample.filesTotal}`);
      // sampled x 3 commits is exactly the limit; every file x 3 commits would be above it.
      const on = await runWithLimit(dir, ["--sample", "2"], sampled * 3);
      assert.equal(on.blame.copyDetection.on, true);
      const off = await runWithLimit(dir, ["--sample", "2"], sampled * 3 - 1);
      assert.equal(off.blame.copyDetection.on, false);
      assert.equal(off.blame.copyDetection.reason, `${sampled} files times 3 commits is more than ${sampled * 3 - 1}`);
    },
  );
});

test("copy detection default: only the commits that touch the run's paths count", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ANN, "2026-01-01T00:00:00Z", "s1", { "src/a.js": lines("a", 3) });
      for (let i = 0; i < 4; i++) commitAsIdentity(dir, ANN, `2026-01-0${i + 2}T00:00:00Z`, `d${i}`, { "docs/n.md": lines("n", 3 + i) });
      commitAsIdentity(dir, ANN, "2026-01-07T00:00:00Z", "s2", { "src/a.js": lines("a", 5) });
    },
    async (dir) => {
      // One file, two commits touch src. The whole history is six.
      assert.equal((await runWithLimit(dir, ["--", "src"], 2)).blame.copyDetection.on, true);
      const off = await runWithLimit(dir, ["--", "src"], 1);
      assert.equal(off.blame.copyDetection.on, false);
      assert.match(off.blame.copyDetection.reason ?? "", /^1 files times 2 commits is more than 1$/);
      assert.match((await runWithLimit(dir, [], 2)).blame.copyDetection.reason ?? "", /^2 files times 6 commits is more than 2$/);
    },
  );
});

test("copy detection default: --since limits the commits that are counted", async () => {
  await withRepo(
    (dir) => {
      for (let i = 0; i < 5; i++) commitAsIdentity(dir, ANN, `2025-0${i + 1}-01T00:00:00Z`, `old${i}`, { "a.js": lines("a", 3 + i) });
      commitAsIdentity(dir, ANN, "2026-02-01T00:00:00Z", "new", { "a.js": lines("a", 9) });
    },
    async (dir) => {
      assert.equal((await runWithLimit(dir, ["--since", "2026-01-01"], 1)).blame.copyDetection.on, true);
      const off = await runWithLimit(dir, [], 5);
      assert.equal(off.blame.copyDetection.on, false);
      assert.match(off.blame.copyDetection.reason ?? "", /^1 files times 6 commits/);
    },
  );
});

test("copy detection default: when it switches itself off the header says so; --no-copies and the default-on case add nothing", async () => {
  await withRepo(
    (dir) => {
      for (let i = 0; i < 3; i++) commitAsIdentity(dir, ANN, `2026-01-0${i + 1}T00:00:00Z`, `c${i}`, { "a.js": lines("a", 3 + i), "b.js": lines("b", 3 + i) });
    },
    async (dir) => {
      const off = await runWithLimit(dir, [], 5);
      const first = renderTable(off, 10).split("\n")[0];
      assert.match(first, /  ·  copy detection off \(2 files times 3 commits is more than 5\)$/);
      assert.match(renderMarkdown(off, 10).split("\n")[0], /copy detection off \(2 files times 3 commits is more than 5\)$/);
      const on = await analyse(parseArgs(["--cwd", dir]));
      assert.doesNotMatch(renderTable(on, 10).split("\n")[0], /copy detection/);
      const none = await analyse(parseArgs(["--cwd", dir, "--no-copies"]));
      assert.doesNotMatch(renderTable(none, 10).split("\n")[0], /copy detection/);
    },
  );
});
