// @ts-check
// --history <path>: the people who changed one path, oldest first by their first commit there, with their last commit,
// commits and surviving lines, and the formatting-only commits that touch the path set aside. The fixture is `history`
// in scripts/fixtures.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PEOPLE, buildFixture, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderHistory, renderJson, setAsideFor, touchesPath } = await import("../bin/surviving-lines.js");

const BIN = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
const COMBINED = "--history prints its own view; it can be combined with --json only";

/** @param {keyof typeof PEOPLE} who */
const mailOf = (who) => PEOPLE[who][1];

/** @param {(dir: string) => Promise<void>} fn */
async function withHistory(fn) {
  const dir = buildFixture("history");
  try {
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

test("the people are listed oldest first by their first commit at the path, ties by address", async () => {
  await withHistory(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "lib"]));
    // Fiona's formatting commit is set aside, so she is not listed. Bob and Troy share a first day: Bob's address sorts first.
    assert.deepEqual(r.history?.authors.map((a) => a.mail), [mailOf("charlie"), mailOf("ada"), mailOf("bob"), mailOf("troy"), mailOf("troyWork")]);
  });
});

test("each person carries the first and last commit dates, the commit count and the surviving lines after the correction", async () => {
  await withHistory(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "lib"]));
    assert.equal(r.history?.path, "lib");
    assert.equal(r.history?.asOf, "2026-04-12");
    assert.deepEqual(
      r.history?.authors.map((a) => [a.mail, a.firstCommit, a.lastCommit, a.commits, a.lines]),
      [
        [mailOf("charlie"), "2024-01-05", "2024-01-05", 1, 40],
        // Ada keeps her 30 lines: the formatter's rewrite of them is ignored, as the table does.
        [mailOf("ada"), "2025-01-10", "2025-01-10", 1, 30],
        [mailOf("bob"), "2025-03-01", "2025-03-01", 1, 8],
        [mailOf("troy"), "2025-03-01", "2025-03-01", 1, 10],
        [mailOf("troyWork"), "2025-04-01", "2025-04-01", 1, 6],
      ],
    );
  });
});

test("the formatting-only commit that touches the path is set aside with its id, subject, author and date, and has no row", async () => {
  await withHistory(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "lib"]));
    const fiona = r.reformat.suspects.find((s) => s.author === PEOPLE.fiona[0]);
    assert.ok(fiona, "the fixture's formatter is a detected suspect");
    assert.deepEqual(r.history?.setAside, [{ sha: fiona.sha, shortSha: fiona.shortSha, subject: "style: switch app.js to double quotes", author: PEOPLE.fiona[0], date: "2025-02-01" }]);
    assert.equal(r.history?.authors.some((a) => a.mail === mailOf("fiona")), false);
  });
});

test("--keep-reformat counts the formatter as a person again, and the set-aside list still names its commit", async () => {
  await withHistory(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "lib", "--keep-reformat"]));
    assert.deepEqual(r.history?.authors.map((a) => [a.mail, a.lines]), [
      [mailOf("charlie"), 40],
      [mailOf("ada"), 0],
      [mailOf("fiona"), 30],
      [mailOf("bob"), 8],
      [mailOf("troy"), 10],
      [mailOf("troyWork"), 6],
    ]);
    assert.equal(r.history?.setAside.length, 1);
  });
});

test("--merge-identities gives one row per person: the earliest first commit, the latest last commit, and summed commits and lines", async () => {
  await withHistory(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "lib", "--merge-identities"]));
    const troy = r.history?.authors.find((a) => a.author === PEOPLE.troy[0]);
    assert.ok(troy, "Troy's two addresses are one row");
    assert.equal(troy.addresses, 2);
    assert.deepEqual([troy.firstCommit, troy.lastCommit, troy.commits, troy.lines], ["2025-03-01", "2025-04-01", 2, 16]);
    assert.equal(r.history?.authors.length, 4);
    // Bob and the merged Troy still share a first day, so Bob stays ahead.
    assert.deepEqual(r.history?.authors.map((a) => a.author), [PEOPLE.charlie[0], PEOPLE.ada[0], PEOPLE.bob[0], PEOPLE.troy[0]]);
  });
});

test("the header and the sentence name the count, the as-of date, the first committer and the holder of most lines", async () => {
  await withHistory(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "lib"]));
    const text = renderHistory(r, 10);
    assert.ok(text.includes("history of lib (5 people changed it, oldest first; surviving lines as of 2026-04-12)"), text);
    // Charlie: 40 of 94 lines, the most, and also the first committer.
    assert.ok(text.includes(`${PEOPLE.charlie[0]} made the first commit, on 2024-01-05, and holds the most lines now (40 lines, 42.6%).`), text);
    assert.ok(text.includes("set aside (formatting-only commits touching this path, left out of the counts):"), text);
    assert.ok(text.includes(`  ${r.history?.setAside[0].shortSha}  2025-02-01  ${PEOPLE.fiona[0]}  style: switch app.js to double quotes`), text);
  });
});

test("the sentence names two people when the first committer and the holder of most lines differ", async () => {
  await withHistory(async (dir) => {
    // Charlie is first but holds 40 lines; Ada holds most once Charlie's lines are reduced in a derived copy of the result.
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "lib"]));
    assert.ok(r.history);
    const shrunk = { ...r, history: { ...r.history, authors: r.history.authors.map((a) => (a.mail === mailOf("charlie") ? { ...a, lines: 1 } : a)) } };
    const text = renderHistory(shrunk, 10);
    assert.ok(text.includes(`${PEOPLE.charlie[0]} made the first commit, on 2024-01-05; ${PEOPLE.ada[0]} holds the most lines now (30 lines, 31.9%).`), text);
  });
});

test("rows beyond --top are named as a count, and the table's default of ten rows applies without --top", async () => {
  await withHistory(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "lib"]));
    assert.ok(renderHistory(r, 2).includes("… 3 more people"), renderHistory(r, 2));
    assert.equal(renderHistory(r, 10).includes("more people"), false);
  });
});

test("--history and --reviewers are mutually exclusive, and --history refuses the same combinations --reviewers does", () => {
  assert.throws(() => parseArgs(["--history", "lib", "--reviewers", "lib"]), { message: "--reviewers and --history are mutually exclusive: each prints its own view" });
  for (const extra of [["--csv"], ["--markdown"], ["--identities"], ["--group-by", "dir"], ["--suggest-codeowners", "--group-by", "dir"]]) {
    assert.throws(() => parseArgs(["--history", "lib", ...extra]), { message: COMBINED }, extra.join(" "));
  }
  assert.throws(() => parseArgs(["--history", "lib", "--", "src"]), { message: "--history takes its path as its own value; it cannot be combined with pathspecs after --" });
  assert.equal(parseArgs(["--history", "lib", "--json"]).json, true);
});

test("the JSON carries the history object, which validates against the schema; without the flag it is null", async () => {
  await withHistory(async (dir) => {
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    const withFlag = JSON.parse(renderJson(await analyse(parseArgs(["--cwd", dir, "--history", "lib", "--merge-identities", "--json"]))));
    assert.deepEqual(schemaErrors(schema, withFlag), []);
    assert.equal(withFlag.history.authors.length, 4);
    assert.equal(withFlag.history.setAside.length, 1);
    const without = JSON.parse(renderJson(await analyse(parseArgs(["--cwd", dir]))));
    assert.deepEqual(schemaErrors(schema, without), []);
    assert.equal(without.history, null);
  });
});

test("the CLI prints the history view, and --top limits its rows", async () => {
  await withHistory(async (dir) => {
    const run = (/** @type {string[]} */ extra) => spawnSync(process.execPath, [BIN, "--cwd", dir, "--history", "lib", "-q", ...extra], { encoding: "utf8" });
    const full = run(["--merge-identities"]);
    assert.equal(full.status, 0, full.stderr);
    const out = full.stdout;
    // Ten rows unless --top is given: five people are all shown, with nothing cut.
    assert.equal(out.includes("more person"), false, out);
    assert.ok(out.indexOf(PEOPLE.charlie[0]) < out.indexOf(PEOPLE.ada[0]) && out.indexOf(PEOPLE.ada[0]) < out.indexOf(PEOPLE.bob[0]), out);
    assert.ok(out.includes("set aside"), out);
    const one = run(["--top", "1"]);
    assert.equal(one.status, 0, one.stderr);
    assert.ok(one.stdout.includes("… 4 more people"), one.stdout);
  });
});

test("touchesPath matches a file, a directory with or without its trailing slash, and nothing that only shares a prefix", () => {
  assert.equal(touchesPath(["lib/app.js"], "lib/app.js"), true);
  assert.equal(touchesPath(["lib/app.js"], "lib"), true);
  assert.equal(touchesPath(["lib/app.js"], "lib/"), true);
  assert.equal(touchesPath(["libs/x.js"], "lib"), false);
  assert.equal(touchesPath(["src/lib.js"], "lib"), false);
  assert.equal(touchesPath(["lib/app.js"], "./lib"), true);
});

test("a suspect without its file list (the old shape) touches no path and does not fail the set-aside list", () => {
  const old = [{ sha: "a".repeat(40), shortSha: "aaaaaaa", subject: "style", author: "Fiona", mail: "f@x.example", date: "2025-02-01" }];
  assert.equal(touchesPath(undefined, "lib"), false);
  assert.deepEqual(setAsideFor(/** @type {any} */ (old), "lib"), []);
});

test("setAsideFor keeps only the suspects whose changed files include the path, sorted by date then id", () => {
  const base = { author: "Fiona", mail: "f@x.example", subject: "style", shortSha: "x", filesChanged: 1, changedLines: 2, survivingLines: 20 };
  const suspects = [
    { ...base, sha: "c".repeat(40), date: "2025-03-01", files: ["src/other.js"] },
    { ...base, sha: "b".repeat(40), date: "2025-02-01", files: ["lib/app.js", "src/x.js"] },
    { ...base, sha: "a".repeat(40), date: "2025-02-01", files: ["lib/z.js"] },
  ];
  assert.deepEqual(setAsideFor(suspects, "lib").map((s) => s.sha), ["a".repeat(40), "b".repeat(40)]);
  assert.deepEqual(setAsideFor(suspects, "src/other.js").map((s) => s.sha), ["c".repeat(40)]);
});

test("a path that matches no file gives the existing pathspec error", async () => {
  await withHistory(async (dir) => {
    await assert.rejects(analyse(parseArgs(["--cwd", dir, "--history", "nope"])), /no files matched the pathspec after --: nope/);
  });
});

test("the --history line of --help lines up with --reviewers, and its second line says what --since and --until leave alone", () => {
  const help = spawnSync(process.execPath, [BIN, "--help"], { encoding: "utf8" }).stdout;
  const lines = help.split("\n");
  const reviewers = lines.find((l) => l.startsWith("  --reviewers <path>"));
  const history = lines.findIndex((l) => l.startsWith("  --history <path>"));
  assert.ok(reviewers !== undefined && history >= 0, help);
  // The description column is the same as the neighbouring options' column.
  assert.equal(lines[history].indexOf("list"), reviewers.indexOf("list"), `${lines[history]}\n${reviewers}`);
  // The window sentence sits on the next line, in the same column, and says what the window does not change.
  const more = lines[history + 1];
  assert.equal(more.indexOf("--since"), reviewers.indexOf("list"), more);
  assert.ok(more.includes("--since and --until do not narrow its dates or commit counts"), more);
});

test("one blank line, not two, separates the bus factor block from the set-aside block in the history view", async () => {
  await withHistory(async (dir) => {
    const r = await analyse(parseArgs(["--cwd", dir, "--history", "lib"]));
    const text = renderHistory(r, 10);
    assert.equal(text.includes("\n\n\n"), false, text);
    const lines = text.split("\n");
    const at = lines.findIndex((l) => l.startsWith("set aside"));
    assert.ok(at >= 2, text);
    assert.equal(lines[at - 1], "", text);
    assert.ok(lines.slice(0, at).some((l) => l.startsWith("bus factor")), text);
    assert.ok(lines.slice(0, at).some((l) => l.startsWith("reformat commit")), "the scope notes come before the set-aside block");
  });
});

test("--since and --until leave the dates and commit counts of each person in the history view as they are", async () => {
  await withHistory(async (dir) => {
    const run = (/** @type {string[]} */ extra) => {
      const res = spawnSync(process.execPath, [BIN, "--cwd", dir, "--history", "lib", "--json", "-q", ...extra], { encoding: "utf8" });
      assert.equal(res.status, 0, res.stderr);
      return JSON.parse(res.stdout).history.authors;
    };
    const all = run([]);
    const windowed = run(["--since", "2024-06-01", "--until", "2025-06-01"]);
    // Everyone who still holds lines keeps their row, and the window changes neither their dates nor their commit counts.
    const holders = all.filter((a) => a.lines > 0);
    assert.ok(holders.length > 0 && windowed.length > 0, "the test needs people with lines in both runs");
    for (const a of holders) {
      const w = windowed.find((x) => x.mail === a.mail);
      assert.ok(w, `${a.mail} lost its row`);
      assert.deepEqual([w.firstCommit, w.lastCommit, w.commits], [a.firstCommit, a.lastCommit, a.commits], a.mail);
    }
  });
});
