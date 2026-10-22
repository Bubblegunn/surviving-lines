// @ts-check
// R7-4: each same-person suggestion has a strength, strong or weak, from the kinds of evidence it carries. The tool
// never merges by itself. Every repository is built inside the test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { schemaErrors } from "../scripts/schema-check.mjs";

const schema = JSON.parse(readFileSync(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
const { parseArgs, analyse, renderTable, renderIdentities, linkIdentities, sameAddressNames, renderJson } = await import("../bin/surviving-lines.js");

/** @param {string} dir @param {string[]} args @param {Record<string, string>} [env] */
function git(dir, args, env = {}) {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", ...env } });
}

/** @param {string} dir @param {string} name @param {string} mail @param {string} file @param {number} n */
function commit(dir, name, mail, file, n) {
  const full = join(dir, file);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, Array.from({ length: n }, (_, i) => `${file} ${i}\n`).join(""));
  git(dir, ["add", file]);
  git(dir, ["commit", "-q", "-m", "change"], { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: mail, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: mail, GIT_AUTHOR_DATE: "2024-01-01T12:00:00Z", GIT_COMMITTER_DATE: "2024-01-01T12:00:00Z" });
}

/** @param {[string, string][]} people one commit of 20 lines each, in a file of its own @param {(r: Awaited<ReturnType<typeof analyse>>, dir: string) => void} check */
async function withPeople(people, check) {
  const dir = mkdtempSync(join(tmpdir(), "sl-r74-"));
  try {
    git(dir, ["init", "-q", "-b", "main"]);
    people.forEach(([name, mail], i) => commit(dir, name, mail, `src/f${i}.js`, 20));
    check(await analyse(parseArgs(["--cwd", dir, "-q"])), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @param {Awaited<ReturnType<typeof analyse>>} r */
const suggestions = (r) => r.possibleSamePerson.suggestions;

test("R7-4: names equal once case and accents are ignored are strong", async () => {
  await withPeople([["JOSÉ garcia", "jose@one.example"], ["Jose Garcia", "jgarcia@two.example"], ["Other Person", "other@three.example"]], (r) => {
    assert.equal(suggestions(r).length, 1);
    assert.equal(suggestions(r)[0].strength, "strong");
    assert.equal(suggestions(r)[0].addresses.length, 2);
  });
});

test("R7-4: two noreply addresses with the same GitHub user id are strong", async () => {
  await withPeople([["Alpha Tester", "123+firstlogin@users.noreply.github.com"], ["Beta Runner", "123+renamedlogin@users.noreply.github.com"], ["Other Person", "other@three.example"]], (r) => {
    assert.equal(suggestions(r).length, 1);
    assert.equal(suggestions(r)[0].strength, "strong");
  });
});

test("R7-4: two different kinds of evidence are strong", async () => {
  // "John Smith" is contained in the second address (a digit keeps R9-1 out), and "J. Smith" is the initial form of "John Smith".
  await withPeople([["John Smith", "jsmith1@one.example"], ["J. Smith", "johnsmith1@two.example"], ["Other Person", "other@three.example"]], (r) => {
    const kinds = suggestions(r)[0]?.evidence ?? [];
    assert.ok(kinds.length >= 2, kinds.join("; "));
    assert.equal(suggestions(r)[0].strength, "strong");
  });
});

test("R7-4: one address-stem item alone is weak", async () => {
  await withPeople([["Alice A", "alice@one.example"], ["Bob B", "alice2@two.example"], ["Other Person", "other@three.example"]], (r) => {
    assert.equal(suggestions(r).length, 1);
    assert.equal(suggestions(r)[0].evidence.length, 1);
    assert.equal(suggestions(r)[0].strength, "weak");
  });
});

test("R7-4: text and JSON print the strength, the schema accepts it, and nothing is merged", async () => {
  await withPeople([["JOSÉ garcia", "jose@one.example"], ["Jose Garcia", "jgarcia@two.example"], ["Alice A", "alice@one.example"], ["Bob B", "alice2@two.example"]], (r) => {
    assert.deepEqual(suggestions(r).map((s) => s.strength).sort(), ["strong", "weak"]);
    assert.match(renderTable(r, 10), /strong suggestion/);
    assert.match(renderTable(r, 10), /weak suggestion/);
    assert.match(renderIdentities(linkIdentities(r.authors), sameAddressNames([]), r.possibleSamePerson), /strong suggestion/);
    const json = JSON.parse(renderJson(r));
    assert.ok(json.possibleSamePerson.suggestions.every((/** @type {{ strength: string }} */ s) => s.strength === "strong" || s.strength === "weak"));
    assert.deepEqual(schemaErrors(schema, json), []);
    assert.equal(json.possibleSamePerson.merged, false);
    assert.equal(r.authors.length, 4);
  });
});
