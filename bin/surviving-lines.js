#!/usr/bin/env node
// @ts-check
/**
 * surviving-lines
 *
 * Two questions, answered side by side for one git ref:
 *
 *   1. Whose lines are still alive?   git blame over a deterministic sample of files
 *   2. Who committed, in a window?     git log, merges excluded
 *
 * Commit counts measure activity. Blame measures what survived every later
 * refactor. The gap between the two is usually the interesting number.
 */

import { execFile, spawn } from "node:child_process";
import { realpathSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const HELP = `usage: surviving-lines [options] [-- <path>...]

Measure who wrote the code that is still alive in a git ref.

  --ref <rev>          revision to analyse (default: HEAD)
  --sample <n>         deterministic 1-in-n file sample, n >= 1 (default: 1, every file)
  --seed <text>        salt for the sample hash; change it to draw a different sample
  --include <glob>     only files matching the glob (repeatable; ** and * supported)
  --exclude <glob>     skip files matching the glob (repeatable)
  --since <date>       commit-share window start (passed to git log)
  --until <date>       commit-share window end
  --copies             pass -C to git blame as well as -w -M (slower, follows copies)
  --jobs <n>           parallel blame processes (default: 4)
  --top <k>            rows to print (default: 10)
  --json               print JSON instead of a table
  --csv                print CSV (author,mail,lines,line_share,commits,commit_share)
  --markdown           print a Markdown table
  --identities         list addresses that look like one person, with .mailmap lines
  --cwd <dir>          repository directory (default: current directory)
  -h, --help           this text
  --version            print the version

Paths after -- are passed to git as pathspecs. Identities follow the repository's .mailmap;
add one to merge an author's several addresses. Map by address where you can: git compares
.mailmap names ignoring case for ASCII letters only, so a name mapped by name alone has to
match the commit's spelling of its accents and non-Latin letters exactly.`;

/** @typedef {{ ref: string, sample: number, seed: string, include: string[], exclude: string[], since?: string, until?: string, copies: boolean, jobs: number, top: number, json: boolean, csv: boolean, markdown: boolean, identities: boolean, cwd: string, paths: string[] }} Options */

/**
 * @param {string[]} argv
 * @returns {Options}
 */
export function parseArgs(argv) {
  /** @type {Options} */
  const o = { ref: "HEAD", sample: 1, seed: "", include: [], exclude: [], copies: false, jobs: 4, top: 10, json: false, csv: false, markdown: false, identities: false, cwd: process.cwd(), paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--") { o.paths = argv.slice(i + 1); break; }
    else if (a === "--ref") o.ref = next();
    else if (a === "--sample") { o.sample = Number(next()); if (!Number.isInteger(o.sample) || o.sample < 1) throw new Error("--sample must be an integer >= 1"); }
    else if (a === "--seed") o.seed = next();
    else if (a === "--include") o.include.push(next());
    else if (a === "--exclude") o.exclude.push(next());
    else if (a === "--since") o.since = next();
    else if (a === "--until") o.until = next();
    else if (a === "--copies") o.copies = true;
    else if (a === "--jobs") { o.jobs = Number(next()); if (!Number.isInteger(o.jobs) || o.jobs < 1) throw new Error("--jobs must be an integer >= 1"); }
    else if (a === "--top") { o.top = Number(next()); if (!Number.isInteger(o.top) || o.top < 1) throw new Error("--top must be an integer >= 1"); }
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--markdown") o.markdown = true;
    else if (a === "--identities") o.identities = true;
    else if (a === "--cwd") o.cwd = next();
    else if (a === "-h" || a === "--help") { o.paths = ["--help"]; return o; }
    else if (a === "--version") { o.paths = ["--version"]; return o; }
    else throw new Error(`unknown option ${a} (see --help)`);
  }
  const outputFormats = [o.json, o.csv, o.markdown, o.identities].filter(Boolean);
  if (outputFormats.length > 1) {
    throw new Error("--json, --csv, --markdown and --identities are mutually exclusive");
  }
  return o;
}

/**
 * FNV-1a 32-bit. Stable across platforms and Node versions, which is the point:
 * the same path with the same seed always lands in the same bucket.
 * @param {string} text
 */
export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * @param {string} path
 * @param {number} n
 * @param {string} seed
 */
export function inSample(path, n, seed) {
  return n === 1 || fnv1a(seed + "\u0000" + path) % n === 0;
}

/**
 * Minimal glob: ** matches across directories, * within one segment, ? one char.
 * A pattern without a slash matches against the basename as well as the full path.
 * @param {string} glob
 */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/**
 * @param {string} path
 * @param {RegExp[]} include
 * @param {RegExp[]} exclude
 * @param {boolean[]} includeIsBare true when the pattern had no slash, so basename matching applies
 * @param {boolean[]} excludeIsBare
 */
export function selected(path, include, exclude, includeIsBare, excludeIsBare) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  /** @param {RegExp} re @param {boolean} bare */
  const hit = (re, bare) => re.test(path) || (bare && re.test(base));
  if (exclude.some((re, i) => hit(re, excludeIsBare[i]))) return false;
  if (include.length === 0) return true;
  return include.some((re, i) => hit(re, includeIsBare[i]));
}

/**
 * Parse `git blame --line-porcelain` output into a map of author-mail -> line count.
 * With --line-porcelain every line repeats its commit headers, so a simple scan works.
 * @param {string} porcelain
 * @returns {Map<string, { name: string, lines: number }>}
 */
export function countBlameLines(porcelain) {
  /** @type {Map<string, { name: string, lines: number }>} */
  const counts = new Map();
  let name = "";
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("author ")) name = line.slice(7);
    else if (line.startsWith("author-mail ")) {
      const mail = line.slice(12).replace(/^<|>$/g, "").toLowerCase();
      const entry = counts.get(mail) ?? { name, lines: 0 };
      entry.lines++;
      counts.set(mail, entry);
    }
  }
  return counts;
}

/**
 * Settings pinned on every call so the same repository answers the same way on any machine.
 *
 * `core.precomposeunicode` is true in every repository git creates on macOS, and it rewrites
 * command-line arguments from decomposed to precomposed form. Paths here are read out of the
 * tree and handed straight back to blame, so a stored decomposed path (what a checkout
 * authored on Linux carries for Korean, French, Turkish, Vietnamese, Portuguese and Spanish
 * names) came back as a different string and matched nothing: "fatal: no such path café.ts in
 * HEAD", printed in a form that looks exactly like the file. Turning it off keeps the path we
 * send identical to the path git stored. ASCII repositories are unaffected either way.
 * @param {string[]} args
 * @param {string} cwd
 */
async function git(args, cwd) {
  const { stdout } = await execFileP("git", ["-c", "core.precomposeunicode=false", ...args], { cwd, maxBuffer: 1024 * 1024 * 512, encoding: "utf8" });
  return stdout;
}

/**
 * The empty tree's id for this repository's hash algorithm, without touching /dev/null (Windows).
 * @param {string} cwd
 * @returns {Promise<string>}
 */
async function emptyTreeId(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["hash-object", "-t", "tree", "--stdin"], { cwd });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `git exited ${code}`))));
    child.stdin.end();
  });
}

/**
 * List files in the ref, with the total line count per text file, in one git call.
 * Binary files come back as "-\t-" from --numstat and are skipped.
 * @param {Options} o
 */
async function listTextFiles(o) {
  const emptyTree = await emptyTreeId(o.cwd);
  const out = await git(["diff", "--numstat", "-z", emptyTree, o.ref, "--", ...o.paths], o.cwd);
  /** @type {{ path: string, lines: number }[]} */
  const files = [];
  // -z output: "added\tdeleted\tpath\0" for plain entries; renames cannot occur against the empty tree.
  for (const rec of out.split("\0")) {
    if (!rec) continue;
    const [added, , path] = rec.split("\t");
    if (added === "-" || path === undefined) continue;
    files.push({ path, lines: Number(added) });
  }
  return files;
}

/**
 * @param {Options} o
 */
export async function analyse(o) {
  try {
    await git(["rev-parse", "--is-inside-work-tree"], o.cwd);
  } catch {
    throw new Error(`${o.cwd} is not inside a git repository (use --cwd to point at one)`);
  }
  try {
    await git(["rev-parse", "--verify", "--quiet", `${o.ref}^{commit}`], o.cwd);
  } catch {
    throw new Error(`ref "${o.ref}" does not resolve to a commit in ${o.cwd}`);
  }
  const includeRe = o.include.map(globToRegExp);
  const excludeRe = o.exclude.map(globToRegExp);
  const includeBare = o.include.map((g) => !g.includes("/"));
  const excludeBare = o.exclude.map((g) => !g.includes("/"));

  const all = (await listTextFiles(o)).filter((f) => selected(f.path, includeRe, excludeRe, includeBare, excludeBare));
  const sampled = all.filter((f) => inSample(f.path, o.sample, o.seed));

  /** @type {Map<string, { name: string, lines: number, commits: number }>} */
  const authors = new Map();
  let attributed = 0;

  const blameArgs = ["blame", "--line-porcelain", "-w", "-M"];
  if (o.copies) blameArgs.push("-C");

  let cursor = 0;
  const worker = async () => {
    while (cursor < sampled.length) {
      const file = sampled[cursor++];
      const out = await git([...blameArgs, o.ref, "--", file.path], o.cwd);
      for (const [mail, { name, lines }] of countBlameLines(out)) {
        const a = authors.get(mail) ?? { name, lines: 0, commits: 0 };
        a.lines += lines;
        attributed += lines;
        authors.set(mail, a);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(o.jobs, sampled.length || 1) }, worker));

  const logArgs = ["log", "--no-merges", "--format=%aE%x09%aN", o.ref];
  if (o.since) logArgs.push(`--since=${o.since}`);
  if (o.until) logArgs.push(`--until=${o.until}`);
  logArgs.push("--", ...o.paths);
  const log = await git(logArgs, o.cwd);
  let commits = 0;
  for (const line of log.split("\n")) {
    if (!line) continue;
    const [mailRaw, name] = line.split("\t");
    const mail = mailRaw.toLowerCase();
    const a = authors.get(mail) ?? { name, lines: 0, commits: 0 };
    a.commits++;
    commits++;
    authors.set(mail, a);
  }

  const rows = [...authors.entries()]
    .map(([mail, a]) => ({
      author: a.name,
      mail,
      lines: a.lines,
      lineShare: attributed ? a.lines / attributed : 0,
      commits: a.commits,
      commitShare: commits ? a.commits / commits : 0,
    }))
    .sort((x, y) => y.lines - x.lines || y.commits - x.commits || x.mail.localeCompare(y.mail));

  return {
    ref: o.ref,
    sample: { every: o.sample, seed: o.seed, filesTotal: all.length, filesSampled: sampled.length, linesInRef: all.reduce((s, f) => s + f.lines, 0), linesAttributed: attributed },
    commitWindow: { since: o.since ?? null, until: o.until ?? null, commits, mergesExcluded: true },
    blame: { flags: blameArgs.slice(2) },
    authors: rows,
  };
}

/** @param {number} x */
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// WIDE-TABLE start — generated by scripts/gen-width-table.mjs from Unicode 17.0.0. Do not edit by hand.
/** Inclusive [start, end] pairs of the Wide and Fullwidth classes of UAX #11, 123 ranges. */
const WIDE = [
  0x1100, 0x115f, 0x231a, 0x231b, 0x2329, 0x232a, 0x23e9, 0x23ec, 0x23f0, 0x23f0,
  0x23f3, 0x23f3, 0x25fd, 0x25fe, 0x2614, 0x2615, 0x2630, 0x2637, 0x2648, 0x2653,
  0x267f, 0x267f, 0x268a, 0x268f, 0x2693, 0x2693, 0x26a1, 0x26a1, 0x26aa, 0x26ab,
  0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26ce, 0x26ce, 0x26d4, 0x26d4, 0x26ea, 0x26ea,
  0x26f2, 0x26f3, 0x26f5, 0x26f5, 0x26fa, 0x26fa, 0x26fd, 0x26fd, 0x2705, 0x2705,
  0x270a, 0x270b, 0x2728, 0x2728, 0x274c, 0x274c, 0x274e, 0x274e, 0x2753, 0x2755,
  0x2757, 0x2757, 0x2795, 0x2797, 0x27b0, 0x27b0, 0x27bf, 0x27bf, 0x2b1b, 0x2b1c,
  0x2b50, 0x2b50, 0x2b55, 0x2b55, 0x2e80, 0x2e99, 0x2e9b, 0x2ef3, 0x2f00, 0x2fd5,
  0x2ff0, 0x303e, 0x3041, 0x3096, 0x3099, 0x30ff, 0x3105, 0x312f, 0x3131, 0x318e,
  0x3190, 0x31e5, 0x31ef, 0x321e, 0x3220, 0x3247, 0x3250, 0xa48c, 0xa490, 0xa4c6,
  0xa960, 0xa97c, 0xac00, 0xd7a3, 0xf900, 0xfaff, 0xfe10, 0xfe19, 0xfe30, 0xfe52,
  0xfe54, 0xfe66, 0xfe68, 0xfe6b, 0xff01, 0xff60, 0xffe0, 0xffe6, 0x16fe0, 0x16fe4,
  0x16ff0, 0x16ff6, 0x17000, 0x18cd5, 0x18cff, 0x18d1e, 0x18d80, 0x18df2, 0x1aff0, 0x1aff3,
  0x1aff5, 0x1affb, 0x1affd, 0x1affe, 0x1b000, 0x1b122, 0x1b132, 0x1b132, 0x1b150, 0x1b152,
  0x1b155, 0x1b155, 0x1b164, 0x1b167, 0x1b170, 0x1b2fb, 0x1d300, 0x1d356, 0x1d360, 0x1d376,
  0x1f004, 0x1f004, 0x1f0cf, 0x1f0cf, 0x1f18e, 0x1f18e, 0x1f191, 0x1f19a, 0x1f200, 0x1f202,
  0x1f210, 0x1f23b, 0x1f240, 0x1f248, 0x1f250, 0x1f251, 0x1f260, 0x1f265, 0x1f300, 0x1f320,
  0x1f32d, 0x1f335, 0x1f337, 0x1f37c, 0x1f37e, 0x1f393, 0x1f3a0, 0x1f3ca, 0x1f3cf, 0x1f3d3,
  0x1f3e0, 0x1f3f0, 0x1f3f4, 0x1f3f4, 0x1f3f8, 0x1f43e, 0x1f440, 0x1f440, 0x1f442, 0x1f4fc,
  0x1f4ff, 0x1f53d, 0x1f54b, 0x1f54e, 0x1f550, 0x1f567, 0x1f57a, 0x1f57a, 0x1f595, 0x1f596,
  0x1f5a4, 0x1f5a4, 0x1f5fb, 0x1f64f, 0x1f680, 0x1f6c5, 0x1f6cc, 0x1f6cc, 0x1f6d0, 0x1f6d2,
  0x1f6d5, 0x1f6d8, 0x1f6dc, 0x1f6df, 0x1f6eb, 0x1f6ec, 0x1f6f4, 0x1f6fc, 0x1f7e0, 0x1f7eb,
  0x1f7f0, 0x1f7f0, 0x1f90c, 0x1f93a, 0x1f93c, 0x1f945, 0x1f947, 0x1f9ff, 0x1fa70, 0x1fa7c,
  0x1fa80, 0x1fa8a, 0x1fa8e, 0x1fac6, 0x1fac8, 0x1fac8, 0x1facd, 0x1fadc, 0x1fadf, 0x1faea,
  0x1faef, 0x1faf8, 0x20000, 0x2fffd, 0x30000, 0x3fffd,
];
// WIDE-TABLE end

/**
 * Columns a string occupies in a terminal, which is not its length in UTF-16 code units.
 *
 * Two columns for the Wide and Fullwidth classes of Unicode Annex #11, East Asian Width, read
 * from the Unicode Character Database rather than written out by hand: the hand-written list
 * this replaced disagreed with the standard on 8,645 assigned code points, calling most emoji
 * narrow, and on 231 in the other direction. Zero columns for combining marks, which is what a
 * decomposed name such as "José" is made of, and for default-ignorable code points, which is
 * what the bidi isolates around a right-to-left name are. Padding by `String.length` pushed the
 * numbers right for Chinese, Japanese and Korean names and pulled them left for decomposed Latin
 * ones, so no column in the table lined up.
 *
 * Where this is still approximate: a character the standard calls narrow followed by U+FE0F,
 * the emoji presentation selector, counts as one column here and is drawn as two by some
 * terminals. Nothing in the standard settles that, so the standard's own width is used.
 * @param {string} s
 * @returns {number}
 */
export function displayWidth(s) {
  let w = 0;
  for (const ch of s) {
    if (/\p{Mn}|\p{Me}|\p{Default_Ignorable_Code_Point}/u.test(ch)) continue;
    w += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
  }
  return w;
}

/**
 * Binary search of the generated range table.
 * @param {number} c
 * @returns {boolean}
 */
function isWide(c) {
  let lo = 0;
  let hi = WIDE.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (c < WIDE[mid * 2]) hi = mid - 1;
    else if (c > WIDE[mid * 2 + 1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Wrap a name in the first-strong isolate so a right-to-left name cannot reorder the row around
 * it. Without this an Arabic or Hebrew author name sets the direction of the whole line: the name
 * moves to the right edge, the four numbers after it reverse their order, and each percent sign
 * lands before its number. U+2068 and U+2069 are what UAX #9 provides for embedding text of
 * unknown direction inside text of another (https://www.unicode.org/reports/tr9/, section 2.7),
 * they are default-ignorable so they cost no column, and they are added only to names that carry
 * strong right-to-left characters so every other row stays byte-for-byte what it was.
 * @param {string} s
 * @returns {string}
 */
export function isolate(s) {
  return /\p{Bidi_Control}/u.test(s) || !/[\p{sc=Arabic}\p{sc=Hebrew}\p{sc=Syriac}\p{sc=Thaana}\p{sc=Nko}\p{sc=Samaritan}\p{sc=Mandaic}\p{sc=Adlam}]/u.test(s) ? s : `\u2068${s}\u2069`;
}

/**
 * Pad to a width measured in terminal columns rather than code units.
 * @param {string} s
 * @param {number} width
 * @returns {string}
 */
function padEndDisplay(s, width) {
  return s + " ".repeat(Math.max(0, width - displayWidth(s)));
}

/**
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {number} top
 */
export function renderTable(r, top) {
  const lines = [];
  const s = r.sample;
  lines.push(`ref ${r.ref}  ·  files ${s.filesSampled}/${s.filesTotal} sampled (1 in ${s.every}${s.seed ? `, seed "${s.seed}"` : ""})  ·  ${s.linesAttributed.toLocaleString("en-US")} of ${s.linesInRef.toLocaleString("en-US")} lines attributed`);
  const w = r.commitWindow;
  lines.push(`git blame ${r.blame.flags.join(" ")}  ·  commits ${w.commits.toLocaleString("en-US")}${w.since || w.until ? ` in window ${w.since ?? "…"} to ${w.until ?? "…"}` : ""}, merges excluded`);
  lines.push("");
  const nameCount = new Map();
  for (const a of r.authors) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const label = (/** @type {{author: string, mail: string}} */ a) => isolate((nameCount.get(a.author) ?? 0) > 1 ? `${a.author} <${a.mail}>` : a.author);
  const rows = r.authors.slice(0, top);
  const nameW = Math.max(6, ...rows.map((a) => displayWidth(label(a))));
  const head = `${padEndDisplay("author", nameW)}  ${"lines".padStart(9)}  ${"share".padStart(6)}  ${"commits".padStart(7)}  ${"share".padStart(6)}`;
  lines.push(head);
  lines.push("-".repeat(displayWidth(head)));
  for (const a of rows) {
    lines.push(`${padEndDisplay(label(a), nameW)}  ${a.lines.toLocaleString("en-US").padStart(9)}  ${pct(a.lineShare).padStart(6)}  ${a.commits.toLocaleString("en-US").padStart(7)}  ${pct(a.commitShare).padStart(6)}`);
  }
  if (r.authors.length > top) lines.push(`… ${r.authors.length - top} more author${r.authors.length - top === 1 ? "" : "s"}`);
  lines.push("");
  lines.push("What this cannot show: quality of the lines, review work, design done in documents,");
  lines.push("or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit.");
  return lines.join("\n");
}

/**
 * CSV with one row per author, all authors, shares as fractions. Quotes fields that need it.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderCsv(r) {
  const q = (/** @type {string} */ v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = ["author,mail,lines,line_share,commits,commit_share"];
  for (const a of r.authors) rows.push([q(a.author), q(a.mail), a.lines, a.lineShare.toFixed(4), a.commits, a.commitShare.toFixed(4)].join(","));
  return rows.join("\n");
}

/**
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {number} top
 */
export function renderMarkdown(r, top) {
  const lines = [];
  const s = r.sample;
  lines.push(
    `ref ${r.ref}  ·  files ${s.filesSampled}/${s.filesTotal} sampled (1 in ${s.every}${s.seed ? `, seed "${s.seed}"` : ""})  ·  ${s.linesAttributed.toLocaleString("en-US")} of ${s.linesInRef.toLocaleString("en-US")} lines attributed`
  );
  const w = r.commitWindow;
  lines.push(
    `git blame ${r.blame.flags.join(" ")}  ·  commits ${w.commits.toLocaleString("en-US")}${w.since || w.until ? ` in window ${w.since ?? "…"} to ${w.until ?? "…"}` : ""}, merges excluded`
  );

  lines.push("");

  const nameCount = new Map();
  for (const a of r.authors) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const label = (/** @type {{author: string, mail: string}} */ a) => {
    const author = a.author.replace(/\|/g, "\\|");
    const mail = a.mail.replace(/\|/g, "\\|");
    return (nameCount.get(a.author) ?? 0) > 1 ? `${author} <${mail}>` : author;
  };
  const rows = r.authors.slice(0, top);

  lines.push("| author | lines | line share | commits | commit share |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");

  for (const a of rows) {
    lines.push(
      `| ${label(a)} | ${a.lines.toLocaleString("en-US")} | ${pct(a.lineShare)} | ${a.commits.toLocaleString("en-US")} | ${pct(a.commitShare)} |`
    );
  }

  if (r.authors.length > top) {
    lines.push("");
    lines.push(
      `… ${r.authors.length - top} more author${r.authors.length - top === 1 ? "" : "s"}`
    );
  }

  lines.push("");
  lines.push(
    "What this cannot show: quality of the lines, review work, design done in documents,"
  );
  lines.push(
    "or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit."
  );

  return lines.join("\n");
}

/**
 * Fold a name or address so the same person matches themselves.
 *
 * Turkish is the reason this is not `toLowerCase()`: uppercase dotted I lowercases to `i` plus a
 * combining dot, and plain `I` lowercases to `i` rather than `ı`, so a Turkish name fails to
 * match itself. A locale-aware fold cannot be applied globally without turning English "I" into
 * "ı", so the four i forms collapse to one.
 *
 * German is the reason the fold is not only case and accents: `"WEISS".toLowerCase()` is "weiss"
 * and `"Weiß".toLowerCase()` is "weiß", so one person who signs both ways was counted as two.
 * Unicode's full case folding maps ß to ss (CaseFolding.txt, status F,
 * https://www.unicode.org/Public/UCD/latest/ucd/CaseFolding.txt); JavaScript's `toLowerCase` is
 * the simple fold, which does not, so ß and capital ẞ are mapped here before it runs.
 *
 * NFKC is the reason a name typed in fullwidth Latin letters, which is what a Japanese or Korean
 * keyboard produces without switching modes, matches the same name typed in ASCII: the two are
 * compatibility equivalents of each other. It also folds the ﬁ ligature and the compatibility
 * ideographs. Decomposed and precomposed spellings of the same accented name meet here too.
 *
 * This is a matching fold, never a display form: what the table prints is always what git holds.
 * @param {string} s
 */
export function foldIdentity(s) {
  return s
    .normalize("NFKC")
    .replace(/[İıIi]/g, "i")
    .replace(/̇/g, "")
    .replace(/[ßẞ]/g, "ss")
    .toLowerCase()
    .normalize("NFKC")
    .trim();
}

/** Local parts that belong to a role rather than a person, so sharing one proves nothing. */
const GENERIC_LOCAL = new Set(["dev", "admin", "info", "me", "git", "hello", "mail", "noreply", "no-reply", "contact", "support", "team", "root", "user", "build", "ci", "bot", "test", "email", "work", "home"]);

/** @param {string} mail */
const isBotAddress = (mail) => /\[bot\]@|^(?:dependabot|renovate|github-actions|greenkeeper)\b/i.test(mail);

/**
 * The GitHub login inside a noreply address: `12345+login@users.noreply.github.com`, or the
 * older `login@users.noreply.github.com`. Returns null for anything else.
 * @param {string} mail
 */
export function githubLogin(mail) {
  const m = /^(?:\d+\+)?([^@+]+)@users\.noreply\.github\.com$/i.exec(mail);
  return m ? m[1].toLowerCase() : null;
}

/** Compare identifiers ignoring the separators people vary: dots, dashes, underscores, spaces. */
const loose = (/** @type {string} */ s) => foldIdentity(s).replace(/[\s._-]/g, "");

/**
 * Group addresses that look like one person, with the signal behind each grouping. This reads
 * only what is already in the repository's own history, proposes and never writes, and cannot
 * know whether two identities really are one person: it reports the evidence and stops.
 * @param {{author: string, mail: string, lines: number, commits: number}[]} authors
 */
export function linkIdentities(authors) {
  const people = authors.filter((a) => !isBotAddress(a.mail));
  /** @type {Map<number, Set<number>>} */
  const edges = new Map();
  /** @type {Map<string, string[]>} */
  const why = new Map();
  const link = (/** @type {number} */ i, /** @type {number} */ j, /** @type {string} */ reason) => {
    if (!edges.has(i)) edges.set(i, new Set());
    if (!edges.has(j)) edges.set(j, new Set());
    edges.get(i)?.add(j);
    edges.get(j)?.add(i);
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    const list = why.get(key) ?? [];
    if (!list.includes(reason)) list.push(reason);
    why.set(key, list);
  };

  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];
      if (a.author && b.author && foldIdentity(a.author) === foldIdentity(b.author)) {
        link(i, j, `the same name, "${a.author}", on two addresses`);
      }
      const [la, lb] = [githubLogin(a.mail), githubLogin(b.mail)];
      const localOf = (/** @type {string} */ m) => m.split("@")[0].replace(/^\d+\+/, "");
      for (const [login, other] of [[la, b], [lb, a]]) {
        if (!login) continue;
        if (loose(login) === loose(localOf(other.mail)) || (other.author && loose(login) === loose(other.author))) {
          link(i, j, `the GitHub login "${login}" also appears as ${loose(login) === loose(localOf(other.mail)) ? "the address" : "the name"} on the other`);
        }
      }
      if (!la && !lb) {
        const [pa, pb] = [localOf(a.mail), localOf(b.mail)];
        if (pa === pb && pa.length >= 3 && !GENERIC_LOCAL.has(pa) && a.mail !== b.mail) {
          link(i, j, `the same address name, "${pa}", on two domains`);
        }
      }
    }
  }

  /** @type {number[][]} */
  const groups = [];
  const seen = new Set();
  for (let i = 0; i < people.length; i++) {
    if (seen.has(i) || !edges.has(i)) continue;
    const stack = [i];
    /** @type {number[]} */
    const members = [];
    while (stack.length) {
      const n = stack.pop();
      if (n === undefined || seen.has(n)) continue;
      seen.add(n);
      members.push(n);
      for (const m of edges.get(n) ?? []) if (!seen.has(m)) stack.push(m);
    }
    if (members.length > 1) groups.push(members.sort((x, y) => x - y));
  }

  return groups.map((members) => {
    const rows = members.map((i) => people[i]);
    // The address someone commits from most often is the one to keep; lines are a weaker signal
    // because one big import can outweigh years of work.
    const canonical = [...rows].sort((x, y) => y.commits - x.commits || y.lines - x.lines || x.mail.localeCompare(y.mail))[0];
    /** @type {string[]} */
    const reasons = [];
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        for (const r of why.get(`${members[a]}:${members[b]}`) ?? []) if (!reasons.includes(r)) reasons.push(r);
      }
    }
    return { canonical, members: rows, reasons };
  });
}

/**
 * @param {ReturnType<typeof linkIdentities>} groups
 */
export function renderIdentities(groups) {
  if (!groups.length) {
    return [
      "No split identities found.",
      "",
      "Every address in this repository looks like a different person. That is what you want,",
      "and it is also what you see when a .mailmap has already merged them.",
    ].join("\n");
  }
  const lines = [`${groups.length} identit${groups.length === 1 ? "y looks" : "ies look"} split across more than one address.`, ""];
  for (const g of groups) {
    lines.push(`${g.canonical.author || g.canonical.mail}`);
    for (const m of g.members) {
      const mark = m.mail === g.canonical.mail ? "keep" : "map ";
      lines.push(`  ${mark} ${m.mail}  ${m.commits} commit${m.commits === 1 ? "" : "s"}, ${m.lines.toLocaleString("en-US")} line${m.lines === 1 ? "" : "s"}`);
    }
    for (const r of g.reasons) lines.push(`  because ${r}`);
    lines.push("");
  }
  lines.push("Add these to a .mailmap file at the repository root:", "");
  for (const g of groups) {
    for (const m of g.members) {
      if (m.mail === g.canonical.mail) continue;
      lines.push(`${g.canonical.author} <${g.canonical.mail}> <${m.mail}>`);
    }
  }
  lines.push("");
  lines.push("These are guesses from names and addresses in this repository's own history; only you");
  lines.push("can tell whether two of them are really one person. Nothing was written. git log, git");
  lines.push("blame, git shortlog and this tool all read .mailmap, so one file fixes every count.");
  lines.push("");
  lines.push("The address lines above are the reliable ones. git matches a .mailmap name ignoring");
  lines.push("case for ASCII letters only, so a name mapped by name alone must be written with its");
  lines.push("accents and its non-Latin letters exactly as the commit spells them.");
  return lines.join("\n");
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(2);
  }
  if (o.paths[0] === "--help") { console.log(HELP); return; }
  if (o.paths[0] === "--version") { console.log(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version); return; }
  try {
    const r = await analyse(o);
    let output;

    if (o.json) {
      output = JSON.stringify(r, null, 2);
    } else if (o.csv) {
      output = renderCsv(r);
    } else if (o.markdown) {
      output = renderMarkdown(r, o.top);
    } else if (o.identities) {
      output = renderIdentities(linkIdentities(r.authors));
    } else {
      output = renderTable(r, o.top);
    }
    console.log(output);

  } catch (err) {
    const msg = err && typeof err === "object" && "stderr" in err && err.stderr ? String(err.stderr).trim() : String(err instanceof Error ? err.message : err);
    console.error(msg);
    process.exit(1);
  }
}

const entry = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : "";
if (entry === import.meta.url) main();
