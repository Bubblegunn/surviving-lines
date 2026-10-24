// @ts-check
// Round 13: --why-not <author> -- <path>, why one person is not among the suggested reviewers of a path. Fixtures are
// tiny repositories with invented names and fixed dates; the head commit is dated 2026-02-01.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderWhyNot, renderJson, inSample } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  ada: ["Ada Quill", "ada@quill.example"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  dee: ["Dee Fern", "dee@fern.example"],
  eli: ["Eli Voss", "eli@voss.example"],
  fay: ["Fay Lund", "fay@lund.example"],
  gus: ["Gus Roth", "gus@roth.example"],
  zoeA: ["ZOË Quist", "zoe@one.example"],
  zoeB: ["Zoe Quist", "zq@two.example"],
};
/** @param {string} dir @param {string} who @param {string} date @param {Record<string, string | null>} files */
const commit = (dir, who, date, files) => commitAsIdentity(dir, WHO[who], `${date}T10:00:00Z`, `${who}: change`, files);

/**
 * src/pay/: Ada 100 lines, Bea 80, Cal 60 (last commit 2024: listed but inactive), then Zoe 35 and Zoe (second
 * address) 30, Dee 20, Eli 10. Fay committed there in 2024 and Ada deleted the file, so Fay has no line. Gus committed
 * only in other/.
 * @param {string} dir
 * @param {boolean} [split] whether the two Zoe addresses exist
 */
function pay(dir, split = true) {
  commit(dir, "cal", "2024-02-01", { "src/pay/core.js": lines("core", 60) });
  commit(dir, "eli", "2024-03-01", { "src/pay/misc.js": lines("misc", 10) });
  commit(dir, "fay", "2024-04-01", { "src/pay/tmp.js": lines("tmp", 15) });
  commit(dir, "ada", "2026-01-05", { "src/pay/ada.js": lines("ada", 100), "src/pay/tmp.js": null });
  commit(dir, "bea", "2026-01-10", { "src/pay/bea.js": lines("bea", 80) });
  commit(dir, "dee", "2026-01-15", { "src/pay/dee.js": lines("dee", 20) });
  commit(dir, "gus", "2026-01-20", { "other/g.js": lines("g", 5) });
  if (split) {
    commit(dir, "zoeA", "2026-01-25", { "src/pay/z1.js": lines("z1", 35) });
    commit(dir, "zoeB", "2026-02-01", { "src/pay/z2.js": lines("z2", 30) });
  } else {
    commit(dir, "dee", "2026-02-01", { "src/pay/dee2.js": lines("dee2", 1) });
  }
}

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-whynot-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string} who @param {string[]} [extra] */
const why = async (dir, who, extra = []) => {
  const r = await analyse(parseArgs(["--cwd", dir, "-q", "--why-not", who, ...extra, "--", "src/pay/"]));
  return /** @type {NonNullable<typeof r.whyNot>} */ (r.whyNot);
};

test("an unknown identity lists the closest names and does not fail", async () => {
  await withRepo((dir) => pay(dir, false), async (dir) => {
    const w = await why(dir, "Ada Quil");
    assert.equal(w.classification, "unknownIdentity");
    assert.equal(w.closest[0], "Ada Quill <ada@quill.example>");
    assert.equal(w.closest.length, 5);
    assert.match(w.message, /^"Ada Quil" is not a known author: no name or address in the history matches after \.mailmap\. Closest: Ada Quill <ada@quill\.example>; /);
  });
});

test("someone known in the history but with no commit at the path: never touched", async () => {
  await withRepo((dir) => pay(dir, false), async (dir) => {
    const w = await why(dir, "gus@roth.example");
    assert.equal(w.classification, "neverTouched");
    assert.equal(w.commitsAtPath, 0);
    assert.match(w.message, /^Gus Roth is not a suggested reviewer of src\/pay\/: no commit by Gus Roth touches src\/pay\/ in the history up to HEAD\./);
  });
});

test("commits at the path and no surviving line: the counts, the dates and the largest current owner", async () => {
  await withRepo((dir) => pay(dir, false), async (dir) => {
    const w = await why(dir, "Fay Lund");
    assert.equal(w.classification, "noSurvivingLines");
    assert.deepEqual([w.commitsAtPath, w.firstCommitAtPath, w.lastCommitAtPath, w.lines], [1, "2024-04-01", "2024-04-01", 0]);
    assert.match(w.message, /^Fay Lund is not a suggested reviewer of src\/pay\/: 1 commit touches it \(first 2024-04-01, last 2024-04-01\), but all lines of theirs here were replaced or removed\. The largest current owner is Ada Quill \(100 lines, /);
  });
});

test("below the cut: the rank, the lines, the third place and the cut, with the activity", async () => {
  await withRepo((dir) => pay(dir, false), async (dir) => {
    // Without the Zoe addresses: Ada 100, Bea 80, Cal 60, Dee 21, Eli 10. Dee is fourth.
    const w = await why(dir, "Dee Fern");
    assert.equal(w.classification, "belowCut");
    assert.deepEqual([w.lines, w.rank, w.of, w.cutLines], [21, 4, 5, 60]);
    assert.match(w.message, /^Dee Fern is not a suggested reviewer of src\/pay\/: 21 lines \(7\.7%\), ranked 4th of 5; the third place holds 60 lines, so the cut is 60 lines /);
    assert.match(w.message, /Last commit at the path 2026-02-01, anywhere 2026-02-01; active under the 365-day window \(a commit at the path from 2025-02-01 to 2026-02-01\)\./);
    const eli = await why(dir, "Eli Voss");
    assert.deepEqual([eli.classification, eli.rank, eli.active], ["belowCut", 5, false]);
    assert.match(eli.message, /Last commit at the path 2024-03-01, anywhere 2024-03-01; inactive under the 365-day window/);
  });
});

test("ranked inside the cut but inactive: listed but inactive, with both last-commit dates and the cutoff", async () => {
  await withRepo((dir) => pay(dir, false), async (dir) => {
    const w = await why(dir, "Cal Dune");
    assert.equal(w.classification, "listedInactive");
    assert.deepEqual([w.rank, w.of, w.lines, w.active, w.lastCommitAtPath, w.lastCommitAnywhere], [3, 5, 60, false, "2024-02-01", "2024-02-01"]);
    assert.match(w.message, /^Cal Dune is a suggested reviewer of src\/pay\/ \(60 lines \(22\.1%\), ranked 3rd of 5\) but is marked inactive\. Last commit at the path 2024-02-01, anywhere 2024-02-01; inactive under the 365-day window \(a commit at the path from 2025-02-01 to 2026-02-01\)\./);
  });
});

test("a listed and active person is said to be listed", async () => {
  await withRepo((dir) => pay(dir, false), async (dir) => {
    const w = await why(dir, "ada@quill.example");
    assert.equal(w.classification, "listed");
    assert.deepEqual([w.rank, w.active], [1, true]);
    assert.match(w.message, /^Ada Quill is a suggested reviewer of src\/pay\/: 100 lines \(36\.9%\), ranked 1st of 5\./);
  });
});

test("split identity: one address is below the cut, both together would be inside it", async () => {
  await withRepo(pay, async (dir) => {
    const w = await why(dir, "Zoe Quist");
    assert.equal(w.classification, "splitIdentity");
    assert.deepEqual([w.lines, w.rank, w.of, w.combinedLines, w.combinedRank], [30, 5, 7, 65, 3]);
    assert.deepEqual(w.alsoAppearsAs, [{ author: "ZOË Quist", mail: "zoe@one.example", lines: 35 }]);
    assert.match(w.message, /Also appears as ZOË Quist <zoe@one\.example> with 35 lines; counted together \(65 lines\) they would rank 3rd\./);
  });
});

test("a split identity that would still be outside the cut is below the cut, and the note is added", async () => {
  await withRepo(
    (dir) => {
      pay(dir);
      commitAsIdentity(dir, ["Hal Pike", "hal@pike.example"], "2026-02-01T11:00:00Z", "hal", { "src/pay/h.js": lines("h", 70) });
    },
    async (dir) => {
      // Ada 100, Bea 80, Hal 70, Cal 60, then the two Zoe addresses: together (65) they would rank 4th, outside the cut.
      const w = await why(dir, "Zoe Quist");
      assert.equal(w.classification, "belowCut");
      assert.deepEqual([w.rank, w.combinedLines, w.combinedRank], [6, 65, 4]);
      assert.match(w.message, /the third place holds 70 lines, so the cut is 70 lines/);
      assert.match(w.message, /counted together \(65 lines\) they would rank 4th/);
    },
  );
});

test("a combined identity that only ties the person above it still ranks above them", async () => {
  await withRepo(
    (dir) => {
      pay(dir);
      commitAsIdentity(dir, ["Hal Pike", "hal@pike.example"], "2026-02-01T11:00:00Z", "hal", { "src/pay/h.js": lines("h", 65) });
    },
    async (dir) => {
      // Together the two Zoe addresses hold 65 lines, as Hal does: Ada and Bea are above, so they would rank 3rd.
      const w = await why(dir, "Zoe Quist");
      assert.deepEqual([w.classification, w.combinedRank], ["splitIdentity", 3]);
    },
  );
});

test("a bot at the path is said to be a bot", async () => {
  await withRepo(
    (dir) => {
      pay(dir, false);
      commitAsIdentity(dir, ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"], "2026-02-01T11:00:00Z", "bump", { "src/pay/bot.txt": lines("bot", 9) });
    },
    async (dir) => {
      const w = await why(dir, "dependabot[bot]");
      assert.equal(w.classification, "bot");
      assert.match(w.message, /^dependabot\[bot\] is a bot identity, not counted as an author, so it is never suggested as a reviewer; --include-bots counts bots\./);
    },
  );
});

test("a sampled run says so", async () => {
  await withRepo((dir) => pay(dir, false), async (dir) => {
    const plain = await why(dir, "Dee Fern");
    assert.doesNotMatch(plain.message, /sample 1 in/);
    const files = ["core", "misc", "ada", "bea", "dee", "dee2"].map((f) => `src/pay/${f}.js`);
    const seed = ["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"].find((s) => files.some((f) => inSample(f, 2, s)));
    assert.ok(seed);
    const sampled = await why(dir, "Dee Fern", ["--sample", "2", "--seed", /** @type {string} */ (seed)]);
    assert.match(sampled.message, /\(sample 1 in 2: only a sample of the files was read\)$/);
    assert.equal(sampled.sampleEvery, 2);
  });
});

test("the JSON key, the text and the schema agree, and the text starts with the message", async () => {
  await withRepo(pay, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q", "--why-not", "Zoe Quist", "--", "src/pay/"]));
    assert.ok(renderWhyNot(r).startsWith(`${r.whyNot?.message}\n`));
    assert.deepEqual(schemaErrors(JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8")), JSON.parse(renderJson(r))), []);
    const none = await analyse(parseArgs(["--cwd", dir, "-q"]));
    assert.equal(none.whyNot, null);
    assert.equal(none.ownedBy, null);
    assert.equal(none.forDiff, null);
  });
});

test("--why-not needs exactly one path after --, and is its own view", async () => {
  assert.throws(() => parseArgs(["--why-not", "Ada"]), /--why-not needs the path after --/);
  assert.throws(() => parseArgs(["--why-not", "Ada", "--", "a", "b"]), /--why-not takes one path after --/);
  for (const extra of [["--csv"], ["--markdown"], ["--identities"], ["--group-by", "dir"], ["--files"], ["--orphans"], ["--without", "Ada"], ["--brief"], ["--for-diff", "a..b"], ["--owned-by", "Ada"]]) {
    assert.throws(() => parseArgs(["--why-not", "Ada", ...extra, "--", "src"]), /prints its own view; it can be combined with --json only, not with /, extra.join(" "));
  }
  // --reviewers and --history take their own path, so they cannot be given beside the path after --.
  assert.throws(() => parseArgs(["--why-not", "Ada", "--reviewers", "src", "--", "src"]), /--reviewers takes its path as its own value/);
  assert.doesNotThrow(() => parseArgs(["--why-not", "Ada", "--json", "--", "src"]));
});
