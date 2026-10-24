// @ts-check
// The identity hint: under the main table (and the markdown, reviewers and group views) a line says when one person
// may be counted twice, because two addresses share a name or look alike. It is a guess, so it says "may" and points
// at --identities. Fixtures are in scripts/fixtures.mjs (split, basic, bots, troySplit).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PEOPLE, buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderMarkdown, renderReviewers, renderGroups, renderJson, linkIdentities, identityHintSummary, identityHintLine } = await import("../bin/surviving-lines.js");

const HINT = "identity hint:";
/** @param {string} text */
const hintCount = (text) => text.split("\n").filter((line) => line.startsWith(HINT)).length;

/** @param {keyof typeof import("../scripts/fixtures.mjs").FIXTURES} name @param {(dir: string) => Promise<void>} fn */
async function withFixture(name, fn) {
  const dir = buildFixture(name);
  try {
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

test("one person on two addresses gets the one-person sentence, with both addresses named in order, and the merged figure", () => {
  const text = identityHintLine({ count: 1, people: [{ name: "Troy Goode", addresses: ["troy@laptop.example", "troy@work.example"], lines: 810, lineShare: 0.408 }] });
  assert.equal(
    text,
    "identity hint: 1 person may be counted twice (Troy Goode: troy@laptop.example, troy@work.example). The table counts each address separately. Run --identities for the .mailmap lines; only you can confirm it is one person. If they are one person, Troy Goode holds 810 lines (40.8%).",
  );
});

test("a single-line person gets the singular noun in the merged figure", () => {
  const text = identityHintLine({ count: 1, people: [{ name: "Ada", addresses: ["ada@a.example", "ada@b.example"], lines: 1, lineShare: 0.001 }] });
  assert.ok(text?.endsWith("If they are one person, Ada holds 1 line (0.1%)."), text ?? "null");
});

test("the merged figure groups thousands and keeps one decimal in the percent, as the table does", () => {
  const text = identityHintLine({ count: 1, people: [{ name: "Troy Goode", addresses: ["troy@laptop.example", "troy@work.example"], lines: 12345, lineShare: 0.4 }] });
  assert.ok(text?.endsWith("If they are one person, Troy Goode holds 12,345 lines (40.0%)."), text ?? "null");
  const several = identityHintLine({ count: 2, people: [{ name: "Troy Goode", addresses: ["a@x.example", "b@x.example"], lines: 12345, lineShare: 0.4 }, { name: "Ada", addresses: ["c@x.example", "d@x.example"], lines: 1000, lineShare: 0.03 }] });
  assert.ok(several?.endsWith("If merged: Troy Goode 12,345 lines (40.0%), Ada 1,000 lines (3.0%)."), several ?? "null");
});

test("a result from before the merged figure keeps the old one-person sentence exactly", () => {
  const text = identityHintLine({ count: 1, people: [{ name: "Troy Goode", addresses: ["troy@laptop.example", "troy@work.example"] }] });
  assert.ok(text?.endsWith("only you can confirm it is one person."), text ?? "null");
  assert.doesNotMatch(text ?? "", /If they are one person/);
});

test("several people get the plural sentence, with their names", () => {
  const text = identityHintLine({
    count: 2,
    people: [
      { name: "Troy Goode", addresses: ["troy@laptop.example", "troy@work.example"], lines: 810, lineShare: 0.408 },
      { name: "Ada", addresses: ["ada@example.com", "ada@laptop.example.org"], lines: 24, lineShare: 0.031 },
    ],
  });
  assert.equal(
    text,
    "identity hint: 2 people may be counted twice (Troy Goode, Ada); run --identities for the .mailmap lines. The table counts each address separately; only you can confirm they are one person each. If merged: Troy Goode 810 lines (40.8%), Ada 24 lines (3.1%).",
  );
});

test("the merged list caps at three people, then a count of the rest, as the names do", () => {
  const people = [["A", 5], ["B", 4], ["C", 3], ["D", 2], ["E", 1]].map(([name, lines]) => ({ name: /** @type {string} */ (name), addresses: [`${name}@x.example`, `${name}@y.example`], lines: /** @type {number} */ (lines), lineShare: /** @type {number} */ (lines) / 100 }));
  const text = identityHintLine({ count: 5, people });
  assert.ok(text?.endsWith("If merged: A 5 lines (5.0%), B 4 lines (4.0%), C 3 lines (3.0%), and 2 more."), text ?? "null");
});

test("names are capped at three and addresses at three, each with a count of the rest", () => {
  const addresses = ["a@x.example", "b@x.example", "c@x.example", "d@x.example", "e@x.example"];
  const one = identityHintLine({ count: 1, people: [{ name: "Troy Goode", addresses }] });
  assert.ok(one?.includes("(Troy Goode: a@x.example, b@x.example, c@x.example, and 2 more)"), one ?? "null");
  const people = ["A", "B", "C", "D", "E"].map((name) => ({ name, addresses: [`${name}@x.example`] }));
  const several = identityHintLine({ count: 5, people });
  assert.ok(several?.includes("5 people may be counted twice (A, B, C, and 2 more);"), several ?? "null");
});

test("exactly three addresses or three names are listed in full, and four get a count of one", () => {
  const three = ["a@x.example", "b@x.example", "c@x.example"];
  const four = [...three, "d@x.example"];
  const oneThree = identityHintLine({ count: 1, people: [{ name: "Troy Goode", addresses: three }] });
  assert.ok(oneThree?.includes("(Troy Goode: a@x.example, b@x.example, c@x.example)."), oneThree ?? "null");
  assert.doesNotMatch(oneThree ?? "", /more/);
  const oneFour = identityHintLine({ count: 1, people: [{ name: "Troy Goode", addresses: four }] });
  assert.ok(oneFour?.includes("(Troy Goode: a@x.example, b@x.example, c@x.example, and 1 more)."), oneFour ?? "null");
  const names = (/** @type {string[]} */ list) => list.map((name) => ({ name, addresses: [`${name}@x.example`] }));
  const threeNames = identityHintLine({ count: 3, people: names(["A", "B", "C"]) });
  assert.ok(threeNames?.includes("(A, B, C);"), threeNames ?? "null");
  assert.doesNotMatch(threeNames ?? "", /more/);
  const fourNames = identityHintLine({ count: 4, people: names(["A", "B", "C", "D"]) });
  assert.ok(fourNames?.includes("(A, B, C, and 1 more);"), fourNames ?? "null");
});

test("no hint line when there is no hint, or when the result predates the key", () => {
  assert.equal(identityHintLine({ count: 0, people: [] }), null);
  assert.equal(identityHintLine(undefined), null);
});

test("the summary names a person by the canonical author and lists every address, sorted", () => {
  const rows = [
    { author: "Ada", mail: "ada@laptop.example.org", lines: 8, lineShare: 0.2, commits: 1 },
    { author: "Ada", mail: "ada@example.com", lines: 12, lineShare: 0.3, commits: 1 },
    { author: "Bob", mail: "bob@example.com", lines: 10, lineShare: 0.25, commits: 1 },
  ];
  const summary = identityHintSummary(linkIdentities(rows));
  assert.deepEqual(summary.people.map((p) => ({ name: p.name, addresses: p.addresses })), [{ name: "Ada", addresses: ["ada@example.com", "ada@laptop.example.org"].sort() }]);
  assert.equal(summary.count, 1);
  assert.equal(summary.people[0].lines, 20, "the two addresses add up");
  assert.ok(Math.abs(summary.people[0].lineShare - 0.5) < 1e-9, "the two shares add up, on the table's denominator");
  assert.deepEqual(identityHintSummary(linkIdentities([rows[2]])), { count: 0, people: [] });
});

test("bot-looking addresses never make a hint, even when their names match", () => {
  const rows = [
    { author: "dependabot[bot]", mail: "49699333+dependabot[bot]@users.noreply.github.com", lines: 9, commits: 2 },
    { author: "dependabot[bot]", mail: "dependabot@example.com", lines: 4, commits: 1 },
  ];
  assert.deepEqual(identityHintSummary(linkIdentities(rows)), { count: 0, people: [] });
});

test("the split fixture shows one hint in the table, and the JSON key validates against the schema", async () => {
  await withFixture("split", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    const mails = [PEOPLE.ada[1], PEOPLE.adaLaptop[1]];
    const rowsOf = r.authors.filter((a) => mails.includes(a.mail));
    assert.deepEqual(r.identityHints, {
      count: 1,
      people: [{ name: PEOPLE.ada[0], addresses: [PEOPLE.ada[1], PEOPLE.adaLaptop[1]].sort(), lines: rowsOf.reduce((s, a) => s + a.lines, 0), lineShare: rowsOf.reduce((s, a) => s + a.lineShare, 0), strength: "strong", weakAdditions: [] }],
    });
    assert.ok(r.identityHints.people[0].lines > 0, "the merged figure is not zero");
    const table = renderTable(r, 10);
    assert.equal(hintCount(table), 1);
    const expected = identityHintLine(r.identityHints);
    assert.ok(expected && table.includes(`\n${expected}\n`), "the hint sits on its own line under the table");
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), []);
  });
});

test("the hint is one of the scope notes: after the author rows and the bus factor line", async () => {
  await withFixture("split", async (dir) => {
    const table = renderTable(await analyse(parseArgs(["--cwd", dir])), 10);
    const hint = table.indexOf(HINT);
    assert.ok(hint > table.indexOf("-----"), "after the table header");
    assert.ok(hint > table.indexOf("bus factor"), "after the bus factor line, with the other scope notes");
  });
});

test("a clean fixture shows no hint in any view, and the key is an empty list", async () => {
  await withFixture("basic", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.deepEqual(r.identityHints, { count: 0, people: [] });
    assert.equal(hintCount(renderTable(r, 10)), 0);
    assert.equal(hintCount(renderMarkdown(r, 10)), 0);
  });
});

test("two split people name both people in one line", async () => {
  await withFixture("troySplit", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.equal(r.identityHints.count, 2);
    const names = r.identityHints.people.map((/** @type {{name: string}} */ p) => p.name).sort();
    assert.deepEqual(names, [PEOPLE.troy[0], PEOPLE.ada[0]].sort());
    const table = renderTable(r, 10);
    assert.equal(hintCount(table), 1);
    assert.ok(table.includes(`identity hint: 2 people may be counted twice (${r.identityHints.people.map((/** @type {{name: string}} */ p) => p.name).join(", ")}); `), table);
  });
});

test("bot rows in the fixture never reach the hint", async () => {
  await withFixture("bots", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir]));
    const hint = JSON.stringify(r.identityHints);
    assert.doesNotMatch(hint, /\[bot\]|dependabot|renovate/);
  });
});

test("the markdown view puts a blank line before the hint, so it is not read as a table row", async () => {
  await withFixture("split", async (dir) => {
    const md = renderMarkdown(await analyse(parseArgs(["--cwd", dir])), 10);
    assert.equal(hintCount(md), 1);
    assert.match(md, /\n\nidentity hint: /);
  });
});

test("the reviewers view prints the hint once, under its table", async () => {
  await withFixture("split", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "src"]));
    const text = renderReviewers(r, 5);
    assert.equal(hintCount(text), 1);
    assert.ok(text.indexOf(HINT) > text.indexOf("suggested"), "after the suggestion, with the other scope notes");
  });
});

test("the group view prints the hint once, after the last group, in the order: table, bus factor, blank, definition, blank, hint", async () => {
  await withFixture("groupSplit", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--group-by", "dir:1"]));
    assert.ok(r.grouping && r.grouping.groups.length >= 2, "a real grouping with at least two groups");
    const text = renderGroups(r, 10);
    const out = text.split("\n");
    assert.equal(hintCount(text), 1);
    const last = r.grouping.groups[r.grouping.groups.length - 1];
    const hintAt = out.findIndex((line) => line.startsWith(HINT));
    const busAt = out.findIndex((line) => line.startsWith(`bus factor ${last.busFactor.value}:`));
    assert.ok(busAt !== -1, "the last group's bus factor line is printed");
    assert.ok(busAt < hintAt, "the hint comes after the last group's bus factor line");
    assert.equal(out[hintAt - 1], "", "a blank line before the hint");
    assert.equal(out[hintAt + 1], "", "a blank line after the hint");
    const definitionAt = out.findIndex((line) => line.startsWith("bus factor = "));
    assert.ok(definitionAt < hintAt, "the definition line comes before the hint, which is a scope note");
    assert.ok(out.slice(0, hintAt).some((line) => line.startsWith(`${last.key}  ·`)), "the last group's header is before the hint");
  });
});

test("a result without the key still renders every view without throwing and without a hint", async () => {
  await withFixture("split", async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "src"]));
    const old = /** @type {any} */ ({ ...r, identityHints: undefined });
    delete old.identityHints;
    assert.equal(hintCount(renderTable(old, 10)), 0);
    assert.equal(hintCount(renderMarkdown(old, 10)), 0);
    assert.equal(hintCount(renderReviewers(old, 5)), 0);
    assert.equal(hintCount(renderGroups({ ...old, grouping: { by: "dir:1", groups: [] } }, 10)), 0);
  });
});

test("--identities prints a two-address .mailmap line for one address under two names, and git accepts it", async () => {
  const { execFileSync } = await import("node:child_process");
  const { commitAsIdentity, createRepo } = await import("../scripts/fixtures.mjs");
  const dir = createRepo("sl-same-address-");
  try {
    commitAsIdentity(dir, ["alex94puchades", "alex@example.test"], "2026-01-01T10:00:00Z", "a1", { "a.js": "a\n" });
    commitAsIdentity(dir, ["Alejandro Caravaca Puchades", "alex@example.test"], "2026-01-02T10:00:00Z", "a2", { "b.js": "b\n" });
    commitAsIdentity(dir, ["Bob", "bob@example.com"], "2026-01-03T10:00:00Z", "b1", { "c.js": "c\n" });
    const bin = fileURLToPath(new URL("../bin/surviving-lines.js", import.meta.url));
    const out = execFileSync("node", [bin, "--cwd", dir, "--identities"], { encoding: "utf8" });
    const line = "Alejandro Caravaca Puchades <alex@example.test> alex94puchades <alex@example.test>";
    assert.ok(out.split("\n").includes(line), out);
    await import("node:fs").then((fs) => fs.writeFileSync(join(dir, ".mailmap"), `${line}\n`));
    const names = execFileSync("git", ["log", "--format=%aN"], { cwd: dir, encoding: "utf8" }).split("\n").filter(Boolean);
    assert.deepEqual([...new Set(names)].sort(), ["Alejandro Caravaca Puchades", "Bob"]);
  } finally {
    removeRepo(dir);
  }
});
