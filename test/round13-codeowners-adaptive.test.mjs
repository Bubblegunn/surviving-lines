// @ts-check
// Round 13 (#11): --suggest-codeowners names only people who are active, lists up to three owners per rule, and writes an
// `orphaned` comment instead of an owner line when nobody active holds a fifth of a directory. Fixtures are tiny
// repositories with invented names; the head commit is dated 2026-02-01.
import { test } from "node:test";
import assert from "node:assert/strict";
import { commitAsIdentity, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";

const { parseArgs, analyse, renderCodeowners, CODEOWNERS_CO_OWNER_MIN_SHARE, CODEOWNERS_MAX_OWNERS } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  // Sorts first among equal line counts, so the person who left is the top author of the tie.
  gus: ["Gus Roth", "0-gus@roth.example"],
  ada: ["Ada Quill", "7+adaq@users.noreply.github.com"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  dee: ["Dee Fern", "dee@fern.example"],
};
/** @param {string} dir @param {string} who @param {string} date @param {Record<string, string | null>} files */
const commit = (dir, who, date, files) => commitAsIdentity(dir, WHO[who], `${date}T10:00:00Z`, `${who}: change`, files);

/**
 * lib/: Gus 71 lines (last commit 2024-03-01), Ada 29. old/: Gus 80, Ada 10. mix/: Ada 52, Bea 20, Cal 18, Dee 10, all
 * active. rnd/: Gus 70, Ada 29. many/: Gus 25 and Ada, Bea, Cal, Dee 25 each (a fifth each).
 * @param {string} dir
 */
function build(dir) {
  commit(dir, "gus", "2024-03-01", { "lib/g.js": lines("g", 71), "old/o.js": lines("o", 80), "many/g.js": lines("mg", 25), "rnd/g.js": lines("rg", 70) });
  commit(dir, "ada", "2026-01-05", { "lib/a.js": lines("a", 29), "old/a.js": lines("oa", 10), "mix/a.js": lines("ma", 52), "many/a.js": lines("na", 25), "rnd/a.js": lines("ra", 29) });
  commit(dir, "bea", "2026-01-10", { "mix/b.js": lines("mb", 20), "many/b.js": lines("nb", 25) });
  commit(dir, "cal", "2026-01-12", { "mix/c.js": lines("mc", 18), "many/c.js": lines("nc", 25) });
  commit(dir, "dee", "2026-02-01", { "mix/d.js": lines("md", 10), "many/d.js": lines("nd", 25) });
}

/** @param {(text: string, all: string[]) => void} check @param {string[]} [extra] */
async function suggested(check, extra = []) {
  const dir = createRepo("sl-adaptive-");
  try {
    build(dir);
    const text = renderCodeowners(await analyse(parseArgs(["--cwd", dir, "-q", "--group-by", "dir", ...extra])));
    check(text, text.split("\n"));
  } finally {
    removeRepo(dir);
  }
}

test("a person with no commit in the window is never the sole owner: the active owner is named and a comment says who left", async () => {
  await suggested((text, all) => {
    const at = all.findIndex((l) => l.startsWith("/lib/ "));
    assert.ok(at > 0);
    assert.equal(all[at], "/lib/ @adaq  # Ada Quill holds 29.0% of 100 lines in 2 sampled files");
    assert.equal(all[at - 1], "# /lib/: Gus Roth wrote 71% of the lines but has no commit since 2024-03-01");
    assert.doesNotMatch(all.filter((l) => !l.startsWith("#")).join("\n"), /a-gus@roth\.example/);
  });
});

test("the share in the comment is rounded to a whole percent, not cut", async () => {
  await suggested((text, all) => {
    // rnd/: Gus 70 of 99 lines is 70.7%.
    assert.ok(all.includes("# /rnd/: Gus Roth wrote 71% of the lines but has no commit since 2024-03-01"));
  });
});

test("a second and third owner are listed when each holds a fifth of the path; a smaller share is not", async () => {
  await suggested((text, all) => {
    // mix/: Ada 52%, Bea 20% (exactly a fifth), Cal 18%, Dee 10%.
    assert.equal(all.find((l) => l.startsWith("/mix/ ")), "/mix/ @adaq bea@marsh.example  # Ada Quill 52.0%, Bea Marsh 20.0% of 100 lines in 4 sampled files");
    assert.equal(CODEOWNERS_CO_OWNER_MIN_SHARE, 0.2);
  });
});

test("a rule names at most three owners", async () => {
  await suggested((text, all) => {
    // many/: Gus has left, four active people hold exactly a fifth each (25 of 125).
    const rule = all.find((l) => l.startsWith("/many/ "));
    assert.ok(rule);
    const owners = rule.slice("/many/ ".length).split("  #")[0].split(" ");
    assert.equal(owners.length, 3);
    assert.equal(CODEOWNERS_MAX_OWNERS, 3);
    assert.ok(owners.every((o) => ["@adaq", "bea@marsh.example", "cal@dune.example", "dee@fern.example"].includes(o)));
    assert.ok(!owners.includes("0-gus@roth.example"));
    assert.equal(all[all.indexOf(rule) - 1], "# /many/: Gus Roth wrote 20% of the lines but has no commit since 2024-03-01");
  });
});

test("nobody active holds a fifth: an orphaned comment and no owner line", async () => {
  await suggested((text, all) => {
    // old/: Gus 80 lines (left), Ada 10 (11.1%).
    assert.ok(all.includes("# orphaned: nobody active holds 20% of /old/"));
    assert.ok(!all.some((l) => l.startsWith("/old/")));
  });
});

test("the window is --active-days before the ref date, to the day", async () => {
  // Ada's last commit is 2026-01-05, 27 days before the head commit.
  await suggested((text, all) => assert.ok(all.some((l) => l.startsWith("/lib/ @adaq"))), ["--active-days", "27"]);
  await suggested((text, all) => {
    assert.ok(all.includes("# orphaned: nobody active holds 20% of /lib/"));
    assert.ok(!all.some((l) => l.startsWith("/lib/")));
    // mix/: Ada is out of the window, so Bea (22 days) is named, and the comment says who left.
    assert.ok(all.some((l) => l.startsWith("/mix/ bea@marsh.example")));
    assert.ok(all.includes("# /mix/: Ada Quill wrote 52% of the lines but has no commit since 2026-01-05"));
  }, ["--active-days", "26"]);
  // A window that reaches back to 2024 makes Gus active again: then he is named.
  await suggested((text, all) => {
    const rule = all.find((l) => l.startsWith("/lib/ "));
    assert.ok(rule?.startsWith("/lib/ 0-gus@roth.example @adaq"));
    assert.ok(!all.some((l) => l.includes("has no commit since 2024-03-01")));
    assert.ok(!all.some((l) => l.startsWith("# orphaned")));
  }, ["--active-days", "5000"]);
});

test("the header says who is named, and a directory whose top active author holds under half still says so", async () => {
  await suggested((text, all) => {
    assert.equal(all[2], "# Only people with a commit in the 365 days before 2026-02-01 are named as owners.");
  });
  const dir = createRepo("sl-adaptive-split-");
  try {
    commit(dir, "ada", "2026-01-05", { "split/a.js": lines("a", 40) });
    commit(dir, "bea", "2026-01-06", { "split/b.js": lines("b", 35) });
    commit(dir, "cal", "2026-01-07", { "split/c.js": lines("c", 25) });
    const text = renderCodeowners(await analyse(parseArgs(["--cwd", dir, "-q", "--group-by", "dir"])));
    assert.match(text, /^# \/split\/ no author holds half of 100 lines in 3 sampled files; top is Ada Quill at 40\.0%$/m);
    assert.doesNotMatch(text, /^\/split\//m);
  } finally {
    removeRepo(dir);
  }
});

test("a merged identity is active when any of its addresses committed in the window", async () => {
  const dir = createRepo("sl-adaptive-merge-");
  try {
    commitAsIdentity(dir, ["Gus Roth", "gus@old.example"], "2024-03-01T10:00:00Z", "gus: old", { "app/g.js": lines("g", 60) });
    commitAsIdentity(dir, ["Gus Roth", "gus@new.example"], "2026-01-20T10:00:00Z", "gus: new", { "other/n.js": lines("n", 5) });
    commit(dir, "ada", "2026-02-01", { "app/a.js": lines("a", 40) });
    const text = renderCodeowners(await analyse(parseArgs(["--cwd", dir, "-q", "--group-by", "dir", "--merge-identities"])));
    // Both Gus addresses are one person (same name and strong hint); his new address committed in the window.
    assert.doesNotMatch(text, /orphaned: nobody active holds 20% of \/app\//);
    assert.match(text, /^\/app\/ .*gus@(old|new)\.example/m);
  } finally {
    removeRepo(dir);
  }
});
