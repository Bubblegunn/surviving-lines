// @ts-check
// The UserPromptSubmit hint (hooks/surviving-lines-hint.sh). It reads the prompt and the cwd from the hook input, and
// when the prompt is about authors, ownership or duplicate identities it prints one JSON line. The suspected same-person
// groups come from names and addresses only, so every group test builds its identities here with fixed dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitAsIdentity, createRepo, git, removeRepo } from "../scripts/fixtures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(ROOT, "hooks", "surviving-lines-hint.sh");
const PROMPT = "who owns the parser module in this repo?";

/** @param {string | Buffer} input raw stdin @param {Record<string, string>} [env] */
function runRaw(input, env = {}) {
  // The working directory is the plugin root, which is itself a repository with many commits. A hook that fell
  // back to "." would therefore print for it, so a silent result proves the hook did not use the process directory.
  return spawnSync("sh", [HOOK], {
    input,
    encoding: "utf8",
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CLAUDE_PLUGIN_ROOT: ROOT, ...env },
  });
}

/** @param {string} prompt @param {string} cwd @param {Record<string, string>} [env] */
function hook(prompt, cwd, env = {}) {
  return runRaw(JSON.stringify({ session_id: "t", cwd, hook_event_name: "UserPromptSubmit", prompt }), env);
}

/** The additionalContext of one run. Asserts exit 0, one JSON line and the event name. @param {import("node:child_process").SpawnSyncReturns<string>} result */
function context(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.indexOf("\n"), result.stdout.length - 1, `one line: ${result.stdout}`);
  assert.equal(result.stderr, "", "stderr must stay empty");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  return parsed.hookSpecificOutput.additionalContext;
}

/** The closing sentence when groups were found. @param {string} ctx */
function assertClosing(ctx) {
  assert.match(ctx, /These groups are guesses\. If asked to fix the duplicates, write the suggested lines to \.mailmap under a proposal comment, re-run SL, and say they are unconfirmed guesses\. SL --identities prints the lines; SL --merge-identities merges in memory only\.$/);
  assert.match(ctx, /SL = node "[^"]+\/bin\/surviving-lines\.js" is the command/);
}

/** The closing sentence when no group was found. @param {string} ctx */
function assertNoGroupClosing(ctx) {
  assert.match(ctx, /No same-person groups were suspected from names and addresses; that does not prove there are none\. Run SL --identities to check\.$/);
  assert.doesNotMatch(ctx, /These groups are guesses/);
}

/**
 * The context without the pre-computed brief (the brief comes on top of the 1,200-character budget of the rest).
 * @param {string} ctx
 */
function withoutBrief(ctx) {
  return ctx.replace(/ Pre-computed ownership brief for this repository at [0-9a-f]+ \(whole repository[^)]*\): [\s\S]*? or --include(?= (Suspected|No same-person))/, "");
}

/** @param {number} i @returns {string} a fixed ISO date, one minute after the previous commit */
const at = (i) => new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * One commit per entry, in order, each by its own identity.
 * @param {Array<[[string, string], string]>} commits [identity, file]
 * @returns {string} the repository
 */
function repoWith(commits) {
  const dir = createRepo("sl-hint-");
  commits.forEach(([identity, file], i) => commitAsIdentity(dir, identity, at(i), `commit ${i}`, { [file]: `line ${i}\n` }));
  return dir;
}

/** @param {string} dir a repository with one human, enough for a clean run */
function cleanRepo() {
  return repoWith([
    [["Ada", "ada@example.com"], "a.js"],
    [["Ada", "ada@example.com"], "b.js"],
    [["Bob", "bob@example.com"], "c.js"],
  ]);
}

/** Every file under dir with its size and mtime, .git included, so any write shows up. @param {string} dir */
function snapshot(dir) {
  return readdirSync(dir, { recursive: true })
    .map((p) => {
      const s = statSync(join(dir, String(p)));
      return `${p} ${s.size} ${s.mtimeMs}`;
    })
    .sort()
    .join("\n");
}

const UNRELATED = [
  "write a function that reverses a string in python",
  "translate 'good morning' into German",
  "what is 17 times 23",
  "write a haiku about rain on a tin roof",
  "who is the president of France",
  "what's the weather like in Ankara tomorrow",
  "explain this error: TypeError: undefined is not a function",
  "rename this variable to something clearer",
  "write a git commit message for this diff",
  "how do I undo my last git rebase",
  "git status",
  "show me the diff of the last change",
  "what is a commit hash",
  "add a dark mode toggle to the settings page",
  "fix the flaky test in checkout.spec.ts",
  "summarise this article in three bullet points",
  "convert 3 km to miles",
  "how do I list files modified in the last hour with find",
  "draft an email to my landlord about the boiler",
  "what does the npm run build script do",
];

// The topic phrases added after review: each must match, and none of them may appear in UNRELATED.
const RECALL = [
  "we have multiple identities for one developer",
  "who is the main author of this module",
  "who are the top committers this quarter",
  "what is the ownership by team across the monorepo",
  "who touched this function last",
  "who is responsible for the auth code",
];

const MATCHING = [
  "who owns the parser module in this repo?",
  "what is the bus factor of this project?",
  "is there a mailmap in this repository?",
  "the same person shows up under two names in the log, fix it",
  "are there duplicate authors in this git log?",
  "why is my email counted twice in the stats",
  "who should review changes to lib/auth.js",
  "run surviving lines on this repository",
  "top contributors for the last year, please",
  "give me the history of this file and who shaped it",
  "who wrote most of the code in src/billing?",
  "is there a CODEOWNERS file for this repo?",
  ...RECALL,
];

test("R1: one name on two addresses is a suspected group, labelled with its rule", () => {
  const dir = repoWith([
    [["Dana Reyes", "dana.r@one.example"], "a.js"],
    [["Dana Reyes", "dreyes@two.example"], "b.js"],
  ]);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.match(ctx, /\[R1 same name\] Dana Reyes \(dana\.r@one\.example\) 1 commit; Dana Reyes \(dreyes@two\.example\) 1 commit/);
    assert.doesNotMatch(ctx, /\[R[234] /);
    assertClosing(ctx);
  } finally {
    removeRepo(dir);
  }
});

test("R2: one address under two names is a suspected group, labelled with its rule", () => {
  const dir = repoWith([
    [["Eli Park", "eli@same.example"], "a.js"],
    [["E. Park", "eli@same.example"], "b.js"],
  ]);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.match(ctx, /\[R2 same address, other name\] /);
    assert.doesNotMatch(ctx, /\[R[134] /);
  } finally {
    removeRepo(dir);
  }
});

test("R2: the hint carries the exact two-address .mailmap line, full name first", () => {
  const dir = repoWith([
    [["alex94p", "alex@same.example"], "a.js"],
    [["Alejandro Caravaca Puchades", "alex@same.example"], "b.js"],
  ]);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.ok(ctx.includes("copy it as is: Alejandro Caravaca Puchades <alex@same.example> alex94p <alex@same.example>"), ctx);
  } finally {
    removeRepo(dir);
  }
});

test("R3: one local part on two domains is a suspected group, with dots ignored", () => {
  const dir = repoWith([
    [["Mara L.", "mara.lund@studio.example"], "a.js"],
    [["Mara Lund", "maralund@agency.example"], "b.js"],
  ]);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.match(ctx, /\[R3 same local part\] /);
    assert.doesNotMatch(ctx, /\[R[124] /);
  } finally {
    removeRepo(dir);
  }
});

test("R4: a noreply login equal to another record's name without punctuation is a suspected group", () => {
  const dir = repoWith([
    [["Hana Ozer", "4321+hanaozer@users.noreply.github.com"], "a.js"],
    [["Hana-Ozer", "hana@ozer.example"], "b.js"],
  ]);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.match(ctx, /\[R4 noreply login\] /);
    assert.doesNotMatch(ctx, /\[R[123] /);
  } finally {
    removeRepo(dir);
  }
});

test("a clean repository gets the ownership hint with no groups", () => {
  const dir = cleanRepo();
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.match(ctx, /^This request is about who wrote or owns code in git/);
    assert.doesNotMatch(ctx, /\[R[1-4]/);
    assert.doesNotMatch(ctx, /Suspected same-person groups/);
    assertNoGroupClosing(ctx);
  } finally {
    removeRepo(dir);
  }
});

test("without CLAUDE_PLUGIN_ROOT the agent is told to run the bare command", () => {
  const dir = cleanRepo();
  try {
    const ctx = context(hook(PROMPT, dir, { CLAUDE_PLUGIN_ROOT: "" }));
    assert.match(ctx, /SL = surviving-lines is the command: run SL instead of counting by hand/);
    assert.match(ctx, /Run SL --identities to check/);
  } finally {
    removeRepo(dir);
  }
});

test("counts read 1 commit or N commits", () => {
  const dir = repoWith([
    [["Eli Park", "eli@same.example"], "a.js"],
    [["Eli Park", "eli@same.example"], "b.js"],
    [["E. Park", "eli@same.example"], "c.js"],
  ]);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.match(ctx, /Eli Park \(eli@same\.example\) 2 commits/);
    assert.match(ctx, /E\. Park \(eli@same\.example\) 1 commit(;|\.|$)/m);
  } finally {
    removeRepo(dir);
  }
});

test("twenty unrelated prompts print nothing, in a repository where a matching prompt does print", () => {
  const dir = cleanRepo();
  try {
    assert.match(context(hook(PROMPT, dir)), /This request is about/);
    for (const prompt of UNRELATED) {
      const result = hook(prompt, dir);
      assert.equal(result.status, 0, prompt);
      assert.equal(result.stdout, "", prompt);
    }
  } finally {
    removeRepo(dir);
  }
});

test("the matching prompts, including the recall phrases, print one hint each", () => {
  const dir = cleanRepo();
  try {
    for (const prompt of MATCHING) assert.match(context(hook(prompt, dir)), /^This request is about/, prompt);
  } finally {
    removeRepo(dir);
  }
});

test("outside a repository nothing is printed, even for a matching prompt", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sl-hint-outside-")));
  try {
    const result = hook(PROMPT, dir);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("above the commit cap nothing is printed; at the default cap the same repository prints", () => {
  const dir = repoWith(Array.from({ length: 8 }, (_, i) => [["Ada", "ada@example.com"], `f${i}.js`]));
  try {
    const capped = hook(PROMPT, dir, { SURVIVING_LINES_HINT_CAP: "5" });
    assert.equal(capped.status, 0);
    assert.equal(capped.stdout, "");
    assert.match(context(hook(PROMPT, dir)), /This request is about/);
  } finally {
    removeRepo(dir);
  }
});

test("bots are never a suspected group, even when two bot records share a name", () => {
  // The two bot records use addresses with no bot marker, so only the name rule can exclude them. The noreply record
  // is excluded by its address alone.
  const dir = repoWith([
    [["renovate[bot]", "ops@example.com"], "a.js"],
    [["renovate[bot]", "ops@example.org"], "b.js"],
    [["renovate[bot]", "29139614+renovate[bot]@users.noreply.github.com"], "c.js"],
    [["Ada", "ada@example.com"], "d.js"],
  ]);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.doesNotMatch(ctx, /\[R[1-4]/);
  } finally {
    removeRepo(dir);
  }
});

test("names with quotes and backslashes keep the JSON valid and are printed without them", () => {
  const name = 'Ana "Q" \\ Lee';
  const dir = repoWith([
    [[name, "ana@one.example"], "a.js"],
    [[name, "lee@two.example"], "b.js"],
  ]);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.match(ctx, /\[R1 same name\] Ana Q {2}Lee \(ana@one\.example\)/);
    assert.doesNotMatch(ctx, /"Q"/);
  } finally {
    removeRepo(dir);
  }
});

/**
 * A repository whose directory has the given name, with a group, so a matching run would print if it found this repository.
 * @param {string} name the directory name, used as given
 * @returns {{ dir: string, parent: string }} the repository and the parent to remove afterwards
 */
function repoNamed(name) {
  const made = repoWith([
    [["Dana Reyes", "dana.r@one.example"], "a.js"],
    [["Dana Reyes", "dreyes@two.example"], "b.js"],
  ]);
  const parent = mkdtempSync(join(tmpdir(), "sl-hint-named-"));
  const dir = join(parent, name);
  renameSync(made, dir);
  return { dir, parent };
}

test("a working directory with a double quote in its name stays silent, and is not replaced by the process directory", () => {
  const { dir, parent } = repoNamed('a"b');
  try {
    const result = hook(PROMPT, dir);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("a working directory with a backslash in its name stays silent, and is not replaced by the process directory", () => {
  const { dir, parent } = repoNamed("a\\b");
  try {
    const result = hook(PROMPT, dir);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("a working directory with a space in its name works", () => {
  const { dir, parent } = repoNamed("my repo");
  try {
    assert.match(context(hook(PROMPT, dir)), /\[R1 same name\] Dana Reyes/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("a non-ASCII author name is printed as ASCII, so the JSON stays valid and no character is split", () => {
  const dir = repoWith([
    [["Zo\u00eb M\u00fcller", "zoe@one.example"], "a.js"],
    [["Zo\u00eb M\u00fcller", "mueller@two.example"], "b.js"],
  ]);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.match(ctx, /^[\x20-\x7e\n]+$/, "the context must be printable ASCII, with line breaks only inside the brief");
    assert.match(ctx, /\[R1 same name\] Zo\?+ M\?+ller \(/);
    assert.match(ctx, /\(zoe@one\.example\)/);
  } finally {
    removeRepo(dir);
  }
});

test("invalid UTF-8 on stdin under a UTF-8 locale prints nothing on stderr and exits 0", () => {
  // tr reports "Illegal byte sequence" on macOS for such bytes under a UTF-8 locale; the C locale hides it.
  const result = runRaw(Buffer.from([0xff, 0xfe, 0x80, 0x22, 0x5c, 0x0a]), { LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("the hook writes nothing and exits 0 for garbage, empty or promptless stdin", () => {
  const dir = repoWith([
    [["Ada", "ada@example.com"], "a.js"],
    [["Ada", "ada@laptop.example"], "b.js"],
    [["Bob", "bob@example.com"], "c.js"],
  ]);
  try {
    // The status calls here take no optional locks, so they do not refresh .git/index and disturb the snapshot.
    const quiet = { GIT_OPTIONAL_LOCKS: "0" };
    const before = snapshot(dir);
    const status = git(dir, ["status", "--porcelain"], quiet);
    assert.match(context(hook(PROMPT, dir)), /Suspected same-person groups/);
    assert.equal(snapshot(dir), before, "a matching run wrote to the repository");
    assert.equal(git(dir, ["status", "--porcelain"], quiet), status);
    for (const input of ["not json \u0000 {{{", "", '{"cwd":"x"}', "\u0001\u0002", Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x22, 0x5c])]) {
      const result = runRaw(input);
      assert.equal(result.status, 0, JSON.stringify(input));
      assert.equal(result.stdout, "", JSON.stringify(input));
    }
  } finally {
    removeRepo(dir);
  }
});

test("fifty suspected groups still fit in 1,200 characters, with five shown and the count given", () => {
  const commits = [];
  for (let i = 0; i < 50; i++) {
    const n = String(i).padStart(2, "0");
    commits.push([[`Member ${n}`, `m${n}a@one.example`], `a${n}.js`]);
    commits.push([[`Member ${n}`, `m${n}b@two.example`], `b${n}.js`]);
  }
  const dir = repoWith(commits);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.ok(withoutBrief(ctx).length <= 1200, `context is ${withoutBrief(ctx).length} characters`);
    assert.match(ctx, /\(50 found, \d+ shown; from names and addresses only\)/);
    const shown = ctx.split("[R1 same name]").length - 1;
    assert.ok(shown >= 4 && shown <= 5, `shown ${shown}`);
    assertClosing(ctx);
  } finally {
    removeRepo(dir);
  }
});

test("hooks.json registers the script on UserPromptSubmit through the plugin root", () => {
  const config = JSON.parse(readFileSync(join(ROOT, "hooks", "hooks.json"), "utf8"));
  const command = config.hooks.UserPromptSubmit[0].hooks[0].command;
  assert.equal(command, '"${CLAUDE_PLUGIN_ROOT}/hooks/surviving-lines-hint.sh"');
  assert.equal(config.hooks.UserPromptSubmit[0].hooks[0].timeout, 30, "the brief may run for 20 seconds, so the hook needs room");
  assert.equal(Object.keys(config.hooks).join(), "UserPromptSubmit,Stop");
  const stop = config.hooks.Stop[0].hooks[0];
  assert.equal(stop.command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/surviving-lines-check.mjs"');
  assert.equal(stop.timeout, 40, "two CLI runs may take 30 seconds, so the hook needs room");
});

test("long names and addresses: the budget keeps six suspected groups under 1,200 characters, with the count given", () => {
  const commits = [];
  for (let i = 0; i < 6; i++) {
    const n = String(i).padStart(2, "0");
    const name = `Engineering Team Member Number ${n} With A Long Name`;
    commits.push([[name, `member${n}.with.a.long.local.part@some-long-company-domain.example`], `a${n}.js`]);
    commits.push([[name, `member${n}.second.long.local.part@another-long-company-domain.example`], `b${n}.js`]);
  }
  const dir = repoWith(commits);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.ok(withoutBrief(ctx).length <= 1200, `context is ${withoutBrief(ctx).length} characters`);
    assert.match(ctx, /\(6 found, [1-5] shown; from names and addresses only\)/);
    assertClosing(ctx);
  } finally {
    removeRepo(dir);
  }
});

test("R2: a non-ASCII name leaves the copy-as-is line out instead of printing a '?' name", () => {
  const dir = repoWith([
    [["jose", "jose@same.example"], "a.js"],
    [["José García", "jose@same.example"], "b.js"],
  ]);
  try {
    const ctx = context(hook(PROMPT, dir));
    assert.ok(!ctx.includes("copy it as is"), ctx);
  } finally {
    removeRepo(dir);
  }
});
