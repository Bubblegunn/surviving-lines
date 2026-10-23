// @ts-check
// Round 13, B4: the UserPromptSubmit hint adds the pre-computed brief (surviving-lines --brief) to its context when node
// and the plugin's own bin file exist. Every case here still has to print one valid JSON line, or nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitAsIdentity, createRepo, git, removeRepo } from "../scripts/fixtures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(ROOT, "hooks", "surviving-lines-hint.sh");
const PROMPT = "who owns the parser module in this repo?";
const LABEL = /Pre-computed ownership brief for this repository at ([0-9a-f]{7}) \(whole repository, computed by SL just now; these numbers are authoritative, do not recount with git blame\): /;

/** @param {string} cwd @param {string} prompt @param {Record<string, string>} [env] */
function hook(cwd, prompt, env = {}) {
  return spawnSync("sh", [HOOK], {
    input: JSON.stringify({ session_id: "t", cwd, hook_event_name: "UserPromptSubmit", prompt }),
    encoding: "utf8",
    cwd: ROOT,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CLAUDE_PLUGIN_ROOT: ROOT, ...env },
  });
}

/** @param {import("node:child_process").SpawnSyncReturns<string>} result @returns {string} */
function context(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.indexOf("\n"), result.stdout.length - 1, `one line: ${result.stdout}`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  return parsed.hookSpecificOutput.additionalContext;
}

/** @param {Array<[[string, string], string, string]>} commits [identity, file, content] */
function repoWith(commits) {
  const dir = createRepo("sl-brief-hook-");
  commits.forEach(([identity, file, content], i) => commitAsIdentity(dir, identity, `2026-01-0${i + 1}T10:00:00Z`, `commit ${i}`, { [file]: content }));
  return dir;
}
const two = () => repoWith([[["Ada Quill", "ada@quill.example"], "a.js", "one\ntwo\nthree\n"], [["Bea Marsh", "bea@marsh.example"], "b.js", "four\nfive\n"]]);

/** A plugin root with a stub bin file. @param {string} script the stub's JavaScript */
function stubRoot(script) {
  const dir = mkdtempSync(join(tmpdir(), "sl-stub-root-"));
  mkdirSync(join(dir, "bin"));
  writeFileSync(join(dir, "bin", "surviving-lines.js"), script);
  return dir;
}

test("an ownership prompt gets the brief after the intro, labelled with the commit, as one valid JSON line", () => {
  const dir = two();
  try {
    const ctx = context(hook(dir, PROMPT));
    const sha7 = git(dir, ["rev-parse", "--short=7", "HEAD"]).trim();
    const m = LABEL.exec(ctx);
    assert.ok(m, ctx);
    assert.equal(m[1], sha7);
    assert.ok(ctx.indexOf("This request is about who wrote or owns code in git") < ctx.search(LABEL), "the brief comes after the intro");
    assert.match(ctx, /owners, top 2 of 2: non-blank lines \(share\) \| counting blank lines \(share\) \| commits \(share\)\n {2}Ada Quill: 3 \(60\.0%\) \| 3 \(60\.0%\) \| 1 \(50\.0%\)\n {2}Bea Marsh: 2 \(40\.0%\)/);
    assert.match(ctx, /quote rule: quote both line counts; identity merges above are proposals; for a named directory or language re-run with -- <dir> or --include/);
    // The steering sentence of the intro.
    assert.match(ctx, /Every count, share, bus factor, activity and ownership claim comes from SL, not git blame or shortlog; a number SL does not print is your own: say so and name the command\. Quote both line counts\. Identity merges are proposals unless asked to apply them\./);
    assert.match(ctx, /No same-person groups were suspected/, "the group text still follows");
  } finally {
    removeRepo(dir);
  }
});

test("a prompt that is not about ownership prints nothing, and the tool is not run", () => {
  const dir = two();
  const root = stubRoot('import { writeFileSync } from "node:fs"; writeFileSync(process.env.STUB_MARK ?? "/dev/null", "ran");');
  try {
    const mark = join(root, "mark");
    const r = hook(dir, "write a haiku about rain", { CLAUDE_PLUGIN_ROOT: root, STUB_MARK: mark });
    assert.deepEqual([r.status, r.stdout, r.stderr], [0, "", ""]);
    assert.throws(() => readFileSync(mark), "the stub must not have run");
  } finally {
    removeRepo(dir);
    rmSync(root, { recursive: true, force: true });
  }
});

test("without the plugin's bin file there is no brief and the text is the hint as before", () => {
  const dir = two();
  const empty = mkdtempSync(join(tmpdir(), "sl-empty-root-"));
  try {
    for (const root of [empty, ""]) {
      const ctx = context(hook(dir, PROMPT, { CLAUDE_PLUGIN_ROOT: root }));
      assert.doesNotMatch(ctx, /Pre-computed/);
      assert.match(ctx, /SL = surviving-lines is the command/);
      assert.ok(ctx.length <= 1200, `${ctx.length} characters`);
      assert.match(ctx, /No same-person groups were suspected from names and addresses; that does not prove there are none\. Run SL --identities to check\.$/);
    }
  } finally {
    removeRepo(dir);
    rmSync(empty, { recursive: true, force: true });
  }
});

test("without node on the PATH there is no brief, and the hint still prints", () => {
  const dir = two();
  const bin = mkdtempSync(join(tmpdir(), "sl-nonode-"));
  try {
    // Every tool the hook uses, linked from where this machine has it, and no node.
    for (const tool of ["git", "tr", "sed", "awk", "cut", "head", "grep", "cat", "printf", "env", "sh"]) {
      const found = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
      if (found.startsWith("/")) symlinkSync(found, join(bin, tool));
    }
    const r = hook(dir, PROMPT, { PATH: bin });
    const ctx = context(r);
    assert.doesNotMatch(ctx, /Pre-computed/);
    assert.match(ctx, /No same-person groups were suspected/);
    // The same run with node on the PATH has the brief, so the link farm is what removed it.
    assert.match(context(hook(dir, PROMPT, { PATH: `${bin}${delimiter}${dirname(process.execPath)}` })), /Pre-computed ownership brief/);
  } finally {
    removeRepo(dir);
    rmSync(bin, { recursive: true, force: true });
  }
});

test("the hook runs the tool in the prompt's directory with the budget and the quiet flag", () => {
  const dir = two();
  const root = stubRoot('console.log("argv " + process.argv.slice(2).join(" "));');
  try {
    const ctx = context(hook(dir, PROMPT, { CLAUDE_PLUGIN_ROOT: root }));
    assert.match(ctx, new RegExp(`: argv --cwd ${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} --brief --quiet --time-budget 20`));
  } finally {
    removeRepo(dir);
    rmSync(root, { recursive: true, force: true });
  }
});

test("when the tool prints nothing, fails, or is cut by its budget, the text is exactly the hint without a brief", () => {
  const dir = two();
  const roots = [stubRoot(""), stubRoot("process.exit(3);"), stubRoot('console.error("boom"); process.exit(1);')];
  const bare = mkdtempSync(join(tmpdir(), "sl-bare-"));
  try {
    for (const root of roots) {
      const ctx = context(hook(dir, PROMPT, { CLAUDE_PLUGIN_ROOT: root }));
      assert.doesNotMatch(ctx, /Pre-computed/);
      assert.ok(!ctx.includes("\n"));
      // Same text as a run with no bin file, apart from the command the agent is told to run.
      const plain = context(hook(dir, PROMPT, { CLAUDE_PLUGIN_ROOT: bare }));
      assert.equal(ctx.replace(/SL = node "[^"]+"/, "SL = surviving-lines"), plain);
    }
  } finally {
    removeRepo(dir);
    for (const root of [...roots, bare]) rmSync(root, { recursive: true, force: true });
  }
});

test("output with quotes, backslashes, control bytes and non-ASCII letters stays one valid JSON line, cut to 3,500 characters", () => {
  const dir = two();
  const root = stubRoot('const bad = "q\\"uote back\\\\slash tab\\there bell\\u0007 caf\\u00e9 \\u00b7 end";\nfor (let i = 0; i < 400; i++) console.log("line " + i + " " + bad);');
  try {
    const raw = hook(dir, PROMPT, { CLAUDE_PLUGIN_ROOT: root });
    const ctx = context(raw);
    const brief = ctx.slice(ctx.search(LABEL) + (LABEL.exec(ctx)?.[0].length ?? 0));
    const text = brief.slice(0, brief.indexOf(" No same-person groups"));
    assert.ok(text.length > 0 && text.length <= 3500 + 5, `brief is ${text.length} characters`);
    assert.match(text, /^line 0 q'uote back'slash tab\?here bell\? caf\?\? \?\? end\nline 1 /, text.slice(0, 120));
    assert.ok(!text.includes('"') && !text.includes("\\"), "no quote or backslash survives");
    // The JSON on the wire carries the line breaks as two characters.
    assert.ok(raw.stdout.includes("\\nline 1 "));
  } finally {
    removeRepo(dir);
    rmSync(root, { recursive: true, force: true });
  }
});

test("outside a git work tree, or above the commit cap, the hook stays silent and does not run the tool", () => {
  const outside = mkdtempSync(join(tmpdir(), "sl-brief-nogit-"));
  const dir = two();
  const root = stubRoot('import { writeFileSync } from "node:fs"; writeFileSync(process.env.STUB_MARK ?? "/dev/null", "ran");');
  try {
    const mark = join(root, "mark");
    const env = { CLAUDE_PLUGIN_ROOT: root, STUB_MARK: mark };
    assert.deepEqual([hook(outside, PROMPT, env).stdout, hook(outside, PROMPT, env).status], ["", 0]);
    assert.equal(hook(dir, PROMPT, { ...env, SURVIVING_LINES_HINT_CAP: "1" }).stdout, "");
    assert.throws(() => readFileSync(mark), "the stub must not have run");
  } finally {
    rmSync(outside, { recursive: true, force: true });
    removeRepo(dir);
    rmSync(root, { recursive: true, force: true });
  }
});

test("the brief goes in the context after the 1,200-character budget: groups still fit on their own", () => {
  const commits = /** @type {Array<[[string, string], string, string]>} */ ([]);
  for (let i = 0; i < 4; i++) {
    commits.push([["Dana Reyes", `dana${i}@one.example`], `a${i}.js`, "x\n"]);
  }
  const dir = repoWith(commits.slice(0, 2));
  try {
    const ctx = context(hook(dir, PROMPT));
    const without = ctx.replace(/ Pre-computed ownership brief[\s\S]*? or --include(?= (Suspected|No same-person))/, "");
    assert.ok(without.length <= 1200, `${without.length} characters`);
    assert.ok(ctx.length > without.length);
    assert.match(ctx, /\[R1 same name\] Dana Reyes/);
  } finally {
    removeRepo(dir);
  }
});
