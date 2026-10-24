// @ts-check
// Round 9: a full name equal to an address name is strong identity evidence (R9-1), one address under several names is
// reported in every view (R9-3), the default table shows every author with at least 1% of the lines (R9-4), the prompt
// hint matches natural ownership wording (R9-5), the skill rules (R9-3, R9-4, R9-6), and the deep copy scope line (R9-7).
// Every repository is built inside the test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRepo, commitAsIdentity, hookEnv, posixPath, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(join(ROOT, "schema", "surviving-lines.schema.json"), "utf8"));
const skill = readFileSync(join(ROOT, "skills", "surviving-lines", "SKILL.md"), "utf8");
const BIN = join(ROOT, "bin", "surviving-lines.js");
const HOOK = join(ROOT, "hooks", "surviving-lines-hint.sh");

const { parseArgs, analyse, renderTable, renderGroups, renderMarkdown, renderReviewers, renderHistory, renderIdentities, renderJson, linkIdentities, sameAddressNames, fullNameIsAddressName, scopeNotes, sameAddressLine, deepCopyLine } = await import("../bin/surviving-lines.js");

/** @param {string} prefix @param {number} n */
const body = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix} line ${i}\n`).join("");
/** @param {number} i a fixed ISO date, one day apart */
const day = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().replace(/\.\d{3}Z$/, "Z");

/** @param {Array<[[string, string], number]>} people one commit each, in a file of its own: [identity, line count] */
function build(people) {
  const dir = createRepo("sl-r9-");
  people.forEach(([identity, n], i) => commitAsIdentity(dir, identity, day(i), `change ${i}`, { [`src/f${i}.js`]: body(`f${i}`, n) }));
  return dir;
}

/** @param {string} dir @param {string[]} [args] */
const run = (dir, args = []) => analyse(parseArgs(["--cwd", dir, "-q", ...args]));

/** @param {Array<[[string, string], number]>} people @param {(dir: string) => Promise<void>} fn */
async function withPeople(people, fn) {
  const dir = build(people);
  try {
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

// ---- R9-1

test("R9-1: fullNameIsAddressName needs two words, letters only, and an exact match", () => {
  assert.equal(fullNameIsAddressName("Tomás García", "tomas.garcia"), true);
  assert.equal(fullNameIsAddressName("Tomás García", "tomas_garcia"), true);
  assert.equal(fullNameIsAddressName("Tomás García", "tomasgarcia"), true);
  assert.equal(fullNameIsAddressName("Tomás García", "tomas.garcia.dev"), false, "an extra word is not equal");
  assert.equal(fullNameIsAddressName("Tomás García", "tomas.garcia2"), false, "a digit is not equal");
  assert.equal(fullNameIsAddressName("Tomas", "tomas"), false, "one word is not a full name");
  assert.equal(fullNameIsAddressName("Tomás García", "garcia"), false, "part of a name is not equal");
  assert.equal(fullNameIsAddressName("J. Smith", "jsmith"), false, "an initial plus a surname is not a full name");
  assert.equal(fullNameIsAddressName("John S.", "johns"), false, "a trailing initial is not a full name");
  assert.equal(fullNameIsAddressName("Al Li", "alli"), true, "four letters is the lowest address name");
  assert.equal(fullNameIsAddressName("Al Y", "aly"), false, "an initial word and a three-letter address");
  assert.equal(fullNameIsAddressName("Tomas Garcia 2", "tomasgarcia"), false, "a digit in the name is not letters only");
});

test("R9-1: an initial plus a surname does not link two addresses", async () => {
  await withPeople(
    [
      [["J. Smith", "js@work.example"], 20],
      [["jenny", "jsmith@home.example"], 10],
      [["Other Person", "other@three.example"], 30],
    ],
    async (dir) => {
      const r = await run(dir);
      assert.equal(r.identityHints.count, 0);
      assert.equal((await run(dir, ["--merge-identities"])).authors.length, 3);
    },
  );
});

test("R9-1: a full name equal to the address name of another identity is a strong group, and --merge-identities merges it", async () => {
  await withPeople(
    [
      [["Tomás García", "tg@work.example"], 20],
      [["tg-laptop", "tomas.garcia@home.example"], 10],
      [["Other Person", "other@three.example"], 30],
    ],
    async (dir) => {
      const r = await run(dir);
      assert.equal(r.identityHints.count, 1);
      assert.equal(r.identityHints.people[0].strength, "strong");
      assert.equal(r.authors.length, 3);
      const merged = await run(dir, ["--merge-identities"]);
      assert.equal(merged.authors.length, 2, "the pair is one row");
      const person = merged.authors.find((a) => a.addresses === 2);
      assert.equal(person?.lines, 30);
    },
  );
});

test("R9-1: partial name containment in an address stays weak and is never merged", async () => {
  await withPeople(
    [
      [["Tomás García", "tg@work.example"], 20],
      [["Tomas", "tomas.garcia.dev@home.example"], 10],
      [["Other Person", "other@three.example"], 30],
    ],
    async (dir) => {
      const r = await run(dir, ["--merge-identities"]);
      assert.equal(r.authors.length, 3, "nothing merged");
      assert.equal(r.identityMerge.groups.length, 0);
      const weak = r.possibleSamePerson.suggestions.filter((s) => s.strength === "weak");
      assert.equal(weak.length, 1);
      assert.ok(weak[0].evidence.some((e) => /contained in the address/.test(e)));
    },
  );
});

test("R9-1: linkIdentities gives the evidence in words", () => {
  const rows = [
    { author: "Tomás García", mail: "tg@work.example", lines: 5, lineShare: 0.5, commits: 1 },
    { author: "tg-laptop", mail: "tomas.garcia@home.example", lines: 5, lineShare: 0.5, commits: 1 },
  ];
  const groups = linkIdentities(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].strength, "strong");
  assert.match(groups[0].reasons.join("\n"), /the full name "Tomás García" is the address name of tomas\.garcia@home\.example/);
});

// ---- R9-3

const SAME_ADDRESS = /^one address, several names, counted as one: (Lena Voss|L\. Voss) <lena@one\.example> also appears as (L\. Voss|Lena Voss) \(18 lines\)$/m;

test("R9-3: one address under several names prints one scope line in every view", async () => {
  await withPeople(
    [
      [["Lena Voss", "lena@one.example"], 12],
      [["L. Voss", "lena@one.example"], 6],
      [["Other Person", "other@three.example"], 30],
    ],
    async (dir) => {
      const r = await run(dir);
      assert.equal(r.sameAddress.length, 1);
      assert.deepEqual(r.sameAddress[0].aliases, ["L. Voss"]);
      assert.equal(r.sameAddress[0].lines, 18, "one row, both names counted as one");
      assert.deepEqual(schemaErrors(JSON.parse(renderJson(r)), schema), []);
      assert.match(renderTable(r, 10), SAME_ADDRESS);
      assert.match(renderTable(r, null), SAME_ADDRESS);
      assert.match(renderMarkdown(r, 10), SAME_ADDRESS);
      assert.match(renderIdentities([], [], undefined) + "\n" + scopeNotes(r, { identityHints: false }).join("\n"), SAME_ADDRESS);
      const groups = await run(dir, ["--group-by", "dir"]);
      assert.match(renderGroups(groups, 10), SAME_ADDRESS);
      const rev = await run(dir, ["--reviewers", "src"]);
      assert.match(renderReviewers(rev, 5), SAME_ADDRESS);
      const hist = await run(dir, ["--history", "src"]);
      assert.match(renderHistory(hist, 10), SAME_ADDRESS);
      const merged = await run(dir, ["--merge-identities"]);
      assert.match(renderTable(merged, 10), SAME_ADDRESS);
      const cli = spawnSync("node", [BIN, "--cwd", dir, "--identities", "-q"], { encoding: "utf8" });
      assert.match(cli.stdout, SAME_ADDRESS);
      const csv = spawnSync("node", [BIN, "--cwd", dir, "--csv", "-q"], { encoding: "utf8" });
      assert.match(csv.stderr, /one address, several names, counted as one: (Lena Voss|L\. Voss)/);
    },
  );
});

test("R9-3: no line when each address has one name, and the names are capped at five", async () => {
  await withPeople([[["Ada", "ada@example.com"], 10], [["Bob", "bob@example.com"], 5]], async (dir) => {
    const r = await run(dir);
    assert.deepEqual(r.sameAddress, []);
    assert.equal(sameAddressLine(r), null);
    assert.doesNotMatch(renderTable(r, 10), /one address, several names/);
  });
  const entries = ["Zed One", "Zed Two", "Zed Three", "Zed Four", "Zed Five", "Zed Six", "Zed Seven"].map((name) => ({ name, mail: "zed@one.example", commits: 1 }));
  const line = sameAddressLine({ sameAddress: [{ mail: "zed@one.example", name: "Zed One", aliases: sameAddressNames(entries)[0].aliases, lines: 3 }] });
  assert.match(line ?? "", /also appears as .+, .+, .+, .+, .+ and 1 more \(3 lines\)$/);
});

// ---- R9-4

/** @param {number} big lines of one large author @param {number} mid how many authors with `midLines` @param {number} midLines @param {number} small how many one-line authors */
function crowd(big, mid, midLines, small) {
  /** @type {Array<[[string, string], number]>} */
  const people = [[["Big Owner", "big@example.com"], big]];
  for (let i = 0; i < mid; i++) people.push([[`Mid Author ${String(i).padStart(2, "0")}`, `mid${i}@example.com`], midLines]);
  for (let i = 0; i < small; i++) people.push([[`Tiny Author ${String(i).padStart(2, "0")}`, `tiny${i}@example.com`], 1]);
  return people;
}

/** @param {string} text */
const tableRows = (text) => text.split("\n").filter((l) => /^(Big Owner|Mid Author|Tiny Author)/.test(l));

test("R9-4: the default table shows every author with at least 1% of the lines, then one tail line and a last-commit column", async () => {
  // 1000 + 11 x 20 + 15 x 1 = 1235 lines: twelve authors hold at least 1% (20 lines is 1.6%), fifteen hold 0.08% each.
  await withPeople(crowd(1000, 11, 20, 15), async (dir) => {
    const r = await run(dir);
    const text = renderTable(r, null);
    assert.equal(tableRows(text).length, 12);
    assert.match(text, /^author +lines +share +commits +share  last commit$/m);
    assert.match(tableRows(text)[0], /Big Owner +1,000 +81\.0% +1 +3\.7% +2026-01-01$/);
    assert.match(text, /^… 15 more authors hold 1\.2% together; largest: Tiny Author 00 0\.1%$/m);
    assert.deepEqual(schemaErrors(JSON.parse(renderJson(r)), schema), []);
  });
});

test("R9-4: at least 10 rows when fewer authors reach 1%, at most 25 when more do", async () => {
  await withPeople(crowd(10000, 0, 0, 14), async (dir) => {
    const text = renderTable(await run(dir), null);
    assert.equal(tableRows(text).length, 10);
    assert.match(text, /^… 5 more authors hold 0\.0% together; largest: Tiny Author \d+ 0\.0%$/m);
  });
  await withPeople(crowd(20, 29, 20, 0), async (dir) => {
    const text = renderTable(await run(dir), null);
    assert.equal(tableRows(text).length, 25);
    assert.match(text, /^… 5 more authors hold 16\.7% together; largest: Mid Author \d+ 3\.3%$/m);
  });
});

test("R9-4: an explicit --top keeps its meaning: exactly that many rows, the old tail line, no last-commit column", async () => {
  await withPeople(crowd(1000, 11, 20, 15), async (dir) => {
    const r = await run(dir, ["--top", "3"]);
    const text = renderTable(r, 3);
    assert.equal(tableRows(text).length, 3);
    assert.match(text, /^… 24 more authors$/m);
    assert.doesNotMatch(text, /last commit/);
    const cli = spawnSync("node", [BIN, "--cwd", dir, "-q", "--top", "3"], { encoding: "utf8" });
    assert.equal(tableRows(cli.stdout).length, 3);
    assert.doesNotMatch(cli.stdout, /last commit|together; largest/);
    const plain = spawnSync("node", [BIN, "--cwd", dir, "-q"], { encoding: "utf8" });
    assert.equal(tableRows(plain.stdout).length, 12);
    assert.match(plain.stdout, /last commit/);
  });
});

test("R9-4: a merged row takes the newest last-commit date of its addresses", async () => {
  await withPeople(
    [
      [["Tomás García", "tg@work.example"], 20],
      [["Other Person", "other@three.example"], 10],
      [["tg-laptop", "tomas.garcia@home.example"], 10],
    ],
    async (dir) => {
      const r = await run(dir, ["--merge-identities"]);
      const person = r.authors.find((a) => a.addresses === 2);
      assert.equal(r.lastCommits[/** @type {string} */ (person?.mail)], "2026-01-03");
      assert.match(renderTable(r, null), /2026-01-03$/m);
    },
  );
});

// ---- R9-5

/** @param {string} prompt @param {string} cwd */
function hook(prompt, cwd) {
  return spawnSync("sh", [posixPath(HOOK)], {
    input: JSON.stringify({ session_id: "t", cwd: posixPath(cwd), hook_event_name: "UserPromptSubmit", prompt }),
    encoding: "utf8",
    cwd: ROOT,
    env: hookEnv(ROOT),
  });
}

test("R9-5: the hint matches natural ownership wording, stays within 1,200 characters, and stays silent on unrelated prompts", async () => {
  await withPeople(
    [
      [["Member 1", "m1a@one.example"], 5],
      [["Member 1", "m1b@two.example"], 5],
      [["Other Person", "other@three.example"], 30],
    ],
    async (dir) => {
      const phrasings = [
        "who actually wrote the billing code?",
        "which people wrote most of src/billing",
        "which authors still know the parser",
        "is this logic still in the repo or was it rewritten",
        "what happens if we are losing one or two people next month",
        "the knowledge looks concentrated in a few heads",
      ];
      for (const prompt of phrasings) {
        const result = hook(prompt, dir);
        assert.equal(result.status, 0, result.stderr);
        assert.notEqual(result.stdout, "", `no hint for: ${prompt}`);
        const ctx = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
        // Round 13: the pre-computed brief comes on top of the 1,200 characters of the note itself.
        const note = ctx.replace(/ Pre-computed ownership brief for this repository at [0-9a-f]+ \(whole repository[^)]*\): [\s\S]*? or --include(?= (Suspected|No same-person))/, "");
        assert.ok(note.length <= 1200, `context is ${note.length} characters`);
      }
      for (const prompt of ["write a function that reverses a string", "which colour looks better on the button", "keep the cache still in memory", "rename this variable to something clearer"]) {
        assert.equal(hook(prompt, dir).stdout, "", `hint for: ${prompt}`);
      }
    },
  );
  // The wording guard covers the hook's text, not its topic gate: "taking over" is now a gate phrase on purpose.
  const hookText = readFileSync(HOOK, "utf8").replace(/^\s*-e '.*$/gm, "");
  assert.doesNotMatch(hookText, /ranked list|taking over/);
});

// ---- R9-6, R9-3 and R9-4 skill rules

test("skill rules R9-3, R9-4, R9-6, R9-7", () => {
  assert.match(skill, /`one address, several names, counted as one` line, name those people/);
  assert.match(skill, /Never write "no duplicates"/);
  assert.match(skill, /list every row the table shows and state the tail line/);
  assert.match(skill, /at least 1% of the lines, 10 to 25 rows/);
  assert.match(skill, /`Co-authored-by` trailer carries no lines\. Trailer names get lines only with `--co-authors share`|`Co-authored-by` trailer carries no lines/);
  assert.match(skill, /`deep copy detection` line[^\n]*later reverted/);
});

// ---- R9-7

test("R9-7: --copies deep prints a scope line about reverted code, and the default does not", async () => {
  await withPeople([[["Ada", "ada@example.com"], 10], [["Bob", "bob@example.com"], 5]], async (dir) => {
    const plain = await run(dir);
    assert.equal(deepCopyLine(plain), null);
    assert.doesNotMatch(renderTable(plain, 10), /later reverted/);
    const deep = await run(dir, ["--copies", "deep"]);
    assert.match(deepCopyLine(deep) ?? "", /can credit lines to a commit that was later reverted; compare with the default \(-C\)/);
    assert.match(renderTable(deep, 10), /^deep copy detection \(-C -C\) can credit lines to a commit that was later reverted/m);
    assert.match(renderMarkdown(deep, 10), /later reverted/);
  });
});
