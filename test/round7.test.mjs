// @ts-check
// Round 7: the same scope notes in every view (R7-1), people ranked by surviving lines whatever their activity (R7-2),
// and the note for identities a .mailmap merged. Every repository is built inside the test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { schemaErrors } from "../scripts/schema-check.mjs";

const schema = JSON.parse(readFileSync(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));

const { parseArgs, analyse, renderTable, renderReviewers, renderHistory, renderMarkdown, renderIdentities, renderJson, scopeNotes, linkIdentities, sameAddressNames, readMailmapMerges } = await import("../bin/surviving-lines.js");

/** @param {string} dir @param {string[]} args @param {Record<string, string>} [env] */
function git(dir, args, env = {}) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", ...env } });
}

/**
 * @param {string} dir
 * @param {{ name: string, mail: string, date: string, files: Record<string, string>, message?: string }} c
 */
function commit(dir, c) {
  for (const [path, text] of Object.entries(c.files)) {
    const full = join(dir, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
    git(dir, ["add", path]);
  }
  git(dir, ["commit", "-q", "-m", c.message ?? "change"], {
    GIT_AUTHOR_NAME: c.name,
    GIT_AUTHOR_EMAIL: c.mail,
    GIT_AUTHOR_DATE: `${c.date}T12:00:00Z`,
    GIT_COMMITTER_NAME: c.name,
    GIT_COMMITTER_EMAIL: c.mail,
    GIT_COMMITTER_DATE: `${c.date}T12:00:00Z`,
  });
}

const lines = (/** @type {string} */ tag, /** @type {number} */ n) => Array.from({ length: n }, (_, i) => `${tag} ${i}\n`).join("");

/** @param {(dir: string) => Promise<void>} fn @param {(dir: string) => void} [setup] */
async function withRepo(setup, fn) {
  const dir = mkdtempSync(join(tmpdir(), "sl-r7-"));
  try {
    git(dir, ["init", "-q", "-b", "main"]);
    setup(dir);
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A repository with a lockfile, a bot, and a reformat-free history, so the notes have something to say. */
function notesRepo(/** @type {string} */ dir) {
  commit(dir, { name: "Ann Old", mail: "ann@example.com", date: "2020-01-01", files: { "lib/a.js": lines("ann", 60), "lib/package-lock.json": lines("lock", 40) } });
  commit(dir, { name: "Bea New", mail: "bea@example.com", date: "2026-03-01", files: { "lib/b.js": lines("bea", 10) } });
  commit(dir, { name: "dependabot[bot]", mail: "bot@example.com", date: "2026-03-02", files: { "lib/c.js": lines("bot", 5) } });
}

test("R7-1: every view and the JSON carry the same dropped-files and bots notes", async () => {
  await withRepo(notesRepo, async (dir) => {
    const views = [
      ["table", []],
      ["reviewers", ["--reviewers", "lib"]],
      ["history", ["--history", "lib"]],
      ["reviewers whole repo", ["--reviewers", "."]],
      ["history whole repo", ["--history", "."]],
    ];
    for (const [name, extra] of views) {
      const r = await analyse(parseArgs(["--cwd", dir, "-q", ...extra]));
      const notes = scopeNotes(r, { view: r.reviewers ?? r.history ?? null }).join("\n");
      assert.match(notes, /bots excluded: 1 identity/, name);
      assert.match(notes, /dropped: 1 file, 40 lines left out of every number \(lockfile/, name);
      const text = r.reviewers ? renderReviewers(r, 5) : r.history ? renderHistory(r, 10) : renderTable(r, 10);
      assert.ok(text.includes(notes.split("\n")[0]), `${name}: the view prints the shared notes`);
      assert.ok(text.includes("dropped: 1 file"), name);
      assert.equal(r.dropped.files, 1, `${name}: the JSON holds the same fact`);
      assert.equal(r.bots.excluded.length, 1);
    }
    const r = await analyse(parseArgs(["--cwd", dir, "-q"]));
    assert.ok(renderMarkdown(r, 10).includes("dropped: 1 file"));
    const identities = renderIdentities(linkIdentities(r.authors), sameAddressNames([]), r.possibleSamePerson);
    assert.ok(identities.length > 0);
  });
});

test("R7-1: --identities prints the scope notes after the suggestions", async () => {
  await withRepo(notesRepo, async (dir) => {
    const out = execFileSync("node", [join(import.meta.dirname, "..", "bin", "surviving-lines.js"), "--cwd", dir, "-q", "--identities"], { encoding: "utf8" });
    assert.match(out, /bots excluded: 1 identity/);
    assert.match(out, /dropped: 1 file/);
  });
});

/** Ann owns most of lib, wrote it long ago; Bea and Cy are recent and small. */
function activitySetup(/** @type {string} */ dir) {
  commit(dir, { name: "Ann Old", mail: "ann@example.com", date: "2022-01-01", files: { "lib/a.js": lines("ann", 80) } });
  commit(dir, { name: "Bea New", mail: "bea@example.com", date: "2026-02-01", files: { "lib/b.js": lines("bea", 12) } });
  commit(dir, { name: "Cy Newer", mail: "cy@example.com", date: "2026-03-01", files: { "lib/c.js": lines("cy", 8) } });
  commit(dir, { name: "Di Newest", mail: "di@example.com", date: "2026-03-10", files: { "lib/d.js": lines("di", 4) } });
}

test("R7-2: the reviewers list is ordered by lines; an inactive top owner stays first and is marked", async () => {
  await withRepo(activitySetup, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q", "--reviewers", "lib"]));
    const v = r.reviewers;
    assert.deepEqual(v?.suggested.map((p) => p.author), ["Ann Old", "Bea New", "Cy Newer"]);
    assert.equal(v?.suggested[0].active, false);
    assert.deepEqual(v?.suggestedActiveOnly?.map((p) => p.author), ["Bea New", "Cy Newer", "Di Newest"]);
    const text = renderReviewers(r, 5);
    const suggested = text.split("\n").find((l) => l.startsWith("suggested by surviving lines")) ?? "";
    assert.ok(suggested.startsWith("suggested by surviving lines: Ann Old (80 lines"), suggested);
    assert.match(suggested, /Ann Old \(80 lines, [\d.]+%, last commit 2022-01-01, inactive\)/);
    assert.match(text, /\nactive only \(a cut by recent commits; the line-ranked list above is the ownership answer\): Bea New/);
    assert.ok(!text.includes("prefer the active"), text);
    const order = text.split("\n").filter((l) => /^(Ann|Bea|Cy|Di) /.test(l)).map((l) => l.split(" ")[0]);
    assert.deepEqual(order, ["Ann", "Bea", "Cy", "Di"]);
    assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), []);
  });
});

test("R7-2: when every top-three person is active there is no second list", async () => {
  await withRepo((dir) => {
    commit(dir, { name: "Bea New", mail: "bea@example.com", date: "2026-02-01", files: { "lib/b.js": lines("bea", 12) } });
    commit(dir, { name: "Cy Newer", mail: "cy@example.com", date: "2026-03-01", files: { "lib/c.js": lines("cy", 8) } });
  }, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q", "--reviewers", "lib"]));
    assert.equal(r.reviewers?.suggestedActiveOnly, null);
    assert.ok(!renderReviewers(r, 5).includes("active only"));
  });
});

/** Two raw addresses of one person, merged by a .mailmap in the repository. */
function mailmapSetup(/** @type {string} */ dir) {
  commit(dir, { name: "Eve Main", mail: "eve@example.com", date: "2024-01-01", files: { "src/a.js": lines("eve", 30) } });
  commit(dir, { name: "eve laptop", mail: "eve@laptop.local", date: "2024-02-01", files: { "src/b.js": lines("lap", 20) } });
  commit(dir, { name: "Fay Solo", mail: "fay@example.com", date: "2024-03-01", files: { "src/c.js": lines("fay", 10) } });
  commit(dir, { name: "Gus Gone", mail: "gus@old.example", date: "2024-04-01", files: { "src/d.js": lines("gus", 7) } });
  writeFileSync(join(dir, ".mailmap"), "Eve Main <eve@example.com> <eve@laptop.local>\nOther Person <other@example.com> <nobody@nowhere.example>\n");
  git(dir, ["add", ".mailmap"]);
  git(dir, ["commit", "-q", "-m", "mailmap"], { GIT_AUTHOR_NAME: "Fay Solo", GIT_AUTHOR_EMAIL: "fay@example.com", GIT_COMMITTER_NAME: "Fay Solo", GIT_COMMITTER_EMAIL: "fay@example.com" });
}

test("the .mailmap note names the merged identities and the lines they add, only for authors in the output", async () => {
  await withRepo(mailmapSetup, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q"]));
    assert.equal(r.mailmap.file, ".mailmap");
    assert.equal(r.mailmap.merges.length, 1, "the entry for an address nobody used is not reported");
    const m = r.mailmap.merges[0];
    assert.deepEqual(m.into, { name: "Eve Main", mail: "eve@example.com" });
    assert.equal(m.lines, 20);
    assert.deepEqual(m.from, [{ name: "eve laptop", mail: "eve@laptop.local", lines: 20 }]);
    assert.equal(r.authors.find((a) => a.author === "Eve Main")?.lines, 50);
    const text = renderTable(r, 10);
    assert.match(text, /identities merged by \.mailmap \(already applied to every number above\): Eve Main <eve@example\.com> includes eve laptop <eve@laptop\.local> \(20 lines\), 20 lines added/);
    for (const extra of [["--reviewers", "src"], ["--history", "src"]]) {
      const view = await analyse(parseArgs(["--cwd", dir, "-q", ...extra]));
      assert.ok((view.reviewers ? renderReviewers(view, 5) : renderHistory(view, 5)).includes("identities merged by .mailmap"));
    }
    assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), []);
  });
});

test("a repository without a .mailmap has no note and an empty field", async () => {
  await withRepo(activitySetup, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q"]));
    assert.deepEqual(r.mailmap, { file: null, merges: [] });
    assert.ok(!renderTable(r, 10).includes("merged by .mailmap"));
  });
});

test("R7 fix 1: mailmap.file in the git config is named as the source", async () => {
  await withRepo((dir) => {
    commit(dir, { name: "Eve Main", mail: "eve@example.com", date: "2024-01-01", files: { "a.js": lines("eve", 30) } });
    commit(dir, { name: "eve laptop", mail: "eve@laptop.local", date: "2024-02-01", files: { "b.js": lines("lap", 20) } });
    writeFileSync(join(dir, "..", `${dir.split("/").pop()}.map`), "Eve Main <eve@example.com> <eve@laptop.local>\n");
    git(dir, ["config", "mailmap.file", join(dir, "..", `${dir.split("/").pop()}.map`)]);
  }, async (dir) => {
    try {
      const r = await analyse(parseArgs(["--cwd", dir, "-q"]));
      assert.equal(r.mailmap.file, "mailmap.file");
      assert.equal(r.mailmap.merges.length, 1);
      assert.match(renderTable(r, 10), /identities merged by mailmap\.file/);
    } finally {
      rmSync(join(dir, "..", `${dir.split("/").pop()}.map`), { force: true });
    }
  });
});

test("R7 fix 2: tabs and angle brackets in names do not break or hide a merge", async () => {
  await withRepo((dir) => {
    commit(dir, { name: "Eve Main", mail: "eve@example.com", date: "2024-01-01", files: { "a.js": lines("eve", 30) } });
    commit(dir, { name: "Eve\tTab", mail: "eve@tab.local", date: "2024-02-01", files: { "b.js": lines("tab", 20) } });
    commit(dir, { name: "Eve <Angle>", mail: "eve@angle.local", date: "2024-03-01", files: { "c.js": lines("ang", 10) } });
    writeFileSync(join(dir, ".mailmap"), "Eve Main <eve@example.com> <eve@tab.local>\nEve Main <eve@example.com> <eve@angle.local>\n");
    git(dir, ["add", ".mailmap"]);
  }, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q"]));
    const from = r.mailmap.merges[0]?.from.map((f) => f.mail).sort();
    assert.deepEqual(from, ["eve@angle.local", "eve@tab.local"]);
    assert.equal(r.mailmap.merges[0].from.find((f) => f.mail === "eve@tab.local")?.name, "Eve\tTab");
    // git itself strips < and > from an author name, so the entry arrives as "Eve Angle"; it must not be skipped.
    assert.equal(r.mailmap.merges[0].from.find((f) => f.mail === "eve@angle.local")?.name, "Eve Angle");
  });
});

test("R7 fix 3: a merge target is present by its mail address; the name decides only when the row has no mail", async () => {
  await withRepo(mailmapSetup, async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "-q"]));
    // Same name as the target, different address: the row is another person, so the merge is not reported.
    const rows = r.authors.map((a) => (a.author === "Eve Main" ? { ...a, mail: "someone-else@example.com" } : a));
    const blamed = new Map(git(dir, ["log", "--format=%H"]).split("\n").filter(Boolean).map((sha) => [sha, { lines: 5 }]));
    const o = parseArgs(["--cwd", dir, "-q"]);
    assert.equal((await readMailmapMerges(o, blamed, r.authors)).merges.length, 1, "control: the real row matches by mail");
    assert.deepEqual((await readMailmapMerges(o, blamed, rows)).merges, []);
    const noMail = r.authors.map((a) => ({ ...a, mail: "" }));
    assert.equal((await readMailmapMerges(o, blamed, noMail)).merges.length, 1, "no mail: the name decides");
  });
});

test("R7 fix 4: a merge source with 0 lines in a path-scoped view is dropped, and no note remains when none is left", async () => {
  await withRepo(mailmapSetup, async (dir) => {
    // src/a.js is Eve's own file; the laptop address wrote only src/b.js.
    const r = await analyse(parseArgs(["--cwd", dir, "-q", "--", "src/a.js"]));
    assert.deepEqual(r.mailmap.merges, []);
    assert.ok(!renderTable(r, 10).includes("merged by"));
  });
});

test("R7 fix 5: --markdown with --reviewers or --history is an error, not the whole-repo table", () => {
  for (const flag of ["--reviewers", "--history"]) {
    assert.throws(() => parseArgs(["--markdown", flag, "src"]), /can be combined with --json only/);
  }
});

test("R7 fix 6: CSV notes on stderr are the scope notes, each prefixed", async () => {
  await withRepo(notesRepo, async (dir) => {
    const out = (await import("node:child_process")).spawnSync(process.execPath, [join(import.meta.dirname, "..", "bin", "surviving-lines.js"), "--cwd", dir, "--csv"], { encoding: "utf8" });
    const r = await analyse(parseArgs(["--cwd", dir, "-q"]));
    for (const note of scopeNotes(r).filter(Boolean)) assert.ok(out.stderr.includes(`surviving-lines: ${note}`), note);
  });
});

test("R7 fix 7: the schema says co-author trailer identities are not in the mailmap note", () => {
  assert.match(schema.properties.mailmap.description, /Co-authored-by trailers are not listed/);
});

test("R7-4: names equal once punctuation is removed are a strong accent-kind item", async () => {
  const { suggestSamePerson } = await import("../bin/surviving-lines.js");
  const row = (author, mail) => ({ author, mail, lines: 10, commits: 1 });
  const out = suggestSamePerson([row("Zoe ONeil", "a@x.test"), row("Zoë O'Neil", "b@y.test")], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].strength, "strong");
});
