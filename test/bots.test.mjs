// @ts-check
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderMarkdown, isBotIdentity } = await import("../bin/surviving-lines.js");
const byMail = (/** @type {any} */ r) => Object.fromEntries(r.authors.map((/** @type {any} */ a) => [a.mail.split("@")[0], [a.lines, a.commits]]));

test("isBotIdentity matches the bot patterns and not people whose names resemble one", () => {
  assert.equal(isBotIdentity("dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"), true);
  assert.equal(isBotIdentity("Renovate Bot", "29139614+renovate[bot]@users.noreply.github.com"), true);
  assert.equal(isBotIdentity("github-actions[bot]", "anything@example.com"), true);
  assert.equal(isBotIdentity("Renovate", "bot@renovateapp.com"), true);
  assert.equal(isBotIdentity("GitLab", "gitlab-bot@gitlab.com"), true);
  assert.equal(isBotIdentity("Gitea", "teabot@gitea.io"), true);
  assert.equal(isBotIdentity("Bot Hawkins", "bot.hawkins@example.com"), false);
  assert.equal(isBotIdentity("Botticelli", "botticelli@example.com"), false);
  assert.equal(isBotIdentity("Abbott", "abbott@example.com"), false);
  assert.equal(isBotIdentity("robot [bot] fan", "fan@example.com"), false);
});

test("bots leave both the line side and the commit side, and the run says how many", async () => {
  const dir = buildFixture("bots");
  try {
    const r = await analyse(parseArgs(["--cwd", dir]));
    // People: ada 10+1 lines in 2 commits, bob 6 in 1, botticelli 4 in 1, bot.hawkins 2 in 1.
    assert.deepEqual(byMail(r), { ada: [11, 2], bob: [6, 1], botticelli: [4, 1], "bot.hawkins": [2, 1] });
    assert.equal(r.sample.linesAttributed, 23);
    assert.equal(r.commitWindow.commits, 5);
    assert.equal(r.bots.included, false);
    assert.deepEqual(r.bots.excluded.map((/** @type {any} */ b) => [b.author, b.lines, b.commits]), [["dependabot[bot]", 17, 2], ["renovate[bot]", 3, 1]]);
    // The shares are of the people only: they add up to one on both sides.
    assert.ok(Math.abs(r.authors.reduce((/** @type {number} */ s, /** @type {any} */ a) => s + a.lineShare, 0) - 1) < 1e-9);
    assert.ok(Math.abs(r.authors.reduce((/** @type {number} */ s, /** @type {any} */ a) => s + a.commitShare, 0) - 1) < 1e-9);
    assert.match(renderTable(r, 10), /^bots excluded: 2 identities \(dependabot\[bot\], renovate\[bot\]\), 20 lines, 3 commits \(--include-bots counts them\)$/m);
    assert.match(renderMarkdown(r, 10), /^bots excluded: 2 identities \(dependabot\[bot\], renovate\[bot\]\), 20 lines, 3 commits/m);
  } finally {
    removeRepo(dir);
  }
});

test("--include-bots counts them as authors again and prints no exclusion line", async () => {
  const dir = buildFixture("bots");
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--include-bots"]));
    assert.equal(r.authors.length, 6);
    assert.equal(r.sample.linesAttributed, 43);
    assert.equal(r.commitWindow.commits, 8);
    assert.deepEqual(r.bots, { included: true, excluded: [] });
    assert.doesNotMatch(renderTable(r, 10), /bots excluded/);
  } finally {
    removeRepo(dir);
  }
});

test("a repository without bots prints exactly what it printed before", async () => {
  const dir = buildFixture("basic");
  try {
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.deepEqual(r.bots, { included: false, excluded: [] });
    assert.doesNotMatch(renderTable(r, 10), /bots excluded/);
  } finally {
    removeRepo(dir);
  }
});

test("a repository made only of bots reports no authors instead of dividing by zero", async () => {
  const dir = buildFixture("bots");
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--", "docs"]));
    assert.deepEqual(r.authors, []);
    assert.equal(r.sample.linesAttributed, 0);
    assert.equal(r.bots.excluded.length, 2);
    assert.match(renderTable(r, 10), /^author {2}/m);
  } finally {
    removeRepo(dir);
  }
});

test("the JSON carries the bots section and matches the published schema; the CLI accepts the flag", async () => {
  const root = join(import.meta.dirname, "..");
  const schema = JSON.parse(await readFile(join(root, "schema", "surviving-lines.schema.json"), "utf8"));
  const dir = buildFixture("bots");
  try {
    const run = spawnSync(process.execPath, [join(root, "bin", "surviving-lines.js"), "--cwd", dir, "--json", "-q"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const doc = JSON.parse(run.stdout);
    assert.equal(doc.bots.excluded.length, 2);
    assert.deepEqual(schemaErrors(schema, doc), []);
    const text = spawnSync(process.execPath, [join(root, "bin", "surviving-lines.js"), "--cwd", dir, "--include-bots", "-q"], { encoding: "utf8" });
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /dependabot\[bot\]/);
  } finally {
    removeRepo(dir);
  }
});

test("isBotIdentity keeps people whose names or person-shaped addresses end in bot", () => {
  const people = [
    ["Tim Talbot", "timtalbot@example.com"],
    ["Jean Chabot", "jeanchabot@example.com"],
    ["Gerard Gabbot", "gerardgabbot@example.com"],
    ["Pierre Guibot", "pierreguibot@example.com"],
    ["Priya", "priyabot@example.com"],
    ["Jan Bot", "jan@example.nl"],
    ["Ion Bot", "ion.bot@example.ro"],
    ["Ion Bot", "ion@example.ro"],
  ];
  for (const [name, mail] of people) assert.equal(isBotIdentity(name, mail), false, `${name} <${mail}>`);
});

test("isBotIdentity still finds bots by name shape and by bot-like address", () => {
  const bots = [
    ["jekyllbot", "jekyllbot@example.com"],
    ["vue-bot", "bot@example.org"],
    ["Release Bot", "release-bot@example.org"],
    ["StepSecurity Bot", "bot@example.io"],
    ["ReadmeCritic", "frankensteinbot@example.com"],
    ["Copybara-Service", "copybara-worker@example.com"],
  ];
  for (const [name, mail] of bots) assert.equal(isBotIdentity(name, mail), true, `${name} <${mail}>`);
});
