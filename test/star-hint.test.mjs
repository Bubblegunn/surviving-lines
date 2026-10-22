// @ts-check
// The one-time star hint: printed to stderr, once, only to a person at a terminal after a successful human view.
// Every test injects the marker file system, the stderr writer and the environment, so nothing touches the real home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFixture, removeRepo } from "../scripts/fixtures.mjs";

const { starHint } = await import("../bin/surviving-lines.js");

const BIN = join(import.meta.dirname, "..", "bin", "surviving-lines.js");
const LINE = "If surviving-lines helped, a star on GitHub helps others find it: https://github.com/Bubblegunn/surviving-lines (shown once; SURVIVING_LINES_NO_STAR_HINT=1 turns it off)";
const CONFIG = "/cfg/surviving-lines";
const MARKER = join(CONFIG, "star-hint-shown");

/**
 * An in-memory file system with the three calls the hint makes. `writes` records the marker contents
 * seen at the moment the stderr line was written, so the test can check the marker came first.
 */
function fakeFs() {
  /** @type {Map<string, string>} */
  const files = new Map();
  /** @type {{ mkdir: boolean, write: boolean }} */
  const fail = { mkdir: false, write: false };
  return {
    files,
    fail,
    fs: {
      existsSync: (/** @type {string} */ p) => files.has(p),
      mkdirSync: () => {
        if (fail.mkdir) throw new Error("EROFS: read-only file system");
      },
      writeFileSync: (/** @type {string} */ p, /** @type {string} */ c) => {
        if (fail.write) throw new Error("EROFS: read-only file system");
        files.set(p, c);
      },
    },
  };
}

/**
 * Calls starHint with a terminal, no agent, no opt-out and a human table view, then lets the test override any input.
 * @param {Record<string, unknown>} [over]
 */
function attempt(over = {}) {
  const fake = fakeFs();
  /** @type {string[]} */
  const printed = [];
  /** @type {{ seenMarker: boolean }[]} */
  const writes = [];
  const args = {
    stdoutIsTTY: true,
    stderrIsTTY: true,
    env: /** @type {Record<string, string | undefined>} */ ({}),
    quiet: false,
    view: "table",
    shallow: false,
    configDir: CONFIG,
    fs: fake.fs,
    write: (/** @type {string} */ s) => {
      printed.push(s);
      writes.push({ seenMarker: fake.files.has(MARKER) });
    },
    ...over,
  };
  const shown = starHint(/** @type {any} */ (args));
  return { shown, printed, writes, fake };
}

test("prints the hint once at a terminal and writes the marker before printing", () => {
  const first = attempt();
  assert.equal(first.shown, true);
  assert.deepEqual(first.printed, [`${LINE}\n`]);
  assert.equal(first.writes[0].seenMarker, true, "the marker existed when the line was written");
  assert.ok(first.fake.files.has(MARKER), "marker file written");
  assert.match(first.fake.files.get(MARKER) ?? "", /^\d{4}-\d{2}-\d{2}T/, "marker holds an ISO date");
});

test("a second call with the marker present prints nothing", () => {
  const fake = fakeFs();
  fake.files.set(MARKER, "2026-10-01T00:00:00.000Z\n");
  /** @type {string[]} */
  const printed = [];
  const shown = starHint({
    stdoutIsTTY: true, stderrIsTTY: true, env: {}, quiet: false, view: "table", shallow: false,
    configDir: CONFIG, fs: fake.fs, write: (s) => printed.push(s),
  });
  assert.equal(shown, false);
  assert.deepEqual(printed, []);
});

test("a second run after the first prints nothing", () => {
  const fake = fakeFs();
  /** @type {string[]} */
  const printed = [];
  const args = {
    stdoutIsTTY: true, stderrIsTTY: true, env: {}, quiet: false, view: "table", shallow: false,
    configDir: CONFIG, fs: fake.fs, write: (/** @type {string} */ s) => printed.push(s),
  };
  assert.equal(starHint(args), true);
  assert.equal(starHint(args), false);
  assert.equal(printed.length, 1);
});

test("stdout that is not a terminal shows nothing and writes no marker", () => {
  const r = attempt({ stdoutIsTTY: false });
  assert.equal(r.shown, false);
  assert.deepEqual(r.printed, []);
  assert.equal(r.fake.files.size, 0);
});

test("stderr that is not a terminal shows nothing and writes no marker", () => {
  const r = attempt({ stderrIsTTY: false });
  assert.equal(r.shown, false);
  assert.deepEqual(r.printed, []);
  assert.equal(r.fake.files.size, 0);
});

test("CI set to a real value hides the hint, while empty, false and 0 do not", () => {
  for (const value of ["true", "1", "yes"]) {
    const r = attempt({ env: { CI: value } });
    assert.equal(r.shown, false, `CI=${value} must hide the hint`);
  }
  for (const value of ["", "false", "0"]) {
    const r = attempt({ env: { CI: value } });
    assert.equal(r.shown, true, `CI=${JSON.stringify(value)} must not hide the hint`);
  }
});

test("each agent marker hides the hint", () => {
  for (const marker of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CODEX_SANDBOX", "AI_AGENT"]) {
    const r = attempt({ env: { [marker]: "1" } });
    assert.equal(r.shown, false, `${marker} must hide the hint`);
    assert.equal(r.fake.files.size, 0, `${marker} must not write the marker`);
  }
});

test("SURVIVING_LINES_NO_STAR_HINT=1 opts out, and any other value does not", () => {
  assert.equal(attempt({ env: { SURVIVING_LINES_NO_STAR_HINT: "1" } }).shown, false);
  assert.equal(attempt({ env: { SURVIVING_LINES_NO_STAR_HINT: "0" } }).shown, true);
});

test("--quiet hides the hint", () => {
  const r = attempt({ quiet: true });
  assert.equal(r.shown, false);
  assert.deepEqual(r.printed, []);
});

test("only the table, group-by and reviewers views show the hint", () => {
  for (const view of ["json", "csv", "markdown", "identities"]) {
    const r = attempt({ view });
    assert.equal(r.shown, false, `${view} must not show the hint`);
    assert.equal(r.fake.files.size, 0, `${view} must not write the marker`);
  }
  for (const view of ["table", "groups", "reviewers"]) {
    assert.equal(attempt({ view }).shown, true, `${view} shows the hint`);
  }
});

test("a shallow-clone run shows nothing", () => {
  const r = attempt({ shallow: true });
  assert.equal(r.shown, false);
  assert.deepEqual(r.printed, []);
});

test("a marker that cannot be written shows nothing, and never throws", () => {
  assert.equal(attempt().shown, true, "control: the normal path still shows the hint");

  const fake = fakeFs();
  fake.fail.write = true;
  /** @type {string[]} */
  const printed = [];
  assert.equal(starHint({ stdoutIsTTY: true, stderrIsTTY: true, env: {}, quiet: false, view: "table", shallow: false, configDir: CONFIG, fs: fake.fs, write: (s) => printed.push(s) }), false);
  assert.deepEqual(printed, []);

  const noDir = fakeFs();
  noDir.fail.mkdir = true;
  /** @type {string[]} */
  const printedToo = [];
  assert.equal(starHint({ stdoutIsTTY: true, stderrIsTTY: true, env: {}, quiet: false, view: "table", shallow: false, configDir: CONFIG, fs: noDir.fs, write: (s) => printedToo.push(s) }), false);
  assert.deepEqual(printedToo, []);
});

test("the hint goes to the injected stderr writer and never to stdout", () => {
  const original = process.stdout.write;
  let stdoutWrites = 0;
  process.stdout.write = /** @type {any} */ ((..._args) => {
    stdoutWrites += 1;
    return true;
  });
  try {
    const r = attempt();
    assert.equal(r.shown, true);
    assert.deepEqual(r.printed, [`${LINE}\n`]);
  } finally {
    process.stdout.write = original;
  }
  assert.equal(stdoutWrites, 0, "nothing written to stdout");
});

test("the CLI help names the opt-out variable", () => {
  const help = spawnSync(process.execPath, [BIN, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^SURVIVING_LINES_NO_STAR_HINT=1 hides the one-time star hint$/m);
});

test("a real run with piped output prints no hint and writes no marker", () => {
  const dir = buildFixture("basic");
  const home = mkdtempSync(join(tmpdir(), "sl-star-home-"));
  try {
    const run = spawnSync(process.execPath, [BIN, "--cwd", dir], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, "xdg") },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(!run.stderr.includes("star on GitHub"), "no hint line on stderr");
    assert.ok(!run.stdout.includes("star on GitHub"), "no hint line on stdout");
    assert.deepEqual(readdirSync(home), [], "no config directory was created");
  } finally {
    removeRepo(dir);
    rmSync(home, { recursive: true, force: true });
  }
});
