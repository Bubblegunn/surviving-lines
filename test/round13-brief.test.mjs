// @ts-check
// Round 13, B4: --brief, one compact plain-text view of the whole repository that an agent can quote. It is built from the
// same analysis objects as the other views. Fixtures are tiny repositories with invented names and fixed dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, git, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderBrief, renderBriefJson, BRIEF_MAX_CHARS, BRIEF_MAX_LINES, BRIEF_QUOTE_RULE } = await import("../bin/surviving-lines.js");

const BIN = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
/** @typedef {[string, string]} Id */
const ADA = /** @type {Id} */ (["Ada Quill", "ada@quill.example"]);
const BEA = /** @type {Id} */ (["Bea Marsh", "bea@marsh.example"]);
const BEA2 = /** @type {Id} */ (["Bea Marsh", "bea@home.example"]);
const CAL = /** @type {Id} */ (["Cal Dune", "cal@dune.example"]);
const DEE = /** @type {Id} */ (["Dee Fern", "dee@fern.example"]);
const BOT = /** @type {Id} */ (["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"]);
const WEB = /** @type {Id} */ (["Web Merger", "noreply@merger.example"]);

/** @param {string} dir @param {Id} who @param {string} date @param {string} subject @param {Record<string, string>} files @param {Id} [committer] */
const commit = (dir, who, date, subject, files, committer) => commitAsIdentity(dir, who, `${date}T10:00:00Z`, subject, files, committer);
/** Lines with a blank line after every third one, so the two line counts differ. */
const spaced = (/** @type {string} */ p, /** @type {number} */ n) => Array.from({ length: n }, (_, i) => (i % 3 === 2 ? `${p} ${i}\n` : `${p} ${i}`)).join("\n") + "\n";

/**
 * Ada (inactive since 2024) wrote src/core.js and src/gone.js; Bea wrote from two addresses; Cal is active and wrote docs,
 * a root file and a single-owner file; a bot wrote a data file; a lockfile is dropped; Bea switched the quotes of
 * src/app.js (a reformat set aside); Cal's src/viaweb.js was committed by someone else; Dee only added blank lines.
 * The ref date is 2026-03-10.
 * @param {string} dir
 */
function build(dir) {
  commit(dir, ADA, "2024-01-10", "ada: core and gone", { "src/core.js": spaced("core", 30), "src/gone.js": lines("gone", 40), "src/app.js": Array.from({ length: 20 }, (_, i) => `const s${i} = 'v${i}';`).join("\n") + "\n" });
  commit(dir, BEA, "2024-06-01", "bea: first lib", { "lib/b1.js": lines("b1", 15) });
  commit(dir, BEA2, "2024-06-02", "bea: second lib", { "lib/b2.js": lines("b2", 10) });
  commit(dir, BEA, "2025-02-01", "style: switch app.js to double quotes", { "src/app.js": Array.from({ length: 20 }, (_, i) => `const s${i} = "v${i}";`).join("\n") + "\n" });
  commit(dir, BOT, "2025-03-01", "chore(deps): bump", { "docs/deps.txt": lines("dep", 7), "package-lock.json": lines("lock", 50) });
  commit(dir, CAL, "2026-02-01", "cal: docs and root", { "docs/guide.md": lines("guide", 12), "README.md": lines("readme", 5), "src/live.js": lines("live", 25) });
  commit(dir, CAL, "2026-02-15", "feat: add the web part", { "src/viaweb.js": lines("web", 20) }, WEB);
  commit(dir, DEE, "2026-03-10", "dee: spacing only", { "docs/guide.md": `${lines("guide", 12)}\n\n\n` });
}

/** @param {(dir: string) => void} make @param {(dir: string) => Promise<void> | void} check */
async function withRepo(make, check) {
  const dir = createRepo("sl-brief-");
  try {
    make(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} [extra] */
const run = (dir, extra = []) => analyse(parseArgs(["--cwd", dir, "--brief", "--quiet", ...extra]));
/** @param {string} dir @param {string[]} [extra] */
const cli = (dir, extra = []) => spawnSync(process.execPath, [BIN, "--cwd", dir, "--brief", "--quiet", ...extra], { encoding: "utf8" });
/** @param {any} r */
const briefOf = (r) => r.brief;

test("--brief prints every section within 40 lines and 3,000 characters, and ends with the quote rule", async () => {
  await withRepo(build, async (dir) => {
    const out = cli(dir);
    assert.equal(out.status, 0, out.stderr);
    const text = out.stdout.trimEnd();
    const rows = text.split("\n");
    assert.ok(rows.length <= BRIEF_MAX_LINES && text.length <= BRIEF_MAX_CHARS, `${rows.length} lines, ${text.length} characters`);
    assert.match(rows[0], /^surviving-lines brief; ref HEAD @ [0-9a-f]{7}; as of 2026-03-10; files \d+; commits \d+, merges excluded$/);
    assert.match(text, /^scope: whole repository; \d+ non-blank lines, \d+ counting blank lines$/m);
    assert.match(text, /^owners, top \d+ of \d+: non-blank lines \(share\) \| counting blank lines \(share\) \| commits \(share\)$/m);
    assert.match(text, /^bus factor \(smallest number of authors holding 50% of the lines\): \d+ \(.*\); counting blank lines: \d+; to reach 80%: \d+; active people only: \d+ \(/m);
    assert.match(text, /^activity as of 2026-03-10: \d+ of \d+ people committed in the last 365 days and hold [\d.]+% of the non-blank lines; [\d.]+% belong to people with no commit then/m);
    assert.match(text, /^orphaned files \(top owner inactive, nobody active holds 20%\+\): \d+ of \d+, [\d.]+% of the lines; largest: src\/gone\.js \(Ada Quill, 40\)/m);
    assert.match(text, /^left out of every number: bots 1 \(dependabot\[bot\]; 7 lines, 1 commit\); 1 file, 50 lines \(lockfile 1;/m);
    assert.match(text, /^set-aside commits \(their lines go back to earlier authors\): [0-9a-f]{7} "style: switch app\.js to double quotes" \(reformat\)$/m);
    assert.match(text, /^identity hints, proposals only, NOT applied: Bea Marsh \(bea@home\.example, bea@marsh\.example\) 25 lines [\d.]+% if one person, strong$/m);
    assert.match(text, /^first-level directories \(lines, share of all, top owner and their share of it\): /m);
    assert.match(text, /^single-owner files \(one person holds 90%\+ of at least 20 lines\): /m);
    assert.match(text, /^committed by someone else, lines credited to the author: 1 commit; 20 lines of [0-9a-f]{7} "feat: add the web part" are Cal Dune's, committed by Web Merger$/m);
    assert.equal(rows[rows.length - 1], "quote rule: quote both line counts; identity merges above are proposals; for a named directory or language re-run with -- <dir> or --include");
    assert.equal(rows[rows.length - 1], BRIEF_QUOTE_RULE);
  });
});

test("every owner row carries both line counts and the commits, equal to the full analysis, and no phantom row", async () => {
  await withRepo(build, async (dir) => {
    const full = await analyse(parseArgs(["--cwd", dir, "--quiet"]));
    const b = briefOf(await run(dir));
    const text = renderBrief(b);
    const counted = full.authors.filter((a) => a.lines > 0);
    assert.equal(b.owners.total, counted.length);
    assert.ok(!text.includes("Dee Fern"), "Dee added only blank lines and holds no counted line");
    assert.ok(full.authors.some((a) => a.author === "Dee Fern" && a.lines === 0), "the fixture does produce a blank-only row");
    for (const a of counted.slice(0, 6)) {
      const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
      const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
      const shared = counted.filter((x) => x.author === a.author).length > 1;
      const row = `${shared ? `${a.author} <${a.mail}>` : a.author}: ${n(a.lines)} (${pct(a.lineShare)}) | ${n(a.linesWithBlank)} (${pct(a.shareWithBlank)}) | ${n(a.commits)} (${pct(a.commitShare)})`;
      assert.ok(text.split("\n").some((l) => l.trim() === row), `missing ${row}\n${text}`);
    }
    const ada = full.authors.find((a) => a.author === "Ada Quill");
    assert.ok(ada && ada.linesWithBlank > ada.lines, "the two counts differ for the person with blank lines");
    assert.equal(b.busFactor.value, full.busFactor?.value);
    assert.equal(b.busFactor.withBlank, full.busFactor?.withBlank?.value);
    assert.equal(b.activity.activeAuthors, full.activity?.activeAuthors);
    assert.equal(b.orphans.files, full.orphans?.files);
  });
});

test("the active bus factor is counted on the lines of the people who still commit", async () => {
  await withRepo(build, async (dir) => {
    const b = briefOf(await run(dir));
    // Active on 2026-03-10: only Cal holds counted lines and committed in the last 365 days; Ada and Bea did not.
    assert.deepEqual(b.busFactor.active, { value: 1, authors: ["Cal Dune"], people: 1 });
    assert.match(renderBrief(b), /active people only: 1 \(Cal Dune; counted on the lines of the 1 person with a commit in the last 365 days\)/);
  });
});

test("--brief --json is a small object that matches the schema and the text", async () => {
  await withRepo(build, async (dir) => {
    const out = cli(dir, ["--json"]);
    assert.equal(out.status, 0, out.stderr);
    const doc = JSON.parse(out.stdout);
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    assert.deepEqual(schemaErrors(schema.$defs.brief, doc), []);
    assert.equal(doc.view, "brief");
    assert.equal(doc.quoteRule, BRIEF_QUOTE_RULE);
    assert.ok(out.stdout.length < 6000, `${out.stdout.length} characters`);
    assert.equal(doc.owners.shown[0].author, "Ada Quill");
    assert.equal(out.stdout.trimEnd(), renderBriefJson(briefOf(await run(dir))));
    // A schema that forbids an unknown key proves the check is not vacuous.
    assert.ok(schemaErrors(schema.$defs.brief, { ...doc, extra: 1 }).length > 0);
    assert.ok(schemaErrors(schema.$defs.brief, { ...doc, owners: undefined }).length > 0);
  });
});

test("--brief works with --include, --exclude, paths after --, --since, --merge-identities and --active-days", async () => {
  await withRepo(build, async (dir) => {
    const docs = briefOf(await run(dir, ["--include", "docs/*.md"]));
    assert.deepEqual(docs.owners.shown.map((a) => a.author), ["Cal Dune"]);
    assert.match(renderBrief(docs), /^scope: include docs\/\*\.md; /m);
    assert.ok(!renderBrief(docs).includes("Bea Marsh"), "a same-person proposal that holds no line in the scope is not listed");
    const noDocs = renderBrief(briefOf(await run(dir, ["--exclude", "docs/**"])));
    assert.match(noDocs, /^scope: exclude docs\/\*\*; /m);
    const pathScoped = briefOf(await run(dir, ["--", "lib"]));
    assert.deepEqual(pathScoped.owners.shown.map((a) => a.author), ["Bea Marsh", "Bea Marsh"]);
    assert.match(renderBrief(pathScoped), /^scope: paths lib; 25 non-blank lines/m);
    // --since narrows the commit column only, as everywhere else.
    const since = briefOf(await run(dir, ["--since", "2026-01-01"]));
    const all = briefOf(await run(dir));
    assert.equal(since.owners.shown.find((a) => a.author === "Ada Quill").lines, all.owners.shown.find((a) => a.author === "Ada Quill").lines);
    assert.equal(since.owners.shown.find((a) => a.author === "Ada Quill").commits, 0);
    assert.match(renderBrief(since), /since 2026-01-01/);
    // --merge-identities folds Bea's two addresses and says the merge was applied; the identity line stays labelled.
    const merged = briefOf(await run(dir, ["--merge-identities"]));
    assert.equal(merged.owners.shown.filter((a) => a.author === "Bea Marsh").length, 1);
    assert.equal(merged.owners.shown.find((a) => a.author === "Bea Marsh").lines, 25);
    assert.match(renderBrief(merged), /Bea Marsh \(2 addresses\): 25 /);
    assert.match(renderBrief(merged), /^identity: --merge-identities applied 1 strong group in memory; further proposals, NOT applied: none suspected/m);
    // --active-days 1: Cal committed 23 days before the ref, so nobody with a counted line is active.
    const days = renderBrief(briefOf(await run(dir, ["--active-days", "1"])));
    assert.match(days, /activity as of 2026-03-10: 0 of \d+ people committed in the last 1 days/);
    assert.match(days, /active people only: none committed in the window/);
  });
});

test("--sample says the figures are a sample", async () => {
  await withRepo(build, async (dir) => {
    assert.match(renderBrief(briefOf(await run(dir, ["--sample", "2"]))), /^surviving-lines brief.*merges excluded; sample: 1 file in 2$/m);
  });
});

test("--time-budget with a budget that runs out prints nothing and exits 0; a roomy budget prints the brief", async () => {
  await withRepo(build, async (dir) => {
    const start = Date.now();
    const out = cli(dir, ["--time-budget", "0.001"]);
    assert.equal(out.status, 0);
    assert.equal(out.stdout, "");
    assert.equal(out.stderr, "");
    assert.ok(Date.now() - start < 20000);
    const json = cli(dir, ["--json", "--time-budget", "0.001"]);
    assert.deepEqual([json.status, json.stdout, json.stderr], [0, "", ""]);
    const roomy = cli(dir, ["--time-budget", "120"]);
    assert.equal(roomy.status, 0, roomy.stderr);
    assert.match(roomy.stdout, /^surviving-lines brief/);
    assert.equal(roomy.stdout.trimEnd(), cli(dir).stdout.trimEnd());
  });
});

test("--time-budget and --brief reject what they cannot do", () => {
  /** @param {string[]} argv */
  const err = (argv) => {
    try {
      parseArgs(argv);
      return "";
    } catch (e) {
      return String(/** @type {Error} */ (e).message);
    }
  };
  assert.match(err(["--time-budget", "5"]), /--time-budget works with --brief only/);
  assert.match(err(["--brief", "--time-budget", "0"]), /--time-budget must be a number of seconds above 0/);
  assert.match(err(["--brief", "--time-budget", "soon"]), /--time-budget must be a number of seconds above 0/);
  for (const clash of [["--csv"], ["--markdown"], ["--identities"], ["--files"], ["--orphans"], ["--without", "x"], ["--group-by", "dir"], ["--reviewers", "src"], ["--history", "src"], ["--co-authors", "share"], ["--ai-breakdown"]]) {
    assert.match(err(["--brief", ...clash]), /--brief prints its own view; it can be combined with --json only, not with /, clash.join(" "));
  }
  assert.equal(err(["--brief", "--json", "--include", "x", "--exclude", "y", "--since", "2020-01-01", "--merge-identities", "--active-days", "30", "--time-budget", "2", "--", "src"]), "");
});

const FIRST = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet", "Kilo", "Lima"];

test("many people, long names and long subjects still fit, with all six owner rows and the quote rule", async () => {
  await withRepo(
    (dir) => {
      for (let i = 0; i < 12; i++) {
        /** @type {Id} */
        const who = [`${FIRST[i]} Person With A Very Long Display Name Indeed`, `${FIRST[i].toLowerCase()}@long${i}.example`];
        commit(dir, who, `2025-01-${String(i + 10).padStart(2, "0")}`, `feat: ${"a very long commit subject ".repeat(6)}${i}`, { [`area${i}-with-a-long-directory-name/deeply/nested/file-with-a-long-name-${i}.js`]: spaced(`p${i}`, 60 + i * 5) });
      }
      for (let i = 0; i < 4; i++) commit(dir, [`Mover ${i}`, `mover${i}@x.example`], `2025-02-0${i + 1}`, `refactor: ${"mechanical rename ".repeat(5)}${i}`, { [`m${i}/a.js`]: lines(`m${i}`, 30) }, WEB);
    },
    async (dir) => {
      const b = briefOf(await run(dir));
      const text = renderBrief(b);
      const rows = text.split("\n");
      assert.ok(rows.length <= BRIEF_MAX_LINES && text.length <= BRIEF_MAX_CHARS, `${rows.length} lines, ${text.length} characters`);
      assert.equal(rows.filter((l) => /^ {2}\w+ Person With.*: [\d,]+ \([\d.]+%\) \| [\d,]+ \([\d.]+%\) \| \d+ \([\d.]+%\)$/.test(l)).length, 6, text);
      assert.equal(rows[rows.length - 1], BRIEF_QUOTE_RULE);
      // Sixteen files are single-owner files; the line names some and counts the rest, at whatever length it was shortened to.
      const single = /^single-owner files[^:]*: (.*)$/m.exec(text)?.[1] ?? "";
      assert.equal((single.match(/\.js \(/g) ?? []).length + Number(/, and (\d+) more$/.exec(single)?.[1] ?? 0), 16, single);
    },
  );
});

test("an empty-handed view still reads: one owner, no hints, nothing left out", async () => {
  await withRepo(
    (dir) => commit(dir, ADA, "2026-01-01", "ada: only", { "a.js": lines("a", 10) }),
    async (dir) => {
      const text = renderBrief(briefOf(await run(dir)));
      assert.match(text, /^left out of every number: no bots, no lockfile, generated, vendored or binary files$/m);
      assert.match(text, /^identity hints, proposals only, NOT applied: none suspected/m);
      assert.match(text, /^activity as of 2026-01-01: all 1 person holding lines committed in the last 365 days$/m);
      assert.match(text, /^orphaned files .*: none$/m);
      assert.match(text, /^first-level directories .*: \(root files\) 10 100\.0%, Ada Quill 100\.0%$/m);
      assert.ok(!/^single-owner files/m.test(text), "a 10-line file is below the single-owner floor");
      assert.ok(!/^set-aside|^committed by someone else|^re-applied/m.test(text));
    },
  );
});

test("the re-applied credit note is one line, and a long note is shortened before a number is", () => {
  /** @type {any} */
  const base = JSON.parse(JSON.stringify({
    view: "brief", ref: "HEAD", sha: "abc1234", asOf: "2026-03-10", shallow: false,
    scope: { paths: [], include: [], exclude: [], since: null, until: null, sampleEvery: 1 },
    files: 1, filesTotal: 1, commits: 1, lines: 10, linesWithBlank: 12,
    owners: { total: 1, shown: [{ author: "Ada Quill", mail: "ada@quill.example", sharedName: false, lines: 10, lineShare: 1, linesWithBlank: 12, shareWithBlank: 1, commits: 1, commitShare: 1 }], others: { people: 0, lines: 0, lineShare: 0, linesWithBlank: 0, shareWithBlank: 0 } },
    busFactor: null, activity: null, orphans: null,
    leftOut: { bots: { identities: 0, names: [], lines: 0, commits: 0 }, dropped: { files: 0, lines: 0, classes: [] }, setAside: [], setAsideTotal: 0, suspectedStillCounted: [] },
    identity: { mergeApplied: false, appliedGroups: 0, proposals: [], proposalsTotal: 0 },
    directories: [], singleOwnerFiles: { files: [], more: 0 },
    committedByOthers: { total: 0, commits: [] },
    reappliedCredit: { total: 3, commits: [{ sha: "1234567", subject: "Revert the revert", lines: 12, credited: "Ada Quill", reappliedBy: "Bea Marsh" }] },
    quoteRule: BRIEF_QUOTE_RULE,
  }));
  const text = renderBrief(base);
  assert.match(text, /^re-applied work credited to the original author: 3 commits; 12 lines of 1234567 "Revert the revert" credited to Ada Quill, re-applied by Bea Marsh$/m);
  assert.equal(text.split("\n").filter((l) => l.startsWith("re-applied")).length, 1);
});
