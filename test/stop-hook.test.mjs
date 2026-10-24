// @ts-check
// The Stop hook (hooks/surviving-lines-check.mjs): after an ownership answer it checks the numbers, the names and the
// identity merges against the plugin's own CLI and blocks the stop once with specific findings. Integration tests
// run the script with a fabricated transcript and stdin payload on a tiny invented repository.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commitAsIdentity, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOK = join(ROOT, "hooks", "surviving-lines-check.mjs");
const { TOPIC_PATTERNS, matchesTopic, extractClaims, namedPeople, readTranscript, numberFindings, mergeFindings, blockReason } = await import(HOOK);

const D = (d) => `2026-10-${d}T10:00:00Z`;
const PROMPT = "who owns the parser module in this repo?";

/** Ann 40 lines (one address); Bob Ray 31 + 16 lines on two addresses (a strong same-name hint). 87 lines in total. */
function fixture() {
  const dir = createRepo("sl-stop-");
  commitAsIdentity(dir, ["Ann Lee", "ann@x.example"], D("01"), "a", { "a.txt": lines("alpha", 40) });
  commitAsIdentity(dir, ["Bob Ray", "bob@y.example"], D("02"), "b", { "b.txt": lines("beta", 31) });
  commitAsIdentity(dir, ["Bob Ray", "bob.ray@z.example"], D("03"), "c", { "c.txt": lines("gamma", 16) });
  return dir;
}

/** @param {string} dir @param {unknown[]} entries */
function writeTranscript(dir, entries) {
  const p = join(dir, "..", `tr-${Math.random().toString(36).slice(2)}.jsonl`);
  writeFileSync(p, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return p;
}
const userEntry = (text) => ({ type: "user", message: { role: "user", content: text } });

/**
 * @param {{ cwd: string, answer: string, prompt?: string, active?: boolean, extra?: unknown[], env?: Record<string, string> }} o
 */
function run(o) {
  const transcript = writeTranscript(o.cwd, [userEntry(o.prompt ?? PROMPT), ...(o.extra ?? [])]);
  const payload = { session_id: "t", transcript_path: transcript, cwd: o.cwd, hook_event_name: "Stop", stop_hook_active: o.active ?? false, last_assistant_message: o.answer };
  return runRaw(JSON.stringify(payload), o.env);
}
/** @param {string} input @param {Record<string, string>} [env] */
function runRaw(input, env = {}) {
  return spawnSync(process.execPath, [HOOK], { input, encoding: "utf8", cwd: tmpdir(), env: { PATH: process.env.PATH, HOME: process.env.HOME, CLAUDE_PLUGIN_ROOT: ROOT, ...env } });
}
/** @param {import("node:child_process").SpawnSyncReturns<string>} r */
function silent(r) {
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
}
/** @param {import("node:child_process").SpawnSyncReturns<string>} r @returns {string} the reason */
function blocked(r) {
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.indexOf("\n"), r.stdout.length - 1, "one line");
  const j = JSON.parse(r.stdout);
  assert.equal(j.decision, "block");
  assert.match(j.reason, /^Check your answer against surviving-lines before you finish:\n/);
  assert.match(j.reason, /Fix what is wrong\. If a number is your own computation, say that and which command produced it\. Reply with your COMPLETE corrected final answer \(the whole answer again, every part, not only the corrections\)\. Do not mention this check\.$/);
  return j.reason;
}

test("topic list equals the -e patterns of the hint hook, so the two cannot drift", () => {
  const sh = readFileSync(join(ROOT, "hooks", "surviving-lines-hint.sh"), "utf8");
  const shell = [...sh.matchAll(/^\s*-e '(.*)'(?: \\| \|\| exit 0)?\s*$/gm)].map((m) => m[1]);
  assert.ok(shell.length >= 20);
  assert.deepEqual(TOPIC_PATTERNS, shell);
});

test("matchesTopic reads ownership prompts and ignores others", () => {
  assert.ok(matchesTopic("Who OWNS the parser?"));
  assert.ok(matchesTopic("what is the bus factor"));
  assert.ok(!matchesTopic("rename the variable foo to bar"));
});

test("extractClaims: units, thousands commas, percent of any size, the 10 rule", () => {
  const c = extractClaims("Ann holds 1,234 lines (46.5%), 12 commits, 7 files, 5%.");
  assert.deepEqual(c.map((x) => [x.value, x.unit]), [[1234, "lines"], [46.5, "%"], [12, "commits"], [5, "%"]]);
});

test("extractClaims skips ranges, approximations, dates, versions and git ids", () => {
  const text = "780-840 lines, about 900 lines, ~500 lines, 2026-10-24 files, v1.2.3 files, abc1234def commits, 1234567 lines";
  assert.deepEqual(extractClaims(text).map((x) => x.raw), ["1234567 lines"]);
  assert.deepEqual(extractClaims("780 to 840 lines"), []);
});

test("namedPeople: whole names only, the longest name wins, case-insensitive", () => {
  assert.deepEqual(namedPeople("ANN LEE holds it", ["ann lee", "ann"]), ["ann lee"]);
  assert.deepEqual(namedPeople("Annabel holds it", ["ann"]), []);
});

test("readTranscript: last plain user prompt, all tool results, --merge-identities flag", () => {
  const t = [
    userEntry("old question"),
    userEntry([{ type: "text", text: PROMPT }]),
    { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "1", name: "Bash", input: { command: "node bin/surviving-lines.js --merge-identities" } }, { type: "tool_use", id: "2", name: "Bash", input: { command: "ls" } }] } },
    { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "1", content: "Ann 123 lines" }, { type: "tool_result", tool_use_id: "2", content: [{ type: "text", text: "999" }] }] } },
  ].map((e) => JSON.stringify(e)).join("\n");
  const r = readTranscript(t + "\nnot json");
  assert.equal(r.prompt, PROMPT);
  // Every tool result of the turn counts, not only those of commands naming the tool.
  assert.deepEqual(r.outputs, ["Ann 123 lines", "999"]);
  assert.equal(r.usedMerge, true);
});

test("a correct answer, with the totals and shares as printed, gets no output", () => {
  const dir = fixture();
  try {
    silent(run({ cwd: dir, answer: "Ann Lee holds 40 lines (46.0%) of the 87 non-blank lines; Bob Ray's two addresses hold 31 lines and 16 lines, 47 lines in all if they are one person (a guess). Bus factor 2." }));
    silent(run({ cwd: dir, answer: "Ann Lee | 40 lines | 46% | 1 commits" }));
  } finally {
    removeRepo(dir);
  }
});

test("a wrong number is blocked once, and the finding carries the tool's value", () => {
  const dir = fixture();
  try {
    const reason = blocked(run({ cwd: dir, answer: "Ann Lee holds 55 lines of the code." }));
    assert.match(reason, /55 lines: no number like this/);
    assert.match(reason, /Ann Lee: 40 non-blank lines \(46\.0%\)/);
    const pct = blocked(run({ cwd: dir, answer: "Ann Lee owns 52% of it." }));
    assert.match(pct, /52%/);
  } finally {
    removeRepo(dir);
  }
});

test("percent tolerance is 0.1 point: 46.1% passes, 46.3% is blocked", () => {
  const dir = fixture();
  try {
    silent(run({ cwd: dir, answer: "Ann Lee holds 46.1% of the code." }));
    blocked(run({ cwd: dir, answer: "Ann Lee holds 46.3% of the code." }));
  } finally {
    removeRepo(dir);
  }
});

test("numbers below 10 and ranges are not claims; the 10 rule does not apply to percent", () => {
  const dir = fixture();
  try {
    silent(run({ cwd: dir, answer: "Ann Lee touched 7 files and about 900 lines, between 780-840 lines." }));
    blocked(run({ cwd: dir, answer: "Ann Lee holds 73% of the code." }));
  } finally {
    removeRepo(dir);
  }
});

test("a swapped author and number is a mismatch finding that names both people", () => {
  const dir = fixture();
  try {
    const reason = blocked(run({ cwd: dir, answer: "Ann Lee holds 31 lines." }));
    assert.match(reason, /31 lines belong to Bob Ray, not Ann Lee/);
    // The same number on a line that names two people is not judged.
    silent(run({ cwd: dir, answer: "Ann Lee and Bob Ray: 31 lines." }));
    // The same number on a line that names nobody is a total or a scope the reader can check.
    silent(run({ cwd: dir, answer: "One person holds 31 lines." }));
  } finally {
    removeRepo(dir);
  }
});

test("numbers the tool printed in this turn (other options, other scope) are accepted", () => {
  const dir = fixture();
  try {
    const answer = "Ann Lee holds 123 lines under src.";
    blocked(run({ cwd: dir, answer }));
    const extra = [
      { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "9", name: "Bash", input: { command: "node bin/surviving-lines.js -- src" } }] } },
      { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "9", content: "Ann Lee  123  100.0%" }] } },
    ];
    silent(run({ cwd: dir, answer, extra }));
    // A result of any other command counts too (round 13 gate: the agent often reads the numbers from other tools).
    const other = JSON.parse(JSON.stringify(extra).replace("surviving-lines", "something-else"));
    silent(run({ cwd: dir, answer, extra: other }));
  } finally {
    removeRepo(dir);
  }
});

test("an unhedged merge is blocked and gives the unmerged figures; a hedged one is not", () => {
  const dir = fixture();
  try {
    const reason = blocked(run({ cwd: dir, answer: "Bob Ray and bob@y.example are the same person, so they are counted once." }));
    assert.match(reason, /Bob Ray is merged without a hedge/);
    assert.match(reason, /proposal/);
    assert.match(reason, /bob@y\.example 31 lines, bob\.ray@z\.example 16 lines/);
    silent(run({ cwd: dir, answer: "Bob Ray and bob@y.example are probably the same person." }));
    silent(run({ cwd: dir, answer: "Bob Ray and bob@y.example were not merged, they are listed apart." }));
    // The run used --merge-identities, so the merge is the tool's own figure.
    const used = [{ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "5", name: "Bash", input: { command: "surviving-lines --merge-identities" } }] } }];
    silent(run({ cwd: dir, answer: "Bob Ray and bob@y.example are the same person, so they are counted once.", extra: used }));
  } finally {
    removeRepo(dir);
  }
});

test("hedge words: each one of the list turns a merge sentence into an allowed one", () => {
  const dir = fixture();
  const report = JSON.parse(spawnSync(process.execPath, [join(ROOT, "bin", "surviving-lines.js"), "--json", "-q"], { cwd: dir, encoding: "utf8" }).stdout);
  removeRepo(dir);
  for (const h of ["proposal", "suggested", "possible", "possibly", "likely", "probably", "appears", "may be", "might", "unconfirmed", "if you confirm", "not confirmed", "assumed", "a guess", "weak", "strong evidence"]) {
    assert.deepEqual(mergeFindings(`Bob Ray and bob@y.example are the same person (${h}).`, [report], false), [], h);
  }
  assert.equal(mergeFindings("Bob Ray and bob@y.example are the same person.", [report], false).length, 1);
});

test("stop_hook_active true: always silent, even for a wrong answer (never blocks twice)", () => {
  const dir = fixture();
  try {
    blocked(run({ cwd: dir, answer: "Ann Lee holds 55 lines." }));
    silent(run({ cwd: dir, answer: "Ann Lee holds 55 lines.", active: true }));
  } finally {
    removeRepo(dir);
  }
});

test("gate: a prompt that is not about ownership is silent", () => {
  const dir = fixture();
  try {
    silent(run({ cwd: dir, answer: "Ann Lee holds 55 lines.", prompt: "rename the variable foo to bar" }));
  } finally {
    removeRepo(dir);
  }
});

test("gate: no git work tree is silent; a history over the cap is silent", () => {
  const plain = mkdtempSync(join(realpathSync(tmpdir()), "sl-stop-plain-"));
  const dir = fixture();
  try {
    silent(run({ cwd: plain, answer: "Ann Lee holds 55 lines." }));
    silent(run({ cwd: dir, answer: "Ann Lee holds 55 lines.", env: { SURVIVING_LINES_HINT_CAP: "2" } }));
    blocked(run({ cwd: dir, answer: "Ann Lee holds 55 lines.", env: { SURVIVING_LINES_HINT_CAP: "3" } }));
  } finally {
    removeRepo(dir);
    removeRepo(plain);
  }
});

test("garbage stdin, a missing transcript, empty input: silent with exit 0", () => {
  silent(runRaw("not json at all {{{"));
  silent(runRaw(""));
  silent(runRaw(JSON.stringify({ cwd: "/", transcript_path: "/nonexistent/x.jsonl", last_assistant_message: "55 lines", stop_hook_active: false })));
  silent(runRaw(JSON.stringify([1, 2, 3])));
});

test("a CLI that fails (or prints no report) is silent", () => {
  const dir = fixture();
  const fake = mkdtempSync(join(realpathSync(tmpdir()), "sl-stop-fake-"));
  try {
    mkdirSync(join(fake, "bin"));
    writeFileSync(join(fake, "bin", "surviving-lines.js"), "process.exit(1);\n");
    silent(run({ cwd: dir, answer: "Ann Lee holds 55 lines.", env: { CLAUDE_PLUGIN_ROOT: fake } }));
    writeFileSync(join(fake, "bin", "surviving-lines.js"), "console.log('not json');\n");
    silent(run({ cwd: dir, answer: "Ann Lee holds 55 lines.", env: { CLAUDE_PLUGIN_ROOT: fake } }));
  } finally {
    removeRepo(dir);
    removeRepo(fake);
  }
});

test("at most six findings are sent", () => {
  const dir = fixture();
  try {
    const answer = [11, 12, 13, 14, 15, 16, 17, 18].map((n) => `Ann Lee holds ${n}1 lines`).join("\n");
    const reason = blocked(run({ cwd: dir, answer }));
    assert.equal(reason.split("\n").filter((l) => l.startsWith("- ")).length, 6);
  } finally {
    removeRepo(dir);
  }
});

test("the script does not write, and prints nothing to stderr on a normal run", () => {
  const dir = fixture();
  try {
    const r = run({ cwd: dir, answer: "Ann Lee holds 55 lines." });
    assert.equal(r.stderr, "");
  } finally {
    removeRepo(dir);
  }
});

test("numberFindings is quiet when the answer has no claims", () => {
  assert.deepEqual(numberFindings("Nobody owns it.", [{ authors: [], sample: { linesInRef: 1, linesWithBlank: 1 } }], []), []);
});

test("the block reason ends with the instruction to answer completely and not to mention the check", () => {
  const r = blockReason(["x"]);
  assert.ok(r.endsWith("Reply with your COMPLETE corrected final answer (the whole answer again, every part, not only the corrections). Do not mention this check."));
  assert.ok(!/corrected answer only/.test(r));
});

test("precision: an unattached or multi-author number is silent now, only the three findings block", () => {
  const dir = fixture();
  try {
    // Used to block as "unverified number anywhere": no author on the line.
    silent(run({ cwd: dir, answer: "The directory holds 555 lines and 77 commits." }));
    // A wrong total is not judged any more.
    silent(run({ cwd: dir, answer: "In total there are 999 lines." }));
    // A derived figure with a named author, labelled as a sum, is fine.
    silent(run({ cwd: dir, answer: "Ann Lee and 55 lines together with her tests." }));
    silent(run({ cwd: dir, answer: "Ann Lee holds roughly 55 lines." }));
    silent(run({ cwd: dir, answer: "Ann Lee: 55 lines (sum of two runs)" }));
    // The three that still block: unmatched number for one author, swap, unhedged merge.
    assert.match(blocked(run({ cwd: dir, answer: "Ann Lee holds 55 lines." })), /55 lines: no number like this/);
    assert.match(blocked(run({ cwd: dir, answer: "| Ann Lee | 31 lines |" })), /31 lines belong to Bob Ray, not Ann Lee/);
    assert.match(blocked(run({ cwd: dir, answer: "Bob Ray and bob@y.example are the same person." })), /merged without a hedge/);
  } finally {
    removeRepo(dir);
  }
});

test("any value known for the author is accepted: lines, blank-inclusive lines, commits, share", () => {
  const dir = fixture();
  try {
    silent(run({ cwd: dir, answer: "Ann Lee: 40 lines, 46% of the code, 1 commits" }));
  } finally {
    removeRepo(dir);
  }
});

test("numbers of the --brief output are allowed: a number of the single-owner list for no author, an author number from the brief row", () => {
  const dir = fixture();
  try {
    // 71 and 87 style totals are in the brief; a number only the brief prints for nobody must pass. The history line
    // of the brief prints a percentage of files; the answer quotes it next to a name.
    const brief = spawnSync(process.execPath, [join(ROOT, "bin", "surviving-lines.js"), "--brief"], { cwd: dir, encoding: "utf8" }).stdout;
    assert.ok(/history:/.test(brief) || brief.length > 0);
    const pct = brief.match(/\((\d+)% of the files\)/);
    if (pct) silent(run({ cwd: dir, answer: `Ann Lee started it (${pct[1]}% of the files at the import).` }));
    // Direct unit check: a brief text adds its numbers.
    assert.deepEqual(numberFindings("Ann Lee has 4242 lines.", [{ authors: [{ author: "Ann Lee", lines: 40, commits: 1 }] }], []).length, 1);
    assert.deepEqual(numberFindings("Ann Lee has 4242 lines.", [{ authors: [{ author: "Ann Lee", lines: 40, commits: 1 }] }], ["history: 4242 something"]), []);
    // A brief row for another person stays that person's: still a swap.
    assert.equal(numberFindings("Ann Lee has 31 lines.", [{ authors: [{ author: "Ann Lee", lines: 40, commits: 1 }, { author: "Bob Ray", lines: 31, commits: 1 }] }], ["  Bob Ray: 31 (43.7%)"]).length, 1);
  } finally {
    removeRepo(dir);
  }
});

test("numbers from hook additionalContext and from any tool result are allowed", () => {
  const dir = fixture();
  try {
    const answer = "Ann Lee holds 4242 lines.";
    blocked(run({ cwd: dir, answer }));
    const ctx = [{ type: "attachment", attachment: { type: "hook_additional_context", content: ["surviving-lines brief: scope 4242 lines"] } }];
    silent(run({ cwd: dir, answer, extra: ctx }));
    const meta = [{ type: "user", isMeta: true, message: { role: "user", content: "<system-reminder>total 4242 lines</system-reminder>" } }];
    silent(run({ cwd: dir, answer, extra: meta }));
    const tool = [
      { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "7", name: "Bash", input: { command: "wc -l src/*" } }] } },
      { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "7", content: "4242 total" }] } },
    ];
    silent(run({ cwd: dir, answer, extra: tool }));
  } finally {
    removeRepo(dir);
  }
});

const OWNERSHIP_PROMPTS = [
  "Who should I ask about the sources and who about the tests?",
  "I just inherited this library and want to know who is really behind it. How much of the code that is in the repo today is theirs?",
  "For each top-level directory, who should be the default reviewer?",
  "We depend on this library and I'm worried it is a one-person project. How concentrated is the ownership?",
  "I'm about to change how tables get printed and want a reviewer. Who should I ask, and how much of that code is really theirs?",
  "The log makes X look like the author of everything. Is he who we should ask?",
];
const UNRELATED_PROMPTS = [
  "fix the failing test in parser.py",
  "add a button to the settings page",
  "review this pull request for bugs",
  "explain git rebase",
  "who is the president of france",
  "write a commit message",
  "what does this regex do",
  "rename the variable foo to bar",
  "why is the build slow on CI",
  "convert this function to async",
  "update the README with install steps",
  "what is the difference between a map and a set",
  "how do I undo my last commit",
  "the power went out and the downloaded file is broken",
];
/** One prompt per generic pattern added for ordinary ownership questions; each is matched by that pattern alone. */
const SINGLE_PATTERN_PROMPTS = new Map([
  ["(^|[^a-z])owner(s|ship)?([^a-z]|$)", "the owner of this module"],
  ["(^|[^a-z])reviewers?([^a-z]|$)", "pick a reviewer for this change"],
  ["who (should|can|do|would) (i|we) (ask|talk|contact|go|turn)", "who can we contact about this"],
  ["one[- ]person (project|library|package)", "this is a one person library"],
  ["(inherited|took over|taking over|taken over|became (the )?maintainer)", "she took over last year"],
  ["who is (really )?behind", "who is behind this"],
  ["how much of (the|that|this) (code|library|package|crate|repo)", "how much of this crate is old"],
  ["really (theirs|his|hers|written by)", "is it really hers"],
  ["who (really )?(wrote|built)", "who really built it"],
  ["authorship", "authorship of the parser"],
  ["truck factor", "what is the truck factor"],
  ["(look|looks|seem|seems) like the (author|owner|maintainer)", "he seems like the maintainer"],
]);

test("generic ownership questions match the JS gate and the shell gate", () => {
  for (const p of OWNERSHIP_PROMPTS) {
    assert.ok(matchesTopic(p), `JS: ${p}`);
    const lc = p.toLowerCase();
    const sh = readFileSync(join(ROOT, "hooks", "surviving-lines-hint.sh"), "utf8");
    const pats = [...sh.matchAll(/^\s*-e '(.*)'(?: \\| \|\| exit 0)?\s*$/gm)].map((m) => m[1]);
    const g = spawnSync("grep", ["-Eq", ...pats.flatMap((x) => ["-e", x])], { input: lc });
    assert.equal(g.status, 0, `shell: ${p}`);
  }
});

test("unrelated prompts match neither gate", () => {
  const sh = readFileSync(join(ROOT, "hooks", "surviving-lines-hint.sh"), "utf8");
  const pats = [...sh.matchAll(/^\s*-e '(.*)'(?: \\| \|\| exit 0)?\s*$/gm)].map((m) => m[1]);
  assert.ok(UNRELATED_PROMPTS.length >= 12);
  for (const p of UNRELATED_PROMPTS) {
    assert.ok(!matchesTopic(p), `JS: ${p}`);
    const g = spawnSync("grep", ["-Eq", ...pats.flatMap((x) => ["-e", x])], { input: p.toLowerCase() });
    assert.equal(g.status, 1, `shell: ${p}`);
  }
});

test("each generic pattern is needed: its prompt matches it and no other pattern", () => {
  for (const [pat, prompt] of SINGLE_PATTERN_PROMPTS) {
    assert.ok(TOPIC_PATTERNS.includes(pat), pat);
    const others = TOPIC_PATTERNS.filter((x) => x !== pat).map((x) => new RegExp(x));
    assert.ok(new RegExp(pat).test(prompt), `own: ${prompt}`);
    assert.ok(!others.some((r) => r.test(prompt)), `only this pattern should match: ${prompt}`);
  }
});
