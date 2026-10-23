// @ts-check
// Round 13, G11a: the activity line under the table, and the `activity` JSON key. An author is active with a commit in
// the N days before the ref's commit date (never before today). Fixtures are tiny repositories with invented names and
// fixed dates, built here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, git, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderFiles, renderReviewers, renderHistory, renderJson } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  ada: ["Ada Quill", "ada@quill.example"],
  adaOld: ["Ada Quill", "ada@old.quill.example"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  robot: ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"],
};
/** @param {string} dir @param {string} who @param {string} date @param {Record<string, string>} files */
const commit = (dir, who, date, files) => commitAsIdentity(dir, WHO[who], `${date}T10:00:00Z`, `${who}: change`, files);

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-activity-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} [extra] */
const run = (dir, extra = []) => analyse(parseArgs(["--cwd", dir, ...extra]));

// The ref commit is dated 2026-03-10. Ada's last commit is exactly 365 days before it (2025-03-10), Bea's 366 days.
/** @param {string} dir */
function window365(dir) {
  commit(dir, "bea", "2025-03-09", { "b.js": lines("b", 30) });
  commit(dir, "ada", "2025-03-10", { "a.js": lines("a", 10) });
  commit(dir, "cal", "2026-03-10", { "c.js": lines("c", 10) });
}

test("the window is counted back from the ref's commit date: 365 days is inside, 366 is outside", async () => {
  await withRepo(window365, async (dir) => {
    const r = await run(dir);
    assert.ok(r.activity);
    assert.equal(r.activity.asOf, "2026-03-10");
    assert.equal(r.activity.activeDays, 365);
    assert.equal(r.activity.authors, 3);
    assert.equal(r.activity.activeAuthors, 2, "Ada (365 days) and Cal are active, Bea (366 days) is not");
    assert.equal(r.activity.activeLines, 20);
    assert.equal(r.activity.lines, 50);
    assert.equal(r.activity.activeShare, 0.4);
    assert.equal(r.activity.inactiveShare, 0.6);
    assert.deepEqual(r.activity.largestInactive.map((p) => [p.author, p.lines, p.lastCommit]), [["Bea Marsh", 30, "2025-03-09"]]);
    const text = renderTable(r, null);
    assert.ok(
      text.split("\n").includes("as of 2026-03-10: 2 of 3 authors committed in the last 365 days and hold 40.0% of the non-blank lines; 60.0% of the lines belong to people with no commit in that time"),
      text,
    );
  });
});

test("--active-days moves the window: 366 days brings Bea in and the line disappears, 364 pushes Ada out", async () => {
  await withRepo(window365, async (dir) => {
    const wide = await run(dir, ["--active-days", "366"]);
    assert.equal(wide.activity?.activeAuthors, 3);
    assert.equal(wide.activity?.activeDays, 366);
    assert.doesNotMatch(renderTable(wide, null), /^as of /m, "nothing is printed when everyone is active");
    const narrow = await run(dir, ["--active-days", "364"]);
    assert.equal(narrow.activity?.activeAuthors, 1);
    assert.match(renderTable(narrow, null), /^as of 2026-03-10: 1 of 3 authors committed in the last 364 days and hold 20\.0% of the non-blank lines; 80\.0% of the lines/m);
  });
});

test("--active-days must be a whole number of at least one", () => {
  for (const bad of ["0", "-3", "1.5", "abc"]) assert.throws(() => parseArgs(["--active-days", bad]), /--active-days must be an integer >= 1/);
  assert.throws(() => parseArgs(["--active-days"]), /needs a value/);
  assert.equal(parseArgs([]).activeDays, 365);
  assert.equal(parseArgs(["--active-days", "30"]).activeDays, 30);
});

test("the as-of date is the ref's commit date, not today: an older --ref gives the older picture", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2024-01-10", { "a.js": lines("a", 10) });
      commit(dir, "bea", "2024-02-10", { "b.js": lines("b", 10) });
      commit(dir, "cal", "2026-03-10", { "c.js": lines("c", 10) });
    },
    async (dir) => {
      const early = git(dir, ["rev-list", "--max-count=1", "--until=2024-03-01T00:00:00Z", "HEAD"]).trim();
      const r = await run(dir, ["--ref", early]);
      assert.equal(r.activity?.asOf, "2024-02-10");
      assert.equal(r.activity?.activeAuthors, 2, "at that date both authors had committed within the year");
      assert.equal(r.activity?.authors, 2);
      assert.equal(activityText(r), null);
      const late = await run(dir);
      assert.equal(late.activity?.asOf, "2026-03-10");
      assert.equal(late.activity?.activeAuthors, 1);
    },
  );
});

/** @param {any} r */
const activityText = (r) => renderTable(r, null).split("\n").find((l) => l.startsWith("as of ")) ?? null;

test("a person with two addresses merged by .mailmap is one author, active by the newest commit of either address", async () => {
  await withRepo(
    (dir) => {
      // The old address commits last: the newest date is found only if .mailmap is applied to the commit's address.
      commit(dir, "ada", "2024-01-10", { "a.js": lines("a", 30), ".mailmap": "Ada Quill <ada@quill.example> <ada@old.quill.example>\n" });
      commit(dir, "adaOld", "2026-03-01", { "n.js": lines("n", 5) });
      commit(dir, "bea", "2024-01-11", { "b.js": lines("b", 10) });
      commit(dir, "cal", "2026-03-10", { "c.js": lines("c", 10) });
    },
    async (dir) => {
      const r = await run(dir);
      assert.equal(r.activity?.authors, 3, "Ada's two addresses are one author");
      assert.equal(r.activity?.activeAuthors, 2);
      assert.deepEqual(r.activity?.largestInactive.map((p) => p.author), ["Bea Marsh"]);
    },
  );
});

test("--merge-identities makes one active person of two addresses with the same name and strong evidence", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "adaOld", "2024-01-10", { "a.js": lines("a", 30) });
      commit(dir, "ada", "2026-03-10", { "n.js": lines("n", 5) });
    },
    async (dir) => {
      const r = await run(dir, ["--merge-identities"]);
      assert.equal(r.activity?.authors, 1);
      assert.equal(r.activity?.activeAuthors, 1);
      assert.equal(activityText(r), null, "everyone active: no line");
      // Without the merge the name still folds to one person for this line, so the answer is the same.
      const plain = await run(dir);
      assert.equal(plain.activity?.authors, 1, "two rows, one person");
      assert.equal(plain.activity?.activeAuthors, 1);
      assert.equal(plain.activity?.lines, 35);
    },
  );
});

test("bots are left out of the authors and the lines unless they are counted", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2024-01-10", { "a.js": lines("a", 10) });
      commit(dir, "robot", "2026-03-10", { "r.js": lines("r", 40) });
      commit(dir, "cal", "2026-03-10", { "c.js": lines("c", 10) });
    },
    async (dir) => {
      const r = await run(dir);
      assert.equal(r.activity?.authors, 2);
      assert.equal(r.activity?.lines, 20);
      const counted = await run(dir, ["--include-bots"]);
      assert.equal(counted.activity?.authors, 3);
      assert.equal(counted.activity?.lines, 60);
    },
  );
});

test("the line is under the table, --files, --reviewers and --history, and the JSON carries the same figures", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "bea", "2024-01-10", { "lib/b.js": lines("b", 30) });
      commit(dir, "cal", "2026-03-10", { "lib/c.js": lines("c", 10) });
    },
    async (dir) => {
      const want = "as of 2026-03-10: 1 of 2 authors committed in the last 365 days and hold 25.0% of the non-blank lines; 75.0% of the lines belong to people with no commit in that time";
      assert.ok(renderTable(await run(dir), null).split("\n").includes(want));
      assert.ok(renderFiles(await run(dir, ["--files"])).split("\n").includes(want));
      assert.ok(renderReviewers(await run(dir, ["--reviewers", "lib"]), 5).split("\n").includes(want));
      assert.ok(renderHistory(await run(dir, ["--history", "lib"]), 10).split("\n").includes(want));
      const json = JSON.parse(renderJson(await run(dir)));
      const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
      assert.deepEqual(schemaErrors(schema, json), []);
      assert.equal(json.activity.activeShare, 0.25);
      assert.equal(json.activity.inactiveShare, 0.75);
    },
  );
});
