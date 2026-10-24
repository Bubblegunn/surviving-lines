// @ts-check
// Round 13: --owned-by <author>[,<author>...], what one person owns. Fixtures are tiny repositories with invented
// names and fixed dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderOwnedBy, renderJson } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  ada: ["Ada Quill", "ada@quill.example"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  dee: ["Dee Fern", "dee@fern.example"],
  eli: ["Eli Voss", "eli@voss.example"],
  bot: ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"],
};
/** @param {string} dir @param {string} who @param {string} date @param {Record<string, string | null>} files */
const commit = (dir, who, date, files) => commitAsIdentity(dir, WHO[who], `${date}T10:00:00Z`, `${who}: change`, files);

/**
 * Ada: engine/a.js 20 non-blank lines and 2 blank ones (only Ada), engine/b.js 30 (only Ada), engine/c.js 10 (Bea 10),
 * api/x.js 6 (Bea 14), docs/r.md 2 (Cal 18). Bea: api/y.js 20 (it replaced Dee's 12 lines, so Dee has a commit and no line).
 * Eli (inactive): docs/old.md 8. A bot wrote bot.txt (5 lines). Non-blank totals: Ada 68, Bea 44, Cal 18, Eli 8 = 138
 * in 7 files; with the 2 blank lines 140.
 * @param {string} dir
 */
function team(dir) {
  commit(dir, "dee", "2024-01-05", { "src/api/y.js": lines("dee", 12) });
  commit(dir, "eli", "2024-03-01", { "docs/old.md": lines("eli", 8) });
  commit(dir, "ada", "2026-01-05", {
    "src/engine/a.js": lines("a", 10) + "\n\n" + lines("a2", 10),
    "src/engine/b.js": lines("b", 30),
    "src/engine/c.js": lines("c", 10),
    "src/api/x.js": lines("x", 6),
    "docs/r.md": lines("r", 2),
  });
  commit(dir, "bea", "2026-01-10", { "src/engine/c.js": lines("c", 10) + lines("cb", 10), "src/api/x.js": lines("x", 6) + lines("xb", 14), "src/api/y.js": lines("y", 20) });
  commit(dir, "cal", "2026-01-15", { "docs/r.md": lines("r", 2) + lines("rc", 18) });
  commit(dir, "bot", "2026-01-16", { "bot.txt": lines("bot", 5) });
}

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-ownedby-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} extra */
const run = (dir, extra) => analyse(parseArgs(["--cwd", dir, "-q", ...extra]));

test("what a person owns: lines on both bases, files, top owner, half or more, sole author, per directory", async () => {
  await withRepo(team, async (dir) => {
    const v = (await run(dir, ["--owned-by", "Ada Quill"])).ownedBy;
    assert.ok(v);
    assert.equal(v.scopeLines, 138);
    assert.equal(v.scopeLinesWithBlank, 140);
    assert.equal(v.scopeFiles, 7);
    const [ada] = v.owned;
    assert.equal(v.owned.length, 1);
    assert.equal(ada.status, "owner");
    assert.deepEqual([ada.lines, ada.linesWithBlank, ada.files, ada.topOfFiles, ada.halfOrMoreFiles, ada.soleAuthorFiles.files], [68, 70, 5, 3, 3, 2]);
    assert.equal(Math.round(ada.share * 1000), 493);
    assert.equal(Math.round(ada.shareWithBlank * 1000), 500);
    // c.js is a tie (Ada 10, Bea 10) and counts for Ada as top owner (equal lines go by name) and as half or more.
    assert.deepEqual(ada.soleAuthorFiles.items, [{ path: "src/engine/b.js", lines: 30 }, { path: "src/engine/a.js", lines: 20 }]);
    // Directories one level deep: src holds 110 lines, Ada 66; docs holds 28, Ada 2 (third behind Cal 18 and Eli 8).
    assert.deepEqual(ada.byDirectory.items.map((d) => [d.directory, d.lines, Math.round(d.share * 100), d.rank, d.topOwner]), [["src", 66, 60, 1, true], ["docs", 2, 7, 3, false]]);
    assert.deepEqual([ada.commits, Math.round(ada.commitShare * 100)], [1, 20]);
    assert.deepEqual([ada.firstCommit, ada.lastCommit, ada.active], ["2026-01-05", "2026-01-05", true]);
    assert.deepEqual(schemaErrors(JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8")), JSON.parse(renderJson(await run(dir, ["--owned-by", "Ada Quill"])))), []);
  });
});

test("--group-by dir:2 sets the directory depth of the per-directory lines", async () => {
  await withRepo(team, async (dir) => {
    const ada = (await run(dir, ["--owned-by", "Ada Quill", "--group-by", "dir:2"])).ownedBy?.owned[0];
    assert.deepEqual(ada?.byDirectory.items.map((d) => [d.directory, d.lines, Math.round(d.share * 100), d.rank]), [["src/engine", 60, 86, 1], ["src/api", 6, 15, 2], ["docs", 2, 7, 3]]);
  });
});

test("the text names the figures, the directories with their rank and the files only the person wrote", async () => {
  await withRepo(team, async (dir) => {
    const text = renderOwnedBy(await run(dir, ["--owned-by", "Ada Quill", "--group-by", "dir:2"]));
    assert.match(text, /^Ada Quill <ada@quill\.example> holds 68 non-blank lines \(49\.3% of 138; 70 counting blank lines, 50\.0% of 140\), in 5 of 7 files$/m);
    assert.match(text, /^ {2}top owner of 3 files, half or more of 3, the only author with lines in 2$/m);
    assert.match(text, /^ {2}by directory: src\/engine\/ 60 \(86% of it, top owner\), src\/api\/ 6 \(15% of it, 2nd\), docs\/ 2 \(7% of it, 3rd\)$/m);
    assert.match(text, /^ {2}files only Ada Quill has written \(2\): src\/engine\/b\.js, src\/engine\/a\.js$/m);
    assert.match(text, /^ {2}commits 1 \(20\.0% of the commits counted\)$/m);
    assert.match(text, /^ {2}last commit 2026-01-05, active \(365-day window, as of 2026-01-16\)$/m);
    // --top caps the lists and says how many more there are.
    const capped = renderOwnedBy(await run(dir, ["--owned-by", "Ada Quill", "--top", "1"]));
    assert.match(capped, /files only Ada Quill has written \(2\): src\/engine\/b\.js, and 1 more$/m);
    assert.match(capped, /by directory: src\/ 66 \(60% of it, top owner\), and 1 more$/m);
  });
});

test("an inactive person is marked so, with the date of their last commit", async () => {
  await withRepo(team, async (dir) => {
    const eli = (await run(dir, ["--owned-by", "eli@voss.example"])).ownedBy?.owned[0];
    assert.deepEqual([eli?.author, eli?.lines, eli?.files, eli?.topOfFiles, eli?.soleAuthorFiles.files, eli?.lastCommit, eli?.active], ["Eli Voss", 8, 1, 1, 1, "2024-03-01", false]);
    assert.deepEqual(eli?.byDirectory.items.map((d) => [d.directory, d.rank]), [["docs", 2]]);
    const wide = (await run(dir, ["--owned-by", "Eli Voss", "--active-days", "800"])).ownedBy?.owned[0];
    assert.equal(wide?.active, true);
  });
});

test("several selectors give one block each, in the order asked, and a selector may be a comma list", async () => {
  await withRepo(team, async (dir) => {
    for (const args of [["--owned-by", "Cal Dune", "--owned-by", "bea@marsh.example"], ["--owned-by", "Cal Dune,Bea Marsh"]]) {
      const v = (await run(dir, args)).ownedBy;
      assert.deepEqual(v?.owned.map((p) => [p.author, p.lines]), [["Cal Dune", 18], ["Bea Marsh", 44]], args.join(" "));
    }
    assert.equal((await run(dir, ["--owned-by", "Cal Dune", "--owned-by", "cal@dune.example"])).ownedBy?.owned.length, 1);
  });
});

test("an author with commits and no surviving line is said to have none, with their dates", async () => {
  await withRepo(team, async (dir) => {
    const r = await run(dir, ["--owned-by", "Dee Fern"]);
    const dee = r.ownedBy?.owned[0];
    assert.deepEqual([dee?.status, dee?.lines, dee?.commits, dee?.firstCommit, dee?.lastCommit], ["noSurvivingLines", 0, 1, "2024-01-05", "2024-01-05"]);
    assert.match(renderOwnedBy(r), /Dee Fern <dee@fern\.example> has 1 commit \(first 2024-01-05, last 2024-01-05\) but none of their lines survive in this scope; --why-not "Dee Fern" -- <path> explains one path/);
  });
});

test("a bot is not counted and the answer says how to count it", async () => {
  await withRepo(team, async (dir) => {
    const r = await run(dir, ["--owned-by", "dependabot[bot]"]);
    assert.equal(r.ownedBy?.owned[0].status, "bot");
    assert.match(renderOwnedBy(r), /is a bot, not counted; use --include-bots to count it \(1 commit, first 2026-01-16, last 2026-01-16\)/);
    const counted = (await run(dir, ["--owned-by", "dependabot[bot]", "--include-bots"])).ownedBy?.owned[0];
    assert.deepEqual([counted?.status, counted?.lines, counted?.files], ["owner", 5, 1]);
  });
});

test("an unknown author is an error that names the closest names", async () => {
  await withRepo(team, async (dir) => {
    await assert.rejects(run(dir, ["--owned-by", "Ada Quil"]), (err) => {
      assert.match(String(err instanceof Error ? err.message : err), /^--owned-by: no author named or addressed "Ada Quil" has a commit or a surviving line here\. Closest: Ada Quill <ada@quill\.example>;/);
      return true;
    });
    await assert.rejects(run(dir, ["--owned-by", "Cal Dune,Nobody Here"]), /"Nobody Here"/);
    // Five names at most, the closest first.
    await assert.rejects(run(dir, ["--owned-by", "Zed"]), (err) => {
      const first = String(err instanceof Error ? err.message : err).split("\n")[0];
      assert.equal(first.split("<").length - 1, 5);
      return true;
    });
  });
});

test("--owned-by is its own view: only --json may combine, and a path after -- scopes it", async () => {
  for (const extra of [["--csv"], ["--markdown"], ["--identities"], ["--group-by", "ext"], ["--files"], ["--reviewers", "src"], ["--history", "src"], ["--orphans"], ["--without", "Ada"], ["--brief"], ["--for-diff", "a..b"], ["--suggest-codeowners", "--group-by", "dir"]]) {
    assert.throws(() => parseArgs(["--owned-by", "Ada", ...extra]), /prints its own view; it can be combined with --json only, not with /, extra.join(" "));
  }
  assert.doesNotThrow(() => parseArgs(["--owned-by", "Ada", "--json", "--top", "3", "--group-by", "dir:2", "--", "src"]));
  await withRepo(team, async (dir) => {
    const v = (await run(dir, ["--owned-by", "Ada Quill", "--", "docs"])).ownedBy;
    assert.deepEqual([v?.scopeLines, v?.scopeFiles, v?.owned[0].lines, v?.owned[0].files], [28, 2, 2, 1]);
  });
});

test("people with the same name on two addresses are one person", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Ada Quill", "ada@quill.example"], "2026-01-05T10:00:00Z", "one", { "a.js": lines("a", 10) });
      commitAsIdentity(dir, ["Ada Quill", "ada@home.example"], "2026-01-06T10:00:00Z", "two", { "b.js": lines("b", 6) });
      commit(dir, "bea", "2026-01-07", { "c.js": lines("c", 4) });
    },
    async (dir) => {
      const ada = (await run(dir, ["--owned-by", "ada@home.example"])).ownedBy?.owned[0];
      assert.deepEqual([ada?.lines, ada?.files, ada?.addresses, ada?.commits], [16, 2, 2, 2]);
      // The first and the last commit are taken over both addresses.
      assert.deepEqual([ada?.firstCommit, ada?.lastCommit], ["2026-01-05", "2026-01-06"]);
    },
  );
});

test("equal lines in a directory rank by name, and the active window is inclusive", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2026-01-05", { "tie/a.js": lines("a", 5) });
      commit(dir, "bea", "2026-01-06", { "tie/b.js": lines("b", 5) });
      commit(dir, "cal", "2026-01-07", { "tie/c.js": lines("c", 5) });
    },
    async (dir) => {
      const ranks = async (/** @type {string} */ who) => (await run(dir, ["--owned-by", who])).ownedBy?.owned[0].byDirectory.items[0];
      assert.deepEqual([(await ranks("Ada Quill"))?.rank, (await ranks("Bea Marsh"))?.rank, (await ranks("Cal Dune"))?.rank], [1, 2, 3]);
      assert.equal((await ranks("Ada Quill"))?.topOwner, true);
      // The ref is dated 2026-01-07: Ada's last commit is 2 days before it.
      assert.equal((await run(dir, ["--owned-by", "Ada Quill", "--active-days", "2"])).ownedBy?.owned[0].active, true);
      assert.equal((await run(dir, ["--owned-by", "Ada Quill", "--active-days", "1"])).ownedBy?.owned[0].active, false);
    },
  );
});
