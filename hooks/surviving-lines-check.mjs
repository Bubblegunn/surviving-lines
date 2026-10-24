#!/usr/bin/env node
// surviving-lines Stop hook. When the agent is about to finish an answer to an ownership question, this checks the
// numbers and names in the answer against the output of the plugin's own CLI for the same repository, and checks
// that identity merges are hedged. When it finds something it blocks the stop once and sends the findings back.
// Read-only (git and the CLI only), no network, no writes, no model call. Exit 0 always; silent on any error,
// timeout or unreadable input. stop_hook_active true means the agent is already repairing: always allow.
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The ownership topic phrases. They are the same ERE patterns as the `-e '...'` lines of
 * hooks/surviving-lines-hint.sh; test/stop-hook.test.mjs parses that file and asserts the two lists are equal.
 */
export const TOPIC_PATTERNS = [
  "more than one (name|e-?mail|address)",
  "(two|three|several|multiple|different) (names|e-?mails?|e-?mail addresses|identities|addresses)",
  "same person",
  "duplicate (author|contributor|name|e-?mail|identit)",
  "mailmap",
  "counted (twice|once)",
  "count each person once",
  "show(s)? up (in|under)",
  "who (owns|wrote|maintains|knows)",
  "whose code",
  "code ownership|codeowners",
  "bus factor",
  "who should review",
  "surviving lines",
  "git blame",
  "top (author|contributor)s?",
  "history of (this|the|a) (file|directory|folder|path)",
  "who shaped",
  "multiple (git )?identities",
  "main author",
  "top committers?",
  "ownership by",
  "who (touched|changed)",
  "who is responsible for",
  "who actually (wrote|built|owns|maintains|knows)",
  "which (people|persons|authors|developers|engineers|contributors) (wrote|own|maintain|know|are|is|still|should)",
  "still (alive )?in (this|the) (repo|repository|code|codebase)",
  "losing (one|two|a few|a couple of)( or (one|two|three|a few))? (people|persons|developers|engineers|contributors)",
  "(^|[^a-z])owner(s|ship)?([^a-z]|$)",
  "(^|[^a-z])reviewers?([^a-z]|$)",
  "who (should|can|do|would) (i|we) (ask|talk|contact|go|turn)",
  "one[- ]person (project|library|package)",
  "(inherited|took over|taking over|taken over|became (the )?maintainer)",
  "who is (really )?behind",
  "how much of (the|that|this) (code|library|package|crate|repo)",
  "really (theirs|his|hers|written by)",
  "who (really )?(wrote|built)",
  "authorship",
  "truck factor",
  "(look|looks|seem|seems) like the (author|owner|maintainer)",
  "concentrated (in|among|with|on)",
];
const TOPIC_REGEXES = TOPIC_PATTERNS.map((p) => new RegExp(p));

/** @param {string} prompt @returns {boolean} */
export function matchesTopic(prompt) {
  const lc = String(prompt).toLowerCase().slice(0, 4000);
  return TOPIC_REGEXES.some((r) => r.test(lc));
}

const MERGE_WORDS = /\b(merged?|merging|counted (once|as one)|count(ed)? (them |it )?once|same person|one person|combined|as one (person|author|contributor)|treated as one|deduplicated|de-duplicated|consolidated)\b/i;
const MERGE_NEGATED = /\b(unmerged|not (been )?(merged|combined|counted once|treated as one)|(isn't|aren't|wasn't|weren't) (merged|combined)|no merge|without merging|before merging|not the same person|different people)\b/i;
const HEDGE_WORDS = /(propos|suggest|possible|possibly|likely|probably|appears|may be|might|unconfirmed|if you confirm|not confirmed|assum|guess|weak|strong evidence)/i;
const APPROX = /(?:about|around|roughly|approximately|approx\.?|nearly|almost|~|≈)\s*$/i;

const MAX_FINDINGS = 6;
const CLI_BUDGET_MS = 25000;
const TOTAL_BUDGET_MS = 30000;

/** @param {string} s */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Number claims with a unit. Percent claims may be any size; counts must be at least 10. Ranges, numbers after
 * "about" and the like, git ids, dates and versions are skipped.
 * @param {string} text
 * @returns {{ raw: string, value: number, unit: "%" | "lines" | "commits" | "files" | "authors", line: string, index: number }[]}
 */
export function extractClaims(text) {
  const claims = [];
  const lines = String(text).split("\n");
  let offset = 0;
  for (const line of lines) {
    // Blank out what looks like a number but is not a claim, keeping the length so positions stay valid.
    const blank = (/** @type {RegExp} */ re) => (line2 = line2.replace(re, (m) => " ".repeat(m.length)));
    let line2 = line;
    blank(/\b\d{4}-\d{2}-\d{2}\b/g);
    blank(/\bv?\d+\.\d+\.\d+(?:[-+][\w.]+)?\b/g);
    blank(/\b(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/g);
    const re = /(?<![\w.#/\-–$])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(%|percent\b|(?:(?:non-blank|blank|surviving|live)\s+)*(lines?|commits?|files?|authors?)\b)/gi;
    let m;
    while ((m = re.exec(line2)) !== null) {
      const before = line2.slice(0, m.index);
      if (APPROX.test(before) || /\d\s*(?:to|and|or)\s+$/i.test(before)) continue;
      // A range such as "780 to 840 lines" or "780-840 lines": the first number is not a claim either.
      if (/^\s*(?:-|–|to\b)\s*\d/.test(line2.slice(m.index + m[0].length - m[3].length))) continue;
      const value = Number((m[1] + (m[2] ?? "")).replace(/,/g, ""));
      let unit;
      const u = m[3].toLowerCase();
      if (u === "%" || u === "percent") unit = "%";
      else if (u.endsWith("lines") || u.endsWith("line")) unit = "lines";
      else if (u.startsWith("commit")) unit = "commits";
      else if (u.startsWith("file")) unit = "files";
      else unit = "authors";
      if (unit !== "%" && (value < 10 || m[2])) continue;
      claims.push({ raw: m[0].trim(), value, unit, line, index: offset + m.index });
    }
    offset += line.length + 1;
  }
  return claims;
}

/**
 * A bucket of the numbers one part of the tool output holds.
 * @typedef {{ counts: Set<number>, pcts: number[] }} Bucket
 * @returns {Bucket}
 */
const newBucket = () => ({ counts: new Set(), pcts: [] });

/** @param {Bucket} b @param {number} x a share as a fraction */
function addShare(b, x) {
  const p = x * 100;
  b.pcts.push(p, Math.round(p * 10) / 10, Math.round(p));
}

/**
 * Add every number below node to the bucket. Keys with "share" or "covered" hold fractions; keys with "percent"
 * hold percentages already; every other number is a count.
 * @param {unknown} node @param {Bucket} b @param {string} [key]
 */
function walk(node, b, key = "") {
  if (typeof node === "number" && Number.isFinite(node)) {
    if (/share|covered/i.test(key)) addShare(b, node);
    else if (/percent/i.test(key)) b.pcts.push(node);
    else if (/^(schemaVersion|every|activeDays)$/.test(key)) return;
    else {
      b.counts.add(node);
      b.counts.add(Math.round(node));
    }
  } else if (Array.isArray(node)) {
    for (const v of node) walk(v, b, key);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) walk(v, b, k);
  }
}

/**
 * The reference numbers of one or more CLI JSON reports.
 * global: numbers not tied to one person. own: lower-case person name to that person's numbers.
 * @param {any[]} reports
 * @returns {{ global: Bucket, own: Map<string, Bucket>, names: Map<string, string> }}
 */
export function buildReference(reports) {
  const global = newBucket();
  /** @type {Map<string, Bucket>} */
  const own = new Map();
  /** @type {Map<string, string>} lower-case key to display name, for the people named by authors rows */
  const names = new Map();
  const ownOf = (/** @type {string} */ name) => {
    const k = name.toLowerCase();
    if (!own.has(k)) own.set(k, newBucket());
    return /** @type {Bucket} */ (own.get(k));
  };
  for (const r of reports) {
    if (!r || typeof r !== "object") continue;
    for (const row of r.authors ?? []) {
      if (typeof row?.author !== "string") continue;
      names.set(row.author.toLowerCase(), row.author);
      walk(row, ownOf(row.author));
    }
    for (const p of r.identityHints?.people ?? []) {
      if (typeof p?.name === "string") walk(p, ownOf(p.name));
    }
    for (const s of r.possibleSamePerson?.suggestions ?? []) {
      if (typeof s?.name === "string") walk(s, ownOf(s.name));
      for (const a of s?.addresses ?? []) if (typeof a?.name === "string") walk(a, ownOf(a.name));
    }
    const rest = { ...r, authors: undefined, identityHints: undefined, possibleSamePerson: undefined, lastCommits: undefined };
    walk(rest, global);
  }
  global.pcts.push(50, 80, 100);
  return { global, own, names };
}

/** @param {number} v @param {Bucket[]} buckets */
const hasCount = (v, buckets) => buckets.some((b) => b.counts.has(v));
/** @param {number} v @param {Bucket[]} buckets */
const hasPct = (v, buckets) => buckets.some((b) => b.pcts.some((p) => Math.abs(p - v) <= 0.1 + 1e-9));
/** @param {{ unit: string, value: number }} c @param {Bucket[]} buckets */
const backed = (c, buckets) => (c.unit === "%" ? hasPct(c.value, buckets) : hasCount(c.value, buckets));

/**
 * Add the numbers of free text (the plain-text brief, tool results, hook context) to the reference. Text is read in
 * segments (a line, cut at ";" and at "), "); a segment that names exactly one known person adds its numbers to that
 * person, every other segment adds them to the global set. Every number counts as a count and as a percentage.
 * @param {{ global: Bucket, own: Map<string, Bucket> }} ref @param {string[]} texts
 */
export function addTexts(ref, texts) {
  const keys = [...ref.own.keys()];
  for (const t of texts) {
    for (const line of String(t).split("\n")) {
      for (const seg of line.split(/;|\),\s/)) {
        const people = namedPeople(seg, keys);
        const b = people.length === 1 ? /** @type {Bucket} */ (ref.own.get(people[0])) : ref.global;
        for (const m of seg.matchAll(/(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?/g)) {
          const v = Number(m[1].replace(/,/g, "") + (m[2] ?? ""));
          b.pcts.push(v);
          if (m[2]) b.pcts.push(Math.round(v));
          else b.counts.add(v);
        }
      }
    }
  }
}

/**
 * The people named in a line of the answer, longest names first so that "Ann" inside "Ann Lee" does not count.
 * @param {string} line @param {string[]} keys lower-case names
 * @returns {string[]}
 */
export function namedPeople(line, keys) {
  /** @type {{ key: string, start: number, end: number }[]} */
  const hits = [];
  for (const key of keys) {
    if (key.length < 2) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(key)}(?![\\p{L}\\p{N}])`, "giu");
    let m;
    while ((m = re.exec(line)) !== null) hits.push({ key, start: m.index, end: m.index + m[0].length });
  }
  const kept = hits.filter((h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && (o.end - o.start > h.end - h.start)));
  return [...new Set(kept.map((h) => h.key))];
}

const fmt = (/** @type {number} */ n) => n.toLocaleString("en-US");

/** The tool's own figures for one person, for a finding. @param {any[]} reports @param {string} key */
function figuresOf(reports, key) {
  for (const r of reports) {
    for (const row of r?.authors ?? []) {
      if (typeof row?.author === "string" && row.author.toLowerCase() === key) {
        const share = typeof row.lineShare === "number" ? ` (${(row.lineShare * 100).toFixed(1)}%)` : "";
        return `${row.author}: ${fmt(row.lines)} non-blank lines${share}, ${fmt(row.commits)} commits`;
      }
    }
  }
  return "";
}

/** Lines that state a derived figure (a sum, an estimate) are not judged. */
const DERIVED = /\b(total|totals|together|combined|sum|about|roughly|approximately|approx|altogether)\b|~|≈/i;

/**
 * Number findings. Only a line that names exactly one known person is judged, and only for two things: a number
 * that no figure of the tool matches for that person ("unmatched"), or a number that belongs only to another person
 * ("swap"). A number is accepted when it is in the global set (the report, the brief, tool results and hook context
 * without a single owner) or in any figure of that person. Lines with a derived-figure word are skipped.
 * @param {string} answer
 * @param {any[]} reports parsed CLI JSON reports
 * @param {string[]} texts the plain-text brief, tool results and hook context of this turn
 * @returns {string[]}
 */
export function numberFindings(answer, reports, texts = []) {
  const ref = buildReference(reports);
  addTexts(ref, texts);
  const { global, own, names } = ref;
  const keys = [...own.keys()];
  const out = [];
  const seen = new Set();
  for (const c of extractClaims(answer)) {
    if (DERIVED.test(c.line)) continue;
    const people = namedPeople(c.line, keys);
    if (people.length !== 1) continue;
    if (backed(c, [global, /** @type {Bucket} */ (own.get(people[0]))])) continue;
    const id = `${c.value}${c.unit}${people.join()}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const owners = keys.filter((k) => k !== people[0] && backed(c, [/** @type {Bucket} */ (own.get(k))]));
    const who = names.get(people[0]) ?? people[0];
    if (owners.length > 0) {
      const o = names.get(owners[0]) ?? owners[0];
      const both = [figuresOf(reports, owners[0]), figuresOf(reports, people[0])].filter(Boolean).join("; ");
      out.push(`${c.raw} belong to ${o}, not ${who}${both ? ` (tool: ${both})` : ""}.`);
      continue;
    }
    const known = figuresOf(reports, people[0]);
    out.push(`${c.raw}: no number like this in the tool output for ${who}${known ? ` (${known})` : ""}. If it is your own computation, say so and name the command.`);
  }
  return out;
}

/** @param {string} text @returns {string[]} */
const sentences = (text) => String(text).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/**
 * Merge findings: a sentence says people are merged or counted once, names members of a group the tool reports
 * as suspected, and has no hedge word.
 * @param {string} answer @param {any[]} reports @param {boolean} usedMerge
 * @returns {string[]}
 */
export function mergeFindings(answer, reports, usedMerge) {
  if (usedMerge) return [];
  const report = reports[0];
  if (!report || report.identityMerge?.applied) return [];
  /** @type {{ name: string, members: string[], names: string[], addresses: string[] }[]} */
  const groups = [];
  for (const p of report.identityHints?.people ?? []) {
    groups.push({ name: p.name, names: [p.name], addresses: p.addresses ?? [], members: [] });
  }
  for (const s of report.possibleSamePerson?.suggestions ?? []) {
    const nm = [...new Set([s.name, ...(s.addresses ?? []).map((a) => a.name)].filter(Boolean))];
    groups.push({ name: s.name, names: nm, addresses: (s.addresses ?? []).map((a) => a.mail).filter(Boolean), members: [] });
  }
  const out = [];
  for (const sentence of sentences(answer)) {
    if (!MERGE_WORDS.test(sentence) || MERGE_NEGATED.test(sentence) || HEDGE_WORDS.test(sentence)) continue;
    for (const g of groups) {
      const lower = sentence.toLowerCase();
      const hitNames = g.names.filter((n) => namedPeople(sentence, [n.toLowerCase()]).length > 0);
      const hitAddr = g.addresses.filter((a) => lower.includes(a.toLowerCase()));
      const distinct = hitNames.length + hitAddr.length;
      if (distinct >= 2 || (g.names.length === 1 && hitNames.length === 1)) {
        const rows = (report.authors ?? []).filter((r) => g.names.some((n) => n.toLowerCase() === String(r.author).toLowerCase()) || g.addresses.includes(r.mail));
        const unmerged = rows.map((r) => `${r.mail ?? r.author} ${fmt(r.lines)} lines`).join(", ");
        out.push(`"${sentence.slice(0, 120)}": ${g.name} is merged without a hedge. State that the merge is a proposal from names and addresses, unconfirmed, and give the unmerged figures too${unmerged ? ` (tool: ${unmerged})` : ""}.`);
        break;
      }
    }
  }
  return out;
}

/**
 * The parts of a transcript the check needs.
 * @param {string} jsonl
 * @returns {{ prompt: string, outputs: string[], context: string[], usedMerge: boolean }}
 */
export function readTranscript(jsonl) {
  /** @type {any[]} */
  const entries = [];
  for (const l of jsonl.split("\n")) {
    if (!l.trim()) continue;
    try {
      entries.push(JSON.parse(l));
    } catch {
      /* skip a damaged line */
    }
  }
  const plain = (/** @type {any} */ e) => {
    if (e?.type !== "user" || e.isMeta || e.isSidechain) return "";
    const c = e.message?.content;
    let t = "";
    if (typeof c === "string") t = c;
    else if (Array.isArray(c)) {
      if (c.some((b) => b?.type === "tool_result")) return "";
      t = c.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
    }
    t = t.trim();
    return /^<(system-reminder|local-command|command-)/.test(t) ? "" : t;
  };
  let last = -1;
  entries.forEach((e, i) => {
    if (plain(e)) last = i;
  });
  const prompt = last >= 0 ? plain(entries[last]) : "";
  const outputs = [];
  let usedMerge = false;
  for (const e of entries.slice(last + 1)) {
    const c = e?.message?.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (b?.type === "tool_use" && typeof b.input?.command === "string" && /surviving-lines/.test(b.input.command) && /--merge-identities/.test(b.input.command)) {
        usedMerge = true;
      } else if (b?.type === "tool_result") {
        outputs.push(typeof b.content === "string" ? b.content : Array.isArray(b.content) ? b.content.map((x) => (typeof x?.text === "string" ? x.text : "")).join("\n") : "");
      }
    }
  }
  // Text a hook injected (additionalContext): attachment entries, meta user entries and system reminders, anywhere.
  const context = [];
  for (const e of entries) {
    const c = e?.message?.content;
    const reminder = Array.isArray(c) ? c.some((b) => b?.type === "text" && /^\s*<system-reminder>/.test(String(b.text))) : typeof c === "string" && /^\s*<system-reminder>/.test(c);
    if (e?.type === "attachment" || e?.isMeta === true || reminder) context.push(...allStrings(e));
  }
  return { prompt, outputs, context, usedMerge };
}

/** Every string below a value. @param {unknown} v @returns {string[]} */
function allStrings(v) {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(allStrings);
  if (v && typeof v === "object") return Object.values(v).flatMap(allStrings);
  return [];
}

/** @param {string[]} findings @returns {string} */
export function blockReason(findings) {
  return `Check your answer against surviving-lines before you finish:\n${findings.slice(0, MAX_FINDINGS).map((f) => `- ${f}`).join("\n")}\nFix what is wrong. If a number is your own computation, say that and which command produced it. Reply with your COMPLETE corrected final answer (the whole answer again, every part, not only the corrections). Do not mention this check.`;
}

/** @param {string} cwd @param {string[]} args @param {number} timeout */
function run(cmd, args, cwd, timeout) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", timeout, maxBuffer: 128 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
}

/** The CLI report as an object, or null on any failure. */
function cliReport(root, cwd, extra, timeout) {
  const r = run(process.execPath, [join(root, "bin", "surviving-lines.js"), "--json", "-q", ...extra], cwd, timeout);
  if (r.status !== 0 || r.error || !r.stdout) return null;
  try {
    const j = JSON.parse(r.stdout);
    return j && j.schemaVersion === 1 && Array.isArray(j.authors) ? j : null;
  } catch {
    return null;
  }
}

/** @param {string} stdin @param {Record<string, string | undefined>} env @param {string} root @returns {string} the stdout to print, or "" */
export function check(stdin, env, root) {
  const started = Date.now();
  const input = JSON.parse(stdin);
  if (!input || typeof input !== "object" || input.stop_hook_active === true) return "";
  const answer = input.last_assistant_message;
  const cwd = input.cwd;
  if (typeof answer !== "string" || !answer.trim() || typeof cwd !== "string" || typeof input.transcript_path !== "string") return "";
  const transcript = readTranscript(readFileSync(input.transcript_path, "utf8"));
  if (!matchesTopic(transcript.prompt)) return "";
  if (run("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], cwd, 5000).stdout?.trim() !== "true") return "";
  const n = Number(run("git", ["-C", cwd, "rev-list", "--count", "--max-count=20001", "HEAD"], cwd, 10000).stdout?.trim());
  const capRaw = env.SURVIVING_LINES_HINT_CAP;
  const cap = capRaw && /^\d+$/.test(capRaw) ? Number(capRaw) : 20000;
  if (!Number.isInteger(n) || n > cap) return "";
  const report = cliReport(root, cwd, [], CLI_BUDGET_MS);
  if (!report) return "";
  const reports = [report];
  if (MERGE_WORDS.test(answer)) {
    const left = TOTAL_BUDGET_MS - (Date.now() - started);
    if (left > 3000) {
      const merged = cliReport(root, cwd, ["--merge-identities"], Math.min(CLI_BUDGET_MS, left));
      if (merged) reports.push(merged);
    }
  }
  /** @type {string[]} */
  const texts = [...transcript.outputs, ...transcript.context];
  const left0 = TOTAL_BUDGET_MS - (Date.now() - started);
  if (left0 > 3000) {
    const br = run(process.execPath, [join(root, "bin", "surviving-lines.js"), "--brief"], cwd, Math.min(CLI_BUDGET_MS, left0));
    if (br.status === 0 && !br.error && br.stdout) texts.push(br.stdout);
  }
  const findings = [...numberFindings(answer, reports, texts), ...mergeFindings(answer, reports, transcript.usedMerge)];
  if (findings.length === 0) return "";
  return JSON.stringify({ decision: "block", reason: blockReason(findings) }) + "\n";
}

function main() {
  try {
    const root = process.env.CLAUDE_PLUGIN_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
    const out = check(readFileSync(0, "utf8"), process.env, root);
    if (out) process.stdout.write(out);
  } catch {
    /* silent on any error */
  }
  process.exit(0);
}

let isMain = false;
try {
  isMain = realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  /* not run as a script */
}
if (isMain) main();
