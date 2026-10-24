// @ts-check
// Round 8: plain -C is the default copy detection with a note naming who it moved (R8-1), the mechanical-rewrite check
// line in every view (R8-2), the skill wording rules (R8-3), strength and the lead figure in the identity hint and the
// history headline (R8-4), and strength per pair (R8-5). Every repository is built inside the test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { schemaErrors } from "../scripts/schema-check.mjs";

const schema = JSON.parse(readFileSync(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
const skill = readFileSync(new URL("../skills/surviving-lines/SKILL.md", import.meta.url), "utf8");
const hook = readFileSync(new URL("../hooks/surviving-lines-hint.sh", import.meta.url), "utf8");

const { parseArgs, analyse, findMechanicalCandidates, mechanicalLine, renderTable, renderReviewers, renderHistory, renderMarkdown, renderIdentities, renderJson, linkIdentities, identityHintLine, samePersonLine } = await import("../bin/surviving-lines.js");

/** @param {string} dir @param {string[]} args @param {Record<string, string>} [env] */
function git(dir, args, env = {}) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", ...env } });
}

/**
 * @param {string} dir
 * @param {{ name: string, mail: string, date: string, files: Record<string, string>, message?: string, remove?: string[] }} c
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
/** A long, distinctive line, so copy detection treats a block of them as copied text. */
const LONG = (/** @type {string} */ tag, /** @type {number} */ n) => Array.from({ length: n }, (_, i) => `const ${tag}_${i} = compute("${tag}", ${i}, "a distinctive line of some length");\n`).join("");

/** @param {(dir: string) => void} setup @param {(dir: string) => Promise<void>} fn */
async function withRepo(setup, fn) {
  const dir = mkdtempSync(join(tmpdir(), "sl-r8-"));
  try {
    git(dir, ["init", "-q", "-b", "main"]);
    setup(dir);
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @param {string} dir @param {string[]} [args] */
const run = (dir, args = []) => analyse(parseArgs(["--cwd", dir, "-q", ...args]));

/** Ada writes a block, Bob moves it to another file in a later commit that also changes the source file. */
function moveRepo(/** @type {string} */ dir) {
  commit(dir, { name: "Ada", mail: "ada@example.com", date: "2024-01-01", files: { "src/a.js": LONG("moved", 30) + lines("rest", 10) } });
  commit(dir, { name: "Bob", mail: "bob@example.com", date: "2024-01-02", files: { "src/a.js": lines("rest", 10), "src/c.js": LONG("moved", 30) } });
  commit(dir, { name: "Cy", mail: "cy@example.com", date: "2024-01-03", files: { "src/d.js": lines("cy", 12) } });
}

test("R8-1: the default blame is -w -M -C, --copies deep gives -C -C, --no-copies gives neither", async () => {
  await withRepo(moveRepo, async (dir) => {
    assert.deepEqual((await run(dir)).blame.flags, ["-w", "-M", "-C"]);
    assert.deepEqual((await run(dir, ["--copies"])).blame.flags, ["-w", "-M", "-C"]);
    const deep = await run(dir, ["--copies", "deep"]);
    assert.deepEqual(deep.blame.flags, ["-w", "-M", "-C", "-C"]);
    assert.equal(deep.blame.copyDetection.flags, "-C -C");
    assert.deepEqual((await run(dir, ["--no-copies"])).blame.flags, ["-w", "-M"]);
    assert.match(renderTable(await run(dir), 10), /^git blame -w -M -C {2}·/m);
    // "deep" is a value of --copies, not a separate word: a path after -- still parses.
    assert.deepEqual(parseArgs(["--copies", "--", "deep"]).paths, ["deep"]);
  });
});

test("R8-1: when copy detection moved lines, one note names the people whose share changed, with both figures, in every view", async () => {
  await withRepo(moveRepo, async (dir) => {
    const r = await run(dir);
    const e = r.blame.copyEffect;
    assert.ok(e, "copy detection moved lines in this repository");
    assert.equal(e.flags, "-C");
    assert.equal(e.lines, 30);
    assert.equal(e.files, 1);
    const ada = e.people.find((p) => p.mail === "ada@example.com");
    const bob = e.people.find((p) => p.mail === "bob@example.com");
    assert.ok(ada && bob);
    assert.equal(ada.lines, 40);
    assert.equal(ada.linesWithout, 10);
    assert.equal(bob.lines, 0);
    assert.equal(bob.linesWithout, 30);
    assert.ok(ada.lineShare > ada.lineShareWithout);
    assert.ok(e.people.length <= 3);
    const text = renderTable(r, 10);
    assert.match(text, /copy detection \(-w -M -C\) moved 30 lines in 1 file to another author\. Largest changes in share against -w -M only: .*Ada .* with, .* without/);
    const withHistory = await run(dir, ["--history", "src"]);
    const withReviewers = await run(dir, ["--reviewers", "src"]);
    const views = [renderTable(r, 10), renderReviewers(withReviewers, 10), renderHistory(withHistory, 10), renderMarkdown(r, 10), renderIdentities([], [], r.possibleSamePerson)];
    for (const [i, v] of views.slice(0, 4).entries()) assert.match(v, /copy detection \(-w -M -C\) moved 30 lines/, `view ${i}`);
    assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), []);
  });
});

test("R8-1: no note when copy detection moved nothing or is off", async () => {
  await withRepo((dir) => commit(dir, { name: "Ada", mail: "ada@example.com", date: "2024-01-01", files: { "src/a.js": lines("a", 20) } }), async (dir) => {
    const r = await run(dir);
    assert.equal(r.blame.copyEffect, null);
    assert.doesNotMatch(renderTable(r, 10), /copy detection \(/);
  });
  await withRepo(moveRepo, async (dir) => {
    const off = await run(dir, ["--no-copies"]);
    assert.equal(off.blame.copyEffect, null);
    assert.doesNotMatch(renderTable(off, 10), /copy detection \(/);
  });
});

test("R8-2: the check line says how many commits were examined and set aside, and lists a commit with many small equal changes", async () => {
  await withRepo(
    (dir) => {
      /** @type {Record<string, string>} */
      const base = {};
      for (let i = 0; i < 12; i++) base[`src/m${i}.js`] = lines(`m${i}`, 8);
      commit(dir, { name: "Ada", mail: "ada@example.com", date: "2024-01-01", files: base });
      /** @type {Record<string, string>} */
      const edited = {};
      for (let i = 0; i < 12; i++) edited[`src/m${i}.js`] = lines(`m${i}`, 8).replace(`m${i} 3\n`, `m${i} three\n`);
      commit(dir, { name: "Bob", mail: "bob@example.com", date: "2024-01-02", files: edited, message: "apply the new naming" });
    },
    async (dir) => {
      const r = await run(dir);
      assert.ok(r.mechanicalCheck);
      assert.equal(r.mechanicalCheck.examined, 2);
      assert.equal(r.mechanicalCheck.setAside, 0);
      assert.equal(r.mechanicalCheck.candidates.length, 1);
      const c = r.mechanicalCheck.candidates[0];
      assert.equal(c.author, "Bob");
      assert.equal(c.reason, "files");
      assert.equal(c.filesChanged, 12);
      assert.equal(c.survivingLines, 12);
      const note = /mechanical rewrites checked: examined 2 commits holding surviving lines, set aside 0; 1 more looks mechanical and was not set aside: [0-9a-f]{7} "apply the new naming" by Bob, 12 surviving lines/;
      assert.match(renderTable(r, 10), note);
      assert.match(renderReviewers(await run(dir, ["--reviewers", "src"]), 10), note);
      assert.match(renderHistory(await run(dir, ["--history", "src"]), 10), note);
      assert.match(renderMarkdown(r, 10), note);
      assert.doesNotMatch(renderTable(r, 10), /no other commit looks mechanical/);
      // The candidate stays in the numbers: the tool never sets it aside from this line.
      assert.equal(r.authors.find((a) => a.mail === "bob@example.com")?.lines, 12);
      assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), []);
    },
  );
});

test("R8-2: a subject that names a formatter or a codemod lists a commit below any size floor, and a plain small commit is not listed", async () => {
  await withRepo(
    (dir) => {
      commit(dir, { name: "Ada", mail: "ada@example.com", date: "2024-01-01", files: { "src/a.js": lines("a", 6), "src/b.js": lines("b", 6) } });
      commit(dir, { name: "Bob", mail: "bob@example.com", date: "2024-01-02", files: { "src/a.js": lines("a", 6).replace("a 1\n", "a one\n") }, message: "run codemod on a" });
      commit(dir, { name: "Cy", mail: "cy@example.com", date: "2024-01-03", files: { "src/b.js": lines("b", 6).replace("b 2\n", "b two\n") }, message: "fix the second line" });
    },
    async (dir) => {
      const r = await run(dir);
      assert.deepEqual(r.mechanicalCheck?.candidates.map((c) => [c.author, c.reason, c.survivingLines]), [["Bob", "subject", 1]]);
      assert.match(renderTable(r, 10), /examined 3 commits holding surviving lines, set aside 0; 1 more looks mechanical and was not set aside: [0-9a-f]{7} "run codemod on a" by Bob, 1 surviving line\./);
    },
  );
});

test("R8-2: a commit set aside by the reformat rule counts as set aside and is not also listed; a repository with none says so", async () => {
  await withRepo(
    (dir) => {
      commit(dir, { name: "Ada", mail: "ada@example.com", date: "2024-01-01", files: { "src/app.js": Array.from({ length: 30 }, (_, i) => `const v${i} = 'value ${i}';\n`).join("") } });
      commit(dir, { name: "Bob", mail: "bob@example.com", date: "2024-01-02", files: { "src/app.js": Array.from({ length: 30 }, (_, i) => `const v${i} = "value ${i}";\n`).join("") }, message: "chore: run prettier" });
    },
    async (dir) => {
      const r = await run(dir);
      assert.equal(r.reformat.applied, true);
      assert.equal(r.mechanicalCheck?.setAside, 1);
      assert.deepEqual(r.mechanicalCheck?.candidates, []);
      assert.match(renderTable(r, 10), /examined 1 commit holding surviving lines, set aside 1; no other commit looks mechanical/);
      // With --keep-reformat nothing is set aside, so the same commit is a candidate that was kept.
      const kept = await run(dir, ["--keep-reformat"]);
      assert.equal(kept.mechanicalCheck?.setAside, 0);
      assert.equal(kept.mechanicalCheck?.candidates.length, 1);
    },
  );
});

test("R8-2: --identities carries the check line too", async () => {
  await withRepo(moveRepo, async (dir) => {
    const r = await run(dir, ["--identities"]);
    assert.ok(r.mechanicalCheck);
    assert.equal(r.mechanicalCheck.examined, 2);
  });
});

/** @param {[string, string, number][]} people one commit each, in a file of its own @param {(r: Awaited<ReturnType<typeof analyse>>, dir: string) => Promise<void>} check @param {string[]} [args] */
async function withPeople(people, check, args = []) {
  await withRepo(
    (dir) => people.forEach(([name, mail, n], i) => commit(dir, { name, mail, date: `2024-01-0${i + 1}`, files: { [`src/f${i}.js`]: lines(`f${i}`, n) } })),
    async (dir) => check(await run(dir, args), dir),
  );
}

test("R8-5: a strongly linked pair is one strong suggestion; a member linked only weakly is a weak addition with its own lines", async () => {
  // The first two names are equal once punctuation is ignored (strong). The third is the initial form of the first
  // only (weak), and shares no other evidence with the second.
  await withPeople([["John Smith", "john@one.example", 30], ["JOHN. SMITH", "js@two.example", 20], ["J. Smith", "jay@three.example", 7], ["Other Person", "other@four.example", 40]], async (r) => {
    assert.equal(r.possibleSamePerson.suggestions.length, 1);
    const s = r.possibleSamePerson.suggestions[0];
    assert.equal(s.strength, "strong");
    assert.equal(s.addresses.length, 2);
    assert.equal(s.lines, 50);
    assert.equal(s.weakAdditions.length, 1);
    assert.equal(s.weakAdditions[0].mail, "jay@three.example");
    assert.equal(s.weakAdditions[0].lines, 7);
    assert.ok(s.weakAdditions[0].mailmap.length > 0);
    const line = samePersonLine(r.possibleSamePerson) ?? "";
    assert.match(line, /strong suggestion: lead with 50 lines, [0-9.]+% if one person, unmerged/);
    assert.match(line, /weak addition J\. Smith <jay@three\.example> 7 lines/);
    assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), []);
  });
});

test("R8-5: with no strong pair the whole group is one weak suggestion, as before", async () => {
  await withPeople([["John Smith", "john@one.example", 30], ["J. Smith", "jay@three.example", 7], ["Other Person", "other@four.example", 40]], async (r) => {
    assert.equal(r.possibleSamePerson.suggestions.length, 1);
    assert.equal(r.possibleSamePerson.suggestions[0].strength, "weak");
    assert.deepEqual(r.possibleSamePerson.suggestions[0].weakAdditions, []);
    assert.match(samePersonLine(r.possibleSamePerson) ?? "", /weak suggestion: lead with the unmerged figures \(.*\), 37 lines, [0-9.]+% only as a possibility/);
  });
});

const row = (/** @type {string} */ author, /** @type {string} */ mail, /** @type {number} */ lines_, commits = 1) => ({ author, mail, lines: lines_, lineShare: lines_ / 100, commits });

test("R8-5: linked addresses are strong by a same name and weak by an address name alone; the weak one is an addition", () => {
  const groups = linkIdentities([row("Ann Lee", "ann@x.example", 30), row("Ann Lee", "ann.lee@y.example", 20), row("Annie", "ann@z.example", 5), row("Zed", "zed@q.example", 45)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].strength, "strong");
  assert.deepEqual(groups[0].members.map((m) => m.mail).sort(), ["ann.lee@y.example", "ann@x.example"]);
  assert.deepEqual(groups[0].weakAdditions.map((w) => w.member.mail), ["ann@z.example"]);
  assert.ok(groups[0].weakAdditions[0].reasons.some((x) => /same address name/.test(x)));
  const weakOnly = linkIdentities([row("Ann Lee", "ann@x.example", 30), row("Annie", "ann@z.example", 5)]);
  assert.equal(weakOnly.length, 1);
  assert.equal(weakOnly[0].strength, "weak");
});

test("R8-5: --merge-identities merges the strong subset only; the weak addition keeps its own row", async () => {
  await withPeople([["Ann Lee", "ann@x.example", 30], ["Ann Lee", "ann.lee@y.example", 20], ["Annie", "ann@z.example", 5], ["Zed", "zed@q.example", 45]], async (r, dir) => {
    assert.equal(r.identityHints.people[0].strength, "strong");
    assert.equal(r.identityHints.people[0].lines, 50);
    assert.equal(r.identityHints.people[0].weakAdditions[0].lines, 5);
    const merged = await run(dir, ["--merge-identities"]);
    assert.equal(merged.authors.length, 3);
    assert.equal(merged.authors.find((a) => a.mail === "ann@z.example")?.lines, 5);
    assert.equal(merged.authors.find((a) => a.author === "Ann Lee")?.lines, 50);
    assert.equal(merged.identityMerge.groups[0].addresses.length, 2);
    assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(merged))), []);
  });
  await withPeople([["Ann Lee", "ann@x.example", 30], ["Annie", "ann@z.example", 5]], async (r, dir) => {
    assert.equal(r.identityHints.people[0].strength, "weak");
    const merged = await run(dir, ["--merge-identities"]);
    assert.equal(merged.authors.length, 2, "a weak group is not merged");
  });
});

test("R8-4: the identity hint line states the strength and the figure to lead with", () => {
  const strong = identityHintLine({ count: 1, people: [{ name: "Ann", addresses: ["a@x", "b@y"], lines: 50, lineShare: 0.5, strength: "strong", weakAdditions: [] }] }) ?? "";
  assert.match(strong, /Strong evidence: lead with the merged figure \(Ann 50 lines \(50\.0%\)\) and give the unmerged figures next to it\./);
  assert.doesNotMatch(strong, /If they are one person/);
  const weak = identityHintLine({ count: 1, people: [{ name: "Ann", addresses: ["a@x", "b@y"], lines: 50, lineShare: 0.5, strength: "weak", weakAdditions: [{ name: "Annie", mail: "c@z", lines: 5, lineShare: 0.05 }] }] }) ?? "";
  assert.match(weak, /Weak evidence: lead with the unmerged figures and give the merged one \(Ann 50 lines \(50\.0%\)\) only as a possibility\./);
  assert.match(weak, /Weak additions, not in the merged figure: Annie <c@z> 5 lines \(5\.0%\)\./);
  // A result from before the strength existed keeps the old sentence.
  assert.match(identityHintLine({ count: 1, people: [{ name: "Ann", addresses: ["a@x", "b@y"], lines: 50, lineShare: 0.5 }] }) ?? "", /If they are one person, Ann holds 50 lines \(50\.0%\)\./);
});

test("R8-4: the hint line is in the table, --reviewers and --history, and the history headline leads with the merged figure for a strong suggestion", async () => {
  await withPeople([["John Smith", "john@one.example", 30], ["JOHN. SMITH", "js@two.example", 25], ["Other Person", "other@four.example", 40]], async (r, dir) => {
    assert.match(renderTable(r, 10), /strong suggestion: lead with 55 lines/);
    const rev = await run(dir, ["--reviewers", "src"]);
    assert.match(renderReviewers(rev, 10), /strong suggestion: lead with 55 lines/);
    const hist = await run(dir, ["--history", "src"]);
    const text = renderHistory(hist, 10);
    assert.match(text, /strong suggestion: lead with 55 lines/);
    // The merged person holds 55 lines, more than the largest single row (40): the headline names that person with the merged figure first.
    assert.match(text, /John Smith made the first commit, on [0-9-]+, and holds the most lines now \(55 lines, [0-9.]+% counting this address and \S+ as one person, strong evidence, not merged by the tool; this address alone: (30|25) lines, [0-9.]+%\)\./);
  });
  await withPeople([["John Smith", "john@one.example", 30], ["J. Smith", "jay@three.example", 25], ["Other Person", "other@four.example", 20]], async (_r, dir) => {
    const text = renderHistory(await run(dir, ["--history", "src"]), 10);
    assert.match(text, /holds the most lines now \(30 lines, [0-9.]+% for this address alone; 55 lines, [0-9.]+% if \S+ is the same person, weak evidence\)\./);
  });
});

test("R8-1 to R8-5: the skill carries the new rules and the hook carries at most a pointer line", () => {
  assert.match(skill, /`git blame -w -M -C`/);
  assert.match(skill, /Say which copy detection setting the figures use/);
  assert.match(skill, /moved by more than 2 points/);
  assert.match(skill, /Say that mechanical rewrites were checked, and name each commit of the `mechanical rewrites checked` line as set aside or kept/);
  assert.match(skill, /Never write "none found" while that line lists candidates/);
  assert.match(skill, /git show --stat <sha>.*--ignore-rev <sha>/);
  assert.match(skill, /Describe a set-aside commit by what it rewrote \(lines, files\)/);
  assert.match(skill, /Do not attach a line total to the committer's name/);
  assert.match(skill, /When the headline names a person with a strong identity suggestion, lead with the merged figure/);
  assert.match(skill, /`weak addition`/);
  // The hook points at the skill and carries the steering sentences itself (round 13, B2), within its 1,200 character budget.
  // It no longer names the skill section: the sentences below replaced the pointer line to keep room for the group text.
  assert.match(hook, /Use the surviving-lines skill; SL = \$cmd is the command: run SL instead of counting by hand\./);
  assert.match(hook, /Every count, share, bus factor, activity and ownership claim comes from SL, not git blame or shortlog; a number SL does not print is your own: say so and name the command\. Quote both line counts\. Identity merges are proposals unless asked to apply them\./);
});

/** Ada writes a block under one address; the same name from a second address moves it in a commit that also changes the source file. */
function sameNameMove(/** @type {string} */ dir) {
  commit(dir, { name: "Ada", mail: "ada@one.example", date: "2024-01-01", files: { "src/a.js": LONG("moved", 30) + lines("rest", 10) } });
  commit(dir, { name: "Ada", mail: "ada@two.example", date: "2024-01-02", files: { "src/a.js": lines("rest", 10), "src/c.js": LONG("moved", 30) } });
  commit(dir, { name: "Cy", mail: "cy@example.com", date: "2024-01-03", files: { "src/d.js": lines("cy", 12) } });
}

test("review 1: the copy note moves a delta to a canonical address only when --merge-identities merged the rows", async () => {
  await withRepo(sameNameMove, async (dir) => {
    const plain = await run(dir);
    assert.equal(linkIdentities(plain.authors)[0]?.strength, "strong");
    const e = plain.blame.copyEffect;
    assert.ok(e, "the two addresses are separate rows, so the move is a change of rows");
    const one = e.people.find((p) => p.mail === "ada@one.example");
    const two = e.people.find((p) => p.mail === "ada@two.example");
    assert.deepEqual([one?.lines, one?.linesWithout], [40, 10]);
    assert.deepEqual([two?.lines, two?.linesWithout], [0, 30]);
    // Merged, the person's total does not change: the move was inside one person.
    const merged = await run(dir, ["--merge-identities"]);
    assert.equal(merged.blame.copyEffect, null);
  });
});

/** Dee's lines are written outside src and moved into it by Bob; Ada holds the most lines on the path through two addresses. */
function offPathHolder(/** @type {string} */ dir) {
  commit(dir, { name: "Dee", mail: "dee@example.com", date: "2024-01-01", files: { "other/x.js": LONG("dd", 12) + lines("keep", 3) } });
  commit(dir, { name: "Ada", mail: "ada@one.example", date: "2024-01-02", files: { "src/a.js": lines("aa", 8) } });
  commit(dir, { name: "Ada", mail: "ada@two.example", date: "2024-01-03", files: { "src/b.js": lines("bb", 6) } });
  commit(dir, { name: "Bob", mail: "bob@example.com", date: "2024-01-04", files: { "other/x.js": lines("keep", 3), "src/c.js": LONG("dd", 12) } });
}

test("review 3: the history headline compares the off-path holder with the merged figure of a strong person", async () => {
  await withRepo(offPathHolder, async (dir) => {
    const text = renderHistory(await run(dir, ["--history", "src"]), 10);
    assert.doesNotMatch(text, /Dee holds the most lines now/);
    assert.match(text, /Ada made the first commit.*holds the most lines now \(14 lines/);
  });
});

test("review 5: more than 3000 commits are reported as a partial check, with the real total", async () => {
  const shas = Array.from({ length: 3005 }, (_, i) => i.toString(16).padStart(40, "0"));
  const blamed = new Map(shas.map((sha, i) => [sha, { name: "Ada", mail: "ada@example.com", lines: 1 + (i % 7) }]));
  const out = shas.map((sha) => `\x1e${sha}\x1fchange\n\n1\t1\tsrc/a.js\n`).join("");
  const m = await findMechanicalCandidates(parseArgs(["-q"]), blamed, new Set(), 0, async () => out);
  assert.ok(m);
  assert.equal(m.examined, 3000);
  assert.equal(m.total, 3005);
  assert.equal(m.truncated, true);
  const line = mechanicalLine({ mechanicalCheck: m });
  assert.match(line, /examined the 3,000 largest of 3,005 commits holding surviving lines \(the rest were not examined\)/);
  const small = await findMechanicalCandidates(parseArgs(["-q"]), new Map([...blamed.entries()].slice(0, 3)), new Set(), 0, async () => out);
  assert.equal(small?.truncated, false);
  assert.match(skill, /largest of M commits/);
});

test("review 6: a subject matches a tool name or an explicit phrase, not a plain feature word", async () => {
  /** @type {[string, boolean][]} */
  const subjects = [["Rename X to Y", false], ["Add black theme", false], ["format date in the header", false], ["Add linter config", false], ["run codemod on a", true], ["apply prettier", true], ["run black over the repo", true], ["bulk rename of the tests", true], ["rename tool output", true], ["lint fix across packages", true], ["eslint --fix", true], ["reformat the tree", true], ["gofmt", true], ["format all files", true]];
  for (const [subject, hit] of subjects) {
    const blamed = new Map([["a".repeat(40), { name: "Ada", mail: "ada@example.com", lines: 5 }]]);
    const m = await findMechanicalCandidates(parseArgs(["-q"]), blamed, new Set(), 0, async () => `\x1e${"a".repeat(40)}\x1f${subject}\n\n1\t0\tsrc/a.js\n`);
    assert.equal(m?.candidates.length, hit ? 1 : 0, subject);
  }
});

test("review 7: revisions the user ignored are counted next to the ones the tool set aside", async () => {
  await withRepo(moveRepo, async (dir) => {
    const sha = git(dir, ["rev-parse", "HEAD~1"]).trim();
    const viaFlag = await run(dir, ["--ignore-rev", sha]);
    assert.equal(viaFlag.mechanicalCheck?.ignoredByUser, 1);
    assert.match(renderTable(viaFlag, 10), /set aside 0, ignored by you 1/);
    writeFileSync(join(dir, ".git-blame-ignore-revs"), `# a rewrite\n${sha}\n`);
    const viaFile = await run(dir);
    assert.equal(viaFile.mechanicalCheck?.ignoredByUser, 1);
    // The same revision given twice is counted once.
    assert.equal((await run(dir, ["--ignore-rev", sha])).mechanicalCheck?.ignoredByUser, 1);
    assert.doesNotMatch(renderTable(await run(dir, ["--no-ignore-revs"]), 10), /ignored by you/);
    assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(viaFlag))), []);
  });
});

test("review 8: a merge commit, a binary file and an empty change are not candidates; --copies deep and --allow-shallow keep the check", async () => {
  const sha = (/** @type {string} */ c) => c.repeat(40);
  const blamed = new Map([sha("a"), sha("b"), sha("c")].map((x) => [x, { name: "Ada", mail: "ada@example.com", lines: 3 }]));
  const bin = Array.from({ length: 12 }, (_, i) => `-\t-\tassets/i${i}.png\n`).join("");
  const out = `\x1e${sha("a")}\x1fMerge branch 'x'\n\n\x1e${sha("b")}\x1fadd images\n\n${bin}\x1e${sha("c")}\x1fmore\n\n`;
  const m = await findMechanicalCandidates(parseArgs(["-q"]), blamed, new Set(), 0, async () => out);
  assert.deepEqual(m?.candidates, []);
  assert.equal(m?.examined, 3);
  await withRepo(moveRepo, async (dir) => {
    const deep = await run(dir, ["--copies", "deep"]);
    assert.ok(deep.mechanicalCheck);
    assert.equal(deep.mechanicalCheck.examined, 2);
  });
  const clone = mkdtempSync(join(tmpdir(), "sl-r8-shallow-"));
  try {
    await withRepo(moveRepo, async (dir) => {
      const target = join(clone, "c");
      git(clone, ["clone", "-q", "--depth", "1", `file://${dir}`, target]);
      const r = await run(target, ["--allow-shallow"]);
      assert.equal(r.shallow, true);
      assert.ok(r.mechanicalCheck);
      assert.equal(r.mechanicalCheck.examined, 1);
      assert.equal(r.mechanicalCheck.truncated, false);
    });
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
});

test("review 2: --identities labels each group's strength and puts a weak group's .mailmap lines under an if-you-confirm heading", async () => {
  await withPeople([["John Smith", "john@one.example", 30], ["John Smith", "john@two.example", 25], ["Jon Smythe", "jon.smith@three.example", 10]], async (r) => {
    const groups = linkIdentities(r.authors);
    const strong = groups.find((g) => g.strength === "strong");
    assert.ok(strong);
    const text = renderIdentities(groups);
    assert.match(text, /strength: strong/);
    const head = text.split("Weakly linked")[0];
    assert.match(head, /Add these to a \.mailmap file/);
    for (const w of groups.filter((g) => g.strength !== "strong")) for (const m of w.members) if (m.mail !== w.canonical.mail) assert.ok(!head.includes(`<${m.mail}>`), "a weak group's line is not in the unconditional block");
  });
  const weak = linkIdentities([
    { author: "Sam Lee", mail: "sam@one.example", lines: 20, commits: 2, lineShare: 0.5, commitShare: 0.5 },
    { author: "Samuel Lee", mail: "sam@two.example", lines: 20, commits: 2, lineShare: 0.5, commitShare: 0.5 },
  ]);
  const text = renderIdentities(weak);
  if (weak.some((g) => g.strength === "weak")) {
    assert.match(text, /strength: weak/);
    assert.match(text, /Only if you confirm they are one person, add these to a \.mailmap file/);
    assert.doesNotMatch(text.split("Weakly linked")[0], /<sam@two\.example>/);
  }
  assert.match(skill, /lines of the `strong` groups/);
  assert.match(skill, /ask the user before writing them/);
});
