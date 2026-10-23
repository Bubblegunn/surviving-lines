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
import { existsSync, mkdirSync, realpathSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/**
 * The version of the `--json` layout, described by schema/surviving-lines.schema.json. It changes
 * when a key is removed, renamed or changes type, so a consumer can refuse a layout it does not know
 * instead of reading a missing key as zero. Adding a key does not change it.
 */
export const SCHEMA_VERSION = 1;

/** Above this many files to blame, copy detection (-C) is off by default: it makes each blame search the whole commit. */
const COPY_DETECTION_MAX_FILES = 2000;

/**
 * Above this many files times commits reachable from the ref, copy detection (-C) is off by default. Blame with -C
 * looks for each line in the other files of every commit that touched the file, so its time grows with both numbers;
 * a repository under the file limit but with a long history can still take many minutes.
 */
export const COPY_DETECTION_MAX_WORK = 2_000_000;

/**
 * Whether copy detection is on when --copies and --no-copies were not given: the file count is at most
 * COPY_DETECTION_MAX_FILES and files times commits is at most `limit`.
 * @param {number} files files to blame
 * @param {number} commits commits reachable from the ref
 * @param {number} [limit]
 * @returns {boolean}
 */
export function copyDetectionDefault(files, commits, limit = COPY_DETECTION_MAX_WORK) {
  return files <= COPY_DETECTION_MAX_FILES && files * commits <= limit;
}

/** The package version, read from the package.json this file ships with. */
function toolVersion() {
  return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
}

/**
 * The `--json` document: the analysis, preceded by what produced it.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderJson(r) {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, tool: { name: "surviving-lines", version: toolVersion() }, ...r }, null, 2);
}

const HELP = `usage: surviving-lines [options] [-- <path>...]

Measure who wrote the code that is still alive in a git ref.

  --ref <rev>          revision to analyse (default: HEAD)
  --sample <n>         deterministic 1-in-n file sample, n >= 1 (default: 1, every file)
  --seed <text>        salt for the sample hash; change it to draw a different sample
  --include <glob>     only files matching the glob (repeatable; ** and * supported)
  --exclude <glob>     skip files matching the glob (repeatable)
  --since <date>       commit-share window start (passed to git log)
  --until <date>       commit-share window end
  --copies [deep]      follow copies even above 2000 files, or files times commits above 2,000,000 (default: git blame -w -M -C, which follows code
                       moved out of a file changed in the same commit; copy detection is off above those limits).
                       "deep" uses -C -C, which also looks in files of the commit that created the file.
                       The word right after --copies is read as this value, so never put a path named "deep" there
                       (paths go after --)
  --no-copies          blame with -w -M only: code moved or copied into a new path is credited to who moved it
  --keep-generated     count lockfiles, generated files (marked or minified), vendored code and binary files (default: leave them
                       out of every number and print what was left out)
  --co-authors <mode>  none (default) or share: split each line and commit equally between the author
                       and the Co-authored-by trailer identities (.mailmap applies to them);
                       cannot be combined with --group-by
  --ai-breakdown       also print surviving lines and commits whose message trailers name an AI assistant
  --group-by <key>     one block per group of files: dir (top-level directories), dir:<n> (n levels deep), or ext
  --suggest-codeowners print CODEOWNERS lines for the groups, from the surviving lines (needs --group-by dir; never written)
  --include-bots       count bot identities as authors (default: leave them out of both shares)
  --ignore-revs-file <f>  skip the revisions listed in <f> when blaming (git 2.23 or newer);
                       default: .git-blame-ignore-revs at the repository root, when it exists
  --no-ignore-revs     do not read .git-blame-ignore-revs
  --ignore-rev <rev>   skip one commit when blaming (repeatable; git 2.23 or newer)
  --no-detect-reformat turn off the reformat heuristic (on by default): it finds suspected whitespace or quote
                       commits and, unless --keep-reformat, leaves them out of the numbers; it does not prove them
  --keep-reformat      count the suspected reformat commits in the numbers, as before the correction; the block
                       still lists them. Not applied under --co-authors share
  --bus-factor-threshold <n>  percent of the lines counted that the bus factor must reach, above 0 and at most 100 (default: 50)
  --jobs <n>           parallel blame processes (default: 4)
  --top <k>            rows to print (default: every author with at least 1% of the lines, 10 to 25 rows,
                       then one line for the rest, and a last-commit column)
  --files [n]          one row per file, largest first, n rows (default 25): lines, top owner and share, next two owners,
                       then a summary line. Not with --group-by, --csv, --markdown, --identities, --reviewers, --history
  --reviewers <path>   list who should review a file or directory: lines, commits, last commit, and whether active
  --history <path>     list who changed a file or directory, oldest first: first and last commit, commits, lines now
                       --since and --until do not narrow its dates or commit counts (they can drop a person with no lines left)
  --sort <key>         lines (default), commits, or gap between line and commit share
  -q, --quiet          suppress progress output on stderr
  --json               print JSON instead of a table
  --csv                print CSV (author,mail,lines,line_share,commits,commit_share)
  --markdown           print a Markdown table
  --identities         list addresses that look like one person, with .mailmap lines
  --merge-identities   count the suggested same-person addresses as one, in memory (nothing written); the table names each merge
  --allow-shallow      run in a shallow clone anyway; every output is marked "shallow clone"
  --cwd <dir>          repository directory (default: current directory)
  -h, --help           this text
  --version            print the version

Paths after -- are passed to git as pathspecs. Identities follow the repository's .mailmap;
add one to merge an author's several addresses. Map by address where you can: git compares
.mailmap names ignoring case for ASCII letters only, so a name mapped by name alone has to
match the commit's spelling of its accents and non-Latin letters exactly.

A shallow clone (git clone --depth, and the default checkout in most CI systems) is refused:
blame gives every line older than the cut to the commit at the cut, so the numbers are wrong.
Run git fetch --unshallow first, or pass --allow-shallow to get the marked, wrong numbers.

Exit status:
  0   success
  1   error (invalid ref, shallow clone, or no files sampled)
  2   command-line option error

SURVIVING_LINES_NO_STAR_HINT=1 hides the one-time star hint`;

/** @typedef {{ ref: string, sample: number, seed: string, include: string[], exclude: string[], since?: string, until?: string, coAuthors: "none" | "share", aiBreakdown: boolean,
groupBy?: string, files?: number, reviewers?: string, history?: string, topGiven: boolean, suggestCodeowners: boolean, includeBots: boolean, ignoreRevsFile?: string, noIgnoreRevs: boolean, ignoreRevs: string[], detectReformat: boolean, keepReformat: boolean, busFactorThreshold: number, copies: boolean, copiesDeep?: boolean, copyWorkLimit?: number, noCopies: boolean, keepGenerated: boolean, jobs: number, top: number, sort: "lines" | "commits" | "gap", quiet: boolean, json: boolean, csv: boolean, markdown: boolean, identities: boolean, mergeIdentities: boolean, allowShallow: boolean, cwd: string, paths: string[], stderr?: import("node:stream").Writable & { isTTY?: boolean } }} Options */

/**
 * @param {string[]} argv
 * @returns {Options}
 */
export function parseArgs(argv) {
  /** @type {Options} */
  const o = { ref: "HEAD", sample: 1, seed: "", include: [], exclude: [], coAuthors: "none", aiBreakdown: false, suggestCodeowners: false, includeBots: false, noIgnoreRevs: false, ignoreRevs: [], detectReformat: true, keepReformat: false, busFactorThreshold: 50, copies: false, noCopies: false, keepGenerated: false, jobs: 4, top: 10, topGiven: false, sort: "lines", quiet: false, json: false, csv: false, markdown: false, identities: false, mergeIdentities: false, allowShallow: false, cwd: process.cwd(), paths: [] };
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
    else if (a === "--copies") { o.copies = true; if (argv[i + 1] === "deep") { o.copiesDeep = true; i++; } }
    else if (a === "--no-copies") o.noCopies = true;
    else if (a === "--keep-generated") o.keepGenerated = true;
    else if (a === "--co-authors") { const mode = next(); if (mode !== "none" && mode !== "share") throw new Error("--co-authors must be none or share"); o.coAuthors = mode; }
    else if (a === "--ai-breakdown") o.aiBreakdown = true;
    else if (a === "--group-by") { o.groupBy = next(); parseGroupBy(o.groupBy); }
    else if (a === "--files") { o.files = 25; if (/^\d+$/.test(argv[i + 1] ?? "")) { o.files = Number(argv[++i]); if (o.files < 1) throw new Error("--files must be an integer >= 1"); } }
    else if (a === "--reviewers") o.reviewers = next();
    else if (a === "--history") o.history = next();
    else if (a === "--suggest-codeowners") o.suggestCodeowners = true;
    else if (a === "--include-bots") o.includeBots = true;
    else if (a === "--ignore-revs-file") o.ignoreRevsFile = next();
    else if (a === "--no-ignore-revs") o.noIgnoreRevs = true;
    else if (a === "--ignore-rev") o.ignoreRevs.push(next());
    else if (a === "--no-detect-reformat") o.detectReformat = false;
    else if (a === "--keep-reformat") o.keepReformat = true;
    else if (a === "--bus-factor-threshold") { o.busFactorThreshold = Number(next()); if (!(o.busFactorThreshold > 0 && o.busFactorThreshold <= 100)) throw new Error("--bus-factor-threshold must be a number above 0 and at most 100"); }
    else if (a === "--jobs") { o.jobs = Number(next()); if (!Number.isInteger(o.jobs) || o.jobs < 1) throw new Error("--jobs must be an integer >= 1"); }
    else if (a === "--top") { o.top = Number(next()); if (!Number.isInteger(o.top) || o.top < 1) throw new Error("--top must be an integer >= 1"); o.topGiven = true; }
    else if (a === "--sort") { const sort = next(); if (!["lines", "commits", "gap"].includes(sort)) throw new Error("--sort must be lines, commits, or gap"); o.sort = /** @type {"lines" | "commits" | "gap"} */ (sort); }
    else if (a === "-q" || a === "--quiet") o.quiet = true;
    else if (a === "--json") o.json = true;
    else if (a === "--csv") o.csv = true;
    else if (a === "--markdown") o.markdown = true;
    else if (a === "--identities") o.identities = true;
    else if (a === "--merge-identities") o.mergeIdentities = true;
    else if (a === "--allow-shallow") o.allowShallow = true;
    else if (a === "--cwd") o.cwd = next();
    else if (a === "-h" || a === "--help") { o.paths = ["--help"]; return o; }
    else if (a === "--version") { o.paths = ["--version"]; return o; }
    else throw new Error(`unknown option ${a} (see --help)`);
  }
  if (o.ignoreRevsFile !== undefined && o.noIgnoreRevs) {
    throw new Error("--ignore-revs-file and --no-ignore-revs are mutually exclusive");
  }
  const grouping = o.groupBy === undefined ? null : parseGroupBy(o.groupBy);
  // Each path view prints its own table, so no other output format can be asked for beside it. Two of them would
  // each need the whole run for their own path, so they cannot share one.
  if (o.reviewers !== undefined && o.history !== undefined) throw new Error("--reviewers and --history are mutually exclusive: each prints its own view");
  const pathView = o.reviewers ?? o.history;
  const pathViewFlag = o.reviewers !== undefined ? "--reviewers" : "--history";
  if (pathView !== undefined && (o.csv || o.markdown || o.identities || grouping || o.suggestCodeowners)) throw new Error(`${pathViewFlag} prints its own view; it can be combined with --json only`);
  // The path joins the pathspecs, so blame, the commit counts and the unmatched-path error all see it. A pathspec after
  // -- would narrow the run to files that may not include the path, and the view would describe the wrong set.
  if (pathView !== undefined && o.paths.length) throw new Error(`${pathViewFlag} takes its path as its own value; it cannot be combined with pathspecs after --`);
  if (pathView !== undefined) o.paths = [pathView];
  if (o.files !== undefined) {
    const clash = grouping ? "--group-by" : o.csv ? "--csv" : o.markdown ? "--markdown" : o.identities ? "--identities" : o.reviewers !== undefined ? "--reviewers" : o.history !== undefined ? "--history" : o.coAuthors === "share" ? "--co-authors share" : null;
    if (clash) throw new Error(`--files prints its own view; it cannot be combined with ${clash}`);
  }
  if (o.suggestCodeowners && grouping?.kind !== "dir") throw new Error("--suggest-codeowners needs --group-by dir or dir:<n>");
  if (grouping && (o.csv || o.markdown || o.identities)) throw new Error("--group-by prints the table or --json; it cannot be combined with --csv, --markdown or --identities");
  if (o.suggestCodeowners && o.json) throw new Error("--suggest-codeowners prints text; it cannot be combined with --json");
  if (grouping && o.coAuthors === "share") throw new Error("--co-authors share cannot be combined with --group-by yet");
  // The merge joins addresses that the table shows apart; --identities shows them apart on purpose, and a split
  // count is not a plain line count, so the two cannot be asked for together.
  if (o.copies && o.noCopies) throw new Error("--copies and --no-copies are mutually exclusive");
  if (o.mergeIdentities && o.identities) throw new Error("--merge-identities cannot be combined with --identities, which lists the addresses as they are");
  if (o.mergeIdentities && o.coAuthors === "share") throw new Error("--merge-identities cannot be combined with --co-authors share");
  if (o.aiBreakdown && (o.csv || o.identities)) throw new Error("--ai-breakdown prints with the table, --markdown or --json; it cannot be combined with --csv or --identities");
  const outputFormats = [o.json, o.csv, o.markdown, o.identities].filter(Boolean);
  if (outputFormats.length > 1) {
    throw new Error("--json, --csv, --markdown and --identities are mutually exclusive");
  }
  return o;
}

/**
 * Documented AI-assistant trailers. An entry is here only when the tool's own documentation or source says it writes
 * this identity into a `Co-authored-by:` trailer; the source is kept beside the entry so a reader can check it. Nothing
 * is guessed from a commit's content, its time or its style: no trailer, no assistant.
 * `Assisted-by:` is handled separately (see assistantsIn): the Linux kernel's Documentation/process/coding-assistants.rst
 * documents it as `Assisted-by: AGENT_NAME:MODEL_VERSION [TOOL1] [TOOL2]`.
 * @type {{ name: string, mail: RegExp, example: string, source: string }[]}
 */
export const AI_ASSISTANTS = [
  { name: "Claude", mail: /^noreply@anthropic\.com$/i, example: "Claude <noreply@anthropic.com>", source: "https://code.claude.com/docs/en/settings (commit attribution)" },
  { name: "aider", mail: /^aider@aider\.chat$/i, example: "aider (gpt-4) <aider@aider.chat>", source: "https://raw.githubusercontent.com/Aider-AI/aider/main/aider/repo.py" },
];

/**
 * The trailers of a commit message that this tool reads: `Co-authored-by:` with an address, and
 * `Assisted-by:`. Only the last paragraph counts, and only when the message has more than one, which is where git puts
 * trailers; a line in prose that starts with the same words is not a trailer. Keys are matched ignoring case.
 * @param {string} message
 * @returns {{ coAuthors: { name: string, mail: string }[], assistedBy: string[] }}
 */
export function parseTrailers(message) {
  const paragraphs = message.replace(/\r\n/g, "\n").trim().split(/\n[ \t]*\n/);
  /** @type {{ coAuthors: { name: string, mail: string }[], assistedBy: string[] }} */
  const found = { coAuthors: [], assistedBy: [] };
  if (paragraphs.length < 2) return found;
  for (const line of paragraphs[paragraphs.length - 1].split("\n")) {
    const m = /^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "co-authored-by") {
      const who = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(m[2]);
      if (who) found.coAuthors.push({ name: who[1].trim(), mail: who[2].toLowerCase() });
    } else if (key === "assisted-by" && m[2]) {
      found.assistedBy.push(m[2]);
    }
  }
  return found;
}

/**
 * The assistants a commit's trailers name, once each: a co-author whose address is in AI_ASSISTANTS, and the agent
 * name at the start of every `Assisted-by:` value (the text before the first colon or space).
 * @param {{ coAuthors: { name: string, mail: string }[], assistedBy: string[] }} t
 * @returns {string[]}
 */
export function assistantsIn(t) {
  /** @type {Set<string>} */
  const names = new Set();
  for (const c of t.coAuthors) {
    const hit = AI_ASSISTANTS.find((a) => a.mail.test(c.mail));
    if (hit) names.add(hit.name);
  }
  for (const v of t.assistedBy) {
    const agent = v.split(/[:\s]/)[0];
    if (agent) names.add(agent);
  }
  return [...names];
}

/**
 * Lines per blamed commit, from `git blame --line-porcelain`: every line repeats its commit's headers, so the
 * commit id on the header line and the author-mail line after it are enough.
 * @param {string} porcelain
 * @returns {Map<string, { name: string, mail: string, lines: number }>}
 */
export function countBlameByCommit(porcelain) {
  /** @type {Map<string, { name: string, mail: string, lines: number }>} */
  const counts = new Map();
  let sha = "";
  let name = "";
  for (const line of porcelain.split("\n")) {
    const header = /^([0-9a-f]{40}|[0-9a-f]{64}) \d+ \d+/.exec(line);
    if (header) sha = header[1];
    else if (line.startsWith("author ")) name = line.slice(7);
    else if (line.startsWith("author-mail ")) {
      const mail = line.slice(12).replace(/^<|>$/g, "").toLowerCase();
      const entry = counts.get(sha) ?? { name, mail, lines: 0 };
      entry.lines++;
      counts.set(sha, entry);
    }
  }
  return counts;
}

/**
 * Read a --group-by value: `dir` (same as `dir:1`), `dir:<n>` with n >= 1, or `ext`.
 * @param {string} spec
 * @returns {{ kind: "dir", depth: number } | { kind: "ext" }}
 */
export function parseGroupBy(spec) {
  if (spec === "ext") return { kind: "ext" };
  const m = /^dir(?::(\d+))?$/.exec(spec);
  const depth = m ? (m[1] === undefined ? 1 : Number(m[1])) : 0;
  if (!m || depth < 1) throw new Error("--group-by must be dir, dir:<n> with n >= 1, or ext");
  return { kind: "dir", depth };
}

/**
 * The group a file belongs to. A file at the repository root is in ".". `ext` is the lowercased text after
 * the last dot of the file name, or "(none)" for a name with no dot or only a leading one.
 * @param {string} path
 * @param {{ kind: "dir", depth: number } | { kind: "ext" }} g
 */
export function groupKey(path, g) {
  const parts = path.split("/");
  if (g.kind === "dir") return parts.slice(0, -1).slice(0, g.depth).join("/") || ".";
  const base = parts[parts.length - 1];
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "(none)";
}

/**
 * The addresses of the apps that commit on their own. These are the patterns GitHub uses for app
 * identities (`<id>+<name>[bot]@users.noreply.github.com`) plus the three other bot addresses
 * workproof recognises (src/figures/bot.ts in Bubblegunn/workproof), so the two tools agree.
 */
const BOT_MAIL_PATTERNS = [/^(?:\d+)?[^@]+\[bot\]@users\.noreply\.github\.com$/i, /^bot@renovateapp\.com$/i, /^gitlab-bot@gitlab\.com$/i, /^teabot@gitea\.io$/i, /^bot@styleci\.io$/i,
  // Hosted translation platforms and the default GitHub Actions identity: services that commit on their own.
  /^(?:hosted|noreply|no-reply|bot|translations?)@(?:hosted\.)?weblate\.org$/i, /^(?:noreply|no-reply|support|bot|translations?)@(?:crowdin|transifex|lokalise)\.(?:com|co)$/i, /^(?:github-actions|action)@github\.com$/i];

/**
 * True for an identity that is a bot by name or by address:
 * - a name that ends in "[bot]";
 * - a name whose last word is "bot" ("Release Bot", "vue-bot", "bot") or that ends in a capital "Bot" after a
 *   lower-case letter or digit ("ZodBot");
 * - a lower-case name of 7 or more letters that ends in "bot" and is also the address's local part ("jekyllbot",
 *   `jekyllbot@example.org`);
 * - an address whose local part is 8 or more letters and ends in "bot" (`frankensteinbot@example.org`);
 * - a name that ends in "-Service", or in " Service" with the word "copybara" in it ("Copybara-Service");
 * - one of BOT_MAIL_PATTERNS.
 * Nothing cleverer: a person called "Bot Hawkins", "Botticelli", "Talbot", "Abbot Smith", "Elbot" or "Robotnik" is a person.
 * @param {string} name
 * @param {string} mail
 */
export function isBotIdentity(name, mail) {
  const n = name.trim();
  if (/\[bot\]$/i.test(n) || BOT_MAIL_PATTERNS.some((re) => re.test(mail))) return true;
  if (/(?:^|[\s_-])bot$/i.test(n) || /[a-z0-9]Bot$/.test(n)) return true;
  // The part of the address before "@", without the numeric id GitHub puts before a "+".
  const local = (mail.split("@")[0] ?? "").replace(/^\d+\+/, "");
  if (/^[a-z]{4,}bot$/.test(n) && n === local.toLowerCase()) return true;
  if (/^[a-z]{5,}bot$/i.test(local)) return true;
  return /-Service$/i.test(n) || (/ Service$/i.test(n) && /copybara/i.test(n));
}

/**
 * True for an identity that no person can be asked about: git's own template name ("Your Name"), or an address on no
 * real domain (`localhost`, `localhost.localdomain`, `(none)`, a `.local` or `.localdomain` host), as a commit made
 * before user.name and user.email were set carries. Its lines stay in the shares; it is never named as someone to ask.
 * @param {string} name
 * @param {string} mail
 */
export function isPlaceholderIdentity(name, mail) {
  if (/^your name$/i.test(name.trim())) return true;
  const domain = mail.split("@")[1] ?? "";
  return /^(?:localhost(?:\.localdomain)?|\(none\)|[^.]+\.(?:local|localdomain|lan))$/i.test(domain);
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
 * R9-14: true for a personal name of two or more alphabetic words ("Albert Nigmatzianov"), false for a handle.
 * @param {string} author
 * @returns {boolean}
 */
export function hasFullName(author) {
  const words = author.trim().split(/\s+/);
  return words.length >= 2 && words.every((w) => /^\p{L}[\p{L}.'-]*$/u.test(w));
}

/**
 * Remove the entries of lines that hold only whitespace from `git blame --line-porcelain` output. An empty line has no
 * author in any useful sense (it carries no logic, and `-w` already ignores whitespace changes), and counting it moves
 * a share toward whoever formats with more blank lines. Each entry ends with its content line, which starts with a tab.
 * @param {string} porcelain
 * @returns {string}
 */
export function dropBlankBlameLines(porcelain) {
  const lines = porcelain.split("\n");
  /** @type {string[]} */
  const kept = [];
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("\t")) continue;
    if (lines[i].trim() !== "") for (let j = start; j <= i; j++) kept.push(lines[j]);
    start = i + 1;
  }
  for (let j = start; j < lines.length; j++) kept.push(lines[j]);
  return kept.join("\n");
}

/**
 * Parse `git blame --line-porcelain` output into a map of author-mail -> line count.
 * With --line-porcelain every line repeats its commit headers, so a simple scan works.
 * @param {string} porcelain
 * Each entry also holds `fullName`, the first personal name (R9-14) that address committed under, when it has one.
 * @returns {Map<string, { name: string, lines: number, fullName?: string }>}
 */
export function countBlameLines(porcelain) {
  /** @type {Map<string, { name: string, lines: number, fullName?: string }>} */
  const counts = new Map();
  let name = "";
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("author ")) name = line.slice(7);
    else if (line.startsWith("author-mail ")) {
      const mail = line.slice(12).replace(/^<|>$/g, "").toLowerCase();
      const entry = counts.get(mail) ?? { name, lines: 0 };
      entry.lines++;
      if (entry.fullName === undefined && hasFullName(name)) entry.fullName = name;
      counts.set(mail, entry);
    }
  }
  return counts;
}

/**
 * A path as git prints it in porcelain output: quoted with C escapes (octal bytes for non-ASCII letters) when it holds a
 * quote, a backslash, a control character or a non-ASCII letter, plain otherwise.
 * @param {string} s
 */
export function unquoteGitPath(s) {
  if (s.length < 2 || !s.startsWith('"') || !s.endsWith('"')) return s;
  /** @type {number[]} */
  const bytes = [];
  const named = /** @type {Record<string, number>} */ ({ n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, '"': 34, "\\": 92 });
  const inner = s.slice(1, -1);
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c !== "\\") {
      bytes.push(...Buffer.from(c, "utf8"));
    } else if (/[0-7]/.test(inner[i + 1] ?? "")) {
      bytes.push(parseInt(inner.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      bytes.push(named[inner[i + 1]] ?? inner.charCodeAt(i + 1));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/**
 * Where the lines of one blamed file were written, from the `filename` header of `git blame --line-porcelain`: the path
 * the line had in the commit that wrote it. A line whose origin path is not the blamed path was moved or copied here.
 * @param {string} porcelain
 * @param {string} path the blamed path
 * @returns {{ total: number, from: Map<string, number> }} every line, and the lines per other origin path
 */
export function countBlameOrigins(porcelain, path) {
  /** @type {Map<string, number>} */
  const from = new Map();
  let total = 0;
  for (const line of porcelain.split("\n")) {
    if (!line.startsWith("filename ")) continue;
    total++;
    const origin = unquoteGitPath(line.slice(9));
    if (origin !== path) from.set(origin, (from.get(origin) ?? 0) + 1);
  }
  return { total, from };
}

/**
 * R10-5: three more settings, so a user's own configuration cannot change what blame and log print: `core.quotepath=off`
 * (paths print as they are, not as octal escapes), `log.showSignature=false` (no signature text inside log output) and
 * `color.ui=never` (no colour codes). They are plain configuration names and change no number.
 */
const GIT_SETTINGS = ["-c", "core.precomposeunicode=false", "-c", "core.quotepath=off", "-c", "log.showSignature=false", "-c", "color.ui=never"];

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
 * @param {{ input?: string, binary?: boolean, timeout?: number }} [opts] text for stdin; binary returns the bytes as a latin1 string; timeout in milliseconds kills the call
 */
async function git(args, cwd, opts = {}) {
  const full = [...GIT_SETTINGS, ...args];
  if (opts.input === undefined && !opts.binary) {
    const { stdout } = await execFileP("git", full, { cwd, maxBuffer: 1024 * 1024 * 512, encoding: "utf8", ...(opts.timeout ? { timeout: opts.timeout } : {}) });
    return stdout;
  }
  // Objects read through `cat-file --batch` are raw bytes. They come back as a latin1 string, one character per byte,
  // so the sizes git prints are positions in it; each blob is decoded as UTF-8 afterwards.
  return new Promise((resolveRun, reject) => {
    const child = spawn("git", full, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    /** @type {Buffer[]} */
    const chunks = [];
    /** @type {Buffer[]} */
    const errs = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => errs.push(c));
    child.on("error", reject);
    // An early exit closes the pipe under a pending write; the exit code carries the failure.
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      if (code === 0) resolveRun(Buffer.concat(chunks).toString(opts.binary ? "latin1" : "utf8"));
      else reject(new Error(Buffer.concat(errs).toString("utf8").trim() || `git exited with ${code}`));
    });
    child.stdin.end(opts.input ?? "");
  });
}

/**
 * The oldest git this runs correctly on. The newest flag in use sets it: `git rev-parse
 * --is-shallow-repository`, added in git 2.15.0 (Documentation/RelNotes/2.15.0.adoc). An older git
 * does not fail on that flag, it echoes it back, so a shallow clone would read as a full one and
 * produce the wrong numbers this check exists to stop. The other flags are older: `blame
 * --line-porcelain` came in 1.7.6, `-c name=value` in 1.7.2, `core.precomposeunicode` in 1.7.12.
 */
export const MIN_GIT = [2, 15];

/**
 * The refusal for a git older than MIN_GIT, or null when this version is fine or cannot be read.
 * @param {string} versionOutput what `git --version` printed
 * @returns {string | null}
 */
export function gitVersionProblem(versionOutput) {
  const m = /git version (\d+)\.(\d+)(?:\.(\d+))?/.exec(versionOutput);
  if (!m) return null;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  if (major > MIN_GIT[0] || (major === MIN_GIT[0] && minor >= MIN_GIT[1])) return null;
  return `git ${MIN_GIT.join(".")} or newer is required (found ${m[1]}.${m[2]}${m[3] === undefined ? "" : `.${m[3]}`})`;
}

/**
 * The oldest git that has `git blame --ignore-revs-file`, added in git 2.23.0 (Documentation/RelNotes/2.23.0.txt:
 * "git blame" learned to ignore commits). MIN_GIT stays 2.15 because the rest of the tool runs there; only a run
 * that actually passes the flag needs this.
 */
export const MIN_GIT_IGNORE_REVS = [2, 23];

/**
 * True when this git can take --ignore-revs-file, or when its version cannot be read (the same benefit of the
 * doubt gitVersionProblem gives).
 * @param {string} versionOutput what `git --version` printed
 */
export function supportsIgnoreRevs(versionOutput) {
  const m = /git version (\d+)\.(\d+)/.exec(versionOutput);
  if (!m) return true;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > MIN_GIT_IGNORE_REVS[0] || (major === MIN_GIT_IGNORE_REVS[0] && minor >= MIN_GIT_IGNORE_REVS[1]);
}

/**
 * The ignore-revs file this run passes to git blame, or null for none. An explicit file must exist.
 * Otherwise the repository's own .git-blame-ignore-revs is used when present. `display` is the name
 * printed in the output (so a result does not carry a temporary path); `path` is what git reads.
 * @param {Options} o
 * @param {string} versionOutput
 * @returns {Promise<{ display: string, path: string } | null>}
 */
async function resolveIgnoreRevs(o, versionOutput) {
  if (o.noIgnoreRevs) return null;
  /** @type {{ display: string, path: string }} */
  let chosen;
  if (o.ignoreRevsFile !== undefined) {
    chosen = { display: o.ignoreRevsFile, path: resolve(o.cwd, o.ignoreRevsFile) };
    if (!existsSync(chosen.path)) throw new Error(`--ignore-revs-file ${o.ignoreRevsFile} does not exist`);
  } else {
    const top = (await git(["rev-parse", "--show-toplevel"], o.cwd)).trim();
    const candidate = join(top, ".git-blame-ignore-revs");
    if (!existsSync(candidate)) return null;
    chosen = { display: ".git-blame-ignore-revs", path: candidate };
  }
  if (!supportsIgnoreRevs(versionOutput)) {
    throw new Error(`${chosen.display} needs git ${MIN_GIT_IGNORE_REVS.join(".")} or newer to be used (git blame --ignore-revs-file); upgrade git or pass --no-ignore-revs`);
  }
  return chosen;
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
  const notBlamable = await listNonRegularPaths(o);
  /** @type {{ path: string, lines: number }[]} */
  const files = [];
  // -z output: "added\tdeleted\tpath\0" for plain entries; renames cannot occur against the empty tree.
  for (const rec of out.split("\0")) {
    if (!rec) continue;
    const [added, , path] = rec.split("\t");
    if (added === "-" || path === undefined || notBlamable.has(path)) continue;
    files.push({ path, lines: Number(added) });
  }
  return files;
}

/**
 * The paths at the ref that are a git submodule (mode 160000) or a symbolic link (mode 120000), from one `git ls-tree`
 * call. `git diff --numstat` lists both as one-line text files, but neither has lines of its own to blame: git blame
 * stops with "no such path" on a submodule, and a symbolic link would count its target's name as one written line.
 * Every file list of a run comes from listTextFiles, so leaving them out there keeps every later step away from them.
 * @param {Options} o
 * @returns {Promise<Set<string>>}
 */
async function listNonRegularPaths(o) {
  const out = await git(["ls-tree", "-r", "-z", o.ref], o.cwd);
  /** @type {Set<string>} */
  const paths = new Set();
  // -z output: "mode type sha\tpath\0".
  for (const rec of out.split("\0")) {
    const tab = rec.indexOf("\t");
    if (tab < 0) continue;
    const mode = rec.slice(0, rec.indexOf(" "));
    if (mode === "160000" || mode === "120000") paths.add(rec.slice(tab + 1));
  }
  return paths;
}

/** File names of dependency lockfiles. A lockfile is written by a tool, so whoever committed it did not write its lines. */
const LOCKFILE_NAMES = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "cargo.lock", "gemfile.lock", "poetry.lock",
  "pipfile.lock", "composer.lock", "go.sum", "podfile.lock", "pubspec.lock", "flake.lock", "mix.lock", "packages.lock.json", "gradle.lockfile",
  "package.resolved", "cartfile.resolved", "uv.lock", "conan.lock",
  "pdm.lock", "pixi.lock", "deno.lock", "gopkg.lock", "glide.lock", "module.bazel.lock", ".terraform.lock.hcl", "bun.lockb",
]);

/** Directory names that hold code copied in from somewhere else. Compared in lower case. */
const VENDOR_DIRS = new Set(["vendor", "vendored", "third_party", "third-party", "node_modules", "bower_components", "extern", "external"]);

/** A marker in the first lines of a file that says a tool wrote it. */
const GENERATED_MARKER = "@generated|DO NOT EDIT|Code generated|[Aa]uto-?[Gg]enerated";
const GENERATED_MARKER_LINES = 10;

/** The kinds of file that are left out, in the order the output lists them. */
const DROP_CLASSES = ["lockfile", "generated", "vendored", "binary"];

/**
 * Extensions of document and image formats that are binary but that git's own probe (a NUL in the first 8000 bytes)
 * can miss. Only a fallback for when `git grep -P` cannot look inside the files; compared in lower case.
 */
const BINARY_EXTENSION = /\.(?:ai|eps|psd|pdf|br)$/i;

/**
 * The paths at the ref whose content holds a NUL byte, which no text file does. `git diff --numstat` calls a file binary
 * only when a NUL sits in its first 8000 bytes, so a file with its first NUL later is listed as text and its bytes are
 * counted as lines. One `git grep` over the tree; empty when this git has no Perl-compatible regular expressions, in
 * which case only the extension list applies.
 * @param {Options} o
 * @returns {Promise<Set<string>>}
 */
async function readNulFiles(o) {
  const tree = (await git(["rev-parse", "--verify", `${o.ref}^{tree}`], o.cwd)).trim();
  /** @type {Set<string>} */
  const found = new Set();
  let out;
  try {
    out = await git(["grep", "-l", "-a", "-z", "-P", "\\x00", tree, "--", ...o.paths], o.cwd);
  } catch {
    return found;
  }
  for (const rec of out.split("\0")) if (rec.startsWith(`${tree}:`)) found.add(rec.slice(tree.length + 1));
  return found;
}

/**
 * The class a path falls in by its name alone, or null. `root` is what the output names: the vendor directory for
 * vendored code, the file itself otherwise.
 * @param {string} path
 * @returns {{ kind: "lockfile" | "generated" | "vendored", root: string } | null}
 */
export function classifyPath(path) {
  const parts = path.split("/");
  const base = parts[parts.length - 1];
  const dir = parts.slice(0, -1).findIndex((p) => VENDOR_DIRS.has(p.toLowerCase()) || p === "Pods");
  if (dir >= 0) return { kind: "vendored", root: parts.slice(0, dir + 1).join("/") };
  if (LOCKFILE_NAMES.has(base.toLowerCase())) return { kind: "lockfile", root: path };
  if (/\.min\.[^./]+$/i.test(base) || /\.map$/i.test(base)) return { kind: "generated", root: path };
  return null;
}

/**
 * What the .gitattributes files at the ref say about each path: linguist-generated and linguist-vendored, set (true) or
 * unset (false). A deeper file wins over a shallower one and a later line over an earlier one. Read from the ref, not
 * from the working tree, so the answer is the same for any checkout.
 * @param {Options} o
 * @param {{ path: string }[]} files every file of the ref
 * @returns {Promise<Map<string, { generated?: boolean, vendored?: boolean }>>}
 */
async function readLinguistAttributes(o, files) {
  const isAttr = (/** @type {string} */ p) => p === ".gitattributes" || p.endsWith("/.gitattributes");
  // A path given on the command line narrows `files`, but the rules that apply to those files may sit above them.
  const attrFiles = o.paths.length ? (await git(["ls-tree", "-r", "--name-only", o.ref], o.cwd)).split("\n").filter(isAttr) : files.map((f) => f.path).filter(isAttr);
  attrFiles.sort((x, y) => x.split("/").length - y.split("/").length || x.localeCompare(y));
  /** @type {{ dir: string, re: RegExp, bare: boolean, generated?: boolean, vendored?: boolean }[]} */
  const rules = [];
  for (const file of attrFiles) {
    let text;
    try {
      text = await git(["show", `${o.ref}:${file}`], o.cwd);
    } catch {
      continue;
    }
    const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith('"') || line.startsWith("[attr]")) continue;
      const [pattern, ...attrs] = line.split(/\s+/);
      /** @type {{ generated?: boolean, vendored?: boolean }} */
      const set = {};
      for (const a of attrs) {
        const m = /^(-|!)?linguist-(generated|vendored)(?:=(.*))?$/.exec(a);
        if (!m) continue;
        const value = m[1] ? false : m[3] === undefined ? true : !/^(false|0|no|off)$/i.test(m[3]);
        if (m[1] === "!") continue;
        set[/** @type {"generated" | "vendored"} */ (m[2])] = value;
      }
      if (set.generated === undefined && set.vendored === undefined) continue;
      const anchored = pattern.replace(/\/+$/, "").includes("/");
      rules.push({ dir, re: globToRegExp(pattern.replace(/^\//, "").replace(/\/+$/, "")), bare: !anchored, ...set });
    }
  }
  /** @type {Map<string, { generated?: boolean, vendored?: boolean }>} */
  const out = new Map();
  if (rules.length === 0) return out;
  for (const f of files) {
    for (const r of rules) {
      if (!f.path.startsWith(r.dir)) continue;
      const rel = f.path.slice(r.dir.length);
      if (!(r.bare ? r.re.test(rel.slice(rel.lastIndexOf("/") + 1)) : r.re.test(rel))) continue;
      const have = out.get(f.path) ?? {};
      if (r.generated !== undefined) have.generated = r.generated;
      if (r.vendored !== undefined) have.vendored = r.vendored;
      out.set(f.path, have);
    }
  }
  return out;
}

/**
 * The text files whose first lines carry a generated-file marker. One `git grep` over the tree; a file with no match
 * (or no text) simply does not come back.
 * @param {Options} o
 * @returns {Promise<Set<string>>}
 */
async function readGeneratedMarkers(o) {
  const tree = (await git(["rev-parse", "--verify", `${o.ref}^{tree}`], o.cwd)).trim();
  /** @type {Set<string>} */
  const marked = new Set();
  let out;
  try {
    out = await git(["grep", "-n", "-z", "-I", "-E", "-e", GENERATED_MARKER, tree, "--", ...o.paths], o.cwd);
  } catch {
    return marked;
  }
  for (const rec of out.split("\n")) {
    const a = rec.indexOf("\0");
    const b = a < 0 ? -1 : rec.indexOf("\0", a + 1);
    if (b < 0) continue;
    if (Number(rec.slice(a + 1, b)) <= GENERATED_MARKER_LINES) marked.add(rec.slice(tree.length + 1, a));
  }
  return marked;
}

/**
 * Split the files into those that count and those left out as lockfiles, generated files, vendored code and binary files that git's probe took for text. By path and
 * file content only, never by author. With --keep-generated nothing is left out.
 * @param {Options} o
 * @param {{ path: string, lines: number }[]} files the files the --include and --exclude globs let through
 * @param {{ path: string }[]} everyFile every file of the ref, for the .gitattributes files
 */
export async function dropGenerated(o, files, everyFile) {
  /** @type {{ path: string, lines: number }[]} */
  const kept = [];
  const dropped = {
    applied: !o.keepGenerated,
    files: 0,
    lines: 0,
    classes: Object.fromEntries(DROP_CLASSES.map((k) => [k, { files: 0, lines: 0 }])),
    /** @type {{ path: string, class: string, files: number, lines: number }[]} */
    paths: [],
    otherPaths: 0,
  };
  if (o.keepGenerated) return { kept: files, dropped };
  const attrs = await readLinguistAttributes(o, everyFile);
  const markers = await readGeneratedMarkers(o);
  const nulFiles = await readNulFiles(o);
  /** @type {Map<string, { path: string, class: string, files: number, lines: number }>} */
  const byRoot = new Map();
  for (const f of files) {
    const attr = attrs.get(f.path) ?? {};
    const byPath = classifyPath(f.path);
    /** @type {{ kind: string, root: string } | null} */
    let hit = null;
    if (attr.vendored === true) hit = { kind: "vendored", root: f.path };
    else if (attr.generated === true) hit = { kind: "generated", root: f.path };
    else if (byPath && !(byPath.kind === "vendored" ? attr.vendored === false : attr.generated === false)) hit = byPath;
    else if (markers.has(f.path) && attr.generated !== false) hit = { kind: "generated", root: f.path };
    else if (nulFiles.has(f.path) || BINARY_EXTENSION.test(f.path)) hit = { kind: "binary", root: f.path };
    if (!hit) {
      kept.push(f);
      continue;
    }
    dropped.files++;
    dropped.lines += f.lines;
    const c = dropped.classes[hit.kind];
    c.files++;
    c.lines += f.lines;
    const key = `${hit.kind}\0${hit.root}`;
    const e = byRoot.get(key) ?? { path: hit.root, class: hit.kind, files: 0, lines: 0 };
    e.files++;
    e.lines += f.lines;
    byRoot.set(key, e);
  }
  const ranked = [...byRoot.values()].sort((x, y) => y.lines - x.lines || x.path.localeCompare(y.path));
  dropped.paths = ranked.slice(0, 10);
  dropped.otherPaths = Math.max(0, ranked.length - 10);
  return { kept, dropped };
}

/**
 * The line that says what was left out, or null when nothing was.
 * @param {{ dropped?: { applied: boolean, files: number, lines: number, classes: Record<string, { files: number, lines: number }>, paths: { path: string, files: number, lines: number }[], otherPaths: number } }} r
 * @returns {string | null}
 */
export function droppedLine(r) {
  const d = r.dropped;
  if (!d || !d.applied || d.files === 0) return null;
  const n = (/** @type {number} */ x, /** @type {string} */ noun) => `${x.toLocaleString("en-US")} ${noun}${x === 1 ? "" : "s"}`;
  const classes = DROP_CLASSES.filter((k) => d.classes[k]?.files).map((k) => `${k} ${n(d.classes[k].files, "file")} ${n(d.classes[k].lines, "line")}`);
  const paths = d.paths.slice(0, 3).map((p) => `${p.path} (${n(p.lines, "line")})`);
  const more = d.paths.length - paths.length + d.otherPaths;
  return `dropped: ${n(d.files, "file")}, ${n(d.lines, "line")} left out of every number (${classes.join(", ")}); largest: ${paths.join(", ")}${more > 0 ? `, and ${more} more` : ""}. --keep-generated counts them`;
}

/**
 * Run git with text on stdin and return what it printed.
 * @param {string[]} args
 * @param {string} input
 * @param {string} cwd
 * @returns {Promise<string>}
 */
function gitWithInput(args, input, cwd) {
  return new Promise((resolveOut, reject) => {
    const child = spawn("git", [...GIT_SETTINGS, ...args], { cwd });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolveOut(out) : reject(new Error(err.trim() || `git exited ${code}`))));
    child.stdin.end(input);
  });
}

/**
 * Trailers of every commit that has any, keyed by commit id.
 * @param {Options} o
 * @returns {Promise<Map<string, ReturnType<typeof parseTrailers>>>}
 */
async function readTrailers(o) {
  const out = await git(["log", "--format=%H%x1f%B%x1e", o.ref], o.cwd);
  /** @type {Map<string, ReturnType<typeof parseTrailers>>} */
  const byCommit = new Map();
  for (const record of out.split("\x1e")) {
    const [sha, message] = record.replace(/^\n/, "").split("\x1f");
    if (!sha || message === undefined) continue;
    const t = parseTrailers(message);
    if (t.coAuthors.length || t.assistedBy.length) byCommit.set(sha, t);
  }
  return byCommit;
}

/**
 * The commits the commit-share side counted, with their authors, in the same window and pathspec.
 * @param {Options} o
 * @returns {Promise<{ sha: string, mail: string, name: string }[]>}
 */
async function readWindowCommits(o) {
  const args = ["log", "--no-merges", "--format=%H%x09%aE%x09%aN", o.ref];
  if (o.since) args.push(`--since=${o.since}`);
  if (o.until) args.push(`--until=${o.until}`);
  args.push("--", ...o.paths);
  const out = await git(args, o.cwd);
  return out
    .split("\n")
    .filter(Boolean)
    .map((/** @type {string} */ line) => {
      const [sha, mail, name] = line.split("\t");
      return { sha, mail: mail.toLowerCase(), name };
    });
}

/**
 * Pass identities through the repository's .mailmap with `git check-mailmap`, so a trailer written with an
 * old address is credited to the same person as a commit written with the new one.
 * @param {string} cwd
 * @param {{ name: string, mail: string }[]} people
 * @returns {Promise<{ name: string, mail: string }[]>}
 */
async function mapIdentities(cwd, people) {
  if (people.length === 0) return [];
  const out = await gitWithInput(["check-mailmap", "--stdin"], people.map((p) => `${p.name} <${p.mail}>`).join("\n") + "\n", cwd);
  const mapped = out.split("\n").filter(Boolean);
  return people.map((p, i) => {
    const m = /^(.*?)\s*<([^>]*)>$/.exec(mapped[i] ?? "");
    return m ? { name: m[1], mail: m[2].toLowerCase() } : p;
  });
}

/** @param {number} x */
const round6 = (x) => Math.round(x * 1e6) / 1e6;

/**
 * `--co-authors share`: each blamed commit's lines, and each window commit, are split equally between its author
 * and the distinct identities in its Co-authored-by trailers. The totals do not change, only who holds them.
 * @param {Map<string, { name: string, mail: string, lines: number }>} blamed lines per blamed commit
 * @param {{ sha: string, mail: string, name: string }[]} window
 * @param {Map<string, { name: string, mail: string }[]>} coAuthorsOf mapped co-authors per commit id
 * @returns {Map<string, { name: string, lines: number, commits: number }>}
 */
export function shareCredit(blamed, window, coAuthorsOf) {
  /** @type {Map<string, { name: string, lines: number, commits: number }>} */
  const out = new Map();
  /** @param {string} sha @param {{ name: string, mail: string }} author */
  const people = (sha, author) => {
    const all = [author];
    for (const c of coAuthorsOf.get(sha) ?? []) if (!all.some((p) => p.mail === c.mail)) all.push(c);
    return all;
  };
  /** @param {{ name: string, mail: string }} p @param {number} lines @param {number} commits */
  const add = (p, lines, commits) => {
    const e = out.get(p.mail) ?? { name: p.name, lines: 0, commits: 0 };
    e.lines += lines;
    e.commits += commits;
    out.set(p.mail, e);
  };
  for (const [sha, b] of blamed) {
    const all = people(sha, { name: b.name, mail: b.mail });
    for (const p of all) add(p, b.lines / all.length, 0);
  }
  for (const c of window) {
    const all = people(c.sha, { name: c.name, mail: c.mail });
    for (const p of all) add(p, 0, 1 / all.length);
  }
  for (const e of out.values()) {
    e.lines = round6(e.lines);
    e.commits = round6(e.commits);
  }
  return out;
}

/**
 * The bus factor: the smallest number of authors whose lines together reach thresholdPercent of the lines counted.
 * The comparison is multiplied out (no division), so an exact tie at the threshold counts as reached. Fractional lines
 * from --co-authors share are rounded before they are compared, the same way the shares are.
 * @param {{ author: string, lines: number }[]} lineCounts the authors, most lines first (ties by address)
 * @param {number} thresholdPercent above 0 and at most 100
 * @returns {{ value: number, authors: string[], covered: number, total: number } | null} null when no lines were counted
 */
export function busFactor(lineCounts, thresholdPercent) {
  const total = round6(lineCounts.reduce((sum, a) => sum + a.lines, 0));
  if (total <= 0) return null;
  let sum = 0;
  for (let k = 0; k < lineCounts.length; k++) {
    sum += lineCounts[k].lines;
    if (round6(sum) * 100 >= thresholdPercent * total) {
      return { value: k + 1, authors: lineCounts.slice(0, k + 1).map((a) => a.author), covered: round6(round6(sum) / total), total };
    }
  }
  return null;
}

/**
 * Turn the per-group tallies into rows: bots out of the group's denominator (unless asked for),
 * authors by lines then address, groups by lines then name. A group's file count is every sampled
 * file in it, including a file whose lines all went to a bot, so a group resting on one file shows.
 * @param {Map<string, { files: number, authors: Map<string, { name: string, lines: number }> }>} acc
 * @param {boolean} includeBots
 * @param {number} thresholdPercent the --bus-factor-threshold the group's bus factor is measured with
 */
function buildGroups(acc, includeBots, thresholdPercent) {
  return [...acc.entries()]
    .map(([key, g]) => {
      const kept = [...g.authors.entries()].filter(([mail, a]) => includeBots || !isBotIdentity(a.name, mail));
      const lines = kept.reduce((sum, [, a]) => sum + a.lines, 0);
      const authors = kept
        .map(([mail, a]) => ({ author: a.name, mail, lines: a.lines, lineShare: lines ? a.lines / lines : 0 }))
        .sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail));
      const bf = busFactor(authors, thresholdPercent);
      return { key, filesSampled: g.files, lines, authors, busFactor: bf && { thresholdPercent, ...bf } };
    })
    .sort((x, y) => y.lines - x.lines || x.key.localeCompare(y.key));
}

/**
 * The full ids of the --ignore-rev values, in the order given. A value that is not a commit stops the run: dropped
 * silently, it would leave the numbers counting a commit the user meant to skip.
 * @param {Options} o
 * @param {string} versionOutput
 * @returns {Promise<string[]>}
 */
async function resolveUserRevs(o, versionOutput) {
  if (o.ignoreRevs.length === 0) return [];
  if (!supportsIgnoreRevs(versionOutput)) {
    throw new Error(`--ignore-rev needs git ${MIN_GIT_IGNORE_REVS.join(".")} or newer (git blame --ignore-rev); upgrade git`);
  }
  /** @type {string[]} */
  const ids = [];
  for (const rev of o.ignoreRevs) {
    try {
      ids.push((await git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], o.cwd)).trim());
    } catch {
      throw new Error(`--ignore-rev ${rev} does not resolve to a commit`);
    }
  }
  return ids;
}

/**
 * One `git blame` per sampled file, run by a pool of --jobs workers. Returns the lines per author, the attributed
 * total, the per-group tallies when grouping, and the lines per blamed commit, which co-authors, the AI breakdown and
 * reformat detection read.
 * @param {Options} o
 * @param {{ path: string, lines: number }[]} sampled
 * @param {string[]} blameArgs
 * @param {{ kind: "dir", depth: number } | { kind: "ext" } | null} grouping
 * @param {{ write(text: string): unknown } | null} progress where progress lines go, or null for none
 */
async function blamePass(o, sampled, blameArgs, grouping, progress) {
  /** @type {Map<string, { name: string, lines: number, commits: number, withBlank?: number }>} */
  const authors = new Map();
  let attributed = 0;
  /** @type {Map<string, { files: number, authors: Map<string, { name: string, lines: number }> }>} */
  const groupAcc = new Map();
  /** @type {Map<string, { name: string, mail: string, lines: number }>} */
  const blamedByCommit = new Map();
  let cursor = 0;
  let completed = 0;
  const total = sampled.length;
  /** @type {Map<string, ReturnType<typeof countBlameOrigins>>} */
  const origins = new Map();
  const wantOrigins = o.reviewers !== undefined || o.history !== undefined;
  const followsCopies = blameArgs.includes("-C");
  /** Files where a line's origin path differs from the path blamed: copy detection (or a rename) credited them. Their counts, to compare. */
  /** @type {Map<string, Map<string, { name: string, lines: number }>>} */
  const copiedFiles = new Map();
  /** The counts per file of a pass without -C, for the comparison with copiedFiles. */
  /** @type {Map<string, Map<string, { name: string, lines: number }>>} */
  const fileCounts = new Map();
  /** R10-1: every blame line per address, blank lines included. */
  /** @type {Map<string, number>} */
  const withBlankOf = new Map();
  /** R10-2: the counts per file of this pass, whatever the copy flags; perFileRaw counts the blank lines too (R10-3). */
  /** @type {Map<string, Map<string, { name: string, lines: number, fullName?: string }>>} */
  const perFile = new Map();
  /** @type {Map<string, Map<string, { name: string, lines: number, fullName?: string }>>} */
  const perFileRaw = new Map();
  /** The index of the file that gave each address its name: blames finish in any order, so the name is the first file's. */
  /** @type {Map<string, { idx: number, rank: number }>} */
  const nameFrom = new Map();
  const worker = async () => {
    while (cursor < sampled.length) {
      const idx = cursor++;
      const file = sampled[idx];
      const raw = await git([...blameArgs, o.ref, "--", file.path], o.cwd);
      const out = dropBlankBlameLines(raw);
      // R9-13: the size with its blank lines, stated beside the non-blank size.
      file.withBlank = (raw.match(/^filename /gm) ?? []).length;
      const counts = countBlameLines(out);
      perFile.set(file.path, counts);
      const rawCounts = out.length === raw.length ? counts : countBlameLines(raw);
      perFileRaw.set(file.path, rawCounts);
      for (const [mail, { lines }] of rawCounts) withBlankOf.set(mail, (withBlankOf.get(mail) ?? 0) + lines);
      // The file's size as the table counts it: without its blank lines.
      file.lines = (out.match(/^filename /gm) ?? []).length;
      if (!followsCopies) fileCounts.set(file.path, counts);
      if (followsCopies) {
        for (const m of out.matchAll(/^filename (.+)$/gm)) {
          if (unquoteGitPath(m[1]) !== file.path) {
            copiedFiles.set(file.path, counts);
            break;
          }
        }
      }
      if (wantOrigins) origins.set(file.path, countBlameOrigins(out, file.path));
      for (const [mail, { name, lines, fullName }] of counts) {
        const a = authors.get(mail) ?? { name, lines: 0, commits: 0 };
        // R9-14: an address that committed under a handle and under a personal name is shown by the personal name.
        const best = fullName ?? name;
        const rank = fullName !== undefined ? 0 : 1;
        const had = nameFrom.get(mail);
        if (had === undefined || rank < had.rank || (rank === had.rank && idx < had.idx)) {
          a.name = best;
          nameFrom.set(mail, { idx, rank });
        }
        a.lines += lines;
        attributed += lines;
        authors.set(mail, a);
      }
      for (const [sha, c] of countBlameByCommit(out)) {
        const e = blamedByCommit.get(sha) ?? { name: c.name, mail: c.mail, lines: 0 };
        e.lines += c.lines;
        blamedByCommit.set(sha, e);
      }
      if (grouping) {
        const key = groupKey(file.path, grouping);
        const g = groupAcc.get(key) ?? { files: 0, authors: new Map() };
        g.files++;
        for (const [mail, { name, lines }] of counts) {
          const a = g.authors.get(mail) ?? { name, lines: 0 };
          a.lines += lines;
          g.authors.set(mail, a);
        }
        groupAcc.set(key, g);
      }
      completed++;
      if (progress) {
        progress.write(`\rblamed ${completed}/${total} files`);
        if (completed === total) progress.write("\n");
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(o.jobs, sampled.length || 1) }, worker));
  for (const [mail, a] of authors) a.withBlank = withBlankOf.get(mail) ?? a.lines;
  return { authors, attributed, groupAcc, blamedByCommit, origins, copiedFiles, fileCounts, perFile, perFileRaw };
}

/**
 * What copy detection changed: the files it credited to another path are blamed again with the same arguments minus
 * -C, and each author's lines in those files are compared. Null when no file was credited to another path or the
 * second blame gives the same lines.
 * @param {Options} o
 * @param {{ path: string, lines: number }[]} sampled
 * @param {Map<string, Map<string, { name: string, lines: number }>>} copiedFiles the files the -C pass credited to another path, with its counts
 * @param {string[]} blameArgs the arguments of the pass that gave copiedFiles
 * @returns {Promise<{ files: number, delta: Map<string, { name: string, lines: number }> } | null>} lines with copy detection minus lines without, per address
 */
async function copyShiftOf(o, sampled, copiedFiles, blameArgs) {
  if (!copiedFiles.size) return null;
  const plain = await blamePass(o, sampled.filter((f) => copiedFiles.has(f.path)), blameArgs.filter((a) => a !== "-C"), null, null);
  /** @type {Map<string, { name: string, lines: number }>} */
  const delta = new Map();
  const add = (/** @type {string} */ mail, /** @type {string} */ name, /** @type {number} */ lines) => {
    const d = delta.get(mail) ?? { name, lines: 0 };
    d.lines += lines;
    delta.set(mail, d);
  };
  // A file whose origin path differs only through a rename gives the same counts without -C: it is not counted as changed.
  let changedFiles = 0;
  for (const [path, counts] of copiedFiles) {
    const without = plain.fileCounts.get(path) ?? new Map();
    let changed = counts.size !== without.size;
    for (const [mail, c] of counts) if (without.get(mail)?.lines !== c.lines) changed = true;
    if (changed) changedFiles++;
    for (const [mail, c] of counts) add(mail, c.name, c.lines);
    for (const [mail, a] of without) add(mail, a.name, -a.lines);
  }
  for (const [mail, d] of delta) if (d.lines === 0) delta.delete(mail);
  return delta.size ? { files: changedFiles, delta } : null;
}

/**
 * The note data: the three people whose share moved most because of copy detection, each with the figure with it and
 * the figure without it, on the table's own basis (bots left out the way the table leaves them out, addresses merged
 * when the rows are).
 * @param {Options} o
 * @param {NonNullable<Awaited<ReturnType<typeof copyShiftOf>>>} shift
 * @param {{ author: string, mail: string, lines: number }[]} rows the table's rows
 * @param {number} attributed the table's line total
 * @param {Map<string, { mail: string }>} canonicalOf
 * @param {string} flags the copy detection flags in use
 */
function copyEffectOf(o, shift, rows, attributed, canonicalOf, flags) {
  /** @type {Map<string, { name: string, lines: number }>} */
  const byPerson = new Map();
  let counted = 0;
  let moved = 0;
  for (const [mail, d] of shift.delta) {
    if (!o.includeBots && isBotIdentity(d.name, mail)) continue;
    const key = canonicalOf.get(mail)?.mail ?? mail;
    const p = byPerson.get(key) ?? { name: d.name, lines: 0 };
    p.lines += d.lines;
    byPerson.set(key, p);
    counted += d.lines;
    if (d.lines > 0) moved += d.lines;
  }
  const without = attributed - counted;
  const people = [...byPerson]
    .filter(([, p]) => p.lines !== 0)
    .map(([mail, p]) => {
      const row = rows.find((x) => x.mail === mail);
      const lines = row?.lines ?? 0;
      const linesWithout = lines - p.lines;
      return {
        author: row?.author ?? p.name,
        mail,
        lines,
        lineShare: attributed ? lines / attributed : 0,
        linesWithout,
        lineShareWithout: without ? linesWithout / without : 0,
      };
    })
    .sort((x, y) => Math.abs(y.lineShare - y.lineShareWithout) - Math.abs(x.lineShare - x.lineShareWithout) || x.mail.localeCompare(y.mail))
    .slice(0, 3);
  return people.length ? { flags, files: shift.files, lines: moved, people } : null;
}

/** Extensions of the languages where `'x'` and `"x"` are the same string, so a quote change is layout there. */
const QUOTE_FOLD_EXTENSIONS = new Set(["js", "jsx", "mjs", "cjs", "ts", "tsx", "py", "json", "css", "scss", "vue", "svelte"]);

/**
 * The text with every whitespace character removed and, for the languages where it is safe, every single quote made
 * double. Two versions that differ only in this are one program in another layout. Comments, semicolons and
 * backticks stay: they are not layout, so a change to them is a change to the code.
 *
 * The quote fold needs the file's language: in a shell script `'$HOME'` and `"$HOME"` are different programs. With a
 * path, the fold applies only to the extensions in QUOTE_FOLD_EXTENSIONS and every other file folds whitespace alone.
 * Without a path both folds apply.
 * @param {string} text
 * @param {string} [path]
 */
export function normaliseForFormat(text, path) {
  const squeezed = text.replace(/\s+/g, "");
  if (path !== undefined) {
    const dot = path.lastIndexOf(".");
    const ext = dot > path.lastIndexOf("/") ? path.slice(dot + 1).toLowerCase() : "";
    if (!QUOTE_FOLD_EXTENSIONS.has(ext)) return squeezed;
  }
  return squeezed.replace(/'/g, '"');
}

/**
 * True when two texts differ, and differ only in layout or quote style (see normaliseForFormat).
 * @param {string} before
 * @param {string} after
 * @param {string} [path] the file both texts belong to; it decides whether a quote change counts as layout
 */
export function isFormatOnlyChange(before, after, path) {
  return before !== after && normaliseForFormat(before, path) === normaliseForFormat(after, path);
}

/** A blamed commit must own this many surviving lines to be a reformat candidate ... */
const REFORMAT_MIN_LINES = 20;
/** ... or this share of the attributed lines. */
const REFORMAT_SHARE = 0.05;
/** At most this many candidates are examined, most surviving lines first. */
const REFORMAT_MAX_CANDIDATES = 40;
/** A commit that changes more files than this is not judged: it is too large to read as a reformat. */
const REFORMAT_MAX_FILES = 1000;
/** A commit whose changed files (both sides) add up to more bytes than this is not judged either. */
const REFORMAT_MAX_BYTES = 20 * 1024 * 1024;
/** All candidates together read at most this many bytes; the ones with the most surviving lines come first. */
const REFORMAT_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/**
 * What one log call gives for a commit: parents, date, subject, and the changed files with their blob ids and counts.
 * @typedef {{ parents: string[], date: string, subject: string, files: { status: string, path: string, before: string, after: string }[], counts: Map<string, { binary: boolean, changed: number }> }} CommitFacts
 */

/**
 * The facts of the given commits from ONE `git log --no-walk` call. `--raw` and `--numstat` together give each changed
 * file's status, both blob ids and its line counts; -z keeps a path with a newline or a tab whole. A commit missing
 * from the output (git failed, or answered nothing) is simply absent from the map.
 * @param {GitRun} run
 * @param {string[]} shas
 * @returns {Promise<Map<string, CommitFacts>>}
 */
async function readCommitFacts(run, shas) {
  /** @type {Map<string, CommitFacts>} */
  const facts = new Map();
  if (!shas.length) return facts;
  const out = await run(["log", "--no-walk=unsorted", "-z", "--raw", "--numstat", "--no-renames", "--no-abbrev", "-r", "--date=short", "--format=%x1e%H%x1f%P%x1f%ad%x1f%s", ...shas]);
  for (const chunk of out.split("\x1e")) {
    if (!chunk) continue;
    const nul = chunk.indexOf("\0");
    const head = (nul < 0 ? chunk : chunk.slice(0, nul)).split("\x1f");
    if (head.length < 4) continue;
    const [sha, parents, date, ...subject] = head;
    /** @type {CommitFacts["files"]} */
    const files = [];
    /** @type {CommitFacts["counts"]} */
    const counts = new Map();
    const tokens = nul < 0 ? [] : chunk.slice(nul + 1).replace(/^\n/, "").split("\0");
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.startsWith(":")) {
        const [, , before, after, status] = t.split(" ");
        files.push({ status, path: tokens[++i] ?? "", before, after });
      } else if (t) {
        const [added, deleted, ...rest] = t.split("\t");
        const binary = added === "-";
        counts.set(rest.join("\t"), { binary, changed: binary ? 0 : Number(added) + Number(deleted) });
      }
    }
    facts.set(sha, { parents: parents.split(" ").filter(Boolean), date, subject: subject.join("\x1f"), files, counts });
  }
  return facts;
}

/**
 * The text of the given blobs, read through ONE `git cat-file --batch` process. A first `--batch-check` gives the sizes,
 * so a blob is never read for a commit that is over the byte cap. A blob git could not give is absent from the map.
 * @param {GitRun} run
 * @param {Map<string, string[]>} wanted candidate sha to the blob ids its comparison needs (ones over the cap are dropped from it)
 * @returns {Promise<{ blobs: Map<string, string>, tooLarge: Set<string> }>}
 */
async function readBlobs(run, wanted) {
  /** @type {Map<string, string>} */
  const blobs = new Map();
  /** @type {Set<string>} */
  const tooLarge = new Set();
  const all = [...new Set([...wanted.values()].flat())];
  if (!all.length) return { blobs, tooLarge };
  /** @type {Map<string, number>} */
  const sizes = new Map();
  for (const line of (await run(["cat-file", "--batch-check"], { input: `${all.join("\n")}\n` })).split("\n")) {
    const [oid, type, size] = line.split(" ");
    if (type === "blob") sizes.set(oid, Number(size));
  }
  // Without a size git did not answer (or the object is no blob): the commit is judged blob by blob instead, which
  // is slower and still correct.
  const keep = new Set();
  let total = 0;
  for (const [sha, oids] of wanted) {
    const bytes = oids.reduce((sum, oid) => sum + (sizes.get(oid) ?? 0), 0);
    if (bytes > REFORMAT_MAX_BYTES || total + bytes > REFORMAT_MAX_TOTAL_BYTES) {
      tooLarge.add(sha);
      continue;
    }
    total += bytes;
    for (const oid of oids) if (sizes.has(oid)) keep.add(oid);
  }
  if (!keep.size) return { blobs, tooLarge };
  const raw = await run(["cat-file", "--batch"], { input: `${[...keep].join("\n")}\n`, binary: true });
  let at = 0;
  while (at < raw.length) {
    const eol = raw.indexOf("\n", at);
    if (eol < 0) break;
    const [oid, type, size] = raw.slice(at, eol).split(" ");
    if (type !== "blob") {
      at = eol + 1;
      continue;
    }
    const end = eol + 1 + Number(size);
    blobs.set(oid, Buffer.from(raw.slice(eol + 1, end), "latin1").toString("utf8"));
    at = end + 1;
  }
  return { blobs, tooLarge };
}

/**
 * The changed lines of a commit when it is a reformat, or null when it is not. A reformat modifies files only (no add,
 * delete or rename), changes at least one text file, and every text file differs from its parent only in layout or
 * quote style. Binary files cannot be compared, so a commit that changed only binary files is not a reformat. A file
 * whose line count git does not give is not judged, so the commit is not a reformat either.
 * @param {CommitFacts} f
 * @param {(oid: string) => Promise<string | undefined>} blob the text of a blob id
 * @returns {Promise<{ filesChanged: number, changedLines: number } | null>}
 */
async function reformatLines(f, blob) {
  const files = f.files;
  if (files.length === 0 || files.length > REFORMAT_MAX_FILES) return null;
  if (files.some((x) => x.status !== "M")) return null;
  let textFiles = 0;
  let changedLines = 0;
  for (const file of files) {
    const c = f.counts.get(file.path);
    if (!c) return null;
    if (c.binary) continue;
    textFiles++;
    changedLines += c.changed;
    const before = await blob(file.before);
    const after = await blob(file.after);
    if (before === undefined || after === undefined || !isFormatOnlyChange(before, after, file.path)) return null;
  }
  return textFiles === 0 ? null : { filesChanged: files.length, changedLines };
}

/**
 * Runs git with the given arguments in the repository and returns its stdout.
 * @typedef {(args: string[], opts?: { input?: string, binary?: boolean }) => Promise<string>} GitRun
 */

/**
 * The commits the first blame pass gave lines to that are reformats: lines moved by layout or quote changes only.
 * Only blamed commits are candidates, so a commit the blame already skips (--ignore-rev or the ignore file) never
 * comes back. Detection is best effort: a git failure while judging one candidate means that candidate is not a
 * suspect, and the others are still judged. The run never stops for it.
 *
 * The cost does not grow with the candidates: one log call gives every commit's parents, subject, date, files and
 * counts, and one cat-file process gives the contents of every file that has to be compared. Only when a batched
 * answer is missing for a commit is that commit asked for alone. The judging itself runs through the --jobs limit.
 * @param {Options} o
 * @param {Map<string, { name: string, mail: string, lines: number }>} blamedByCommit
 * @param {number} blamedTotal the lines the first pass attributed
 * @param {GitRun} [run] runs git; the default runs it in the repository
 * @returns {Promise<{ sha: string, shortSha: string, subject: string, author: string, mail: string, date: string, filesChanged: number, changedLines: number, survivingLines: number, files: string[] }[]>}
 */
export async function findReformatSuspects(o, blamedByCommit, blamedTotal, run = (args, opts) => git(args, o.cwd, opts)) {
  const candidates = [...blamedByCommit]
    .filter(([, b]) => b.lines >= REFORMAT_MIN_LINES || b.lines >= blamedTotal * REFORMAT_SHARE)
    .sort((x, y) => y[1].lines - x[1].lines || x[0].localeCompare(y[0]))
    .slice(0, REFORMAT_MAX_CANDIDATES);
  /** @type {Map<string, CommitFacts>} */
  let facts = new Map();
  try {
    facts = await readCommitFacts(run, candidates.map(([sha]) => sha));
  } catch {
    // One bad commit fails the whole call; the commits are then asked for one at a time below.
  }
  for (const [sha] of candidates) {
    if (facts.has(sha) || candidates.length === 1) continue;
    try {
      const one = await readCommitFacts(run, [sha]);
      const got = one.get(sha);
      if (got) facts.set(sha, got);
    } catch {
      // This candidate is not a suspect; the others are still judged.
    }
  }
  /** @type {Map<string, string[]>} */
  const wanted = new Map();
  for (const [sha] of candidates) {
    const f = facts.get(sha);
    // The same cheap rules reformatLines applies, so no blob is read for a commit that cannot be a reformat.
    if (!f || f.parents.length !== 1 || f.files.length === 0 || f.files.length > REFORMAT_MAX_FILES || f.files.some((x) => x.status !== "M")) continue;
    wanted.set(sha, f.files.filter((x) => f.counts.get(x.path)?.binary === false).flatMap((x) => [x.before, x.after]));
  }
  /** @type {Map<string, string>} */
  let blobs = new Map();
  /** @type {Set<string>} */
  let tooLarge = new Set();
  try {
    ({ blobs, tooLarge } = await readBlobs(run, wanted));
  } catch {
    // Judged blob by blob below.
  }
  /** @param {string} oid */
  const blob = async (oid) => blobs.get(oid) ?? (await run(["cat-file", "blob", oid]));
  const suspects = new Array(candidates.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const idx = next++;
      const [sha, b] = candidates[idx];
      const f = facts.get(sha);
      if (!f || f.parents.length !== 1 || tooLarge.has(sha)) continue;
      try {
        const found = await reformatLines(f, blob);
        if (found) suspects[idx] = { sha, shortSha: sha.slice(0, 7), author: b.name, mail: b.mail, subject: f.subject, date: f.date, ...found, survivingLines: b.lines, files: f.files.map((x) => x.path) };
      } catch {
        // A git failure on one blob: this candidate is not a suspect.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(o.jobs, 1), candidates.length || 1) }, worker));
  return suspects.filter(Boolean);
}

/** At most this many commits holding surviving lines are examined for the mechanical-rewrite check, most surviving lines first. */
const MECHANICAL_MAX_COMMITS = 3000;
/** A commit touching at least this many files with the same small change in each looks mechanical ... */
const MECHANICAL_MIN_FILES = 10;
/** ... when no file changed by more than this many inserted (and as many deleted) lines. */
const MECHANICAL_MAX_LINES_PER_FILE = 3;
/** Subjects that name a formatting tool, a lint fix, a codemod or a rename tool: tool names and explicit phrases only, not a bare "rename", "format" or "black". */
const MECHANICAL_SUBJECT = /\b(?:fmt|gofmt|rustfmt|clang-format|scalafmt|autopep8|isort|prettier|black\s+formatt(?:ing|er|ed)|(?:run|ran|apply|applied|apply|using|with)\s+(?:the\s+)?(?:black|formatter)|format\s+(?:all|everything|the\s+(?:code|codebase|repo(?:sitory)?))|reformat(?:ting|ted)?|lint(?:ing)?\s+fix(?:es)?|fix(?:ed|es)?\s+lint|eslint(?:\s+--fix)?|codemods?|(?:rename|renaming)\s+tool|(?:mass|bulk)\s+rename|go\s+fix|gofix)\b|(?:^|\s)--fix\b/i;

/**
 * The mechanical-rewrite check (R8-2): every commit that holds surviving lines is read once. A commit looks mechanical
 * when it touches at least 10 files with equal insertions and deletions in each, at most 3 lines per file, or when its
 * subject names a formatter, a lint fix, a codemod or a rename tool. There is no size floor. A candidate is only
 * listed: the tool never sets one aside by this check, only by the reformat rule.
 * @param {Options} o
 * @param {Map<string, { name: string, mail: string, lines: number }>} blamedByCommit
 * @param {Set<string>} setAside the commits the reformat rule set aside
 * @param {number} [ignoredByUser] the revisions the user ignored (--ignore-rev, an ignore-revs file); they hold no blamed line, so they are only counted
 * @param {GitRun} [run]
 * @returns {Promise<{ examined: number, total: number, truncated: boolean, setAside: number, ignoredByUser: number, candidates: { sha: string, shortSha: string, author: string, mail: string, subject: string, survivingLines: number, filesChanged: number, reason: "files" | "subject", both?: boolean }[], setAsideCommits?: { sha: string, shortSha: string, author: string, mail: string, subject: string, survivingLines: number, filesChanged: number, reason: "files" | "subject" }[] } | null>}
 */
export async function findMechanicalCandidates(o, blamedByCommit, setAside, ignoredByUser = 0, run = (args, opts) => git(args, o.cwd, opts)) {
  const total = blamedByCommit.size;
  const list = [...blamedByCommit].sort((x, y) => y[1].lines - x[1].lines || x[0].localeCompare(y[0])).slice(0, MECHANICAL_MAX_COMMITS);
  if (!list.length) return null;
  /** @type {string} */
  let out;
  try {
    out = await run(["log", "--no-walk=unsorted", "--numstat", "--no-renames", "--format=%x1e%H%x1f%s", "--stdin"], { input: `${list.map(([sha]) => sha).join("\n")}\n` });
  } catch {
    return null;
  }
  /** @type {Map<string, { subject: string, files: number, small: boolean }>} */
  const facts = new Map();
  for (const chunk of out.split("\x1e")) {
    if (!chunk) continue;
    const [head, ...rest] = chunk.split("\n");
    const [sha, ...subject] = head.split("\x1f");
    let files = 0;
    let small = true;
    for (const line of rest) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
      if (!m) continue;
      files++;
      if (m[1] === "-" || m[1] !== m[2] || Number(m[1]) < 1 || Number(m[1]) > MECHANICAL_MAX_LINES_PER_FILE) small = false;
    }
    facts.set(sha, { subject: subject.join("\x1f"), files, small });
  }
  /** @type {NonNullable<Awaited<ReturnType<typeof findMechanicalCandidates>>>["candidates"]} */
  const candidates = [];
  for (const [sha, b] of list) {
    const f = facts.get(sha);
    if (!f || setAside.has(sha)) continue;
    const byFiles = f.files >= MECHANICAL_MIN_FILES && f.small;
    const bySubject = MECHANICAL_SUBJECT.test(f.subject);
    if (!byFiles && !bySubject) continue;
    candidates.push({ sha, shortSha: sha.slice(0, 7), author: b.name, mail: b.mail, subject: f.subject, survivingLines: b.lines, filesChanged: f.files, reason: byFiles ? "files" : "subject", ...(byFiles && bySubject ? { both: true } : {}) });
  }
  return { examined: list.length, total, truncated: total > list.length, setAside: setAside.size, ignoredByUser, candidates };
}

/** An author is active when their newest commit at the reviewed path is no more than this many days before the as-of date. */
const INACTIVE_AFTER_DAYS = 365;

/**
 * The as-of date of the path views: the author date of the ref commit, so the clock is never read.
 * @param {Options} o
 */
async function refDay(o) {
  return (await git(["log", "-1", "--format=%aI", o.ref], o.cwd)).trim().slice(0, 10);
}

/**
 * The commits that touch a path at the ref, from ONE git log call, for the path views. Each has its id, its author
 * address (.mailmap applied and lowercased, the key the commit counts use) and its author date as YYYY-MM-DD.
 * Merges are left out, as the commit counts leave them out.
 * @param {Options} o
 * @param {string} path
 * @returns {Promise<{ sha: string, mail: string, day: string }[]>}
 */
async function readPathCommits(o, path) {
  /** @type {{ sha: string, mail: string, day: string }[]} */
  const commits = [];
  for (const line of (await git(["log", "--no-merges", "--format=%H%x09%aE%x09%aI", o.ref, "--", path], o.cwd)).split("\n")) {
    if (!line) continue;
    const [sha, mail, date] = line.split("\t");
    commits.push({ sha, mail: mail.toLowerCase(), day: date.slice(0, 10) });
  }
  return commits;
}

/**
 * The lines under one path of a view that were written in other paths, with the share of the blamed lines and the three
 * largest origin paths. Null when nothing was blamed under the path.
 * @param {Map<string, ReturnType<typeof countBlameOrigins>>} origins the origin counts of every blamed file
 * @param {string} path the view's path, a file or a directory
 * @returns {{ lines: number, of: number, share: number, largest: { path: string, lines: number }[] } | null}
 */
function movedInFor(origins, path) {
  const dir = path.replace(/\/+$/, "");
  let of = 0;
  /** @type {Map<string, number>} */
  const from = new Map();
  for (const [file, c] of origins) {
    if (dir !== "" && dir !== "." && file !== dir && !file.startsWith(`${dir}/`)) continue;
    of += c.total;
    for (const [origin, n] of c.from) from.set(origin, (from.get(origin) ?? 0) + n);
  }
  if (of === 0) return null;
  const lines = [...from.values()].reduce((sum, n) => sum + n, 0);
  const largest = [...from].map(([p, n]) => ({ path: p, lines: n })).sort((x, y) => y.lines - x.lines || x.path.localeCompare(y.path)).slice(0, 3);
  return { lines, of, share: lines / of, largest };
}

/** The share of moved-in lines from which the path views print a line about it. */
const MOVED_IN_MIN_SHARE = 0.05;

/**
 * The names a `.mailmap` file at the repository root merged into other names, for the authors in the output.
 * git blame already prints the mapped name, so the merge cannot be seen in its output. The history is read with the raw
 * author fields (%an, %ae; %aN and %aE apply the mapping), each distinct identity is run through `git check-mailmap`, which reads the same file, and an
 * identity that comes back different was merged. The lines it adds are the blamed lines of its commits. Only a merge
 * whose target is a row of the output is reported.
 * @param {Options} o
 * @param {Map<string, { lines: number }>} blamedByCommit
 * @param {{ author: string, mail: string }[]} rows the output rows
 * @returns {Promise<{ file: string | null, merges: { into: { name: string, mail: string }, lines: number, from: { name: string, mail: string, lines: number }[] }[] }>}
 */
export async function readMailmapMerges(o, blamedByCommit, rows) {
  const none = { file: null, merges: [] };
  let top;
  try {
    top = (await git(["rev-parse", "--show-toplevel"], o.cwd)).trim();
  } catch {
    return none;
  }
  const sources = [];
  if (existsSync(join(top, ".mailmap"))) sources.push(".mailmap");
  for (const key of ["mailmap.file", "mailmap.blob"]) {
    try {
      if ((await git(["config", "--get", key], o.cwd)).trim()) sources.push(key);
    } catch {
      // the key is not set
    }
  }
  /** @type {Map<string, { name: string, mail: string, lines: number }>} */
  const raw = new Map();
  // NUL separates the fields and the records (-z), so a tab or any other character in a name cannot split a field.
  const fields = (await git(["log", "-z", "--no-merges", "--format=%H%x00%an%x00%ae", o.ref], o.cwd)).split("\0");
  for (let i = 0; i + 2 < fields.length; i += 3) {
    const sha = fields[i].replace(/^\n/, "");
    const name = fields[i + 1];
    const mail = fields[i + 2];
    if (/\n/.test(name) || /\n/.test(mail)) continue;
    const key = `${name}\0${mail}`;
    const e = raw.get(key) ?? { name, mail, lines: 0 };
    e.lines += blamedByCommit.get(sha)?.lines ?? 0;
    raw.set(key, e);
  }
  const file = sources.length ? sources.join(", ") : "mailmap configured elsewhere";
  const ids = [...raw.values()];
  if (!ids.length) return sources.length ? { file, merges: [] } : none;
  const mapped = (await gitWithInput(["check-mailmap", "--stdin"], `${ids.map((i) => `${i.name} <${i.mail}>`).join("\n")}\n`, o.cwd)).split("\n");
  /** @type {Map<string, { into: { name: string, mail: string }, lines: number, from: { name: string, mail: string, lines: number }[] }>} */
  const merges = new Map();
  ids.forEach((id, i) => {
    const m = /^(.*) <(.*)>$/.exec(mapped[i] ?? "");
    if (!m || (m[1] === id.name && m[2].toLowerCase() === id.mail.toLowerCase())) return;
    // The mail address decides; the name is the fallback only for a row whose mail is unknown.
    const present = rows.some((r) => (r.mail ? r.mail === m[2].toLowerCase() : r.author === m[1]));
    if (!present) return;
    const key = `${m[2].toLowerCase()}\t${m[1]}`;
    const e = merges.get(key) ?? { into: { name: m[1], mail: m[2] }, lines: 0, from: [] };
    e.lines += id.lines;
    e.from.push({ name: id.name, mail: id.mail, lines: id.lines });
    merges.set(key, e);
  });
  // A name that adds no line to this view (a path-scoped one) is not worth a note.
  const out = [...merges.values()]
    .map((e) => ({ ...e, from: e.from.filter((f) => f.lines > 0).sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail)) }))
    .filter((e) => e.from.length);
  out.sort((x, y) => y.lines - x.lines || x.into.mail.localeCompare(y.into.mail));
  if (!out.length && !sources.length) return none;
  return { file, merges: out };
}

/**
 * The line that names the identities a .mailmap merged, or null when none affects the output.
 * @param {{ mailmap?: { file: string | null, merges: { into: { name: string, mail: string }, lines: number, from: { name: string, mail: string, lines: number }[] }[] } }} r
 * @returns {string | null}
 */
function mailmapLine(r) {
  const m = r.mailmap;
  if (!m || !m.file || !m.merges.length) return null;
  const n = (/** @type {number} */ x) => `${x.toLocaleString("en-US")} line${x === 1 ? "" : "s"}`;
  const parts = capped(m.merges.map((e) => `${e.into.name} <${e.into.mail}> includes ${capped(e.from.map((f) => `${f.name} <${f.mail}> (${n(f.lines)})`), ", ")}, ${n(e.lines)} added`), "; ");
  return `identities merged by ${m.file} (already applied to every number above): ${parts}`;
}

/**
 * The line for addresses that appear under several author names and are counted as one person (R9-3), or null. Names
 * are listed up to five per address and up to three addresses, then counted.
 * @param {{ sameAddress?: { mail: string, name: string, aliases: string[], lines: number }[] }} r
 * @returns {string | null}
 */
export function sameAddressLine(r) {
  const groups = r.sameAddress ?? [];
  if (!groups.length) return null;
  const n = (/** @type {number} */ x) => `${x.toLocaleString("en-US")} line${x === 1 ? "" : "s"}`;
  const names = (/** @type {string[]} */ list) => (list.length > 5 ? `${list.slice(0, 5).join(", ")} and ${list.length - 5} more` : list.join(", "));
  const parts = capped(groups.map((g) => `${g.name} <${g.mail}> also appears as ${names(g.aliases)} (${n(g.lines)})`), "; ");
  return `one address, several names, counted as one: ${parts}`;
}

/**
 * The note for --copies deep (R9-7), or null. Deep copy detection looks in every file of the commit that created a file,
 * so it can give lines to a commit that was later reverted.
 * @param {{ blame?: { copyDetection?: { flags?: string | null } } }} r
 * @returns {string | null}
 */
export function deepCopyLine(r) {
  if (r.blame?.copyDetection?.flags !== "-C -C") return null;
  return "deep copy detection (-C -C) can credit lines to a commit that was later reverted; compare with the default (-C)";
}

/**
 * The scope notes every view prints, in one place: what was left out of the numbers (bots, lockfiles and generated
 * files, copy detection off), the reformat commits ignored or suspected, the identities a .mailmap merged, the identity
 * hints and "possible same person" suggestions, and the lines moved in from other paths. A view calls this once and
 * prints the result; the notes are not written per view.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {{ view?: Parameters<typeof movedInLine>[0] | null, identityHints?: boolean }} [opts]
 * @returns {string[]} lines, with a blank line between blocks; empty when nothing applies
 */
export function scopeNotes(r, opts = {}) {
  /** @type {string[]} */
  const out = [];
  const add = (/** @type {string | string[] | null | undefined} */ block) => {
    if (!block || !block.length) return;
    if (out.length) out.push("");
    out.push(...(Array.isArray(block) ? block : [block]));
  };
  const left = [botsLine(r), mailmapLine(r)].filter(Boolean);
  add(left.length ? left.join("\n").split("\n") : null);
  add(reformatBlock(r));
  add(mechanicalLine(r));
  add(whitespaceOnlyLine(r));
  add(copyEffectLine(r));
  add(deepCopyLine(r));
  add(sameAddressLine(r));
  if (opts.identityHints !== false) add(identityLine(r)?.split("\n"));
  add(opts.view ? movedInLine(opts.view) : null);
  return out;
}

/**
 * The --reviewers view: the authors of one path, most surviving lines first, each with the newest non-merge commit
 * that touched the path and whether it is recent. The as-of date is the author date of the ref commit, so the same
 * repository answers the same way on any day; the clock is never read. Bots are already out of `rows`.
 *
 * The suggestion reads the table's rows, which already leave the suspected reformat commits out when `applied` is true.
 * Entries whose names fold to the same identity (see foldIdentity) are one person there: lines and shares
 * add up, the newest commit wins, and the person is active when any address is.
 * @param {Options} o
 * @param {string} path the --reviewers path
 * @param {{ author: string, mail: string, lines: number, lineShare: number, commits: number, addresses?: number }[]} rows the table's rows
 * @param {boolean} applied whether the rows have the suspected reformat commits left out
 * @param {Map<string, string[]> | null} membersOf under --merge-identities, each merged row's canonical address to every address it holds
 * @param {{ mail: string, day: string }[]} pathCommits the commits at the path, from readPathCommits
 */
async function reviewersView(o, path, rows, applied, membersOf, pathCommits) {
  // A merged row stands for several addresses: its newest commit is the newest of them, and its mails list all of them.
  const memberMails = (/** @type {string} */ mail) => membersOf?.get(mail) ?? [mail];
  const asOf = await refDay(o);
  // The newest date per address. Dates are YYYY-MM-DD, so the newest one is the larger string.
  /** @type {Map<string, string>} */
  const newest = new Map();
  for (const c of pathCommits) {
    if (!newest.has(c.mail) || c.day > /** @type {string} */ (newest.get(c.mail))) newest.set(c.mail, c.day);
  }
  const authors = [...rows]
    .sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail))
    .map((a) => {
      const lastCommit = memberMails(a.mail).reduce((/** @type {string | null} */ best, m) => {
        const day = newest.get(m) ?? null;
        return day !== null && (best === null || day > best) ? day : best;
      }, null);
      const daysSince = lastCommit === null ? Infinity : (Date.parse(asOf) - Date.parse(lastCommit)) / 86400000;
      // asOf is the ref's own author date. An ancestor normally has an earlier or equal author date, so a last commit
      // after asOf only appears with clock skew or a hand-set date. It is counted as active, not rejected.
      return { author: a.author, mail: a.mail, lines: a.lines, lineShare: a.lineShare, commits: a.commits, lastCommit, active: daysSince <= INACTIVE_AFTER_DAYS, ...(a.addresses ? { addresses: a.addresses } : {}) };
    });
  const lastOf = new Map(authors.map((a) => [a.mail, a]));
  /** @type {Map<string, { author: string, mails: string[], lines: number, lineShare: number, lastCommit: string | null, active: boolean }>} */
  const people = new Map();
  for (const b of rows) {
    if (b.lines <= 0 || isPlaceholderIdentity(b.author, b.mail)) continue;
    const a = lastOf.get(b.mail);
    const key = foldIdentity(b.author);
    const p = people.get(key) ?? { author: b.author, mails: [], lines: 0, lineShare: 0, lastCommit: null, active: false };
    p.mails.push(...memberMails(b.mail));
    p.lines += b.lines;
    p.lineShare += b.lineShare;
    if (a?.lastCommit && (p.lastCommit === null || a.lastCommit > p.lastCommit)) p.lastCommit = a.lastCommit;
    p.active = p.active || Boolean(a?.active);
    people.set(key, p);
  }
  const ranked = [...people.values()].sort((x, y) => y.lines - x.lines || x.author.localeCompare(y.author));
  // Activity never reorders or removes a person: the suggestion is the three people with the most lines. The active-only
  // cut is a second list, given only when it differs.
  const cut = (/** @type {typeof ranked} */ list) => list.slice(0, 3).map((p) => ({ ...p, mails: [...p.mails].sort() }));
  const suggested = cut(ranked);
  const activeOnly = cut(ranked.filter((p) => p.active));
  const sameCut = activeOnly.length === suggested.length && activeOnly.every((p, i) => p.author === suggested[i].author);
  const top = ranked[0];
  const topOwner = top ? { author: top.author, lastCommit: top.lastCommit, active: top.active } : null;
  return {
    path,
    asOf,
    inactiveAfterDays: INACTIVE_AFTER_DAYS,
    suggestedBasis: applied ? /** @type {const} */ ("reformatIgnored") : /** @type {const} */ ("table"),
    suggested,
    suggestedActiveOnly: sameCut ? null : activeOnly,
    topOwner,
    authors,
  };
}

/**
 * Whether a commit's changed files include the path: the file itself, or any file under it when the path is a
 * directory. A path that only shares a prefix (lib against libs/x.js) does not match. A suspect from an older record,
 * without its file list, touches nothing.
 * @param {string[] | undefined} files
 * @param {string} path
 */
export function touchesPath(files, path) {
  const dir = path.replace(/^\.\//, "").replace(/\/+$/, "");
  if (dir === "" || dir === ".") return (files ?? []).length > 0;
  return (files ?? []).some((f) => f === dir || f.startsWith(`${dir}/`));
}

/**
 * The formatting-only commits that touch a path, as the history view names them: id, short id, subject, author and
 * date, in date order and then by id. The suspects come from the reformat detection and carry their changed files.
 * @param {{ sha: string, shortSha: string, subject: string, author: string, date: string, files?: string[] }[]} suspects
 * @param {string} path
 * @returns {{ sha: string, shortSha: string, subject: string, author: string, date: string }[]}
 */
export function setAsideFor(suspects, path) {
  return suspects
    .filter((s) => touchesPath(s.files, path))
    .map((s) => ({ sha: s.sha, shortSha: s.shortSha, subject: s.subject, author: s.author, date: s.date }))
    .sort((x, y) => x.date.localeCompare(y.date) || x.sha.localeCompare(y.sha));
}

/**
 * The --history view: the people who changed one path, oldest first by their first commit there, ties by address.
 * Only counted commits decide who is listed and their dates: when the reformat correction applies, the set-aside
 * commits are not counted, so a person whose only commit at the path was a formatting change has no row and appears in
 * the set-aside list instead. Lines and shares are the rows the table shows, so they carry the correction and any
 * --merge-identities merge. The as-of date is the ref commit's author date, as in the reviewers view.
 * @param {Options} o
 * @param {string} path the --history path
 * @param {{ author: string, mail: string, lines: number, lineShare: number, commits: number, addresses?: number }[]} rows the table's rows
 * @param {Map<string, string[]> | null} membersOf under --merge-identities, each merged row's canonical address to every address it holds
 * @param {{ sha: string, mail: string, day: string }[]} pathCommits the commits at the path, from readPathCommits
 * @param {{ sha: string, shortSha: string, subject: string, author: string, date: string, files?: string[] }[]} suspects the reformat suspects
 * @param {boolean} applied whether the set-aside commits are left out of the counts
 */
async function historyView(o, path, rows, membersOf, pathCommits, suspects, applied) {
  const memberMails = (/** @type {string} */ mail) => membersOf?.get(mail) ?? [mail];
  const setAside = setAsideFor(suspects, path);
  const skipped = new Set(applied ? setAside.map((s) => s.sha) : []);
  /** @type {Map<string, { first: string, last: string, commits: number }>} */
  const counted = new Map();
  for (const c of pathCommits) {
    if (skipped.has(c.sha)) continue;
    const e = counted.get(c.mail) ?? { first: c.day, last: c.day, commits: 0 };
    e.commits++;
    if (c.day < e.first) e.first = c.day;
    if (c.day > e.last) e.last = c.day;
    counted.set(c.mail, e);
  }
  const authors = [];
  for (const row of rows) {
    // A row without a counted commit at the path (a bot, or a person whose only commit here was set aside) is not listed.
    const held = memberMails(row.mail).map((m) => counted.get(m)).filter((x) => x !== undefined);
    if (held.length === 0) continue;
    authors.push({
      author: row.author,
      mail: row.mail,
      firstCommit: held.reduce((best, h) => (h.first < best ? h.first : best), held[0].first),
      lastCommit: held.reduce((best, h) => (h.last > best ? h.last : best), held[0].last),
      commits: held.reduce((sum, h) => sum + h.commits, 0),
      lines: row.lines,
      lineShare: row.lineShare,
      ...(row.addresses ? { addresses: row.addresses } : {}),
    });
  }
  authors.sort((x, y) => (x.firstCommit < y.firstCommit ? -1 : x.firstCommit > y.firstCommit ? 1 : x.mail.localeCompare(y.mail)));
  return { path, asOf: await refDay(o), authors, setAside };
}

/**
 * The lines per author of one blame pass, bots left out as the table leaves them out, with the shares and the bus
 * factor those lines give. The correction keeps the first pass in this shape, so the block can print what it moved.
 * @param {Options} o
 * @param {Map<string, { name: string, lines: number }>} authorMap
 */
function linesSummary(o, authorMap) {
  const kept = [...authorMap].filter(([mail, a]) => o.includeBots || !isBotIdentity(a.name, mail)).map(([mail, a]) => ({ author: a.name, mail, lines: a.lines }));
  const linesAttributed = kept.reduce((sum, a) => sum + a.lines, 0);
  const authors = kept.map((a) => ({ ...a, lineShare: linesAttributed ? a.lines / linesAttributed : 0 })).sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail));
  const bf = busFactor(authors, o.busFactorThreshold);
  return { linesAttributed, authors, busFactor: bf && { thresholdPercent: o.busFactorThreshold, ...bf } };
}

/** @param {{ mail: string, lines: number, commits: number }} x @param {{ mail: string, lines: number, commits: number }} y */
const byCommitsThenLines = (x, y) => y.commits - x.commits || y.lines - x.lines || x.mail.localeCompare(y.mail);

/**
 * --merge-identities: the rows of one list with each person's addresses folded into the canonical address that
 * linkIdentities chose. Lines and commits add up; an address outside every group is left as it is. A row that holds
 * more than one address carries `addresses`, the number it holds in this list, so a renderer can say so.
 * @template {{ author: string, mail: string, lines: number, commits?: number, linesWithBlank?: number }} T
 * @param {T[]} list
 * @param {Map<string, { author: string, mail: string }>} canonicalOf the canonical identity of each address in a group
 * @returns {(T & { addresses?: number })[]}
 */
export function foldAddresses(list, canonicalOf) {
  /** @type {Map<string, { row: T & { addresses?: number }, held: number }>} */
  const out = new Map();
  for (const row of list) {
    const canon = canonicalOf.get(row.mail) ?? { author: row.author, mail: row.mail };
    const found = out.get(canon.mail);
    if (found) {
      found.row.lines += row.lines;
      if (row.linesWithBlank !== undefined) found.row.linesWithBlank = (found.row.linesWithBlank ?? 0) + row.linesWithBlank;
      if (row.commits !== undefined) found.row.commits = (found.row.commits ?? 0) + row.commits;
      found.held++;
    } else {
      out.set(canon.mail, { row: { ...row, author: canon.author, mail: canon.mail }, held: 1 });
    }
  }
  return [...out.values()].map(({ row, held }) => (held > 1 ? { ...row, addresses: held } : row));
}

/**
 * The lines of one list (a group block, or the plain count) with the merge applied, and its shares and bus factor
 * recomputed on the same total the list was shared over.
 * @param {{ author: string, mail: string, lines: number }[]} list
 * @param {number} total
 * @param {Map<string, { author: string, mail: string }>} canonicalOf
 * @param {number} thresholdPercent
 */
function mergedLines(list, total, canonicalOf, thresholdPercent) {
  const authors = foldAddresses(list, canonicalOf)
    .map((a) => ({ ...a, lineShare: total ? a.lines / total : 0 }))
    .sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail));
  const bf = busFactor(authors, thresholdPercent);
  return { authors, busFactor: bf && { thresholdPercent, ...bf } };
}

/**
 * The name a row is shown under. A row that holds several addresses of one person says how many; two rows that share a
 * name show their address, as they always did; otherwise the name alone.
 * @param {{ author: string, mail: string, addresses?: number }} a
 * @param {Map<string, number>} nameCount rows per name
 */
function rowLabel(a, nameCount) {
  if ((a.addresses ?? 0) > 1) return isolate(`${a.author} (${a.addresses} addresses)`);
  return isolate((nameCount.get(a.author) ?? 0) > 1 ? `${a.author} <${a.mail}>` : a.author);
}

/**
 * The figure the --history headline gives for a person: the one the tool recommends leading with when the person's
 * address belongs to an identity hint or a possible-same-person suggestion, with the other next to it (R8-4).
 * Strong evidence leads with the merged figure; weak evidence leads with the address alone. Nothing is merged.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {{ mail: string, lines: number, lineShare: number }} a
 */
function leadFigure(r, a) {
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const alone = `${n(a.lines)} lines, ${pct(a.lineShare)}`;
  const group = identityGroupOf(r, a);
  if (!group) return alone;
  const merged = `${n(group.lines)} lines, ${pct(group.lineShare)}`;
  const others = capped(group.others, ", ");
  return group.strength === "strong"
    ? `${merged} counting this address and ${others} as one person, strong evidence, not merged by the tool; this address alone: ${alone}`
    : `${alone} for this address alone; ${merged} if ${others} is the same person, weak evidence`;
}

/**
 * The identity hint or suggestion the person's address belongs to, with its strength and merged figure, or null when
 * there is none, the figure or strength is missing (a result from before they existed), or --merge-identities already
 * merged the rows.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {{ mail: string }} a
 * @returns {{ strength: "strong" | "weak", lines: number, lineShare: number, others: string[] } | null}
 */
function identityGroupOf(r, a) {
  if (r.identityMerge?.applied) return null;
  /** @type {{ strength?: string, lines?: number, lineShare?: number, others: string[] } | null} */
  let group = null;
  for (const p of r.identityHints?.people ?? []) {
    if (!group && p.addresses.includes(a.mail)) group = { strength: p.strength, lines: p.lines, lineShare: p.lineShare, others: p.addresses.filter((m) => m !== a.mail) };
  }
  for (const s of r.possibleSamePerson?.suggestions ?? []) {
    if (!group && s.addresses.some((x) => x.mail === a.mail)) group = { strength: s.strength, lines: s.lines, lineShare: s.lineShare, others: s.addresses.map((x) => x.mail).filter((m) => m !== a.mail) };
  }
  if (!group || typeof group.lines !== "number" || typeof group.lineShare !== "number" || (group.strength !== "strong" && group.strength !== "weak")) return null;
  return { strength: group.strength, lines: group.lines, lineShare: group.lineShare, others: group.others };
}

/**
 * The line under the table when --merge-identities applied: each merged person with the lines and commits of every
 * address, so a reader sees what was added up. People are separated by semicolons and addresses by commas; past three
 * of either, the rest are counted.
 * @param {{ applied: boolean, groups: { name: string, addresses: { mail: string, lines: number, commits: number }[] }[] }} merge
 * @returns {string}
 */
export function identityMergeLine(merge) {
  if (!merge.groups.length) return "identities merged in memory: none found";
  /** @param {number} n @param {string} noun */
  const figure = (n, noun) => `${n.toLocaleString("en-US")} ${n === 1 ? noun : `${noun}s`}`;
  const people = capped(
    merge.groups.map((g) => `${g.name} = ${capped(g.addresses.map((a) => `${a.mail} ${figure(a.lines, "line")} ${figure(a.commits, "commit")}`), ", ")}`),
    "; ",
  );
  return `identities merged in memory (nothing written): ${people}; this is a guess from names and addresses; leave out --merge-identities for the unmerged table.`;
}

/**
 * Up to three items joined by the separator, then a count of the rest.
 * @param {string[]} items
 * @param {string} sep
 */
function capped(items, sep) {
  const shown = items.slice(0, 3);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(sep)}${sep}and ${rest} more` : shown.join(sep);
}

/**
 * The line under a view's table: the in-memory merge when --merge-identities applied, otherwise the identity hint.
 * A result from before the merge existed has no identityMerge, so it gets the hint, as it always did.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
function identityLine(r) {
  const first = r.identityMerge?.applied ? identityMergeLine(r.identityMerge) : identityHintLine(r.identityHints);
  const second = samePersonLine(r.possibleSamePerson);
  return first && second ? `${first}\n${second}` : first ?? second;
}

/**
 * R10-2 and R10-3: one file's owners, from its blame counts. Bots are left out the way the table leaves them out, and an
 * address that --merge-identities joined counts as one person. Lines are on the table's basis (blank lines not counted).
 * @param {Map<string, { name: string, lines: number, fullName?: string }>} counts
 * @param {boolean} includeBots
 * @param {Map<string, { author: string, mail: string }>} canonicalOf empty unless the identities are merged
 * @param {Map<string, string>} nameOf the name the table shows for an address
 * @returns {{ lines: number, owners: { name: string, lines: number, share: number }[] }}
 */
export function ownersOfFile(counts, includeBots, canonicalOf, nameOf) {
  /** @type {Map<string, { name: string, lines: number }>} */
  const people = new Map();
  let total = 0;
  for (const [mail, c] of counts) {
    const name = nameOf.get(mail) ?? c.fullName ?? c.name;
    if (!includeBots && isBotIdentity(name, mail)) continue;
    const canon = canonicalOf.get(mail);
    const key = canon?.mail ?? mail;
    const p = people.get(key) ?? { name: canon?.author ?? name, lines: 0 };
    p.lines += c.lines;
    total += c.lines;
    people.set(key, p);
  }
  const owners = [...people.entries()]
    .sort((x, y) => y[1].lines - x[1].lines || x[0].localeCompare(y[0]))
    .map(([, p]) => ({ name: p.name, lines: p.lines, share: total ? p.lines / total : 0 }));
  return { lines: total, owners };
}

/** R10-3: a commit qualifies when a file it changed shows at least this many added plus deleted lines. */
const WHITESPACE_ONLY_MIN_LINES = 20;
/** R10-3: the check stops after this long. */
const WHITESPACE_ONLY_TIMEOUT_MS = 20000;
/** R10-3: this many commits are named, and the files of these are blamed. */
const WHITESPACE_ONLY_SHOWN = 5;

/**
 * The files of each commit in `git log --numstat` output written with the format `%x01%H%x1f%aE%x1f%aN%x1f%s`.
 * @param {string} out
 * @returns {Map<string, { mail: string, name: string, subject: string, files: Map<string, { add: number, del: number }> }>}
 */
function parseNumstatLog(out) {
  /** @type {Map<string, { mail: string, name: string, subject: string, files: Map<string, { add: number, del: number }> }>} */
  const commits = new Map();
  for (const chunk of out.split("\x01")) {
    if (!chunk) continue;
    const eol = chunk.indexOf("\n");
    const [sha, mail, name, ...subject] = (eol < 0 ? chunk : chunk.slice(0, eol)).split("\x1f");
    if (!sha || mail === undefined) continue;
    /** @type {Map<string, { add: number, del: number }>} */
    const files = new Map();
    for (const line of eol < 0 ? [] : chunk.slice(eol + 1).split("\n")) {
      const m = /^(\d+)\t(\d+)\t(.+)$/.exec(line);
      if (m) files.set(unquoteGitPath(m[3]), { add: Number(m[1]), del: Number(m[2]) });
    }
    commits.set(sha, { mail: mail.toLowerCase(), name, subject: subject.join("\x1f"), files });
  }
  return commits;
}

/**
 * R10-3: commits that rewrote at least 20 lines of a file still present and changed nothing `git blame -w` can see in
 * it (a line-ending change, indentation, wrapping). Such a commit holds no line in the table, whoever made it. The test
 * is the numbers of `git log --numstat` against the same log with `-w`: an entry in the first and none in the second.
 * Merges, bots and the commits in `skip` (set aside already) are not listed. It never changes a number.
 * @param {Options} o
 * @param {Set<string>} present the paths of the files in scope at the ref
 * @param {Set<string>} skip full ids of commits that were set aside or ignored
 * @param {{ blameArgs: string[], perFile: Map<string, Map<string, { name: string, lines: number, fullName?: string }>>, nameOf: Map<string, string>, canonicalOf: Map<string, { author: string, mail: string }> }} ctx how to find who holds a file now
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ skipped: boolean, commits: { sha: string, shortSha: string, subject: string, author: string, lines: number, files: { path: string, lines: number, topOwner: string | null, topShare: number | null, topOwnerLines: number | null, fileLines: number | null }[] }[] }>}
 */
export async function findWhitespaceOnlyCommits(o, present, skip, ctx, opts = {}) {
  const timeout = opts.timeoutMs ?? WHITESPACE_ONLY_TIMEOUT_MS;
  const started = Date.now();
  const format = "--format=%x01%H%x1f%aE%x1f%aN%x1f%s";
  /** @param {boolean} ignoreSpace */
  const log = (ignoreSpace) => git(["log", "--no-merges", "--no-renames", "--numstat", format, ...(ignoreSpace ? ["-w"] : []), o.ref, "--", ...o.paths], o.cwd, { timeout });
  let plain;
  let spaced;
  try {
    [plain, spaced] = (await Promise.all([log(false), log(true)])).map(parseNumstatLog);
  } catch (err) {
    const e = /** @type {{ killed?: boolean, signal?: string, code?: string }} */ (err);
    if (e && (e.killed || e.signal || e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")) return { skipped: true, commits: [] };
    throw err;
  }
  /** @type {{ sha: string, mail: string, name: string, subject: string, files: { path: string, lines: number }[], lines: number }[]} */
  const found = [];
  for (const [sha, c] of plain) {
    if (skip.has(sha) || isBotIdentity(c.name, c.mail)) continue;
    const seen = spaced.get(sha)?.files;
    /** @type {{ path: string, lines: number }[]} */
    const files = [];
    for (const [path, st] of c.files) {
      if (!present.has(path) || st.add + st.del < WHITESPACE_ONLY_MIN_LINES) continue;
      const w = seen?.get(path);
      if (w && w.add + w.del > 0) continue;
      files.push({ path, lines: Math.max(st.add, st.del) });
    }
    const lines = files.reduce((sum, f) => sum + f.lines, 0);
    if (files.length && lines >= WHITESPACE_ONLY_MIN_LINES) found.push({ sha, mail: c.mail, name: c.name, subject: c.subject, files: files.sort((x, y) => y.lines - x.lines || x.path.localeCompare(y.path)), lines });
  }
  found.sort((x, y) => y.lines - x.lines || x.sha.localeCompare(y.sha));
  const mapped = await mapIdentities(o.cwd, found.map((c) => ({ name: c.name, mail: c.mail })));
  const out = found.map((c, i) => ({
    sha: c.sha,
    shortSha: c.sha.slice(0, 7),
    subject: c.subject,
    author: mapped[i].name,
    lines: c.lines,
    files: c.files.map((f) => ({ path: f.path, lines: f.lines, topOwner: /** @type {string | null} */ (null), topShare: /** @type {number | null} */ (null), topOwnerLines: /** @type {number | null} */ (null), fileLines: /** @type {number | null} */ (null) })),
  }));
  // Who holds the largest file of each named commit now: the run's own blame of that file, at most five files, every line
  // counted (blank lines too), the way the commit's own line count is.
  /** @type {Map<string, ReturnType<typeof ownersOfFile>>} */
  const owned = new Map();
  for (const c of out.slice(0, WHITESPACE_ONLY_SHOWN)) {
    const f = c.files[0];
    let who = owned.get(f.path);
    if (!who) {
      let counts = ctx.perFile.get(f.path);
      if (!counts) {
        const left = timeout - (Date.now() - started);
        if (left <= 0) return { skipped: true, commits: [] };
        try {
          counts = countBlameLines(await git([...ctx.blameArgs, o.ref, "--", f.path], o.cwd, { timeout: left }));
        } catch (err) {
          const e = /** @type {{ killed?: boolean, signal?: string }} */ (err);
          if (e && (e.killed || e.signal)) return { skipped: true, commits: [] };
          throw err;
        }
      }
      who = ownersOfFile(counts, o.includeBots, ctx.canonicalOf, ctx.nameOf);
      owned.set(f.path, who);
    }
    const top = who.owners[0];
    if (top) Object.assign(f, { topOwner: top.name, topShare: top.share, topOwnerLines: top.lines, fileLines: who.lines });
  }
  return { skipped: false, commits: out };
}

/**
 * R10-3: the scope note for whitespace-only commits, or null when there are none.
 * @param {{ whitespaceOnlyCommits?: Awaited<ReturnType<typeof findWhitespaceOnlyCommits>>["commits"], whitespaceOnlySkipped?: boolean }} r
 * @returns {string | null}
 */
export function whitespaceOnlyLine(r) {
  if (r.whitespaceOnlySkipped) return "whitespace-only check skipped (history too large)";
  const list = r.whitespaceOnlyCommits ?? [];
  if (!list.length) return null;
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const shown = list.slice(0, WHITESPACE_ONLY_SHOWN).map((c) => {
    const f = c.files[0];
    const now = f.topOwner !== null && f.topShare !== null ? ` (now: ${f.topOwner} ${pct(f.topShare)}, ${n(f.topOwnerLines ?? 0)} of ${n(f.fileLines ?? 0)} lines)` : "";
    // With several files the total is not the first file's count: name the file count, then the largest file with its own owner figure.
    const where = c.files.length > 1 ? `${c.files.length} files, largest ${f.path}` : `${f.path}`;
    return `${c.shortSha} "${c.subject}" by ${c.author}, ${n(c.lines)} line${c.lines === 1 ? "" : "s"} in ${where}${now}`;
  });
  const rest = list.length - shown.length;
  return `whitespace-only commits (git blame -w gives them no lines): ${shown.join("; ")}${rest > 0 ? `; ${rest} more` : ""}`;
}

/**
 * R10-2: the rows of the --files view and its summary, on the table's basis.
 * @param {number} limit
 * @param {Map<string, Map<string, { name: string, lines: number, fullName?: string }>>} perFile
 * @param {boolean} includeBots
 * @param {Map<string, { author: string, mail: string }>} canonicalOf
 * @param {Map<string, string>} nameOf
 */
export function filesView(limit, perFile, includeBots, canonicalOf, nameOf) {
  const all = [...perFile]
    .map(([path, counts]) => ({ path, ...ownersOfFile(counts, includeBots, canonicalOf, nameOf) }))
    .filter((f) => f.lines > 0)
    .sort((x, y) => y.lines - x.lines || x.path.localeCompare(y.path));
  const files = all.slice(0, limit).map((f) => ({ path: f.path, lines: f.lines, owners: f.owners.slice(0, 3) }));
  const summary = {
    total: all.length,
    shown: files.length,
    oneOwnerAbove80Percent: all.filter((f) => (f.owners[0]?.share ?? 0) > 0.8).length,
    noOwnerAbove50Percent: all.filter((f) => (f.owners[0]?.share ?? 0) <= 0.5).length,
  };
  return { files, summary };
}

/**
 * The --files view: one row per file, largest first.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderFiles(r) {
  const out = [];
  out.push(headerLine(r));
  const w = r.commitWindow;
  out.push(`git blame ${r.blame.flags.join(" ")}  ·  commits ${w.commits.toLocaleString("en-US")}${w.since || w.until ? ` in window ${w.since ?? "…"} to ${w.until ?? "…"}` : ""}, merges excluded`);
  out.push("");
  const files = r.files ?? [];
  const sum = r.filesSummary;
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const owner = (/** @type {{ name: string, share: number } | undefined} */ x) => (x ? `${x.name} ${pct(x.share)}` : "");
  const pathW = Math.max(4, ...files.map((f) => displayWidth(f.path)));
  const ownerW = Math.max(9, ...files.map((f) => displayWidth(f.owners[0]?.name ?? "")));
  const head = `${padEndDisplay("file", pathW)}  ${"lines".padStart(7)}  ${padEndDisplay("top owner", ownerW)}  ${"share".padStart(6)}  next two owners`;
  out.push(head);
  out.push("-".repeat(displayWidth(head)));
  for (const f of files) {
    const [top, ...next] = f.owners;
    out.push(`${padEndDisplay(f.path, pathW)}  ${n(f.lines).padStart(7)}  ${padEndDisplay(top?.name ?? "", ownerW)}  ${(top ? pct(top.share) : "").padStart(6)}  ${next.slice(0, 2).map(owner).join(", ")}`.trimEnd());
  }
  if (sum && sum.total > sum.shown) out.push(`… ${n(sum.total - sum.shown)} more file${sum.total - sum.shown === 1 ? "" : "s"}`);
  if (sum) out.push(`files: ${n(sum.total)}; one owner above 80% in ${n(sum.oneOwnerAbove80Percent)}; no owner above 50% in ${n(sum.noOwnerAbove50Percent)}`);
  const notes = scopeNotes(r);
  if (notes.length) out.push("", ...notes);
  out.push("");
  out.push("What this cannot show: quality of the lines, review work, design done in documents,");
  out.push("or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit.");
  return out.join("\n");
}

/**
 * @param {Options} o
 */
export async function analyse(o) {
  let versionOutput;
  try {
    ({ stdout: versionOutput } = await execFileP("git", ["--version"], { encoding: "utf8" }));
  } catch {
    throw new Error(`git ${MIN_GIT.join(".")} or newer is required, and no git was found on PATH`);
  }
  const tooOld = gitVersionProblem(versionOutput);
  if (tooOld) throw new Error(tooOld);
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
  // In a shallow clone the oldest fetched commit stands in for all of history before it, so blame
  // gives every older line to that commit's author. A depth-1 clone reports 100% for whoever made
  // HEAD and looks like a normal run, which is what a default CI checkout is.
  const shallow = (await git(["rev-parse", "--is-shallow-repository"], o.cwd)).trim() === "true";
  if (shallow && !o.allowShallow) {
    throw new Error(
      `${o.cwd} is a shallow clone, so git blame would give every line older than the cut to the commit at the cut.\n` +
        "Fetch the full history with: git fetch --unshallow\n" +
        "(in GitHub Actions, set fetch-depth: 0 on actions/checkout), or pass --allow-shallow to run anyway.",
    );
  }
  const includeRe = o.include.map(globToRegExp);
  const excludeRe = o.exclude.map(globToRegExp);
  const includeBare = o.include.map((g) => !g.includes("/"));
  const excludeBare = o.exclude.map((g) => !g.includes("/"));

  const listed = await listTextFiles(o);
  const wanted = listed.filter((f) => selected(f.path, includeRe, excludeRe, includeBare, excludeBare));
  // Lockfiles, generated files and vendored code are not the committer's writing. They leave every number, and the
  // result says how much left. The user's own --include and --exclude globs have already applied.
  const { kept: all, dropped } = await dropGenerated(o, wanted, listed);
  if (all.length === 0 && wanted.length > 0) {
    throw new Error(`every one of the ${wanted.length} files at ref "${o.ref}" is a lockfile, a generated file, vendored code or a binary file, so none is counted; pass --keep-generated to count them`);
  }
  if (all.length === 0) {
    if (o.include.length) {
      throw new Error(`no files matched include pattern${o.include.length > 1 ? "s" : ""}: ${o.include.join(", ")}`);
    }
    // Nothing here is the repository's fault: it holds files at this ref, and the caller's own
    // pathspec or --exclude emptied the run. "no files found" reads as an empty repository, or as
    // the wrong ref, which sends someone checking the ref instead of checking the command.
    if (listed.length === 0 && o.paths.length) {
      throw new Error(`no files matched the pathspec${o.paths.length > 1 ? "s" : ""} after --: ${o.paths.join(", ")}`);
    }
    if (listed.length > 0 && o.exclude.length) {
      const which = listed.length === 1 ? "the only file" : `every one of the ${listed.length} files`;
      throw new Error(`${which} at ref "${o.ref}" was excluded by --exclude ${o.exclude.join(", ")}`);
    }
    throw new Error(`no files found in ${o.cwd} at ref "${o.ref}"`);
  }

  const sampled = all.filter((f) => inSample(f.path, o.sample, o.seed));
  if (sampled.length === 0) {
    throw new Error(`no files sampled from ${all.length} files with --sample ${o.sample}${o.seed ? ` and --seed "${o.seed}"` : ""}`);
  }

  const errStream = o.stderr ?? process.stderr;
  const showProgress = !o.quiet && Boolean(errStream && errStream.isTTY);

  // -C follows code moved out of a file changed in the same commit back to its first author; --copies deep (-C -C) also
  // looks in the files of the commit that created the file. Every blame then looks in more files, so above this many
  // files it is off unless asked for.
  // The history is measured only when the file count alone does not decide it.
  const forced = o.noCopies || o.copies;
  const commitCount = !forced && all.length <= COPY_DETECTION_MAX_FILES ? Number((await git(["rev-list", "--count", o.ref], o.cwd)).trim()) : 0;
  const copyOn = !o.noCopies && (o.copies || copyDetectionDefault(all.length, commitCount, o.copyWorkLimit));
  const workLimit = o.copyWorkLimit ?? COPY_DETECTION_MAX_WORK;
  const copyDetection = {
    on: copyOn,
    reason: copyOn
      ? null
      : o.noCopies
        ? "--no-copies"
        : all.length > COPY_DETECTION_MAX_FILES
          ? `${all.length} files in the ref, more than ${COPY_DETECTION_MAX_FILES}`
          : `${all.length.toLocaleString("en-US")} files times ${commitCount.toLocaleString("en-US")} commits is more than ${workLimit.toLocaleString("en-US")}`,
    flags: copyOn ? (o.copiesDeep ? "-C -C" : "-C") : null,
  };
  const blameArgs = ["blame", "--line-porcelain", "-w", "-M"];
  if (copyOn) blameArgs.push("-C");
  if (copyOn && o.copiesDeep) blameArgs.push("-C");
  const shownFlags = blameArgs.slice(2);
  const ignoreRevs = await resolveIgnoreRevs(o, versionOutput);
  if (ignoreRevs) {
    blameArgs.push("--ignore-revs-file", ignoreRevs.path);
    shownFlags.push("--ignore-revs-file", ignoreRevs.display);
  }
  const userRevs = await resolveUserRevs(o, versionOutput);
  for (const id of userRevs) {
    blameArgs.push("--ignore-rev", id);
    shownFlags.push("--ignore-rev", id.slice(0, 7));
  }

  const grouping = o.groupBy === undefined ? null : parseGroupBy(o.groupBy);
  const needTrailers = o.coAuthors === "share" || o.aiBreakdown;
  const first = await blamePass(o, sampled, blameArgs, grouping, showProgress ? errStream : null);
  // The reformat candidates are judged against what the first pass attributed, before bots leave the totals.
  const blamedTotal = first.attributed;

  // --identities lists addresses and never mentions a reformat, so it does not look for one.
  const detect = o.detectReformat && !o.identities && supportsIgnoreRevs(versionOutput);
  const suspects = detect ? await findReformatSuspects(o, first.blamedByCommit, blamedTotal) : [];
  // The correction: the main numbers are a second pass with the suspects ignored, so every output reads one result.
  // --keep-reformat keeps the first pass, and --co-authors share keeps it too: its split is not a plain line count.
  const applied = suspects.length > 0 && !o.keepReformat && o.coAuthors !== "share";
  const ignoredByUser = new Set(userRevs);
  if (ignoreRevs) for (const m of readFileSync(ignoreRevs.path, "utf8").matchAll(/^\s*([0-9a-f]{40}|[0-9a-f]{64})\b/gim)) ignoredByUser.add(m[1].toLowerCase());
  const mechanicalCheck = await findMechanicalCandidates(o, first.blamedByCommit, new Set(applied ? suspects.map((x) => x.sha) : []), ignoredByUser.size);
  /** @type {ReturnType<typeof linesSummary> | null} */
  let uncorrected = null;
  let main = first;
  let mainArgs = blameArgs;
  // R9-9: a commit that shows both signs of a mechanical rewrite (the same small change in at least 10 files AND a
  // formatter, lint fix or codemod named in the subject) is set aside the way a reformat is: its lines go back to the
  // people who wrote them before it. A commit with only one sign stays a named candidate that is not set aside.
  const strongRewrites = mechanicalCheck && detect && !o.keepReformat && o.coAuthors !== "share" && supportsIgnoreRevs(versionOutput) ? mechanicalCheck.candidates.filter((c) => c.both) : [];
  if (applied || strongRewrites.length) {
    const ignored = [...(applied ? suspects.map((x) => ({ sha: x.sha, shortSha: x.shortSha })) : []), ...strongRewrites];
    for (const s of ignored) shownFlags.push("--ignore-rev", s.shortSha, "(auto)");
    mainArgs = [...blameArgs, ...ignored.flatMap((s) => ["--ignore-rev", s.sha])];
    main = await blamePass(o, sampled, mainArgs, grouping, null);
    if (applied) uncorrected = linesSummary(o, first.authors);
  }
  if (mechanicalCheck) {
    // `both` is internal: it never reaches the output, whether or not the commit was set aside.
    mechanicalCheck.candidates = mechanicalCheck.candidates.filter((c) => !strongRewrites.includes(c)).map(({ both, ...c }) => c);
  }
  if (mechanicalCheck && strongRewrites.length) {
    mechanicalCheck.setAside += strongRewrites.length;
    mechanicalCheck.setAsideCommits = strongRewrites.map(({ both, ...c }) => c);
  }
  // Where copy detection credited lines to another path, the same files are blamed again without it, so the notes can
  // name who gained or lost. Only those files are blamed twice. Under --co-authors share the split is not a line count.
  const copyShift = copyOn && o.coAuthors !== "share" ? await copyShiftOf(o, sampled, main.copiedFiles, mainArgs) : null;
  const authors = main.authors;
  let attributed = main.attributed;
  const blamedByCommit = main.blamedByCommit;
  const groupAcc = main.groupAcc;

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

  /** @type {Map<string, ReturnType<typeof parseTrailers>>} */
  let trailers = new Map();
  /** @type {{ sha: string, mail: string, name: string }[]} */
  let windowCommits = [];
  if (needTrailers) {
    trailers = await readTrailers(o);
    windowCommits = await readWindowCommits(o);
  }
  /** @type {Map<string, { name: string, mail: string }[]>} */
  const coAuthorsOf = new Map();
  if (o.coAuthors === "share") {
    const flat = [...trailers.entries()].flatMap(([sha, t]) => t.coAuthors.map((c) => ({ sha, ...c })));
    const mapped = await mapIdentities(o.cwd, flat);
    flat.forEach((f, i) => coAuthorsOf.set(f.sha, [...(coAuthorsOf.get(f.sha) ?? []), mapped[i]]));
    const credited = shareCredit(blamedByCommit, windowCommits, coAuthorsOf);
    authors.clear();
    for (const [mail, c] of credited) authors.set(mail, c);
  }

  // Bots leave both sides together, so the two shares keep one set of people as their denominator.
  /** @type {{ author: string, mail: string, lines: number, commits: number }[]} */
  const botRows = [];
  if (!o.includeBots) {
    for (const [mail, a] of authors) {
      if (!isBotIdentity(a.name, mail)) continue;
      botRows.push({ author: a.name, mail, lines: a.lines, commits: a.commits });
      attributed -= a.lines;
      commits -= a.commits;
      authors.delete(mail);
    }
    botRows.sort((x, y) => y.lines - x.lines || y.commits - x.commits || x.mail.localeCompare(y.mail));
    // Under --co-authors share a bot can hold half a line; keep the totals free of float drift.
    attributed = round6(attributed);
    commits = round6(commits);
  }

  /** @type {null | { lines: number, lineShare: number, commits: number, commitShare: number, assistants: { name: string, lines: number, commits: number }[] }} */
  let aiAssisted = null;
  if (o.aiBreakdown) {
    const keep = (/** @type {string} */ name, /** @type {string} */ mail) => o.includeBots || !isBotIdentity(name, mail);
    // Under --co-authors share the AI figures use the same split and the same bot exclusion as `attributed` and
    // `commits`, so each fraction has a numerator and a denominator on one basis. Otherwise only the author counts.
    const share = o.coAuthors === "share";
    /** @param {string} sha @param {{ name: string, mail: string }} author */
    const holders = (sha, author) => {
      const all = [author];
      if (share) for (const c of coAuthorsOf.get(sha) ?? []) if (!all.some((p) => p.mail === c.mail)) all.push(c);
      return all.filter((p) => keep(p.name, p.mail)).length / all.length;
    };
    /** @type {Map<string, { lines: number, commits: number }>} */
    const per = new Map();
    let aiLines = 0;
    let aiCommits = 0;
    let humanCommits = 0;
    for (const [sha, b] of blamedByCommit) {
      const t = trailers.get(sha);
      const names = t ? assistantsIn(t) : [];
      if (!names.length) continue;
      const lines = b.lines * holders(sha, b);
      if (!lines) continue;
      aiLines += lines;
      for (const n of names) per.set(n, { lines: (per.get(n)?.lines ?? 0) + lines, commits: per.get(n)?.commits ?? 0 });
    }
    for (const c of windowCommits) {
      const weight = holders(c.sha, c);
      if (!weight) continue;
      humanCommits += weight;
      const t = trailers.get(c.sha);
      const names = t ? assistantsIn(t) : [];
      if (!names.length) continue;
      aiCommits += weight;
      for (const n of names) per.set(n, { lines: per.get(n)?.lines ?? 0, commits: (per.get(n)?.commits ?? 0) + weight });
    }
    if (share) {
      aiLines = round6(aiLines);
      aiCommits = round6(aiCommits);
      humanCommits = round6(humanCommits);
      for (const v of per.values()) {
        v.lines = round6(v.lines);
        v.commits = round6(v.commits);
      }
    }
    aiAssisted = {
      lines: aiLines,
      lineShare: attributed ? aiLines / attributed : 0,
      commits: aiCommits,
      commitShare: humanCommits ? aiCommits / humanCommits : 0,
      assistants: [...per.entries()].map(([name, v]) => ({ name, ...v })).sort((x, y) => y.lines - x.lines || y.commits - x.commits || x.name.localeCompare(y.name)),
    };
  }
  /** @param {{ lines: number, commits: number, mail: string }} x @param {{ lines: number, commits: number, mail: string }} y */
  const compareDefault = (x, y) => y.lines - x.lines || y.commits - x.commits || x.mail.localeCompare(y.mail);
  // R10-1: the same lines counted with their blank lines. Under --co-authors share the split is not a plain line count,
  // so both bases are the same number there.
  const withBlankOfRow = (/** @type {{ lines: number, withBlank?: number }} */ a) => (o.coAuthors === "share" ? a.lines : a.withBlank ?? a.lines);
  let attributedWithBlank = 0;
  for (const a of authors.values()) attributedWithBlank += withBlankOfRow(a);
  let rows = [...authors.entries()].map(([mail, a]) => ({
    author: a.name,
    mail,
    lines: a.lines,
    lineShare: attributed ? a.lines / attributed : 0,
    commits: a.commits,
    commitShare: commits ? a.commits / commits : 0,
    linesWithBlank: withBlankOfRow(a),
    shareWithBlank: attributedWithBlank ? withBlankOfRow(a) / attributedWithBlank : 0,
  }));

  /** @param {typeof rows} list */
  const sortRows = (list) => {
    if (o.sort === "commits") {
      list.sort((x, y) => y.commits - x.commits || compareDefault(x, y));
    } else if (o.sort === "gap") {
      // The common denominator lets this integer numerator preserve exact ties without float drift.
      /** @param {{ lines: number, commits: number }} a */
      const gapNumerator = (a) => {
        const value = BigInt(a.lines) * BigInt(commits) - BigInt(a.commits) * BigInt(attributed);
        return value < 0n ? -value : value;
      };
      // Under --co-authors share the counts are fractions, which BigInt rejects, so that mode compares floats.
      const fractional = o.coAuthors === "share";
      list.sort((x, y) => {
        if (fractional && attributed > 0 && commits > 0) {
          const gap = (/** @type {{ lines: number, commits: number }} */ a) => Math.abs(a.lines * commits - a.commits * attributed);
          const gapDifference = round6(gap(y) - gap(x));
          if (gapDifference !== 0) return gapDifference;
        } else if (attributed > 0 && commits > 0) {
          const xGap = gapNumerator(x);
          const yGap = gapNumerator(y);
          if (xGap !== yGap) return xGap > yGap ? -1 : 1;
        } else {
          const gapDifference = Math.abs(y.lineShare - y.commitShare) - Math.abs(x.lineShare - x.commitShare);
          if (gapDifference !== 0) return gapDifference;
        }
        return compareDefault(x, y);
      });
    } else {
      list.sort(compareDefault);
    }
  };
  sortRows(rows);

  // R9-3: addresses that carry more than one author name are one row each (rows are keyed by address). The names and
  // the lines are read here, before any merge, so every view can say so.
  const sameAddress = sameAddressLines(sameAddressNames(await readAddressNames(o)), rows);
  // The identity links are read from the rows as blamed, before any merge, as the hint always was.
  const linked = linkIdentities(rows);
  // Looser evidence (names and addresses that differ), offered to the reader and never merged by any flag.
  const suggested = suggestSamePerson(rows, linked);
  /** @type {Map<string, { author: string, mail: string }>} */
  const canonicalOf = new Map();
  // --merge-identities merges the strong groups only (R8-5): a weak group, or a weak addition, stays on its own row.
  const mergeable = linked.filter((g) => g.strength === "strong");
  for (const g of mergeable) for (const m of g.members) canonicalOf.set(m.mail, { author: g.canonical.author, mail: g.canonical.mail });
  /** @type {Map<string, string[]> | null} */
  const membersOf = o.mergeIdentities ? new Map(mergeable.map((g) => [g.canonical.mail, g.members.map((m) => m.mail)])) : null;
  if (o.mergeIdentities) {
    rows = foldAddresses(rows, canonicalOf).map((a) => ({ ...a, lineShare: attributed ? a.lines / attributed : 0, commitShare: commits ? a.commits / commits : 0, shareWithBlank: attributedWithBlank ? a.linesWithBlank / attributedWithBlank : 0 }));
    sortRows(rows);
  }

  // The bus factor reads lines, most first. The rows may be sorted by commits or by the gap, so it takes its own copy.
  const byLines = [...rows].sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail));
  const runBusFactor = busFactor(byLines, o.busFactorThreshold);
  // R10-1: the same figure with blank lines counted, most such lines first.
  const byLinesWithBlank = rows.map((x) => ({ author: x.author, mail: x.mail, lines: x.linesWithBlank })).sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail));
  const runBusFactorWithBlank = busFactor(byLinesWithBlank, o.busFactorThreshold);
  let groups = grouping ? buildGroups(groupAcc, o.includeBots, o.busFactorThreshold) : null;
  if (groups && o.mergeIdentities) groups = groups.map((g) => ({ ...g, ...mergedLines(g.authors, g.lines, canonicalOf, o.busFactorThreshold) }));
  if (uncorrected && o.mergeIdentities) uncorrected = { ...uncorrected, ...mergedLines(uncorrected.authors, uncorrected.linesAttributed, canonicalOf, o.busFactorThreshold) };
  // One log call at the path serves both path views; --reviewers and --history cannot be asked for together.
  const pathView = o.reviewers ?? o.history;
  const pathCommits = pathView === undefined ? [] : await readPathCommits(o, pathView);
  const reviewers = o.reviewers === undefined ? null : { ...(await reviewersView(o, o.reviewers, rows, applied, membersOf, pathCommits)), movedIn: movedInFor(main.origins, o.reviewers) };
  const history = o.history === undefined ? null : { ...(await historyView(o, o.history, rows, membersOf, pathCommits, suspects, applied)), movedIn: movedInFor(main.origins, o.history) };
  // R10-3 and R10-2 read the run's own blame counts, with the names and merges the table uses.
  const nameOf = new Map([...authors].map(([mail, a]) => [mail, a.name]));
  const ownerMerge = o.mergeIdentities ? canonicalOf : new Map();
  const skipShas = new Set([...ignoredByUser, ...(applied ? suspects.map((x) => x.sha) : []), ...strongRewrites.map((c) => c.sha)]);
  const whitespace = await findWhitespaceOnlyCommits(o, new Set(all.map((f) => f.path)), skipShas, { blameArgs: mainArgs, perFile: main.perFileRaw, nameOf, canonicalOf: ownerMerge });
  const filesResult = o.files === undefined ? null : filesView(o.files, main.perFile, o.includeBots, ownerMerge, nameOf);
  const mailmap = await readMailmapMerges(o, blamedByCommit, rows);
  const lastCommits = await readLastCommits(o, rows, membersOf);
  return {
    ref: o.ref,
    sort: o.sort,
    shallow,
    sample: { every: o.sample, seed: o.seed, filesTotal: all.length, filesSampled: sampled.length, linesInRef: all.reduce((s, f) => s + f.lines, 0), linesWithBlank: all.reduce((s, f) => s + (f.withBlank ?? f.lines), 0), linesAttributed: attributed },
    commitWindow: { since: o.since ?? null, until: o.until ?? null, commits, mergesExcluded: true },
    coAuthors: o.coAuthors,
    aiAssisted,
    grouping: grouping && groups ? { by: grouping.kind === "dir" ? `dir:${grouping.depth}` : "ext", groups } : null,
    bots: { included: o.includeBots, excluded: botRows },
    dropped,
    blame: { flags: shownFlags, copyDetection, copyEffect: copyShift ? copyEffectOf(o, copyShift, rows, attributed, o.mergeIdentities ? canonicalOf : new Map(), copyDetection.flags ?? "") : null, ignoreRevsFile: ignoreRevs ? ignoreRevs.display : null, ignoreRevs: userRevs, autoIgnoredRevs: [...(applied ? suspects.map((s) => s.sha) : []), ...strongRewrites.map((c) => c.sha)] },
    reformat: { detection: detect, applied, suspects, uncorrected },
    mechanicalCheck,
    whitespaceOnlyCommits: whitespace.commits,
    whitespaceOnlySkipped: whitespace.skipped,
    files: filesResult && filesResult.files,
    filesSummary: filesResult && filesResult.summary,
    busFactor: runBusFactor && { thresholdPercent: o.busFactorThreshold, ...runBusFactor, authorsFor80Percent: busFactor(byLines, 80)?.value ?? null, withBlank: runBusFactorWithBlank && { thresholdPercent: o.busFactorThreshold, ...runBusFactorWithBlank, authorsFor80Percent: busFactor(byLinesWithBlank, 80)?.value ?? null } },
    identityHints: identityHintSummary(linked),
    possibleSamePerson: samePersonSummary(suggested),
    // Written whether or not the merge ran, so a consumer can tell a plain table from a merged one without a missing-key check.
    identityMerge: {
      applied: o.mergeIdentities,
      groups: o.mergeIdentities ? mergeable.map((g) => ({ name: g.canonical.author, mail: g.canonical.mail, addresses: [...g.members].sort(byCommitsThenLines).map((m) => ({ mail: m.mail, lines: m.lines, commits: m.commits })), lines: g.members.reduce((sum, m) => sum + m.lines, 0), commits: g.members.reduce((sum, m) => sum + m.commits, 0) })) : [],
    },
    mailmap,
    sameAddress,
    lastCommits,
    reviewers,
    history,
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

/** What a run in a shallow clone is marked with, on the first line of every output. */
export const SHALLOW_MARK = "shallow clone, history before the cut is blamed on the cut";

/**
 * The first line of the table and the Markdown output: what was sampled, and whether it can be trusted.
 * @param {Pick<Awaited<ReturnType<typeof analyse>>, "ref" | "sample"> & { shallow?: boolean }} r
 */
function headerLine(r) {
  const s = r.sample;
  return `ref ${r.ref}  ·  files ${s.filesSampled}/${s.filesTotal} sampled (1 in ${s.every}${s.seed ? `, seed "${s.seed}"` : ""})  ·  ${s.linesAttributed.toLocaleString("en-US")} of ${s.linesInRef.toLocaleString("en-US")} lines attributed${s.linesWithBlank > s.linesInRef ? ` (non-blank; ${s.linesWithBlank.toLocaleString("en-US")} with blank lines)` : ""}${r.shallow ? `  ·  ${SHALLOW_MARK}` : ""}`;
}

/**
 * The words that say Co-authored-by trailers moved lines and commits between people, or an empty string.
 * @param {{ coAuthors?: "none" | "share" }} r
 */
function coAuthorsNote(r) {
  return r.coAuthors === "share" ? "  ·  Co-authored-by trailers share lines and commits equally" : "";
}

/**
 * The AI-assistant block for --ai-breakdown, or null when it was not asked for. It counts trailers and says so.
 * @param {{ aiAssisted?: null | { lines: number, lineShare: number, commits: number, commitShare: number, assistants: { name: string, lines: number, commits: number }[] } }} r
 * @param {{ linesAttributed: number }} sample
 * @param {number} windowCommits
 * @returns {string | null}
 */
export function renderAiBreakdown(r, sample, windowCommits) {
  const a = r.aiAssisted;
  if (!a) return null;
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const out = ["AI-assisted, counted from commit trailers (Co-authored-by: with a documented assistant address, Assisted-by:):"];
  out.push(`  lines    ${n(a.lines)} of ${n(sample.linesAttributed)} attributed (${pct(a.lineShare)})`);
  out.push(`  commits  ${n(a.commits)} of ${n(windowCommits)} (${pct(a.commitShare)})`);
  for (const x of a.assistants) out.push(`  ${x.name}  ${n(x.lines)} line${x.lines === 1 ? "" : "s"}, ${n(x.commits)} commit${x.commits === 1 ? "" : "s"}`);
  out.push("A trailer records that a tool was named in the message. It does not say how much of a line the tool wrote,");
  out.push("and a commit without a trailer may still have had help. Nothing here is guessed from the code.");
  return out.join("\n");
}

/**
 * The lines under the header that say what was left out of the numbers: bots, then lockfiles, generated files and
 * vendored code, then the note that copy detection is off when size turned it off. Null when nothing applies. Silent
 * filtering in a tool about attribution would be the wrong default.
 * @param {{ bots?: { included: boolean, excluded: { lines: number, commits: number }[] }, dropped?: Parameters<typeof droppedLine>[0]["dropped"], blame?: { copyDetection?: { on: boolean, reason: string | null } } }} r
 * @returns {string | null}
 */
function botsLine(r) {
  const authors = /** @type {{ author: string, mail: string, lines: number, lineShare: number }[]} */ (/** @type {any} */ (r).authors ?? []);
  /** @type {string[]} */
  const out = [];
  const n = r.bots?.excluded.length ?? 0;
  if (r.bots && !r.bots.included && n > 0) {
    const lines = r.bots.excluded.reduce((s, b) => s + b.lines, 0);
    const commits = r.bots.excluded.reduce((s, b) => s + b.commits, 0);
    const names = /** @type {{ author?: string }[]} */ (r.bots.excluded).map((b) => b.author).filter(Boolean);
    const who = names.length ? ` (${names.slice(0, 3).join(", ")}${names.length > 3 ? ", ..." : ""})` : "";
    out.push(`bots excluded: ${n} identit${n === 1 ? "y" : "ies"}${who}, ${lines.toLocaleString("en-US")} lines, ${commits.toLocaleString("en-US")} commits (--include-bots counts them)`);
  }
  const holes = authors.filter((a) => a.lines > 0 && isPlaceholderIdentity(a.author, a.mail));
  if (holes.length) {
    const lines = holes.reduce((s, a) => s + a.lines, 0);
    const share = holes.reduce((s, a) => s + a.lineShare, 0);
    out.push(`placeholder identities: ${holes.slice(0, 3).map((a) => `${a.author} <${a.mail}>`).join(", ")}${holes.length > 3 ? ", ..." : ""} hold ${lines.toLocaleString("en-US")} lines (${(share * 100).toFixed(1)}%) that cannot be attributed to a person; they stay in the shares and are not someone to ask`);
  }
  const dropped = droppedLine(r);
  if (dropped) out.push(dropped);
  const copies = r.blame?.copyDetection;
  if (copies && !copies.on && copies.reason && copies.reason !== "--no-copies") {
    out.push(`copy detection off: ${copies.reason}, so code moved or copied between files is credited to whoever moved it (-w -M only). --copies turns it on (slower)`);
  }
  return out.length ? out.join("\n") : null;
}

/**
 * The one line of the mechanical-rewrite check: how many commits holding surviving lines were examined, how many were
 * set aside, and each commit that looks mechanical and was not set aside, with its author, subject and surviving
 * lines. Null for a result without the check.
 * @param {{ mechanicalCheck?: Awaited<ReturnType<typeof findMechanicalCandidates>> }} r
 * @returns {string | null}
 */
export function mechanicalLine(r) {
  const m = r.mechanicalCheck;
  if (!m) return null;
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const scope = m.truncated ? `the ${n(m.examined)} largest of ${n(m.total)} commits` : `${n(m.examined)} commit${m.examined === 1 ? "" : "s"}`;
  const head = `mechanical rewrites checked: examined ${scope} holding surviving lines${m.truncated ? " (the rest were not examined)" : ""}, set aside ${n(m.setAside)}${m.ignoredByUser ? `, ignored by you ${n(m.ignoredByUser)}` : ""}`;
  const one = (/** @type {{ shortSha: string, subject: string, author: string, survivingLines: number }} */ c) => `${c.shortSha} "${c.subject}" by ${c.author}, ${n(c.survivingLines)} surviving line${c.survivingLines === 1 ? "" : "s"}`;
  const looked = m.setAsideCommits?.length ? `; rewrites looked through (the same small change in many files and a tool named in the subject; their lines go back to the people who wrote them before): ${m.setAsideCommits.slice(0, 5).map(one).join("; ")}` : "";
  if (!m.candidates.length) return `${head}${looked}; no other commit looks mechanical (at least ${MECHANICAL_MIN_FILES} files with the same small change, or a formatter, lint fix, codemod or rename tool in the subject).`;
  const shown = m.candidates.slice(0, 5).map(one);
  const rest = m.candidates.length - shown.length;
  return `${head}${looked}; ${m.candidates.length} more look${m.candidates.length === 1 ? "s" : ""} mechanical and ${m.candidates.length === 1 ? "was" : "were"} not set aside: ${shown.join("; ")}${rest > 0 ? `; and ${rest} more` : ""}. Inspect with git show --stat; to count without one, re-run with --ignore-rev.`;
}

/**
 * The one scope note about copy detection: when it moved lines, the three people whose share changed most against a
 * run without it, each with both figures. Null when copy detection moved nothing or was off.
 * @param {{ blame?: { copyEffect?: { flags: string, files: number, lines: number, people: { author: string, lines: number, lineShare: number, linesWithout: number, lineShareWithout: number }[] } | null } }} r
 * @returns {string | null}
 */
export function copyEffectLine(r) {
  const e = r.blame?.copyEffect;
  if (!e) return null;
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const people = e.people.map((p) => `${p.author} ${pct(p.lineShare)} (${n(p.lines)} lines) with, ${pct(p.lineShareWithout)} (${n(p.linesWithout)} lines) without`);
  return `copy detection (-w -M ${e.flags}) moved ${n(e.lines)} line${e.lines === 1 ? "" : "s"} in ${n(e.files)} file${e.files === 1 ? "" : "s"} to another author. Largest changes in share against -w -M only: ${people.join("; ")}. --no-copies counts without it.`;
}

/**
 * Names for a bus factor line: at most three, then a count of the rest, so the line stays one line.
 * @param {string[]} names
 */
function listNames(names) {
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  return shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/**
 * The part of a bus factor line after its number: who holds the lines and how many there are. One author reads
 * "alone", more read "together".
 * @param {{ value: number, authors: string[], covered: number, total: number }} bf
 * @param {string} noun what the lines are called, "surviving lines" or "lines"
 * @param {string[]} [names] the names to print in place of bf.authors, for rows that need their address
 */
function busFactorWords(bf, noun, names = bf.authors) {
  const who = bf.value === 1 ? "alone holds" : "together hold";
  return `${listNames(names)} ${who} ${pct(bf.covered)} of ${bf.total.toLocaleString("en-US")} ${noun}`;
}

/**
 * R10-1: true when some author's lines differ with and without blank lines, that is when a blank line was dropped from
 * the counted lines. Then the two bases are printed side by side.
 * @param {{ lines: number, linesWithBlank?: number }[]} rows
 */
function hasBlankBasis(rows) {
  return rows.some((a) => a.linesWithBlank !== undefined && a.linesWithBlank !== a.lines);
}

/**
 * The line that states a bus factor, or null when there is none.
 * @param {{ value: number, authors: string[], covered: number, total: number, authorsFor80Percent?: number | null, withBlank?: { value: number, total: number, authorsFor80Percent?: number | null } | null } | null | undefined} bf
 * @param {{ author: string, mail: string, lines: number, linesWithBlank?: number }[]} [rows] the rows the bus factor was computed from; with them a shared name shows its address
 * @returns {string | null}
 */
export function busFactorLine(bf, rows) {
  if (!bf) return null;
  const n = "authorsFor80Percent" in bf ? bf.authorsFor80Percent : null;
  const reach = typeof n === "number" ? ` · to reach 80%: ${n} author${n === 1 ? "" : "s"}` : "";
  const wb = "withBlank" in bf ? bf.withBlank : null;
  if (wb && rows && hasBlankBasis(rows)) {
    // R10-1: both bases. The people named are the same on both; their share is read on each basis.
    const names = labelledBusNames(bf, rows);
    const top = [...rows].sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail)).slice(0, bf.value);
    const held = top.reduce((sum, a) => sum + (a.linesWithBlank ?? a.lines), 0);
    const nl = (/** @type {number} */ x) => x.toLocaleString("en-US");
    const both = `${busFactorWords(bf, "non-blank lines", names)} (${pct(wb.total ? held / wb.total : 0)} of ${nl(wb.total)} lines with blank lines)`;
    const m = wb.authorsFor80Percent;
    const reach80Differs = typeof n === "number" && typeof m === "number" && m !== n;
    const counting = wb.value !== bf.value || reach80Differs ? ` · counting blank lines: bus factor ${wb.value}${reach80Differs ? `, to reach 80%: ${m} author${m === 1 ? "" : "s"}` : ""}` : "";
    return `bus factor ${bf.value}: ${both}${reach}${counting}`;
  }
  return `bus factor ${bf.value}: ${busFactorWords(bf, "surviving lines", labelledBusNames(bf, rows))}${reach}`;
}

/**
 * The names a bus factor lists, with `Name <address>` for any name that two rows share, as the table does. The bus
 * factor carries names only, so the addresses come from the rows it was computed from: the first `value` of them,
 * most lines first. When those rows do not line up with the names (a result from another source), the plain names stay.
 * @param {{ value: number, authors: string[] }} bf
 * @param {{ author: string, mail: string, lines: number, addresses?: number }[] | undefined} rows every row the bus factor was computed from
 * @param {{ author: string, mail: string }[] | undefined} [nameRows] the rows whose shared names are told apart; the table's rows
 * @returns {string[]}
 */
function labelledBusNames(bf, rows, nameRows = rows) {
  if (!rows || !nameRows) return bf.authors;
  const count = new Map();
  for (const a of nameRows) count.set(a.author, (count.get(a.author) ?? 0) + 1);
  const top = [...rows].sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail)).slice(0, bf.value);
  if (top.length !== bf.authors.length || top.some((a, i) => a.author !== bf.authors[i])) return bf.authors;
  return top.map((a) => ((a.addresses ?? 0) > 1 ? `${a.author} (${a.addresses} addresses)` : (count.get(a.author) ?? 0) > 1 ? isolate(`${a.author} <${a.mail}>`) : a.author));
}

/**
 * The definition printed once per output, so a reader knows what the number measures and what it does not.
 * @param {number} thresholdPercent
 */
function busFactorDefinition(thresholdPercent) {
  return `bus factor = the smallest number of authors whose surviving lines together reach ${thresholdPercent}% of the lines counted (change with --bus-factor-threshold). It measures how concentrated the code that is left is, not who understands it.`;
}

/**
 * The bus factor line and its definition for a whole run's table, or nothing when there is no bus factor.
 * @param {{ value: number, authors: string[], covered: number, total: number, thresholdPercent: number } | null} bf
 * @param {{ author: string, mail: string, lines: number }[]} [rows] see busFactorLine
 * @returns {string[]}
 */
function busFactorBlock(bf, rows) {
  const line = busFactorLine(bf, rows);
  return bf && line ? [line, busFactorDefinition(bf.thresholdPercent)] : [];
}

/**
 * The block under the table about commits that only changed whitespace or quotes, or null when there are none.
 * Applied (the default), it says the commits are left out of the table and what the table would show with them
 * counted. Not applied (--keep-reformat, or --co-authors share), it names them and says the numbers include them.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @returns {string[] | null}
 */
export function reformatBlock(r) {
  const suspects = r.reformat?.suspects ?? [];
  if (!suspects.length) return null;
  const many = suspects.length > 1;
  const it = many ? "them" : "it";
  const n = r.sample.linesAttributed;
  if (r.reformat.applied && r.reformat.uncorrected) return appliedBlock(r, r.reformat.uncorrected, suspects, it);
  const header = `reformat suspected (looks like whitespace and quote changes only): ${suspects.length} commit${many ? "s" : ""}`;
  const out = [header];
  for (const s of suspects) {
    out.push(`  ${s.shortSha} "${s.subject}" by ${s.author}, ${s.date}, ${s.survivingLines.toLocaleString("en-US")} surviving lines (${pct(n ? s.survivingLines / n : 0)} of the lines counted above)`);
  }
  if (r.coAuthors === "share") {
    out.push(`  the correction is not applied with --co-authors share: the numbers above include ${it}.`);
  } else {
    const flags = many ? suspects.map((s) => `--ignore-rev ${s.sha}`).join(" ") : `--ignore-rev ${suspects[0].shortSha}`;
    out.push(`  the numbers above include ${it}. Re-run with ${flags} to apply ${it}, or add ${it} to .git-blame-ignore-revs.`);
  }
  return out;
}

/**
 * The block for an applied correction: the suspects, the line count each had in the plain count, one line on what the
 * table would show without the correction (the authors whose count moves, largest move first, at most five), and the
 * bus factor of that plain count.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {NonNullable<Awaited<ReturnType<typeof analyse>>["reformat"]["uncorrected"]>} counted
 * @param {Awaited<ReturnType<typeof analyse>>["reformat"]["suspects"]} suspects
 * @param {string} it "it" or "them"
 * @returns {string[]}
 */
function appliedBlock(r, counted, suspects, it) {
  const many = suspects.length > 1;
  const out = [`reformat commit${many ? "s" : ""} ignored (looks like whitespace and quote changes only): ${suspects.length} commit${many ? "s" : ""}`];
  for (const s of suspects) {
    out.push(`  ${s.shortSha} "${s.subject}" by ${s.author}, ${s.date}, ${s.survivingLines.toLocaleString("en-US")} lines in the plain count`);
  }
  // A name two addresses share shows its address, the same rule the table uses. The names are read from both lists,
  // so an address that only the plain count holds is labelled as the table would label it.
  /** @type {Map<string, string>} */
  const nameOf = new Map([...r.authors, ...counted.authors].map((a) => [a.mail, a.author]));
  /** @type {Map<string, Set<string>>} */
  const mailsOf = new Map();
  for (const [mail, name] of nameOf) mailsOf.set(name, (mailsOf.get(name) ?? new Set()).add(mail));
  /** @type {Map<string, number>} */
  const addressesOf = new Map([...counted.authors, ...r.authors].map((/** @type {{ mail: string, addresses?: number }} */ a) => [a.mail, a.addresses ?? 0]));
  const label = (/** @type {string} */ mail) => {
    const name = /** @type {string} */ (nameOf.get(mail));
    if ((addressesOf.get(mail) ?? 0) > 1) return `${name} (${addressesOf.get(mail)} addresses)`;
    return (mailsOf.get(name)?.size ?? 0) > 1 ? isolate(`${name} <${mail}>`) : name;
  };
  const shown = new Map(r.authors.map((a) => [a.mail, a.lines]));
  const plain = new Map(counted.authors.map((a) => [a.mail, a]));
  const moved = [...nameOf.keys()]
    .map((mail) => ({ label: label(mail), lines: plain.get(mail)?.lines ?? 0, share: plain.get(mail)?.lineShare ?? 0, now: shown.get(mail) ?? 0 }))
    .filter((m) => m.lines !== m.now)
    .sort((x, y) => Math.abs(y.lines - y.now) - Math.abs(x.lines - x.now) || x.label.localeCompare(y.label))
    .slice(0, 5);
  const without = moved.length ? ` Without the correction: ${moved.map((m) => `${m.label} ${m.lines.toLocaleString("en-US")} (${pct(m.share)})`).join(", ")}.` : "";
  out.push(`  The table above does not count ${it}.${without} --keep-reformat counts ${it}.`);
  // The bus factor of the plain count, named the way the table names its own.
  const plainBf = counted.busFactor;
  if (plainBf) out.push(`  bus factor without the correction: ${plainBf.value} (${busFactorWords(plainBf, "lines", labelledBusNames(plainBf, counted.authors, r.authors))})`);
  return out;
}

/**
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {number} top
 */
/** The default table (R9-4): every author with at least this share of the lines, within MIN_ROWS and MAX_ROWS rows. */
const DEFAULT_ROW_SHARE = 0.01;
const DEFAULT_MIN_ROWS = 10;
const DEFAULT_MAX_ROWS = 25;

/**
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {number | null} top an explicit --top, or null for the default rows (R9-4) and the last-commit column
 */
export function renderTable(r, top) {
  const lines = [];
  lines.push(headerLine(r));
  const w = r.commitWindow;
  lines.push(`git blame ${r.blame.flags.join(" ")}  ·  commits ${w.commits.toLocaleString("en-US")}${w.since || w.until ? ` in window ${w.since ?? "…"} to ${w.until ?? "…"}` : ""}, merges excluded${coAuthorsNote(r)}`);
  lines.push("");
  const nameCount = new Map();
  for (const a of r.authors) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const label = (/** @type {{author: string, mail: string, addresses?: number}} */ a) => rowLabel(a, nameCount);
  const byDefault = top === null;
  const shown = byDefault ? Math.min(DEFAULT_MAX_ROWS, Math.max(DEFAULT_MIN_ROWS, r.authors.filter((a) => a.lineShare >= DEFAULT_ROW_SHARE).length)) : top;
  const rows = r.authors.slice(0, shown);
  const nameW = Math.max(6, ...rows.map((a) => displayWidth(label(a))));
  const lastOf = (/** @type {{ mail: string }} */ a) => (r.lastCommits?.[a.mail] ?? "").padEnd(10);
  const both = hasBlankBasis(r.authors);
  const head = `${padEndDisplay("author", nameW)}  ${"lines".padStart(9)}  ${"share".padStart(6)}${both ? `  ${"with blank".padStart(10)}  ${"share".padStart(6)}` : ""}  ${"commits".padStart(7)}  ${"share".padStart(6)}${byDefault ? "  last commit" : ""}`;
  lines.push(head);
  lines.push("-".repeat(displayWidth(head)));
  for (const a of rows) {
    lines.push(`${padEndDisplay(label(a), nameW)}  ${a.lines.toLocaleString("en-US").padStart(9)}  ${pct(a.lineShare).padStart(6)}${both ? `  ${(a.linesWithBlank ?? a.lines).toLocaleString("en-US").padStart(10)}  ${pct(a.shareWithBlank ?? a.lineShare).padStart(6)}` : ""}  ${a.commits.toLocaleString("en-US").padStart(7)}  ${pct(a.commitShare).padStart(6)}${byDefault ? `  ${lastOf(a)}`.trimEnd() : ""}`);
  }
  const tail = r.authors.slice(shown);
  if (tail.length && byDefault) {
    // The tail line names the count, the combined share and the largest tail author, so a reader can still say who is there.
    const largest = [...tail].sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail))[0];
    const together = tail.reduce((sum, a) => sum + a.lineShare, 0);
    lines.push(`… ${tail.length} more author${tail.length === 1 ? "" : "s"} hold${tail.length === 1 ? "s" : ""} ${pct(together)} together; largest: ${label(largest)} ${pct(largest.lineShare)}`);
  } else if (tail.length) {
    lines.push(`… ${tail.length} more author${tail.length === 1 ? "" : "s"}`);
  }
  const bus = busFactorBlock(r.busFactor, r.authors);
  if (bus.length) lines.push("", ...bus);
  const notes = scopeNotes(r);
  if (notes.length) lines.push("", ...notes);
  lines.push("");
  lines.push("What this cannot show: quality of the lines, review work, design done in documents,");
  lines.push("or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit.");
  return lines.join("\n");
}

/**
 * The --reviewers view: a title naming the path and the as-of date, the owners table, the suggested owners, and the
 * reformat block when there are suspects. The header and the bots line come first, as in the table.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {number} top
 */
export function renderReviewers(r, top) {
  const v = r.reviewers;
  if (!v) throw new Error("renderReviewers needs a result from --reviewers");
  const lines = [headerLine(r)];
  lines.push("", `who should review ${v.path}  (surviving lines in ${v.path}, as of ${v.asOf})`);
  const nameCount = new Map();
  for (const a of v.authors) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const label = (/** @type {{author: string, mail: string, addresses?: number}} */ a) => rowLabel(a, nameCount);
  const shown = v.authors.slice(0, top);
  const nameW = Math.max(6, ...shown.map((a) => displayWidth(label(a))));
  const head = `${padEndDisplay("author", nameW)}  ${"lines".padStart(9)}  ${"share".padStart(6)}  ${"commits".padStart(7)}  ${"last commit".padEnd(11)}  activity`;
  lines.push(head);
  lines.push("-".repeat(displayWidth(head)));
  for (const a of shown) {
    lines.push(`${padEndDisplay(label(a), nameW)}  ${a.lines.toLocaleString("en-US").padStart(9)}  ${pct(a.lineShare).padStart(6)}  ${a.commits.toLocaleString("en-US").padStart(7)}  ${(a.lastCommit ?? "-").padEnd(11)}  ${a.active ? "active" : "inactive"}`);
  }
  if (v.authors.length > top) lines.push(`… ${v.authors.length - top} more author${v.authors.length - top === 1 ? "" : "s"}`);
  lines.push(`rows are ordered by surviving lines; the last commit date and the active marker (a commit in the ${v.inactiveAfterDays} days before ${v.asOf}) are information and do not change the order.`);
  // The run's bus factor is the path's: the rows were blamed over the path alone.
  const bus = busFactorBlock(r.busFactor, r.authors);
  if (bus.length) lines.push("", ...bus, "");
  const manySuspects = (r.reformat?.suspects.length ?? 0) > 1;
  const heading = v.suggestedBasis === "reformatIgnored" ? `suggested by surviving lines (with the suspected reformat commit${manySuspects ? "s" : ""} ignored)` : "suggested by surviving lines";
  const person = (/** @type {typeof v.suggested[number]} */ p) => `${p.author} (${p.lines.toLocaleString("en-US")} lines, ${pct(p.lineShare)}${p.mails.length > 1 ? `, ${p.mails.length} addresses` : ""}, last commit ${p.lastCommit ?? "unknown"}, ${p.active ? "active" : "inactive"})`;
  lines.push(v.suggested.length ? `${heading}: ${v.suggested.map(person).join(", ")}` : "suggested: none, no author holds a surviving line here");
  if (v.suggestedActiveOnly) {
    lines.push(v.suggestedActiveOnly.length ? `active only (a cut by recent commits; the line-ranked list above is the ownership answer): ${v.suggestedActiveOnly.map(person).join(", ")}` : "active only: nobody with lines here committed in the active window; the line-ranked list above is the ownership answer");
  }
  // Only the rows the table shows are named here, three at most, so the line stays one line.
  // A person is active when any of their addresses is, so two addresses under one name are judged together.
  const activePeople = new Set(v.authors.filter((a) => a.active).map((a) => foldIdentity(a.author)));
  const idle = [...new Set(shown.filter((a) => a.lines > 0 && !activePeople.has(foldIdentity(a.author))).map((a) => a.author))];
  if (idle.length) {
    const named = idle.slice(0, 3);
    const more = idle.length - named.length;
    lines.push(`not active in the year before ${v.asOf}: ${named.join(", ")}${more ? `, and ${more} more` : ""}`);
  }
  const notes = scopeNotes(r, { view: v });
  if (notes.length) lines.push("", ...notes);
  return lines.join("\n");
}

/**
 * The line that says part of a path's lines were written elsewhere, or null below the share that matters.
 * @param {{ path: string, movedIn?: { lines: number, of: number, share: number, largest: { path: string, lines: number }[] } | null }} v
 * @returns {string | null}
 */
function movedInLine(v) {
  const m = v.movedIn;
  if (!m || m.share < MOVED_IN_MIN_SHARE) return null;
  return `${m.lines.toLocaleString("en-US")} of ${m.of.toLocaleString("en-US")} lines (${pct(m.share)}) in ${v.path} were written in other paths and moved or copied here (largest source: ${m.largest.map((l) => l.path).join(", ")}); the credit goes to the people who wrote them, not to whoever moved them.`;
}

/**
 * The --history view: a title naming the path, the as-of date and the number of people, the people oldest first, one
 * sentence on who made the first commit and who holds the most lines now, the bus factor and the identity hint as in
 * the reviewers view, and the set-aside formatting commits. The header and the bots line come first, as in the table.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {number} top
 */
export function renderHistory(r, top) {
  const h = r.history;
  if (!h) throw new Error("renderHistory needs a result from --history");
  const lines = [headerLine(r)];
  const people = h.authors.length;
  lines.push("", `history of ${h.path} (${people} ${people === 1 ? "person" : "people"} changed it, oldest first; surviving lines as of ${h.asOf})`);
  const nameCount = new Map();
  for (const a of h.authors) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const label = (/** @type {{author: string, mail: string, addresses?: number}} */ a) => rowLabel(a, nameCount);
  const shown = h.authors.slice(0, top);
  const nameW = Math.max(6, ...shown.map((a) => displayWidth(label(a))));
  const head = `${padEndDisplay("author", nameW)}  ${"first commit".padEnd(12)}  ${"last commit".padEnd(12)}  ${"commits".padStart(7)}  ${"lines now".padStart(9)}`;
  if (h.authors.length) {
    lines.push(head);
    lines.push("-".repeat(displayWidth(head)));
    for (const a of shown) {
      lines.push(`${padEndDisplay(label(a), nameW)}  ${a.firstCommit.padEnd(12)}  ${a.lastCommit.padEnd(12)}  ${a.commits.toLocaleString("en-US").padStart(7)}  ${a.lines.toLocaleString("en-US").padStart(9)}`);
    }
    if (h.authors.length > top) lines.push(`… ${h.authors.length - top} more ${h.authors.length - top === 1 ? "person" : "people"}`);
    // The first committer is the oldest row; the holder of most lines is the largest, the older one on a tie.
    const first = h.authors[0];
    // A person a strong suggestion counts as one is compared by the merged figure, the one the headline leads with.
    const leadLines = (/** @type {typeof h.authors[number]} */ a) => {
      const g = identityGroupOf(r, a);
      return g?.strength === "strong" ? g.lines : a.lines;
    };
    const most = h.authors.reduce((best, a) => (leadLines(a) > leadLines(best) ? a : best));
    const figuresOf = (/** @type {{ mail: string, lines: number, lineShare: number }} */ a) => leadFigure(r, a);
    const figures = figuresOf(most);
    // Lines moved or copied in belong to people with no commit on this path, so they are not in the rows above.
    const holder = r.authors.reduce((best, a) => (a.lines > (best?.lines ?? -1) ? a : best), /** @type {(typeof r.authors)[number] | undefined} */ (undefined));
    const onPath = (/** @type {{ mail: string }} */ a) => h.authors.some((x) => x.mail === a.mail);
    if (holder && leadLines(holder) > leadLines(most) && !onPath(holder)) {
      lines.push(`${first.author} made the first commit, on ${first.firstCommit}; ${holder.author} holds the most lines now (${figuresOf(holder)}) and has no commit on this path, because those lines were written in other paths and moved or copied here.`);
    } else lines.push(
      most === first
        ? `${first.author} made the first commit, on ${first.firstCommit}, and holds the most lines now (${figures}).`
        : `${first.author} made the first commit, on ${first.firstCommit}; ${most.author} holds the most lines now (${figures}).`,
    );
  } else {
    lines.push("no counted commit touches this path: every commit here is a set-aside formatting change");
  }
  // The run's bus factor is the path's: the rows were blamed over the path alone.
  const bus = busFactorBlock(r.busFactor, r.authors);
  if (bus.length) lines.push("", ...bus);
  const notes = scopeNotes(r, { view: h });
  if (notes.length) lines.push("", ...notes);
  if (h.setAside.length) {
    // Under --keep-reformat the same commits are counted, so the block says so rather than claiming they are left out.
    lines.push("", r.reformat.applied ? "set aside (formatting-only commits touching this path, left out of the counts):" : "formatting-only commits touching this path (counted, because of --keep-reformat):");
    for (const s of h.setAside) lines.push(`  ${s.shortSha}  ${s.date}  ${s.author}  ${s.subject}`);
  }
  return lines.join("\n");
}

/**
 * One block per group: its name, how many sampled files it rests on, and its authors' line shares.
 * Commit share stays a whole-repository number, so it is not repeated here.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {number} top
 */
export function renderGroups(r, top) {
  const lines = [];
  lines.push(headerLine(r));
  const w = r.commitWindow;
  lines.push(`git blame ${r.blame.flags.join(" ")}  ·  commits ${w.commits.toLocaleString("en-US")}${w.since || w.until ? ` in window ${w.since ?? "…"} to ${w.until ?? "…"}` : ""}, merges excluded`);
  const nameCount = new Map();
  for (const a of r.authors) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const label = (/** @type {{author: string, mail: string, addresses?: number}} */ a) => rowLabel(a, nameCount);
  /** @type {number | null} */
  let groupThreshold = null;
  for (const g of r.grouping?.groups ?? []) {
    lines.push("");
    lines.push(`${g.key}  ·  ${g.filesSampled} file${g.filesSampled === 1 ? "" : "s"} sampled  ·  ${g.lines.toLocaleString("en-US")} lines`);
    const rows = g.authors.slice(0, top);
    const nameW = Math.max(6, ...rows.map((a) => displayWidth(label(a))));
    const head = `${padEndDisplay("author", nameW)}  ${"lines".padStart(9)}  ${"share".padStart(6)}`;
    lines.push(head);
    lines.push("-".repeat(displayWidth(head)));
    for (const a of rows) lines.push(`${padEndDisplay(label(a), nameW)}  ${a.lines.toLocaleString("en-US").padStart(9)}  ${pct(a.lineShare).padStart(6)}`);
    if (g.authors.length > top) lines.push(`… ${g.authors.length - top} more author${g.authors.length - top === 1 ? "" : "s"}`);
    const groupLine = busFactorLine(g.busFactor, g.authors);
    if (groupLine) {
      lines.push("", groupLine);
      groupThreshold = g.busFactor?.thresholdPercent ?? null;
    }
  }
  // The hint is about the whole run's authors, not one group, so it is its own paragraph after every group.
  if (groupThreshold !== null) lines.push("", busFactorDefinition(groupThreshold));
  const notes = scopeNotes(r);
  if (notes.length) lines.push("", ...notes);
  lines.push("");
  lines.push("What this cannot show: quality of the lines, review work, design done in documents,");
  lines.push("or code that was deleted on purpose. Share of surviving lines is about survivorship, not merit.");
  return lines.join("\n");
}

/** A top author must hold at least this share of a directory's surviving lines to be suggested as its owner. */
export const OWNER_THRESHOLD = 0.5;

/**
 * CODEOWNERS lines for a `--group-by dir` result. Printed, never written. A directory gets an owner
 * only when one author holds at least OWNER_THRESHOLD of its sampled surviving lines; otherwise the
 * line is a comment that says so. Files at the root are skipped: the pattern that matches only them
 * does not exist, and `/*` would also match every directory.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderCodeowners(r) {
  const out = ["# CODEOWNERS suggestions from sampled surviving lines. Printed only; nothing was written.", "# Surviving lines say who wrote the code that is left, not who should review changes to it."];
  // A later CODEOWNERS pattern overrides an earlier one, so a directory is listed before the directories inside it.
  const ordered = [...(r.grouping?.groups ?? [])].sort((x, y) => x.key.localeCompare(y.key));
  for (const g of ordered) {
    if (g.key === ".") {
      out.push("# (files at the repository root) skipped: a CODEOWNERS pattern for them would also match every directory");
      continue;
    }
    const top = g.authors[0];
    const basis = `${g.filesSampled} sampled file${g.filesSampled === 1 ? "" : "s"}`;
    if (!top) {
      out.push(`# /${g.key}/ no surviving lines in ${basis}`);
    } else if (top.lineShare >= OWNER_THRESHOLD) {
      const login = githubLogin(top.mail);
      out.push(`/${g.key}/ ${login ? `@${login}` : top.mail}  # ${top.author} holds ${pct(top.lineShare)} of ${g.lines.toLocaleString("en-US")} lines in ${basis}`);
    } else {
      out.push(`# /${g.key}/ no author holds half of ${g.lines.toLocaleString("en-US")} lines in ${basis}; top is ${top.author} at ${pct(top.lineShare)}`);
    }
  }
  return out.join("\n");
}

/**
 * CSV with one row per author, all authors, shares as fractions. Quotes fields that need it.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderCsv(r) {
  const q = (/** @type {string} */ v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const both = hasBlankBasis(r.authors);
  const rows = [`author,mail,lines,line_share,commits,commit_share${both ? ",lines_with_blank,line_share_with_blank" : ""}`];
  for (const a of r.authors) rows.push([q(a.author), q(a.mail), a.lines, a.lineShare.toFixed(4), a.commits, a.commitShare.toFixed(4), ...(both ? [a.linesWithBlank ?? a.lines, (a.shareWithBlank ?? a.lineShare).toFixed(4)] : [])].join(","));
  return rows.join("\n");
}

/**
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {number} top
 */
export function renderMarkdown(r, top) {
  const lines = [];
  lines.push(headerLine(r));
  const w = r.commitWindow;
  lines.push(
    `git blame ${r.blame.flags.join(" ")}  ·  commits ${w.commits.toLocaleString("en-US")}${w.since || w.until ? ` in window ${w.since ?? "…"} to ${w.until ?? "…"}` : ""}, merges excluded${coAuthorsNote(r)}`
  );
  lines.push("");

  const nameCount = new Map();
  for (const a of r.authors) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const label = (/** @type {{author: string, mail: string, addresses?: number}} */ a) => {
    // Backslashes first: escaping only the pipe turns `\|` into `\\|`, a literal backslash and a cell separator.
    const author = a.author.replace(/[\\|]/g, "\\$&");
    const mail = a.mail.replace(/[\\|]/g, "\\$&");
    if ((a.addresses ?? 0) > 1) return `${author} (${a.addresses} addresses)`;
    return (nameCount.get(a.author) ?? 0) > 1 ? `${author} <${mail}>` : author;
  };
  const rows = r.authors.slice(0, top);

  const both = hasBlankBasis(r.authors);
  lines.push(`| author | lines | line share |${both ? " with blank | share with blank |" : ""} commits | commit share |`);
  lines.push(`| --- | ---: | ---: |${both ? " ---: | ---: |" : ""} ---: | ---: |`);

  for (const a of rows) {
    lines.push(
      `| ${label(a)} | ${a.lines.toLocaleString("en-US")} | ${pct(a.lineShare)} |${both ? ` ${(a.linesWithBlank ?? a.lines).toLocaleString("en-US")} | ${pct(a.shareWithBlank ?? a.lineShare)} |` : ""} ${a.commits.toLocaleString("en-US")} | ${pct(a.commitShare)} |`
    );
  }

  if (r.authors.length > top) {
    lines.push("");
    lines.push(
      `… ${r.authors.length - top} more author${r.authors.length - top === 1 ? "" : "s"}`
    );
  }

  // A blank line first: a plain line directly under a Markdown table would be read as another row.
  // Markdown joins neighbouring lines into one paragraph, so each of these gets a blank line around it.
  const bus = busFactorBlock(r.busFactor, r.authors);
  if (bus.length) lines.push("", bus[0], "", bus[1]);
  // A note block is plain lines in the table; here every line of it is its own paragraph.
  const notes = scopeNotes(r);
  if (notes.length) lines.push("", ...notes.map((l) => (l === "" ? l : `${l}\n`)));
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
 * Whether a full name equals an address name (R9-1): the name has two or more words made of letters, and its letters
 * (case and accents folded) are exactly the letters of the address name once the separators . _ - are removed. An
 * address name with a digit or any other character never matches. Every name word has at least two letters (an initial
 * plus a surname, "J. Smith" and jsmith, is not a full name), the address name has at least four letters, and a name
 * with a digit never matches.
 * @param {string} name
 * @param {string} local the part of the address before the @, without a GitHub noreply id prefix
 */
export function fullNameIsAddressName(name, local) {
  const words = foldIdentity(name).normalize("NFD").replace(/\p{M}/gu, "").split(/[^\p{L}]+/u).filter(Boolean);
  if (/\p{N}/u.test(name) || words.length < 2 || words.some((w) => [...w].length < 2) || !/^[\p{L}._-]+$/u.test(local)) return false;
  const joined = words.join("");
  const address = local.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[._-]/g, "");
  return address.length >= 4 && joined === address;
}

/**
 * Group addresses that look like one person, with the signal behind each grouping. This reads
 * only what is already in the repository's own history, proposes and never writes, and cannot
 * know whether two identities really are one person: it reports the evidence and stops.
 * @param {{author: string, mail: string, lines: number, lineShare: number, commits: number}[]} authors
 */
export function linkIdentities(authors) {
  const people = authors.filter((a) => !isBotAddress(a.mail));
  /** @type {Map<number, Set<number>>} */
  const edges = new Map();
  /** @type {Map<string, { kind: "name" | "login" | "stem", text: string }[]>} */
  const why = new Map();
  const link = (/** @type {number} */ i, /** @type {number} */ j, /** @type {"name" | "login" | "stem"} */ kind, /** @type {string} */ reason) => {
    if (!edges.has(i)) edges.set(i, new Set());
    if (!edges.has(j)) edges.set(j, new Set());
    edges.get(i)?.add(j);
    edges.get(j)?.add(i);
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    const list = why.get(key) ?? [];
    if (!list.some((e) => e.text === reason)) list.push({ kind, text: reason });
    why.set(key, list);
  };

  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];
      if (a.author && b.author && foldIdentity(a.author) === foldIdentity(b.author)) {
        link(i, j, "name", `the same name, "${a.author}", on two addresses`);
      }
      const [la, lb] = [githubLogin(a.mail), githubLogin(b.mail)];
      const localOf = (/** @type {string} */ m) => m.split("@")[0].replace(/^\d+\+/, "");
      for (const [login, other] of /** @type {[string | null, typeof a][]} */ ([[la, b], [lb, a]])) {
        if (!login) continue;
        if (loose(login) === loose(localOf(other.mail)) || (other.author && loose(login) === loose(other.author))) {
          link(i, j, "login", `the GitHub login "${login}" also appears as ${loose(login) === loose(localOf(other.mail)) ? "the address" : "the name"} on the other`);
        }
      }
      // R9-1: the full name of one identity (two or more words) is exactly the address name of the other, once case,
      // accents, punctuation and the dots or dashes of the address are removed. Part of a name inside an address is not
      // this rule; suggestSamePerson keeps that as weak evidence.
      for (const [named, addressed] of /** @type {[typeof a, typeof a][]} */ ([[a, b], [b, a]])) {
        if (fullNameIsAddressName(named.author ?? "", localOf(addressed.mail))) {
          link(i, j, "name", `the full name "${named.author}" is the address name of ${addressed.mail}`);
        }
      }
      if (!la && !lb) {
        const [pa, pb] = [localOf(a.mail), localOf(b.mail)];
        if (pa === pb && pa.length >= 3 && !GENERIC_LOCAL.has(pa) && a.mail !== b.mail) {
          link(i, j, "stem", `the same address name, "${pa}", on two domains`);
        }
      }
    }
  }

  /** @type {number[][]} */
  const components = [];
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
    if (members.length > 1) components.push(members.sort((x, y) => x - y));
  }

  const pairKey = (/** @type {number} */ i, /** @type {number} */ j) => (i < j ? `${i}:${j}` : `${j}:${i}`);
  const evidenceOf = (/** @type {number} */ i, /** @type {number} */ j) => why.get(pairKey(i, j)) ?? [];
  /** A name or login link is conclusive; an address name on two domains is weak alone and strong with another kind of evidence. */
  const strongPair = (/** @type {number} */ i, /** @type {number} */ j) => {
    const list = evidenceOf(i, j);
    return list.some((e) => e.kind !== "stem") || new Set(list.map((e) => e.kind)).size >= 2;
  };
  const textsOf = (/** @type {number[]} */ idx, /** @type {(i: number, j: number) => boolean} */ pairs) => {
    /** @type {string[]} */
    const texts = [];
    for (let a = 0; a < idx.length; a++) {
      for (let b = a + 1; b < idx.length; b++) {
        if (!pairs(idx[a], idx[b])) continue;
        for (const e of evidenceOf(idx[a], idx[b])) if (!texts.includes(e.text)) texts.push(e.text);
      }
    }
    return texts;
  };

  /** @type {{ canonical: typeof people[number], members: typeof people, reasons: string[], strength: "strong" | "weak", weakAdditions: { member: typeof people[number], reasons: string[] }[] }[]} */
  const out = [];
  for (const component of components) {
    for (const part of splitByStrength(component, edges, strongPair)) {
      const rows = part.members.map((i) => people[i]);
      // The address someone commits from most often is the one to keep; lines are a weaker signal
      // because one big import can outweigh years of work.
      const canonical = [...rows].sort((x, y) => y.commits - x.commits || y.lines - x.lines || x.mail.localeCompare(y.mail))[0];
      out.push({
        canonical,
        members: rows,
        reasons: textsOf(part.members, part.strong ? strongPair : () => true),
        strength: part.strong ? "strong" : "weak",
        weakAdditions: part.additions.map((i) => ({ member: people[i], reasons: textsOf([...part.members, i], (a, b) => (a === i || b === i) && edges.get(a)?.has(b) === true) })),
      });
    }
  }
  return out;
}

/**
 * Splits one connected group of identities by the strength of each pair (R8-5). The pairs that are strong join the
 * members they link into one strong part. A member linked only weakly to a strong
 * part is a weak addition of that part. Members left over, linked to each other only weakly, form weak parts.
 * @param {number[]} component
 * @param {Map<number, Set<number>>} edges every linked pair
 * @param {(i: number, j: number) => boolean} isStrong whether a linked pair is strong
 * @returns {{ members: number[], additions: number[], strong: boolean }[]}
 */
function splitByStrength(component, edges, isStrong) {
  /** @type {number[][]} */
  const strongParts = [];
  const placed = new Set();
  for (const start of component) {
    if (placed.has(start)) continue;
    const stack = [start];
    /** @type {number[]} */
    const part = [];
    const here = new Set();
    while (stack.length) {
      const n = /** @type {number} */ (stack.pop());
      if (here.has(n)) continue;
      here.add(n);
      part.push(n);
      for (const m of edges.get(n) ?? []) if (!here.has(m) && isStrong(n, m)) stack.push(m);
    }
    if (part.length > 1) {
      for (const n of part) placed.add(n);
      strongParts.push(part.sort((x, y) => x - y));
    }
  }
  const parts = strongParts.map((members) => ({ members, additions: /** @type {number[]} */ ([]), strong: true }));
  /** @type {number[]} */
  const rest = [];
  for (const n of component) {
    if (placed.has(n)) continue;
    const home = parts.find((p) => p.members.some((m) => edges.get(n)?.has(m)));
    if (home) home.additions.push(n);
    else rest.push(n);
  }
  const left = new Set(rest);
  const taken = new Set();
  for (const start of rest) {
    if (taken.has(start)) continue;
    const stack = [start];
    /** @type {number[]} */
    const members = [];
    while (stack.length) {
      const n = /** @type {number} */ (stack.pop());
      if (taken.has(n)) continue;
      taken.add(n);
      members.push(n);
      for (const m of edges.get(n) ?? []) if (left.has(m) && !taken.has(m)) stack.push(m);
    }
    if (members.length > 1) parts.push({ members: members.sort((x, y) => x - y), additions: [], strong: false });
  }
  return parts;
}

/**
 * The summary the JSON carries and the hint reads: one entry per person the linker grouped, named by the address
 * the person commits from most, with every address they use, sorted.
 * @param {ReturnType<typeof linkIdentities>} groups
 */
export function identityHintSummary(groups) {
  return {
    count: groups.length,
    people: groups.map((g) => ({
      name: g.canonical.author,
      addresses: g.members.map((m) => m.mail).sort(),
      // The figure the person would have if the addresses were one: the member rows added up, on the table's share basis.
      lines: g.members.reduce((sum, m) => sum + m.lines, 0),
      lineShare: g.members.reduce((sum, m) => sum + m.lineShare, 0),
      strength: g.strength,
      // Members linked to the group only weakly (R8-5): not in the figure above, each with its own lines.
      weakAdditions: g.weakAdditions.map((w) => ({ name: w.member.author, mail: w.member.mail, lines: w.member.lines, lineShare: w.member.lineShare })),
    })),
  };
}

/** The letters of a name with case, accents and everything else folded away: "Zoë O'Neil" and "zoe.oneil" both give "zoeoneil". */
const lettersOnly = (/** @type {string} */ s) => foldIdentity(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}]/gu, "");

/** Whether `short` is the initial form of `full`: the same last word and only first initials before it ("J. Gee" and "John Gee"). */
function isInitialForm(/** @type {string} */ short, /** @type {string} */ full) {
  const words = (/** @type {string} */ n) => foldIdentity(n).split(/[\s.]+/).filter(Boolean);
  const s = words(short);
  const f = words(full);
  if (s.length < 2 || f.length < 2 || s[s.length - 1] !== f[f.length - 1]) return false;
  const sGiven = s.slice(0, -1);
  const fGiven = f.slice(0, -1);
  if (sGiven.length > fGiven.length || !sGiven.every((w) => w.length === 1)) return false;
  return sGiven.every((w, i) => fGiven[i].startsWith(w)) && sGiven.join("") !== fGiven.join("");
}

/** @typedef {"contained" | "stem" | "noreplyId" | "noreplyUser" | "accent" | "initial"} EvidenceKind */

/**
 * Whether the evidence for one pair is strong (R7-4): one near-conclusive item (names equal once case, accents and
 * punctuation are ignored; two noreply addresses with the same GitHub user name or id), or at least two different kinds.
 * A single contained-in-address, address-stem or initial-form item is weak. A group is strong only when every pair in it is.
 * @param {{ kind: EvidenceKind }[]} items
 */
function isStrongEvidence(items) {
  const conclusive = new Set(["noreplyId", "noreplyUser", "accent"]);
  return items.some((e) => conclusive.has(e.kind)) || new Set(items.map((e) => e.kind)).size >= 2;
}

/**
 * Identities whose names differ and whose addresses differ, but that carry fixed evidence of being one person. These
 * are offered to the reader with the evidence and the .mailmap line; nothing here merges anything, and no flag does.
 * Evidence, any one of which is enough:
 *   - a name, letters only and at least four of them, is contained in the other identity's address name (or the reverse);
 *   - the address names are equal once trailing digits and separators are removed;
 *   - two GitHub noreply addresses carry the same numeric user id;
 *   - one name is the other's initial form;
 *   - the names are equal once accents are removed (letters only, at least four of them, not a role name);
 *   - two GitHub noreply addresses name the same user, one with the numeric id and one without.
 * Pairs the same-name and same-address rules already group are left to those rules.
 * @param {{author: string, mail: string, lines: number, lineShare: number, commits: number}[]} authors
 * @param {ReturnType<typeof linkIdentities>} linked
 */
export function suggestSamePerson(authors, linked) {
  const MAX_IDENTITIES = 4000;
  const people = authors
    .filter((a) => !isBotAddress(a.mail) && !/\[bot\]/i.test(a.author))
    .sort((x, y) => y.lines - x.lines || y.commits - x.commits || x.mail.localeCompare(y.mail))
    .slice(0, MAX_IDENTITIES)
    .map((a) => {
      const local = a.mail.split("@")[0].replace(/^\d+\+/, "").toLowerCase();
      const trimmed = local.replace(/[\d._-]+$/, "");
      return {
        row: a,
        folded: foldIdentity(a.author ?? ""),
        plain: foldIdentity(a.author ?? "").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " "),
        letters: lettersOnly(a.author ?? ""),
        localLetters: lettersOnly(local),
        local,
        stem: trimmed.length >= 3 && !GENERIC_LOCAL.has(trimmed) ? trimmed : "",
        id: /^(\d+)\+[^@]+@users\.noreply\.github\.com$/i.exec(a.mail)?.[1] ?? null,
        noreplyUser: /^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/i.exec(a.mail)?.[1]?.toLowerCase() ?? null,
        generic: GENERIC_LOCAL.has(local),
      };
    });
  /** @type {Map<string, number>} */
  const groupOf = new Map();
  linked.forEach((g, i) => [...g.members, ...g.weakAdditions.map((w) => w.member)].forEach((m) => groupOf.set(m.mail, i)));
  /** @type {Map<number, Set<number>>} */
  const edges = new Map();
  /** @type {Map<string, { kind: EvidenceKind, text: string }[]>} */
  const why = new Map();
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];
      if (a.row.mail === b.row.mail || (a.folded !== "" && a.folded === b.folded)) continue;
      const ga = groupOf.get(a.row.mail);
      if (ga !== undefined && ga === groupOf.get(b.row.mail)) continue;
      /** @type {{ kind: EvidenceKind, text: string }[]} */
      const evidence = [];
      for (const [x, y] of /** @type {[typeof a, typeof a][]} */ ([[a, b], [b, a]])) {
        if (x.letters.length >= 4 && !y.generic && y.localLetters.includes(x.letters)) evidence.push({ kind: "contained", text: `the name "${x.row.author}" is contained in the address ${y.row.mail}` });
      }
      if (a.stem && a.stem === b.stem && a.local !== b.local) evidence.push({ kind: "stem", text: `the address names "${a.local}" and "${b.local}" are equal once trailing digits and separators are removed` });
      if (a.id && a.id === b.id) evidence.push({ kind: "noreplyId", text: `both noreply addresses carry the GitHub user id ${a.id}` });
      if (a.noreplyUser && a.noreplyUser === b.noreplyUser && (a.id === null) !== (b.id === null)) evidence.push({ kind: "noreplyUser", text: `both noreply addresses name the GitHub user "${a.noreplyUser}", one with the numeric id and one without` });
      if (lettersOnly(a.plain) === lettersOnly(b.plain) && lettersOnly(a.plain).length >= 4 && !GENERIC_LOCAL.has(lettersOnly(a.plain))) evidence.push({ kind: "accent", text: `the names "${a.row.author}" and "${b.row.author}" are equal once accents${a.plain === b.plain ? "" : " and punctuation"} are removed` });
      if (isInitialForm(a.row.author ?? "", b.row.author ?? "")) evidence.push({ kind: "initial", text: `"${a.row.author}" is the initial form of "${b.row.author}"` });
      else if (isInitialForm(b.row.author ?? "", a.row.author ?? "")) evidence.push({ kind: "initial", text: `"${b.row.author}" is the initial form of "${a.row.author}"` });
      if (evidence.length === 0) continue;
      for (const [p, q] of [[i, j], [j, i]]) edges.set(p, (edges.get(p) ?? new Set()).add(q));
      why.set(`${i}:${j}`, evidence);
    }
  }
  /** @type {{ canonical: typeof authors[number], members: typeof authors, evidence: string[], strength: "strong" | "weak", mailmap: string[], weakAdditions: { member: typeof authors[number], evidence: string[], mailmap: string[] }[] }[]} */
  const out = [];
  const seen = new Set();
  const hasSpace = (/** @type {string} */ n) => (/\s/.test(n.trim()) ? 1 : 0);
  const pairList = (/** @type {number} */ p, /** @type {number} */ q) => why.get(p < q ? `${p}:${q}` : `${q}:${p}`) ?? [];
  const evidenceFor = (/** @type {number[]} */ idx, /** @type {(p: number, q: number) => boolean} */ pairs) => {
    /** @type {string[]} */
    const texts = [];
    for (let a = 0; a < idx.length; a++) {
      for (let b = a + 1; b < idx.length; b++) {
        if (!pairs(idx[a], idx[b])) continue;
        for (const e of pairList(idx[a], idx[b])) if (!texts.includes(e.text)) texts.push(e.text);
      }
    }
    return texts;
  };
  for (let i = 0; i < people.length; i++) {
    if (seen.has(i) || !edges.has(i)) continue;
    const stack = [i];
    /** @type {number[]} */
    const component = [];
    while (stack.length) {
      const n = /** @type {number} */ (stack.pop());
      if (seen.has(n)) continue;
      seen.add(n);
      component.push(n);
      for (const m of edges.get(n) ?? []) if (!seen.has(m)) stack.push(m);
    }
    component.sort((x, y) => x - y);
    // Strength is decided per pair (R8-5): the strongly linked members are one strong suggestion, and a member linked
    // only weakly is a weak addition of it, with its own lines.
    for (const part of splitByStrength(component, edges, (p, q) => isStrongEvidence(pairList(p, q)))) {
      const members = part.members.map((n) => people[n].row);
      const canonical = [...members].sort((x, y) => hasSpace(y.author ?? "") - hasSpace(x.author ?? "") || y.commits - x.commits || y.lines - x.lines || x.mail.localeCompare(y.mail))[0];
      const mailmapOf = (/** @type {typeof members} */ list) => list.filter((m) => m.mail !== canonical.mail).map((m) => `${canonical.author || canonical.mail} <${canonical.mail}> <${m.mail}>`);
      out.push({
        canonical,
        members,
        evidence: evidenceFor(part.members, part.strong ? (p, q) => isStrongEvidence(pairList(p, q)) : () => true),
        strength: part.strong ? "strong" : "weak",
        mailmap: mailmapOf(members),
        weakAdditions: part.additions.map((n) => ({
          member: people[n].row,
          evidence: evidenceFor([...part.members, n], (p, q) => (p === n || q === n) && edges.get(p)?.has(q) === true),
          mailmap: mailmapOf([people[n].row]),
        })),
      });
    }
  }
  const total = (/** @type {typeof out[number]} */ s) => s.members.reduce((sum, m) => sum + m.lines, 0);
  return out.sort((x, y) => total(y) - total(x) || x.canonical.mail.localeCompare(y.canonical.mail));
}

/**
 * The part of the result the JSON and the hint read: one entry per suggestion, with the figure the person would have if
 * the addresses were one (the shares the table prints, added up). Not merged anywhere.
 * @param {ReturnType<typeof suggestSamePerson>} suggestions
 */
export function samePersonSummary(suggestions) {
  return {
    count: suggestions.length,
    merged: false,
    suggestions: suggestions.map((s) => ({
      name: s.canonical.author,
      mail: s.canonical.mail,
      addresses: [...s.members].sort(byCommitsThenLines).map((m) => ({ name: m.author, mail: m.mail, lines: m.lines, commits: m.commits })),
      lines: s.members.reduce((sum, m) => sum + m.lines, 0),
      lineShare: s.members.reduce((sum, m) => sum + m.lineShare, 0),
      strength: s.strength,
      evidence: s.evidence,
      mailmap: s.mailmap,
      // Members linked to the suggestion only weakly (R8-5): not in `lines`, each with its own lines and .mailmap line.
      weakAdditions: s.weakAdditions.map((w) => ({ name: w.member.author, mail: w.member.mail, lines: w.member.lines, lineShare: w.member.lineShare, commits: w.member.commits, evidence: w.evidence, mailmap: w.mailmap })),
    })),
  };
}

/**
 * The line under the table that names the "possible same person" suggestions, or null when there are none. It says the
 * shares above may be split and that nothing was merged.
 * @param {{ count: number, suggestions: { name: string, mail: string, lines: number, lineShare: number, addresses: { name: string, mail: string, lines?: number }[], strength?: string, weakAdditions?: { name: string, mail: string, lines: number, lineShare: number }[] }[] } | null | undefined} s
 * @returns {string | null}
 */
export function samePersonLine(s) {
  if (!s || s.count === 0) return null;
  const n = (/** @type {number} */ x) => `${x.toLocaleString("en-US")} ${x === 1 ? "line" : "lines"}`;
  const pair = (/** @type {typeof s.suggestions[number]} */ x) => {
    const names = x.addresses.map((a) => `${a.name || a.mail} <${a.mail}>`).join(" / ");
    const merged = `${n(x.lines)}, ${pct(x.lineShare)}`;
    const separate = x.addresses.map((a) => `${a.name || a.mail} ${n(a.lines ?? 0)}`).join(", ");
    // R8-4: the line says which figure to lead with. Strong evidence leads with the merged figure, weak evidence with the unmerged ones.
    const lead = x.strength === "strong" ? `, ${x.strength} suggestion: lead with ${merged} if one person, unmerged ${separate}` : x.strength === "weak" ? `, ${x.strength} suggestion: lead with the unmerged figures (${separate}), ${merged} only as a possibility` : `, ${merged} if one person`;
    const added = (x.weakAdditions ?? []).map((w) => `weak addition ${w.name || w.mail} <${w.mail}> ${n(w.lines)} (${pct(w.lineShare)}), not in the figure above`);
    return `${names}: ${lead.slice(2)}${added.length ? `; ${added.join("; ")}` : ""}`;
  };
  return `possible same person: ${s.count} suggestion${s.count === 1 ? "" : "s"}, not merged, so the shares above may be split (${cappedList(s.suggestions.map(pair))}). Run --identities for the evidence and the .mailmap lines; only you can confirm it is one person.`;
}

/**
 * Up to three items, then a count of the rest, so the hint stays one line.
 * @param {string[]} items
 */
function cappedList(items) {
  const shown = items.slice(0, 3);
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(", ")}, and ${rest} more` : shown.join(", ");
}

/**
 * The identity hint printed under the main table, or null when there is no hint. It is a guess, so it says "may" and
 * names the command that shows the .mailmap lines; only the reader can confirm the people are one. The last sentence
 * gives the figure each person would have if their addresses were one. A result from before that figure was added has
 * no lines, so the sentence is left out rather than printed with a blank number.
 * @param {{ count: number, people: { name: string, addresses: string[], lines?: number, lineShare?: number, strength?: string, weakAdditions?: { name: string, mail: string, lines: number, lineShare: number }[] }[] } | null | undefined} hints
 * @returns {string | null}
 */
export function identityHintLine(hints) {
  if (!hints || hints.count === 0) return null;
  const figured = hints.people.every((p) => typeof p.lines === "number" && typeof p.lineShare === "number");
  const n = (/** @type {number} */ x) => `${x.toLocaleString("en-US")} ${x === 1 ? "line" : "lines"}`;
  /** @param {{ name: string, lines?: number, lineShare?: number }} p */
  const figure = (p) => `${p.name} ${p.lines?.toLocaleString("en-US")} ${p.lines === 1 ? "line" : "lines"} (${pct(p.lineShare ?? 0)})`;
  // R8-4: say which figure to lead with. Strong evidence leads with the merged figure, weak evidence with the unmerged ones.
  const known = figured && hints.people.every((p) => p.strength === "strong" || p.strength === "weak");
  const strong = hints.people.filter((p) => p.strength === "strong");
  const weak = hints.people.filter((p) => p.strength === "weak");
  const lead = !known
    ? ""
    : ` ${[
        strong.length ? `Strong evidence: lead with the merged figure (${cappedList(strong.map(figure))}) and give the unmerged figures next to it.` : "",
        weak.length ? `Weak evidence: lead with the unmerged figures and give the merged one (${cappedList(weak.map(figure))}) only as a possibility.` : "",
      ].filter(Boolean).join(" ")}`;
  const additions = hints.people.flatMap((p) => (p.weakAdditions ?? []).map((w) => `${w.name} <${w.mail}> ${n(w.lines)} (${pct(w.lineShare)})`));
  const extra = additions.length ? ` Weak additions, not in the merged figure: ${cappedList(additions)}.` : "";
  if (hints.count === 1) {
    const [p] = hints.people;
    const merged = figured && !known ? ` If they are one person, ${p.name} holds ${p.lines?.toLocaleString("en-US")} ${p.lines === 1 ? "line" : "lines"} (${pct(p.lineShare ?? 0)}).` : "";
    return `identity hint: 1 person may be counted twice (${p.name}: ${cappedList(p.addresses)}). The table counts each address separately. Run --identities for the .mailmap lines; only you can confirm it is one person.${merged}${lead}${extra}`;
  }
  const merged = figured && !known ? ` If merged: ${cappedList(hints.people.map(figure))}.` : "";
  return `identity hint: ${hints.count} people may be counted twice (${cappedList(hints.people.map((p) => p.name))}); run --identities for the .mailmap lines. The table counts each address separately; only you can confirm they are one person each.${merged}${lead}${extra}`;
}

/**
 * The addresses that more than one name commits from, as `--identities` prints them. `entries` is one item per
 * (name, address) pair with its commit count, after .mailmap. Names are compared with foldIdentity, so case and
 * accents do not make two names. Bots are left out. The canonical name is the one with a space in it (a full name
 * over a login), then the most commits, then the first alphabetically; the others are the aliases.
 * @param {{ name: string, mail: string, commits: number }[]} entries
 * @returns {{ mail: string, canonical: string, aliases: string[] }[]}
 */
export function sameAddressNames(entries) {
  /** @type {Map<string, Map<string, { name: string, commits: number }>>} */
  const byMail = new Map();
  for (const e of entries) {
    if (!e.name || isBotAddress(e.mail) || /\[bot\]/i.test(e.name) || /noreply@github\.com/i.test(e.mail)) continue;
    const mail = e.mail.toLowerCase();
    const names = byMail.get(mail) ?? new Map();
    const key = foldIdentity(e.name);
    const seen = names.get(key) ?? { name: e.name, commits: 0 };
    seen.commits += e.commits;
    names.set(key, seen);
    byMail.set(mail, names);
  }
  const hasSpace = (/** @type {string} */ n) => (/\s/.test(n.trim()) ? 1 : 0);
  /** @type {{ mail: string, canonical: string, aliases: string[] }[]} */
  const out = [];
  for (const [mail, names] of [...byMail].sort((x, y) => x[0].localeCompare(y[0]))) {
    if (names.size < 2) continue;
    const ranked = [...names.values()].sort((x, y) => hasSpace(y.name) - hasSpace(x.name) || y.commits - x.commits || x.name.localeCompare(y.name));
    out.push({ mail, canonical: ranked[0].name, aliases: ranked.slice(1).map((n) => n.name) });
  }
  return out;
}

/**
 * The addresses with more than one author name that also hold lines in the table (R9-3), with the lines of the row.
 * An address with no lines is left out: nothing in the numbers depends on it.
 * @param {ReturnType<typeof sameAddressNames>} groups
 * @param {{ author: string, mail: string, lines: number }[]} rows the table rows before any merge
 * @returns {{ mail: string, name: string, aliases: string[], lines: number }[]}
 */
export function sameAddressLines(groups, rows) {
  const byMail = new Map(rows.map((a) => [a.mail.toLowerCase(), a]));
  /** @type {{ mail: string, name: string, aliases: string[], lines: number }[]} */
  const out = [];
  for (const g of groups) {
    const row = byMail.get(g.mail);
    if (!row || row.lines <= 0) continue;
    const key = foldIdentity(row.author ?? "");
    const names = [g.canonical, ...g.aliases];
    const name = names.find((n) => foldIdentity(n) === key) ?? row.author ?? g.canonical;
    out.push({ mail: g.mail, name, aliases: names.filter((n) => n !== name), lines: row.lines });
  }
  return out.sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail));
}

/**
 * The newest author date (YYYY-MM-DD) of every row of the table, from one git log call over the whole ref, merges left
 * out and .mailmap applied, as the commit counts are. A merged row takes the newest date of its addresses.
 * @param {Options} o
 * @param {{ mail: string }[]} rows
 * @param {Map<string, string[]> | null} membersOf
 * @returns {Promise<Record<string, string>>}
 */
async function readLastCommits(o, rows, membersOf) {
  /** @type {Map<string, string>} */
  const newest = new Map();
  for (const line of (await git(["log", "--no-merges", "--format=%aE%x09%aI", o.ref], o.cwd)).split("\n")) {
    if (!line) continue;
    const [mail, date] = line.split("\t");
    if (!date) continue;
    const key = mail.toLowerCase();
    const day = date.slice(0, 10);
    if (!newest.has(key) || day > /** @type {string} */ (newest.get(key))) newest.set(key, day);
  }
  /** @type {Record<string, string>} */
  const out = {};
  for (const a of rows) {
    let best = "";
    for (const m of membersOf?.get(a.mail) ?? [a.mail]) {
      const day = newest.get(m.toLowerCase());
      if (day && day > best) best = day;
    }
    if (best) out[a.mail] = best;
  }
  return out;
}

/**
 * Every (name, address) pair that author commits carry at the ref, with its commit count, merges left out. The name and
 * address go through .mailmap, as the commit counts do.
 * @param {Options} o
 * @returns {Promise<{ name: string, mail: string, commits: number }[]>}
 */
async function readAddressNames(o) {
  const out = await git(["log", "--no-merges", "--format=%aN%x09%aE", o.ref], o.cwd);
  /** @type {Map<string, { name: string, mail: string, commits: number }>} */
  const counts = new Map();
  for (const line of out.split("\n")) {
    if (!line) continue;
    const [name, mail] = line.split("\t");
    if (!mail) continue;
    const key = `${name}\t${mail.toLowerCase()}`;
    const e = counts.get(key) ?? { name, mail: mail.toLowerCase(), commits: 0 };
    e.commits++;
    counts.set(key, e);
  }
  return [...counts.values()];
}

/**
 * @param {ReturnType<typeof linkIdentities>} groups
 * @param {ReturnType<typeof sameAddressNames>} [sameAddress] addresses that several names commit from
 * @param {ReturnType<typeof samePersonSummary>} [possible] identities with different names and addresses and evidence of one person; never merged
 */
export function renderIdentities(groups, sameAddress = [], possible = { count: 0, merged: false, suggestions: [] }) {
  if (!groups.length && !sameAddress.length && !possible.count) {
    return [
      "No split identities found.",
      "",
      "Every address in this repository looks like a different person. That is what you want,",
      "and it is also what you see when a .mailmap has already merged them.",
    ].join("\n");
  }
  const total = groups.length + sameAddress.length;
  /** @type {string[]} */
  const lines = total ? [`${total} identit${total === 1 ? "y looks" : "ies look"} split across more than one address.`, ""] : [];
  for (const s of sameAddress) {
    lines.push(`${s.canonical}`, `  keep ${s.mail}  as "${s.canonical}"`);
    for (const alias of s.aliases) lines.push(`  map  ${s.mail}  committed as "${alias}"`);
    lines.push(`  because the same address, ${s.mail}, is written under ${s.aliases.length + 1} names`, "");
  }
  for (const g of groups) {
    lines.push(`${g.canonical.author || g.canonical.mail}`);
    for (const m of g.members) {
      const mark = m.mail === g.canonical.mail ? "keep" : "map ";
      lines.push(`  ${mark} ${m.mail}  ${m.commits} commit${m.commits === 1 ? "" : "s"}, ${m.lines.toLocaleString("en-US")} line${m.lines === 1 ? "" : "s"}`);
    }
    for (const r of g.reasons) lines.push(`  because ${r}`);
    lines.push(`  strength: ${g.strength}${g.strength === "strong" ? "" : " (a guess; not merged by --merge-identities, confirm before writing a .mailmap line)"}`);
    for (const w of g.weakAdditions ?? []) lines.push(`  weak addition, not in the group above and not merged by --merge-identities: ${w.member.mail}  ${w.member.commits} commit${w.member.commits === 1 ? "" : "s"}, ${w.member.lines.toLocaleString("en-US")} line${w.member.lines === 1 ? "" : "s"}, because ${w.reasons.join("; ")}`);
    lines.push("");
  }
  const mailmapLines = (/** @type {typeof groups} */ gs) => {
    for (const g of gs) {
      for (const m of g.members) {
        if (m.mail === g.canonical.mail) continue;
        lines.push(`${g.canonical.author} <${g.canonical.mail}> <${m.mail}>`);
      }
    }
  };
  const strongGroups = groups.filter((g) => g.strength === "strong");
  const weakGroups = groups.filter((g) => g.strength !== "strong");
  if (strongGroups.length || sameAddress.length) lines.push("Add these to a .mailmap file at the repository root:", "");
  mailmapLines(strongGroups);
  // One address under several names has no second address to map, so the line repeats the address: the proper name
  // and address first, then the name to replace and the same address. Copy it as printed.
  for (const s of sameAddress) {
    for (const alias of s.aliases) lines.push(`${s.canonical} <${s.mail}> ${alias} <${s.mail}>`);
  }
  if (weakGroups.length) {
    lines.push("", "Weakly linked (strength weak): the evidence is thin, and --merge-identities does not merge these. Only if you confirm they are one person, add these to a .mailmap file at the repository root:", "");
    mailmapLines(weakGroups);
  }
  lines.push("");
  lines.push("These are guesses from names and addresses in this repository's own history; only you");
  lines.push("can tell whether two of them are really one person. Nothing was written. git log, git");
  lines.push("blame, git shortlog and this tool all read .mailmap, so one file fixes every count.");
  if (total) lines.push("");
  if (possible.count) {
    lines.push("", `Possible same person: ${possible.count} suggestion${possible.count === 1 ? "" : "s"}. Names and addresses both differ, so nothing here is merged by default,`);
    lines.push("and --merge-identities does not merge them. The evidence is listed; only the repository owner can confirm it, by writing the .mailmap lines.", "");
    for (const s of possible.suggestions) {
      lines.push(`${s.name || s.mail}  ${s.lines.toLocaleString("en-US")} line${s.lines === 1 ? "" : "s"} (${pct(s.lineShare)}) if these are one person (${s.strength} suggestion)`);
      for (const a of s.addresses) lines.push(`  ${a.mail === s.mail ? "keep" : "map "} ${a.name ? `"${a.name}" ` : ""}<${a.mail}>  ${a.commits} commit${a.commits === 1 ? "" : "s"}, ${a.lines.toLocaleString("en-US")} line${a.lines === 1 ? "" : "s"}`);
      for (const e of s.evidence) lines.push(`  because ${e}`);
      lines.push("");
    }
    lines.push("Only if you confirm they are one person, add these to a .mailmap file at the repository root:", "");
    for (const s of possible.suggestions) lines.push(...s.mailmap);
    lines.push("");
  }
  lines.push("The address lines above are the reliable ones. git matches a .mailmap name ignoring");
  lines.push("case for ASCII letters only, so a name mapped by name alone must be written with its");
  lines.push("accents and its non-Latin letters exactly as the commit spells them.");
  return lines.join("\n").replace(/^\n+/, "");
}

/** The one-time line. The URL is the repository a reader would star, so it is written out rather than read from package.json. */
const STAR_HINT = "If surviving-lines helped, a star on GitHub helps others find it: https://github.com/Bubblegunn/surviving-lines (shown once; SURVIVING_LINES_NO_STAR_HINT=1 turns it off)";

/** The human views. A machine format (--json, --csv, --markdown, --identities) never carries the hint. */
const HINT_VIEWS = new Set(["table", "groups", "reviewers", "history"]);

/** Set by a coding agent's shell. A person at a terminal has none of them. */
const AGENT_MARKERS = ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CODEX_SANDBOX", "AI_AGENT"];

/**
 * Prints the star hint to stderr once, for a person at a terminal who has just read a successful human view.
 * The marker is written before the line. If the marker cannot be written (a read-only home), nothing is shown,
 * because the line would otherwise repeat on every run. Returns whether the line was printed; it does not throw
 * for a file-system failure and never touches stdout.
 * @param {{ stdoutIsTTY: boolean, stderrIsTTY: boolean, env: Record<string, string | undefined>, quiet: boolean, view: string, shallow: boolean, configDir: string,
 *   write?: (text: string) => void, fs?: { existsSync: (p: string) => boolean, mkdirSync: (p: string, o: { recursive: boolean }) => unknown, writeFileSync: (p: string, c: string) => void } }} o
 * @returns {boolean}
 */
export function starHint({ stdoutIsTTY, stderrIsTTY, env, quiet, view, shallow, configDir, write = (text) => process.stderr.write(text), fs = { existsSync, mkdirSync, writeFileSync } }) {
  if (!stdoutIsTTY || !stderrIsTTY || quiet || shallow || !HINT_VIEWS.has(view)) return false;
  // CI follows the usual convention: an empty value, "false" or "0" means not set.
  const ci = env.CI;
  if (ci !== undefined && ci !== "" && ci !== "false" && ci !== "0") return false;
  if (AGENT_MARKERS.some((name) => env[name])) return false;
  if (env.SURVIVING_LINES_NO_STAR_HINT === "1") return false;
  const marker = join(configDir, "star-hint-shown");
  if (fs.existsSync(marker)) return false;
  try {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(marker, `${new Date().toISOString()}\n`);
  } catch {
    return false;
  }
  write(`${STAR_HINT}\n`);
  return true;
}

/**
 * The directory that holds the tool's small state file. XDG_CONFIG_HOME counts only when it is an absolute path: the
 * XDG specification says a relative value is invalid and must be ignored, and a relative one would put the file in
 * whatever directory the command happened to run from.
 * @param {Record<string, string | undefined>} env
 * @param {string} home
 */
export function configDirFor(env, home) {
  const xdg = env.XDG_CONFIG_HOME;
  return join(xdg && isAbsolute(xdg) ? xdg : join(home, ".config"), "surviving-lines");
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
  if (o.paths[0] === "--version") { console.log(toolVersion()); return; }
  try {
    const r = await analyse(o);
    let output;

    if (o.json) {
      output = renderJson(r);
    } else if (o.csv) {
      // CSV has no header line beyond the column names, which parsers read; the mark goes to stderr.
      if (r.shallow) console.error(`surviving-lines: ${SHALLOW_MARK}`);
      // The table's blocks cannot go in CSV, so the same scope notes go to stderr, where the reader still sees them.
      for (const note of scopeNotes(r)) if (note) console.error(`surviving-lines: ${note}`);
      if (r.blame.copyDetection.reason && r.blame.copyDetection.reason !== "--no-copies") console.error(`surviving-lines: copy detection off: ${r.blame.copyDetection.reason}`);
      output = renderCsv(r);
    } else if (o.markdown) {
      output = renderMarkdown(r, o.top);
    } else if (o.identities) {
      output = renderIdentities(linkIdentities(r.authors), sameAddressNames(await readAddressNames(o)), r.possibleSamePerson);
      const notes = scopeNotes(r, { identityHints: false });
      if (notes.length) output += `\n\n${notes.join("\n")}`;
      if (r.shallow) output = `${SHALLOW_MARK}\n\n${output}`;
    } else if (r.files) {
      output = renderFiles(r);
    } else if (r.reviewers) {
      // Five rows unless --top was given: the owners of one path are a short list.
      output = renderReviewers(r, o.topGiven ? o.top : 5);
    } else if (r.history) {
      // Ten rows unless --top was given, as the table shows them.
      output = renderHistory(r, o.topGiven ? o.top : 10);
    } else if (r.grouping) {
      output = renderGroups(r, o.top);
      if (o.suggestCodeowners) output += `\n\n${renderCodeowners(r)}`;
    } else {
      output = renderTable(r, o.topGiven ? o.top : null);
    }
    const ai = o.json ? null : renderAiBreakdown(r, r.sample, r.commitWindow.commits);
    if (ai) output += `\n\n${ai}`;
    console.log(output);
    // Best effort: a failure while showing the hint must not turn a successful run into an error.
    try {
      const view = o.json ? "json" : o.csv ? "csv" : o.markdown ? "markdown" : o.identities ? "identities" : r.reviewers ? "reviewers" : r.history ? "history" : r.grouping ? "groups" : "table";
      starHint({
        stdoutIsTTY: process.stdout.isTTY === true,
        stderrIsTTY: process.stderr.isTTY === true,
        env: process.env,
        quiet: o.quiet,
        view,
        shallow: r.shallow,
        configDir: configDirFor(process.env, homedir()),
      });
    } catch {
      // Never change the exit status for the hint.
    }
  } catch (err) {
    const msg = err && typeof err === "object" && "stderr" in err && err.stderr ? String(err.stderr).trim() : String(err instanceof Error ? err.message : err);
    console.error(msg);
    process.exit(1);
  }
}

const entry = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : "";
if (entry === import.meta.url) main();
