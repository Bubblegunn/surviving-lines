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

/** The git processes that are running now, so a time budget can stop them instead of leaving them to finish alone. */
const liveChildren = new Set();

/** Stop every git process this run started. Used when --time-budget runs out. */
export function stopGitProcesses() {
  for (const child of liveChildren) child.kill();
  liveChildren.clear();
}

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
 * Above this many non-binary lines to blame times commits, copy detection (-C) is off by default too. Files times
 * commits misses a repository with few but large files: its blame time grows with the lines as well.
 */
export const COPY_DETECTION_MAX_LINE_WORK = 400_000_000;

/**
 * Whether copy detection is on when --copies and --no-copies were not given: the file count is at most
 * COPY_DETECTION_MAX_FILES, files times commits is at most `limit`, and lines times commits is at most `lineLimit`.
 * @param {number} files files to blame
 * @param {number} commits commits reachable from the ref
 * @param {number} [limit]
 * @param {number} [lines] non-binary lines in the files to blame (0 when not known)
 * @param {number} [lineLimit]
 * @returns {boolean}
 */
export function copyDetectionDefault(files, commits, limit = COPY_DETECTION_MAX_WORK, lines = 0, lineLimit = COPY_DETECTION_MAX_LINE_WORK) {
  return files <= COPY_DETECTION_MAX_FILES && files * commits <= limit && lines * commits <= lineLimit;
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
  --copies [deep]      follow copies even above 2000 files, or files x commits above 2,000,000 or lines x commits above 400,000,000 (default: git blame -w -M -C, which follows code
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
  --suggest-codeowners print CODEOWNERS lines for the groups, from the surviving lines (needs --group-by dir; never written).
                       Only people with a commit in the --active-days window are named, up to 3 per rule (each with 20% of the
                       directory); a directory nobody active holds 20% of gets an orphaned comment and no owner line
  --include-bots       count bot identities as authors (default: leave them out of both shares)
  --ignore-revs-file <f>  skip the revisions listed in <f> when blaming (git 2.23 or newer);
                       default: .git-blame-ignore-revs at the repository root, when it exists
  --no-ignore-revs     do not read .git-blame-ignore-revs
  --ignore-rev <rev>   skip one commit when blaming (repeatable; git 2.23 or newer)
  --no-detect-reformat turn off the reformat heuristic (on by default): it finds suspected whitespace or quote
                       commits and, unless --keep-reformat, leaves them out of the numbers; it does not prove them
  --keep-reformat      count the suspected reformat commits in the numbers, as before the correction; the block
                       still lists them. Not applied under --co-authors share
  --no-reapply-credit  do not credit a re-applied change to its original author (on by default): a commit that reverts a
                       revert, or a copy made by someone else with a "cherry picked from" trailer, has its lines credited
                       to the author of the original commit when that commit is in the repository
  --bus-factor-threshold <n>  percent of the lines counted that the bus factor must reach, above 0 and at most 100 (default: 50)
  --jobs <n>           parallel blame processes (default: 4)
  --top <k>            rows to print (default: every author with at least 1% of the lines, 10 to 25 rows,
                       then one line for the rest, and a last-commit column)
  --files [n]          one row per file, largest first, n rows (default 25): lines, top owner and share, next two owners,
                       then a summary line. Not with --group-by, --csv, --markdown, --identities, --reviewers, --history
  --active-days <n>    an author is active with a commit in the n days before the ref's commit date (default: 365). Used by the line
                       under the table (as of <date>: k of n authors committed ...; nothing is printed when everyone is active),
                       --orphans, and the orphaned line of --files and --reviewers
  --orphans            list up to 30 orphaned files (top owner inactive, nobody active holds 20% of the file) with owner, lines
                       and the owner's last commit; not with --history, --group-by, --csv, --markdown, --identities
  --without <author>[,<author>...]  what if these people left: lines they hold, files they own, files nobody remaining would
                       know, bus factor before and after, who inherits most. An author is a name or an address (after .mailmap
                       and --merge-identities). Repeatable; prints its own view, with --json only
  --why-not <author> -- <path>  why this person is not among the suggested reviewers of the path (the three people with the most
                       lines, as --reviewers lists them): unknown name, no commit at the path, no surviving line, below the cut,
                       listed but inactive, or the same person under two addresses; always with the numbers that decided it.
                       Prints its own view, with --json only; the path goes after -- (one path)
  --check-codeowners [<file>]  compare a CODEOWNERS file with the evidence: files no rule covers, rules that match no file, rules whose
                       declared owners and observed owners (20%+ of the covered lines) share nobody, declared owners with no line
                       and no commit there for 365 days, undeclared people holding half, declared owners inactive for --active-days.
                       GitHub's matching (last match wins, ** crosses directories, a leading / anchors); ! and [...] lines are
                       reported, not applied. Team handles and handles with no noreply address are listed as not comparable, never as
                       drift. Default file: .github/CODEOWNERS, CODEOWNERS, docs/CODEOWNERS at --ref. Own view, --json only
  --owned-by <author>[,<author>...]  what these people own: lines on both bases, files, files they own most of or half of, files only
                       they wrote, lines per directory (--group-by dir:<n> sets the depth), commits, last commit and activity.
                       An author is a name or an address (after .mailmap and --merge-identities). Repeatable; prints its own
                       view, with --json only; -- <path> scopes it; --top caps the lists
  --tree [depth]       the ownership tree: for each directory and file, the person with the most surviving lines in it and their share, with
                       a mark for owners who are not active and for nodes where nobody holds half. Depth counts levels of nodes (default 2,
                       0 = all); a directory whose only child is a directory is printed on one line; --top caps the children per node
                       (default 25); -- <path> scopes it. Prints its own view, with --json only
  --attention          files that change often and are risky: files with at least 3 commits in the window (--since, default 12 months before the
                       ref's commit date; renames followed; bots and set-aside commits out) that are orphaned (weight 3), single-owner (one
                       person holds 80%+, weight 1) or coupled (change together with another file at degree 0.5 or more, weight 1), ranked by
                       score, commits and path, each with the numbers behind it; --top caps the list (default 10). --min-commits <n> (default 3),
                       --min-shared <n> (default 3) and --max-files-per-commit <n> (default 30) set the thresholds. Own view, --json only
  --coupled <path>     the files that change together with one file: for each partner the shared commits, the degree (shared over the smaller
                       commit count of the two), jaccard, and the top owner of the five best, then the people with the most lines across these
                       files. Window as --attention (--since); --min-shared <n> (3) and --max-files-per-commit <n> (30) apply; --top caps the
                       partners (default 10). A file only (not a directory), with at least 3 commits. Own view, --json only
  --written-since <date>  ownership of recent code: per person the surviving lines whose author date is on or after the date (00:00 UTC, or an ISO
                       timestamp), the lines inserted in the same window and kept = written / inserted, and the share of all lines. --written-until <date>
                       ends the window (exclusive); --churn adds all-time inserted and deleted lines and the survival ratio. Works with --sample; not with
                       --co-authors share. Own view, --json only
  --timeline [<path>]  who made most of the changes in each year, month or day (chosen from the span: over 5 years yearly, over 60 days monthly), with the
                       share of the bucket and a handover when the winner changes to someone with half or more. --by commits|lines (default commits);
                       --since and --until bound it; --at <date>[,<date>...] adds the bus factor and top three holders by blame at the last commit
                       before each date (slow without --sample). Counts commits, not surviving lines. Own view, --json only
  --for-diff <base>..<head>  who should review a change: the people who wrote the lines it replaces or deletes (blamed at the base
                       commit, with this run's blame rules), without the change authors, with per-file flags (inactive owners, orphaned,
                       one owner holds 80%+, new, deleted, renamed). Also <base>...<head> (from the merge base) and <base> alone
                       (= <base>..HEAD). Files left out as with the table. Prints its own view, with --json only; not with --sample or --ref
  --brief              one compact plain-text view of the whole repository (at most 40 lines, about 3,000 characters): owners with both
                       line counts, bus factor, activity, orphans, what was left out, identity proposals, top directories, single-owner
                       files. Built from the same analysis as the other views; with --json, a small object. Not with the other views
  --time-budget <s>    with --brief: after s seconds print nothing and exit 0, so a hook can bound the run
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
groupBy?: string, files?: number, brief: boolean, timeBudget?: number, activeDays: number, orphans: boolean, without: string[], forDiff?: string, ownedBy: string[], tree?: number, attention: boolean, writtenSince?: string, writtenUntil?: string, writtenFrom?: number, writtenTo?: number, churn: boolean, timeline?: string, by?: "commits" | "lines", at: string[], coupled?: string, minCommits?: number, minShared?: number, maxFilesPerCommit?: number, whyNot?: string, checkCodeowners?: string, reviewers?: string, history?: string, topGiven: boolean, suggestCodeowners: boolean, includeBots: boolean, ignoreRevsFile?: string, noIgnoreRevs: boolean, ignoreRevs: string[], detectReformat: boolean, keepReformat: boolean, reapplyCredit: boolean, busFactorThreshold: number, copies: boolean, copiesDeep?: boolean, copyWorkLimit?: number, copyLineWorkLimit?: number, noCopies: boolean, keepGenerated: boolean, jobs: number, top: number, sort: "lines" | "commits" | "gap", quiet: boolean, json: boolean, csv: boolean, markdown: boolean, identities: boolean, mergeIdentities: boolean, allowShallow: boolean, cwd: string, paths: string[], stderr?: import("node:stream").Writable & { isTTY?: boolean } }} Options */

/**
 * @param {string[]} argv
 * @returns {Options}
 */
export function parseArgs(argv) {
  /** @type {Options} */
  const o = { ref: "HEAD", sample: 1, brief: false, activeDays: ACTIVE_DAYS_DEFAULT, orphans: false, without: [], ownedBy: [], attention: false, churn: false, at: [], seed: "", include: [], exclude: [], coAuthors: "none", aiBreakdown: false, suggestCodeowners: false, includeBots: false, noIgnoreRevs: false, ignoreRevs: [], detectReformat: true, keepReformat: false, reapplyCredit: true, busFactorThreshold: 50, copies: false, noCopies: false, keepGenerated: false, jobs: 4, top: 10, topGiven: false, sort: "lines", quiet: false, json: false, csv: false, markdown: false, identities: false, mergeIdentities: false, allowShallow: false, cwd: process.cwd(), paths: [] };
  let refGiven = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--") { o.paths = argv.slice(i + 1); break; }
    else if (a === "--ref") { o.ref = next(); refGiven = true; }
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
    else if (a === "--active-days") { o.activeDays = Number(next()); if (!Number.isInteger(o.activeDays) || o.activeDays < 1) throw new Error("--active-days must be an integer >= 1"); }
    else if (a === "--orphans") o.orphans = true;
    else if (a === "--brief") o.brief = true;
    else if (a === "--time-budget") { o.timeBudget = Number(next()); if (!Number.isFinite(o.timeBudget) || o.timeBudget <= 0) throw new Error("--time-budget must be a number of seconds above 0"); }
    else if (a === "--without") o.without.push(next());
    else if (a === "--owned-by") o.ownedBy.push(next());
    else if (a === "--tree") { o.tree = TREE_DEPTH_DEFAULT; if (/^\d+$/.test(argv[i + 1] ?? "")) o.tree = Number(argv[++i]); }
    else if (a === "--attention") o.attention = true;
    else if (a === "--written-since") { o.writtenSince = next(); o.writtenFrom = parseWrittenDate(o.writtenSince, "--written-since"); }
    else if (a === "--written-until") { const v = next(); o.writtenUntil = v; o.writtenTo = parseWrittenDate(v, "--written-until"); }
    else if (a === "--churn") o.churn = true;
    else if (a === "--timeline") { o.timeline = ""; if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("-")) o.timeline = argv[++i]; }
    else if (a === "--by") { const by = next(); if (by !== "commits" && by !== "lines") throw new Error("--by must be commits or lines"); o.by = by; }
    else if (a === "--at") { o.at = next().split(",").map((x) => x.trim()).filter(Boolean); if (!o.at.length) throw new Error("--at needs at least one date"); }
    else if (a === "--coupled") { o.coupled = next(); if (!o.coupled.trim()) throw new Error("--coupled needs a file path"); }
    else if (a === "--min-commits") { o.minCommits = Number(next()); if (!Number.isInteger(o.minCommits) || o.minCommits < 1) throw new Error("--min-commits must be an integer >= 1"); }
    else if (a === "--min-shared") { o.minShared = Number(next()); if (!Number.isInteger(o.minShared) || o.minShared < 1) throw new Error("--min-shared must be an integer >= 1"); }
    else if (a === "--max-files-per-commit") { o.maxFilesPerCommit = Number(next()); if (!Number.isInteger(o.maxFilesPerCommit) || o.maxFilesPerCommit < 1) throw new Error("--max-files-per-commit must be an integer >= 1"); }
    else if (a === "--why-not") o.whyNot = next();
    else if (a === "--check-codeowners") { o.checkCodeowners = ""; const v = argv[i + 1]; if (v !== undefined && v !== "--" && !v.startsWith("-")) o.checkCodeowners = argv[++i]; }
    else if (a === "--for-diff") { o.forDiff = next(); if (!o.forDiff.trim()) throw new Error("--for-diff needs a revision range such as main..feature"); }
    else if (a === "--reviewers") o.reviewers = next();
    else if (a === "--history") o.history = next();
    else if (a === "--suggest-codeowners") o.suggestCodeowners = true;
    else if (a === "--include-bots") o.includeBots = true;
    else if (a === "--ignore-revs-file") o.ignoreRevsFile = next();
    else if (a === "--no-ignore-revs") o.noIgnoreRevs = true;
    else if (a === "--ignore-rev") o.ignoreRevs.push(next());
    else if (a === "--no-detect-reformat") o.detectReformat = false;
    else if (a === "--keep-reformat") o.keepReformat = true;
    else if (a === "--no-reapply-credit") o.reapplyCredit = false;
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
  if (o.without.length) {
    const clash = grouping ? "--group-by" : o.csv ? "--csv" : o.markdown ? "--markdown" : o.identities ? "--identities" : o.reviewers !== undefined ? "--reviewers" : o.history !== undefined ? "--history" : o.files !== undefined ? "--files" : o.orphans ? "--orphans" : o.suggestCodeowners ? "--suggest-codeowners" : o.coAuthors === "share" ? "--co-authors share" : null;
    if (clash) throw new Error(`--without prints its own view; it can be combined with --json only, not with ${clash}`);
  }
  if (o.whyNot !== undefined) {
    if (!o.paths.length) throw new Error("--why-not needs the path after --: --why-not <author> -- <path>");
    if (o.paths.length > 1) throw new Error("--why-not takes one path after --");
  }
  // The views added in round 13 (--for-diff, --owned-by, --why-not, --check-codeowners) print their own output. Each one is refused with every other view
  // and every output format; only --json may be combined with them.
  const newViews = /** @type {Record<string, boolean>} */ ({ "--for-diff": o.forDiff !== undefined, "--owned-by": o.ownedBy.length > 0, "--tree": o.tree !== undefined, "--attention": o.attention, "--written-since": o.writtenSince !== undefined, "--timeline": o.timeline !== undefined, "--coupled": o.coupled !== undefined, "--why-not": o.whyNot !== undefined, "--check-codeowners": o.checkCodeowners !== undefined });
  const optionsSet = /** @type {Record<string, boolean>} */ ({ "--group-by": Boolean(grouping), "--csv": o.csv, "--markdown": o.markdown, "--identities": o.identities, "--files": o.files !== undefined, "--reviewers": o.reviewers !== undefined, "--history": o.history !== undefined, "--orphans": o.orphans, "--without": o.without.length > 0, "--brief": o.brief, "--suggest-codeowners": o.suggestCodeowners, "--co-authors share": o.coAuthors === "share", ...newViews });
  for (const view of Object.keys(newViews).filter((k) => newViews[k])) {
    const own = view === "--owned-by" ? { ...optionsSet, "--group-by": grouping?.kind === "ext", "--owned-by": false } : view === "--tree" ? { ...optionsSet, "--tree": false } : view === "--attention" ? { ...optionsSet, "--attention": false, "--sample": o.sample !== 1 } : view === "--coupled" ? { ...optionsSet, "--coupled": false, "--sample": o.sample !== 1 } : view === "--written-since" ? { ...optionsSet, "--written-since": false } : view === "--timeline" ? { ...optionsSet, "--timeline": false } : view === "--check-codeowners" ? { ...optionsSet, "--check-codeowners": false } : view === "--why-not" ? { ...optionsSet, "--group-by": Boolean(grouping), "--why-not": false } : view === "--for-diff" ? { ...optionsSet, "--for-diff": false, "--sample": o.sample !== 1, "--ref": refGiven } : optionsSet;
    const clash = Object.keys(own).find((k) => own[k]);
    if (clash) throw new Error(`${view} prints its own view; it can be combined with --json only, not with ${clash}`);
  }
  if (o.writtenUntil !== undefined && o.writtenSince === undefined) throw new Error("--written-until works with --written-since only");
  if (o.churn && o.writtenSince === undefined) throw new Error("--churn works with --written-since only");
  if (o.writtenFrom !== undefined && o.writtenTo !== undefined && o.writtenTo <= o.writtenFrom) throw new Error("--written-until must be later than --written-since");
  if ((o.by !== undefined || o.at.length) && o.timeline === undefined) throw new Error("--by and --at work with --timeline only");
  if (o.timeline) {
    if (o.paths.length) throw new Error("--timeline takes its path as its own value; it cannot be combined with pathspecs after --");
    o.paths = [o.timeline];
  }
  if (o.coupled !== undefined && o.paths.length) throw new Error("--coupled takes its path as its own value; it cannot be combined with pathspecs after --");
  if (o.minCommits !== undefined && !o.attention) throw new Error("--min-commits works with --attention only");
  if ((o.minShared !== undefined || o.maxFilesPerCommit !== undefined) && !o.attention && o.coupled === undefined) throw new Error("--min-shared and --max-files-per-commit work with --attention or --coupled");
  if (o.timeBudget !== undefined && !o.brief) throw new Error("--time-budget works with --brief only");
  if (o.brief) {
    const clash = grouping ? "--group-by" : o.csv ? "--csv" : o.markdown ? "--markdown" : o.identities ? "--identities" : o.reviewers !== undefined ? "--reviewers" : o.history !== undefined ? "--history" : o.files !== undefined ? "--files" : o.orphans ? "--orphans" : o.without.length ? "--without" : o.forDiff !== undefined ? "--for-diff" : o.ownedBy.length ? "--owned-by" : o.whyNot !== undefined ? "--why-not" : o.suggestCodeowners ? "--suggest-codeowners" : o.coAuthors === "share" ? "--co-authors share" : o.aiBreakdown ? "--ai-breakdown" : null;
    if (clash) throw new Error(`--brief prints its own view; it can be combined with --json only, not with ${clash}`);
  }
  if (o.orphans) {
    const clash = grouping ? "--group-by" : o.csv ? "--csv" : o.markdown ? "--markdown" : o.identities ? "--identities" : o.history !== undefined ? "--history" : o.suggestCodeowners ? "--suggest-codeowners" : o.coAuthors === "share" ? "--co-authors share" : null;
    if (clash) throw new Error(`--orphans lists files under the table, --files or --reviewers; it cannot be combined with ${clash}`);
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
 * commit id on the header line and the author-mail line after it are enough. The committer headers follow the author
 * headers of the same commit; they are kept as `committer` and `committerMail` (G12) when git printed them.
 * @param {string} porcelain
 * @returns {Map<string, { name: string, mail: string, lines: number, committer?: string, committerMail?: string }>}
 */
export function countBlameByCommit(porcelain) {
  /** @type {Map<string, { name: string, mail: string, lines: number, committer?: string, committerMail?: string }>} */
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
    } else if (line.startsWith("committer ")) {
      const entry = counts.get(sha);
      if (entry && entry.committer === undefined) entry.committer = line.slice(10);
    } else if (line.startsWith("committer-mail ")) {
      const entry = counts.get(sha);
      if (entry && entry.committerMail === undefined) entry.committerMail = line.slice(15).replace(/^<|>$/g, "").toLowerCase();
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
 * True for an identity that is a bot by name or by address. The address alone almost never decides: a person-shaped
 * address such as `timtalbot@example.org` or `priyabot@example.org` is not a bot. The rules, in order:
 * - a name that ends in "[bot]", or an address in BOT_MAIL_PATTERNS;
 * - a name made of a single word that ends in "Bot" after a lower-case letter or digit ("ZodBot");
 * - a lower-case name of 7 or more letters that ends in "bot" and is also the address's local part ("jekyllbot");
 * - the name "bot", or a name of two or more words whose last word is "bot" ("Release Bot", "vue-bot") when the
 *   address does not look like a person's: the local part is `bot`, `noreply`, `no-reply`, `ci`, `release`,
 *   `automation` or `actions`, or has "bot" as a whole segment between "-", "_" or "+" ("release-bot"), or is the
 *   name without its separators, or neither starts with the first word of the name nor has a "." in it. So
 *   `Jan Bot <jan@example.nl>` and `Ion Bot <ion.bot@example.ro>` stay people;
 * - a single-word name with an address whose local part is 10 or more letters and ends in "bot"
 *   (`ReadmeCritic <frankensteinbot@example.org>`). Shorter ones, and any name of two or more words, stay people
 *   because `priyabot@` cannot be told from a bot by its shape;
 * - a name that ends in "-Service", or in " Service" with the word "copybara" in it.
 * When a rule cannot separate a case safely, the identity is a person.
 * @param {string} name
 * @param {string} mail
 */
export function isBotIdentity(name, mail) {
  const n = name.trim();
  if (/\[bot\]$/i.test(n) || BOT_MAIL_PATTERNS.some((re) => re.test(mail))) return true;
  // The part of the address before "@", without the numeric id GitHub puts before a "+".
  const local = (mail.split("@")[0] ?? "").replace(/^\d+\+/, "").toLowerCase();
  const oneWord = !/[\s_-]/.test(n);
  if (oneWord && /[a-z0-9]Bot$/.test(n)) return true;
  if (/^[a-z]{4,}bot$/.test(n) && n === local) return true;
  if (/^bot$/i.test(n)) return true;
  const words = n.split(/[\s_-]+/).filter(Boolean);
  if (words.length >= 2 && /^bot$/i.test(words[words.length - 1] ?? "")) {
    const first = (words[0] ?? "").toLowerCase();
    const botLocal = ["bot", "noreply", "no-reply", "ci", "release", "automation", "actions"].includes(local)
      || local.split(/[-_+]/).includes("bot")
      || local === n.toLowerCase().replace(/[\s_-]+/g, "");
    const personLocal = local.startsWith(first) || local.includes(".");
    if (botLocal || !personLocal) return true;
  }
  if (oneWord && /^[a-z]{7,}bot$/.test(local)) return true;
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
 * Remove the entries of lines that the given commits hold from `git blame --line-porcelain` output. A boilerplate
 * commit (the same header added to several files) adds lines that no earlier commit can take back, so ignoring the
 * commit leaves them on it; they are left out of the count instead. Each entry starts with the commit id.
 * @param {string} porcelain
 * @param {Set<string>} shas full commit ids
 * @returns {string}
 */
export function dropBlameLinesOf(porcelain, shas) {
  if (!shas.size) return porcelain;
  const lines = porcelain.split("\n");
  /** @type {string[]} */
  const kept = [];
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("\t")) continue;
    if (!shas.has(lines[start].split(" ")[0])) for (let j = start; j <= i; j++) kept.push(lines[j]);
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
 * R13 #10: the lines of `git blame --line-porcelain` text per author address whose author time is at or after `from` and
 * before `to` (epoch seconds; `to` null for no upper limit). It is the author time, not the committer time that
 * `git log --since` reads: a rebased commit keeps the date its author gave it.
 * @param {string} porcelain
 * @param {number} from
 * @param {number | null} to
 * @returns {Map<string, number>}
 */
export function countBlameWritten(porcelain, from, to) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  let mail = "";
  let time = 0;
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("author-mail ")) mail = line.slice(12).replace(/^<|>$/g, "").toLowerCase();
    else if (line.startsWith("author-time ")) time = Number(line.slice(12));
    else if (line.startsWith("\t") && time >= from && (to === null || time < to)) counts.set(mail, (counts.get(mail) ?? 0) + 1);
  }
  return counts;
}

/**
 * R13 #10: a --written-since or --written-until value as epoch seconds: a date (YYYY-MM-DD, taken as 00:00 UTC) or a full
 * ISO timestamp with a zone. The window is since <= author time < until.
 * @param {string} value
 * @param {string} flag
 * @returns {number}
 */
export function parseWrittenDate(value, flag) {
  const v = value.trim();
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(v);
  const ms = ok ? Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v.replace(" ", "T")) : NaN;
  if (Number.isNaN(ms)) throw new Error(`${flag} needs a date like 2026-04-24 (UTC) or an ISO timestamp with a zone, not "${value}"`);
  return Math.floor(ms / 1000);
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
    const pending = execFileP("git", full, { cwd, maxBuffer: 1024 * 1024 * 512, encoding: "utf8", ...(opts.timeout ? { timeout: opts.timeout } : {}) });
    liveChildren.add(pending.child);
    try {
      return (await pending).stdout;
    } finally {
      liveChildren.delete(pending.child);
    }
  }
  // Objects read through `cat-file --batch` are raw bytes. They come back as a latin1 string, one character per byte,
  // so the sizes git prints are positions in it; each blob is decoded as UTF-8 afterwards.
  return new Promise((resolveRun, reject) => {
    const child = spawn("git", full, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    liveChildren.add(child);
    child.on("close", () => liveChildren.delete(child));
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
export async function listNonRegularPaths(o) {
  // --full-tree: without it git lists only the working directory's subtree, with paths relative to it.
  const out = await git(["ls-tree", "--full-tree", "-r", "-z", o.ref], o.cwd);
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

/**
 * Markers in the first lines of a file that say a tool wrote it. The strong ones (the original, case-sensitive set)
 * count wherever they stand in those lines. The wide ones are matched without regard to case and count only on a line
 * that looks like a comment, or inside a block comment, or on a line that holds both "generated" and "do not", so a
 * source line that merely uses the word (`let generated = 1;`) keeps its file.
 */
const GENERATED_STRONG = /@generated|DO NOT EDIT|Code generated|[Aa]uto-?[Gg]enerated/;
const GENERATED_WIDE_SOURCE = "@generated|generated by|generated file|generated code|code generated|auto-?generated|automatically generated|do not (edit|modify|change)|this file was generated|produced by|compiled from";
/** The pattern given to `git grep -i -E`: every marker, in any case. */
const GENERATED_MARKER = GENERATED_WIDE_SOURCE;
const GENERATED_WIDE = new RegExp(GENERATED_WIDE_SOURCE, "i");
const GENERATED_MARKER_LINES = 10;
/** The start of a comment line in the usual languages. */
const COMMENT_LEADER = /^\s*(?:\/\/|#|--|\/\*|\*|;|%|<!--|""")/;

/**
 * Whether line `index` (0-based) of the head lines stands inside a block comment (`/* ... *\/`, `<!-- ... -->` or a
 * triple-quoted string) that began on an earlier line of the head and is still open there.
 * @param {string[]} head
 * @param {number} index
 */
function insideBlockComment(head, index) {
  /** @type {string | null} */
  let close = null;
  for (let i = 0; i < index; i++) {
    let rest = head[i];
    while (rest.length) {
      if (close) {
        const at = rest.indexOf(close);
        if (at < 0) break;
        rest = rest.slice(at + close.length);
        close = null;
      } else {
        const m = /\/\*|<!--|"""/.exec(rest);
        if (!m) break;
        close = m[0] === "/*" ? "*/" : m[0] === "<!--" ? "-->" : '"""';
        rest = rest.slice(m.index + m[0].length);
      }
    }
  }
  return close !== null;
}

/** Output extension to the source extensions it is compiled from. A `.d.ts` file is never a source: `X.d.ts` has the stem `X.d`, which no output shares. */
const COMPILED_FROM = new Map([
  [".js", [".ts", ".tsx", ".coffee"]],
  [".lua", [".tl"]],
  [".css", [".scss", ".sass", ".less"]],
  [".c", [".pyx"]],
]);

/**
 * The source file a compiled output comes from, when both are in the ref: `X.js` with `X.ts` in the same directory, or
 * in a `src` directory that stands where the output's first or last directory stands (`dist/X.js` and `src/X.ts`).
 * @param {string} path
 * @param {Set<string>} all every path of the ref
 * @returns {string | null}
 */
function compiledSourceOf(path, all) {
  const dot = path.lastIndexOf(".");
  if (dot <= path.lastIndexOf("/") + 1) return null;
  const sources = COMPILED_FROM.get(path.slice(dot));
  if (!sources) return null;
  const stem = path.slice(0, dot);
  const parts = stem.split("/");
  const dirs = parts.slice(0, -1);
  const stems = [stem];
  if (dirs.length) stems.push([...dirs.slice(0, -1), "src", parts[parts.length - 1]].join("/"), ["src", ...parts.slice(1)].join("/"));
  for (const base of stems) for (const ext of sources) if (all.has(base + ext)) return base + ext;
  return null;
}

/** The kinds of file that are left out, in the order the output lists them. */
const DROP_CLASSES = ["lockfile", "generated", "vendored", "binary"];

/**
 * Extensions of document and image formats that are binary but that git's own probe (a NUL in the first 8000 bytes)
 * can miss. Used only when the NUL scan (readNulFiles) could not run, as a coarser stand-in for it; compared in lower
 * case. When the scan ran, a file with one of these extensions and no NUL byte is text and is counted.
 */
const BINARY_EXTENSION = /\.(?:ai|eps|psd|pdf|br)$/i;

/**
 * The paths at the ref whose content holds a NUL byte, which no text file does. `git diff --numstat` calls a file binary
 * only when a NUL sits in its first 8000 bytes, so a file with its first NUL later is listed as text and its bytes are
 * counted as lines. One `git grep` over the tree. `git grep` exits with 1 when nothing matches, which is an empty
 * result; any other failure (this git has no Perl-compatible regular expressions, for one) means the scan could not
 * run, and the caller falls back to BINARY_EXTENSION.
 * @param {Options} o
 * @returns {Promise<{ files: Set<string>, available: boolean }>}
 */
async function readNulFiles(o) {
  const tree = (await git(["rev-parse", "--verify", `${o.ref}^{tree}`], o.cwd)).trim();
  /** @type {Set<string>} */
  const found = new Set();
  let out;
  try {
    out = await git(["grep", "-l", "-a", "-z", "-P", "\\x00", tree, "--", ...o.paths], o.cwd);
  } catch (err) {
    if (/** @type {{ code?: unknown }} */ (err).code === 1) return { files: found, available: true };
    return { files: found, available: false };
  }
  for (const rec of out.split("\0")) if (rec.startsWith(`${tree}:`)) found.add(rec.slice(tree.length + 1));
  return { files: found, available: true };
}

/**
 * File names that tools write, matched case-insensitively against the base name, for the "generated" class. A name that
 * holds ".generated." or ".gen." before the extension, the output names of common code generators, an Xcode
 * project.pbxproj and test snapshots. Plain .json, .csproj and .sln names are not here.
 */
const GENERATED_NAME_RULES = [
  /\.(?:generated|gen)\./i,
  /\.(?:g|freezed)\.dart$/i,
  /\.pb\.(?:go|cc|h)$/i,
  /_pb2(?:_grpc)?\.py$/i,
  /\.(?:designer|g)\.cs$/i,
  /_generated\.(?:go|rs)$/i,
  /^project\.pbxproj$/i,
  /\.snap$/i,
];

/** Directory names whose whole content is written by Xcode. */
const GENERATED_DIR_RULE = /\.(?:xcodeproj|xcworkspace)$/i;

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
  if (GENERATED_NAME_RULES.some((re) => re.test(base)) || parts.slice(0, -1).some((p) => GENERATED_DIR_RULE.test(p))) return { kind: "generated", root: path };
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
    out = await git(["grep", "-n", "-z", "-I", "-i", "-E", "-e", GENERATED_MARKER, tree, "--", ...o.paths], o.cwd);
  } catch {
    return marked;
  }
  /** @type {Map<string, { n: number, text: string }[]>} */
  const hits = new Map();
  for (const rec of out.split("\n")) {
    const a = rec.indexOf("\0");
    const b = a < 0 ? -1 : rec.indexOf("\0", a + 1);
    if (b < 0) continue;
    const n = Number(rec.slice(a + 1, b));
    if (n > GENERATED_MARKER_LINES) continue;
    const path = rec.slice(tree.length + 1, a);
    const text = rec.slice(b + 1);
    if (GENERATED_STRONG.test(text)) {
      marked.add(path);
      continue;
    }
    if (!GENERATED_WIDE.test(text)) continue;
    if (COMMENT_LEADER.test(text) || (/generated/i.test(text) && /do not/i.test(text))) marked.add(path);
    else hits.set(path, [...(hits.get(path) ?? []), { n, text }]);
  }
  // A wide marker on a line with no comment leader may still sit inside a block comment that opened above it.
  for (const [path, list] of hits) {
    if (marked.has(path)) continue;
    let head;
    try {
      head = (await git(["show", `${tree}:${path}`], o.cwd)).split("\n").slice(0, GENERATED_MARKER_LINES);
    } catch {
      continue;
    }
    if (list.some((h) => insideBlockComment(head, h.n - 1))) marked.add(path);
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
    /** @type {{ path: string, class: string, files: number, lines: number, note?: string }[]} */
    paths: [],
    otherPaths: 0,
  };
  if (o.keepGenerated) return { kept: files, dropped };
  const attrs = await readLinguistAttributes(o, everyFile);
  const markers = await readGeneratedMarkers(o);
  const nul = await readNulFiles(o);
  const allPaths = new Set(everyFile.map((x) => x.path));
  if (!nul.available && !o.quiet) (o.stderr ?? process.stderr).write("surviving-lines: NUL scan skipped: git grep -P unavailable (binary files are recognised by extension only)\n");
  /** @type {Map<string, { path: string, class: string, files: number, lines: number, note?: string }>} */
  const byRoot = new Map();
  for (const f of files) {
    const attr = attrs.get(f.path) ?? {};
    const byPath = classifyPath(f.path);
    /** @type {{ kind: string, root: string, note?: string } | null} */
    let hit = null;
    if (attr.vendored === true) hit = { kind: "vendored", root: f.path };
    else if (attr.generated === true) hit = { kind: "generated", root: f.path };
    else if (byPath && !(byPath.kind === "vendored" ? attr.vendored === false : attr.generated === false)) hit = byPath;
    else if (markers.has(f.path) && attr.generated !== false) hit = { kind: "generated", root: f.path };
    else if (attr.generated !== false && compiledSourceOf(f.path, allPaths)) hit = { kind: "generated", root: f.path, note: `compiled output of ${compiledSourceOf(f.path, allPaths)}` };
    else if (nul.files.has(f.path) || (!nul.available && BINARY_EXTENSION.test(f.path))) hit = { kind: "binary", root: f.path };
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
    const e = byRoot.get(key) ?? { path: hit.root, class: hit.kind, files: 0, lines: 0, ...(hit.note ? { note: hit.note } : {}) };
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
 * @param {{ dropped?: { applied: boolean, files: number, lines: number, classes: Record<string, { files: number, lines: number }>, paths: { path: string, files: number, lines: number, note?: string }[], otherPaths: number } }} r
 * @returns {string | null}
 */
export function droppedLine(r) {
  const d = r.dropped;
  if (!d || !d.applied || d.files === 0) return null;
  const n = (/** @type {number} */ x, /** @type {string} */ noun) => `${x.toLocaleString("en-US")} ${noun}${x === 1 ? "" : "s"}`;
  const classes = DROP_CLASSES.filter((k) => d.classes[k]?.files).map((k) => `${k} ${n(d.classes[k].files, "file")} ${n(d.classes[k].lines, "line")}`);
  const paths = d.paths.slice(0, 3).map((p) => `${p.path} (${n(p.lines, "line")}${p.note ? `, ${p.note}` : ""})`);
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
 * @param {Map<string, { files: number, authors: Map<string, { name: string, lines: number, withBlank?: number }> }>} acc
 * @param {boolean} includeBots
 * @param {number} thresholdPercent the --bus-factor-threshold the group's bus factor is measured with
 */
function buildGroups(acc, includeBots, thresholdPercent) {
  return [...acc.entries()]
    .map(([key, g]) => {
      const kept = [...g.authors.entries()].filter(([mail, a]) => includeBots || !isBotIdentity(a.name, mail));
      const lines = kept.reduce((sum, [, a]) => sum + a.lines, 0);
      const linesWithBlank = kept.reduce((sum, [, a]) => sum + (a.withBlank ?? a.lines), 0);
      const authors = kept
        .map(([mail, a]) => ({ author: a.name, mail, lines: a.lines, lineShare: lines ? a.lines / lines : 0, linesWithBlank: a.withBlank ?? a.lines, shareWithBlank: linesWithBlank ? (a.withBlank ?? a.lines) / linesWithBlank : 0 }))
        .sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail));
      const bf = busFactor(authors, thresholdPercent);
      return { key, filesSampled: g.files, lines, linesWithBlank, authors, busFactor: bf && { thresholdPercent, ...bf } };
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
 * @param {Set<string>} [leaveOut] commits whose lines are left out of every count (boilerplate commits)
 * @param {ReapplyCredit | null} [credit] when given, the lines of a re-applied commit are credited to the original author
 */
async function blamePass(o, sampled, blameArgs, grouping, progress, leaveOut = new Set(), credit = null) {
  /** @type {Map<string, { name: string, lines: number, commits: number, withBlank?: number }>} */
  const authors = new Map();
  let attributed = 0;
  /** @type {Map<string, { files: number, authors: Map<string, { name: string, lines: number, withBlank?: number }> }>} */
  const groupAcc = new Map();
  /** @type {Map<string, { name: string, mail: string, lines: number, committer?: string, committerMail?: string }>} */
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
  /** R13 #10: the surviving lines per address whose author time is inside the --written-since window. */
  /** @type {Map<string, number>} */
  const written = new Map();
  /** The index of the file that gave each address its name: blames finish in any order, so the name is the first file's. */
  /** @type {Map<string, { idx: number, rank: number }>} */
  const nameFrom = new Map();
  const worker = async () => {
    while (cursor < sampled.length) {
      const idx = cursor++;
      const file = sampled[idx];
      let raw = dropBlameLinesOf(await git([...blameArgs, o.ref, "--", file.path], o.cwd), leaveOut);
      if (credit) raw = await credit.rewrite(raw);
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
      if (o.writtenFrom !== undefined) for (const [mail, n] of countBlameWritten(out, o.writtenFrom, o.writtenTo ?? null)) written.set(mail, (written.get(mail) ?? 0) + n);
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
        const e = blamedByCommit.get(sha) ?? { name: c.name, mail: c.mail, lines: 0, committer: c.committer, committerMail: c.committerMail };
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
        // The same lines with their blank lines, for the with-blank column of the group tables.
        for (const [mail, { name, lines }] of rawCounts) {
          const a = g.authors.get(mail) ?? { name, lines: 0 };
          a.withBlank = (a.withBlank ?? 0) + lines;
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
  // An author whose surviving lines are all blank is in no non-blank count. Without a row of their own their blank lines
  // would be in the size of the files but in no author's with-blank figure, so the totals would disagree.
  for (const file of sampled) {
    for (const [mail, { name, fullName }] of perFileRaw.get(file.path) ?? []) {
      if (!authors.has(mail)) authors.set(mail, { name: fullName ?? name, lines: 0, commits: 0 });
    }
  }
  for (const [mail, a] of authors) a.withBlank = withBlankOf.get(mail) ?? a.lines;
  return { authors, attributed, groupAcc, blamedByCommit, origins, copiedFiles, fileCounts, perFile, perFileRaw, written };
}

/**
 * What copy detection changed: the files it credited to another path are blamed again with the same arguments minus
 * -C, and each author's lines in those files are compared. Null when no file was credited to another path or the
 * second blame gives the same lines.
 * @param {Options} o
 * @param {{ path: string, lines: number }[]} sampled
 * @param {Map<string, Map<string, { name: string, lines: number }>>} copiedFiles the files the -C pass credited to another path, with its counts
 * @param {string[]} blameArgs the arguments of the pass that gave copiedFiles
 * @param {Set<string>} [leaveOut] the commits that pass left out
 * @returns {Promise<{ files: number, delta: Map<string, { name: string, lines: number }> } | null>} lines with copy detection minus lines without, per address
 */
async function copyShiftOf(o, sampled, copiedFiles, blameArgs, leaveOut = new Set(), credit = null) {
  if (!copiedFiles.size) return null;
  const plain = await blamePass(o, sampled.filter((f) => copiedFiles.has(f.path)), blameArgs.filter((a) => a !== "-C"), null, null, leaveOut, credit);
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

/**
 * Extensions of the languages where `'x'` and `"x"` are the same string, so a quote change is layout there. Lua and Dart
 * are in because both quote styles give the same string, escapes and (in Dart) interpolation included. Ruby, PHP, Perl,
 * Elixir, Julia and shell are not: there `'x'` and `"x"` differ in interpolation, in escapes or in type, so a quote
 * change can be a real change. Swift, Go, Rust, Java, Kotlin and C# have one quote style for strings.
 */
const QUOTE_FOLD_EXTENSIONS = new Set(["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "py", "json", "json5", "jsonc", "css", "scss", "sass", "less", "vue", "svelte", "lua", "dart"]);

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
/** In a run scoped to paths a commit holding at least this many surviving lines in scope is judged (the floor above does not apply). */
const REFORMAT_SCOPED_MIN_LINES = 1;
/** A commit whose proof covers at least this many changed lines is set aside even without a formatter in the subject. */
const REFORMAT_PROOF_LINES = 50;
/** A commit that touches at least this many files, all passing the proof, is set aside even without a formatter in the subject. */
const REFORMAT_PROOF_FILES = 10;
/**
 * Files that configure a formatter, by base name. A commit that adds or edits one of them while every other file only
 * changes in layout is still a reformat, so the proof leaves these files out. A commit that touches only these files
 * is not a rewrite. pyproject.toml and the editor/linter configs are here because they hold the formatter's settings.
 */
export const FORMATTER_CONFIG_FILES = /^(?:\.?stylua\.toml|\.formatter\.exs|analysis_options\.yaml|\.?rustfmt\.toml|\.prettierrc(?:\.[\w]+)?|prettier\.config\.[\w]+|\.prettierignore|pyproject\.toml|\.clang-format|\.editorconfig|biome\.jsonc?|\.scalafmt\.conf|\.swiftformat|\.style\.yapf|\.isort\.cfg|dprint\.json|\.php-cs-fixer(?:\.dist)?\.php|\.ktlint|\.rubocop\.yml|\.gofmt|\.black|\.yapfignore)$/i;
/** @param {string} path */
const isFormatterConfig = (path) => FORMATTER_CONFIG_FILES.test(path.slice(path.lastIndexOf("/") + 1));
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
 * @typedef {{ parents: string[], date: string, subject: string, files: { status: string, path: string, before: string, after: string }[], counts: Map<string, { binary: boolean, changed: number, added?: number }> }} CommitFacts
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
        counts.set(rest.join("\t"), { binary, changed: binary ? 0 : Number(added) + Number(deleted), added: binary ? 0 : Number(added) });
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
 * delete or rename, formatter configuration files excepted), changes at least one text file, and every text file differs from its parent only in layout or
 * quote style. Binary files cannot be compared, so a commit that changed only binary files is not a reformat. A file
 * whose line count git does not give is not judged, so the commit is not a reformat either.
 * @param {CommitFacts} f
 * @param {(oid: string) => Promise<string | undefined>} blob the text of a blob id
 * @returns {Promise<{ filesChanged: number, changedLines: number, addedLines: number } | null>}
 */
async function reformatLines(f, blob) {
  const files = f.files;
  if (files.length === 0 || files.length > REFORMAT_MAX_FILES) return null;
  // A formatter configuration file may be added, edited or removed beside the reformat; it is not part of the proof.
  const proved = files.filter((x) => !isFormatterConfig(x.path));
  if (proved.length === 0 || proved.some((x) => x.status !== "M")) return null;
  let textFiles = 0;
  let changedLines = 0;
  let addedLines = 0;
  for (const file of proved) {
    const c = f.counts.get(file.path);
    if (!c) return null;
    if (c.binary) continue;
    textFiles++;
    changedLines += c.changed;
    addedLines += c.added ?? Math.ceil(c.changed / 2);
    const before = await blob(file.before);
    const after = await blob(file.after);
    if (before === undefined || after === undefined || !isFormatOnlyChange(before, after, file.path)) return null;
  }
  return textFiles === 0 ? null : { filesChanged: files.length, changedLines, addedLines };
}

/**
 * Runs git with the given arguments in the repository and returns its stdout.
 * @typedef {(args: string[], opts?: { input?: string, binary?: boolean }) => Promise<string>} GitRun
 */

/**
 * The commits the first blame pass gave lines to that are reformats: lines moved by layout or quote changes only. The
 * content proof (see reformatLines) is the signal. A proved commit is set aside when its subject names a formatter, or it
 * touches at least 10 files, or the proof covers at least 50 changed lines; otherwise it is only listed (see judgeReformats).
 * A commit judged by its subject alone, without the proof, is never returned here.
 * In a run scoped to paths every commit with at least one surviving line is judged; otherwise the commit needs 20
 * surviving lines or 5% of the attributed lines.
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
  return (await judgeReformats(o, blamedByCommit, blamedTotal, run)).suspects;
}

/**
 * Like findReformatSuspects, and also gives the commits that passed the content proof but were not set aside (no
 * formatter in the subject, fewer than 10 files, fewer than 50 changed lines).
 * @param {Options} o
 * @param {Map<string, { name: string, mail: string, lines: number }>} blamedByCommit
 * @param {number} blamedTotal
 * @param {GitRun} [run]
 */
export async function judgeReformats(o, blamedByCommit, blamedTotal, run = (args, opts) => git(args, o.cwd, opts)) {
  const scoped = (o.paths?.length ?? 0) > 0 || o.files !== undefined;
  const candidates = [...blamedByCommit]
    .filter(([, b]) => (scoped ? b.lines >= REFORMAT_SCOPED_MIN_LINES : b.lines >= REFORMAT_MIN_LINES || b.lines >= blamedTotal * REFORMAT_SHARE))
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
    if (!f || f.parents.length !== 1 || f.files.length === 0 || f.files.length > REFORMAT_MAX_FILES) continue;
    const proved = f.files.filter((x) => !isFormatterConfig(x.path));
    if (proved.length === 0 || proved.some((x) => x.status !== "M")) continue;
    wanted.set(sha, proved.filter((x) => f.counts.get(x.path)?.binary === false).flatMap((x) => [x.before, x.after]));
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
  const listed = new Array(candidates.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const idx = next++;
      const [sha, b] = candidates[idx];
      const f = facts.get(sha);
      if (!f || f.parents.length !== 1 || tooLarge.has(sha)) continue;
      try {
        const found = await reformatLines(f, blob);
        if (found) {
          const suspect = { sha, shortSha: sha.slice(0, 7), author: b.name, mail: b.mail, subject: f.subject, date: f.date, ...found, survivingLines: b.lines, files: f.files.map((x) => x.path) };
          const strong = MECHANICAL_SUBJECT.test(f.subject) || f.files.length >= REFORMAT_PROOF_FILES || found.changedLines >= REFORMAT_PROOF_LINES;
          (strong ? suspects : listed)[idx] = suspect;
        }
      } catch {
        // A git failure on one blob: this candidate is not a suspect.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(o.jobs, 1), candidates.length || 1) }, worker));
  return { suspects: suspects.filter(Boolean), listed: listed.filter(Boolean) };
}

/** At most this many commits holding surviving lines are examined for the mechanical-rewrite check, most surviving lines first. */
const MECHANICAL_MAX_COMMITS = 3000;
/** A commit touching at least this many files with the same small change in each looks mechanical ... */
const MECHANICAL_MIN_FILES = 10;
/** ... when no file changed by more than this many inserted (and as many deleted) lines. */
const MECHANICAL_MAX_LINES_PER_FILE = 3;
/** Subjects that name a formatting tool, a lint fix, a codemod or a rename tool: tool names and explicit phrases only, not a bare "rename", "format" or "black". */
const MECHANICAL_TOOL_SUBJECT = /\b(?:fmt|gofmt|rustfmt|clang-format|scalafmt|autopep8|isort|prettier|black\s+formatt(?:ing|er|ed)|(?:run|ran|apply|applied|apply|using|with)\s+(?:the\s+)?(?:black|formatter)|format\s+(?:all|everything|the\s+(?:code|codebase|repo(?:sitory)?))|reformat(?:ting|ted)?|lint(?:ing)?\s+fix(?:es)?|fix(?:ed|es)?\s+lint|eslint(?:\s+--fix)?|codemods?|(?:rename|renaming)\s+tool|(?:mass|bulk)\s+rename|go\s+fix|gofix)\b|(?:^|\s)--fix\b/i;
/** Phrases added to the tool vocabulary: more formatters, and plain wording such as "format code" or "fix style". Used to list a commit and, with the content proof, to set it aside. */
const MECHANICAL_EXTRA_SUBJECT = /\b(?:mix\s+format|dart\s+format|(?:cargo|go|terraform|ruff|biome|deno|dotnet|swift)\s+(?:fmt|format)|stylua|yapf|ktlint|spotless|swift-?format|php-cs-fixer|rubocop\s+(?:-a\b|-A\b|--auto-?correct)|blacken(?:ed)?|auto-?format\w*|auto-?fix\w*|lint\s+--fix|(?:apply|applied|applying)\s+(?:the\s+)?(?:code\s+)?format(?:ting|ter)?|(?:format|formatting)\s+(?:code|fixes|only|changes|source|files?|sources)|code\s+format(?:ting)?|fix(?:ed|es|ing)?\s+(?:code\s+)?(?:style|formatting|whitespace|indent(?:ation)?)|(?:style|whitespace)\s+(?:fix|fixes|only|cleanup|clean-up)|line[_\s-]length|(?:single|double)[-\s]quotes?|quote\s+style)\b|^(?:\w+(?:\([^)]*\))?!?:\s*)?(?:format|formatting|fmt|lint|linting|black|reformat|style)\s*(?:[.!]|$)/i;
const MECHANICAL_SUBJECT = new RegExp(`${MECHANICAL_TOOL_SUBJECT.source}|${MECHANICAL_EXTRA_SUBJECT.source}`, "i");

/** A boilerplate commit is read from its patch only when no file gains more than this many lines. */
const BOILERPLATE_MAX_ADDED_PER_FILE = 200;
/** A boilerplate commit touches at least this many files, and the same added text stands in at least this many of them. */
const BOILERPLATE_MIN_FILES = 3;
/** An added line that is licence, copyright or banner text. */
const BOILERPLATE_LINE = /copyright|licen[sc]e|SPDX-License-Identifier|all rights reserved|permission is hereby granted|apache license|mit license|gnu general public/i;

/**
 * Whether a commit only adds the same boilerplate to several existing files, from its patch (`git log -p -U0`).
 * Every file must be a change to an existing file that deletes nothing but blank lines and adds something. Then either
 * the same added non-blank lines stand in at least three files and every other file adds licence text only, or every
 * file adds licence, copyright, SPDX or banner text only. A commit that adds files is never boilerplate: a new file's
 * header is part of the file.
 * @param {string} patch the patch text of one commit
 * @returns {boolean}
 */
export function isBoilerplatePatch(patch) {
  /** @type {{ created: boolean, removed: boolean, delText: boolean, added: string[] }[]} */
  const files = [];
  let inHunk = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      files.push({ created: false, removed: false, delText: false, added: [] });
      inHunk = false;
      continue;
    }
    const f = files[files.length - 1];
    if (!f) continue;
    if (!inHunk) {
      if (line.startsWith("@@")) inHunk = true;
      else if (line.startsWith("new file mode")) f.created = true;
      else if (line.startsWith("deleted file mode")) f.removed = true;
      else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) f.removed = true;
      continue;
    }
    if (line.startsWith("@@")) continue;
    if (line.startsWith("+") && line.slice(1).trim() !== "") f.added.push(line.slice(1).trimEnd());
    else if (line.startsWith("-") && line.slice(1).trim() !== "") f.delText = true;
  }
  if (files.length < BOILERPLATE_MIN_FILES) return false;
  if (files.some((f) => f.created || f.removed || f.delText || !f.added.length)) return false;
  const licence = files.map((f) => f.added.every((l) => BOILERPLATE_LINE.test(l)));
  if (licence.every(Boolean)) return true;
  /** @type {Map<string, number>} */
  const bySignature = new Map();
  for (const f of files) {
    const sig = f.added.join("\n");
    bySignature.set(sig, (bySignature.get(sig) ?? 0) + 1);
  }
  const [top, count] = [...bySignature].sort((x, y) => y[1] - x[1])[0];
  return count >= BOILERPLATE_MIN_FILES && files.every((f, i) => f.added.join("\n") === top || licence[i]);
}

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
 * @param {{ sha: string, shortSha: string, subject: string, author: string, mail: string, survivingLines: number, filesChanged: number }[]} [proved] commits whose content proof passed and that were not set aside; they are listed with reason "content"
 * @returns {Promise<{ examined: number, total: number, truncated: boolean, setAside: number, ignoredByUser: number, candidates: { sha: string, shortSha: string, author: string, mail: string, subject: string, survivingLines: number, filesChanged: number, reason: "files" | "subject" | "content" | "boilerplate", both?: boolean }[], setAsideCommits?: { sha: string, shortSha: string, author: string, mail: string, subject: string, survivingLines: number, filesChanged: number, reason: "files" | "subject" | "content" | "boilerplate" }[] } | null>}
 */
export async function findMechanicalCandidates(o, blamedByCommit, setAside, ignoredByUser = 0, run = (args, opts) => git(args, o.cwd, opts), proved = []) {
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
  /** @type {Map<string, { subject: string, files: number, small: boolean, plausible: boolean }>} */
  const facts = new Map();
  for (const chunk of out.split("\x1e")) {
    if (!chunk) continue;
    const [head, ...rest] = chunk.split("\n");
    const [sha, ...subject] = head.split("\x1f");
    let files = 0;
    let small = true;
    let plausible = true;
    for (const line of rest) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
      if (!m) continue;
      files++;
      if (m[1] === "-" || m[1] !== m[2] || Number(m[1]) < 1 || Number(m[1]) > MECHANICAL_MAX_LINES_PER_FILE) small = false;
      if (m[1] === "-" || Number(m[1]) < 1 || Number(m[1]) > BOILERPLATE_MAX_ADDED_PER_FILE) plausible = false;
    }
    facts.set(sha, { subject: subject.join("\x1f"), files, small, plausible: plausible && files >= BOILERPLATE_MIN_FILES });
  }
  // Boilerplate: the patch is read only for commits that add a modest number of lines to at least three files.
  /** @type {Set<string>} */
  const boilerplate = new Set();
  const toRead = [...facts].filter(([, f]) => f.plausible).map(([sha]) => sha);
  if (toRead.length) {
    try {
      const patches = await run(["log", "--no-walk=unsorted", "-p", "-U0", "--no-renames", "--no-color", "--format=%x1e%H", "--stdin"], { input: `${toRead.join("\n")}\n` });
      for (const chunk of patches.split("\x1e")) {
        const nl = chunk.indexOf("\n");
        if (nl > 0 && isBoilerplatePatch(chunk.slice(nl + 1))) boilerplate.add(chunk.slice(0, nl));
      }
    } catch {
      // A patch that cannot be read leaves the commit as it was: not boilerplate.
    }
  }
  /** @type {NonNullable<Awaited<ReturnType<typeof findMechanicalCandidates>>>["candidates"]} */
  const candidates = [];
  for (const [sha, b] of list) {
    const f = facts.get(sha);
    if (!f || setAside.has(sha)) continue;
    if (boilerplate.has(sha)) {
      // The same lines added to several existing files and nothing deleted: set aside like a reformat (internal flag `both`).
      candidates.push({ sha, shortSha: sha.slice(0, 7), author: b.name, mail: b.mail, subject: f.subject, survivingLines: b.lines, filesChanged: f.files, reason: "boilerplate", both: true });
      continue;
    }
    const byFiles = f.files >= MECHANICAL_MIN_FILES && f.small;
    const bySubject = MECHANICAL_SUBJECT.test(f.subject);
    if (!byFiles && !bySubject) continue;
    // Only the original tool vocabulary plus the same small change in 10 files sets a commit aside without the content proof.
    const both = byFiles && MECHANICAL_TOOL_SUBJECT.test(f.subject);
    candidates.push({ sha, shortSha: sha.slice(0, 7), author: b.name, mail: b.mail, subject: f.subject, survivingLines: b.lines, filesChanged: f.files, reason: byFiles ? "files" : "subject", ...(both ? { both: true } : {}) });
  }
  for (const p of proved) {
    if (setAside.has(p.sha) || candidates.some((c) => c.sha === p.sha)) continue;
    candidates.push({ sha: p.sha, shortSha: p.shortSha, author: p.author, mail: p.mail, subject: p.subject, survivingLines: p.survivingLines, filesChanged: p.filesChanged, reason: "content" });
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
 * G13: whether a path is a single file (a blob) at the ref. A directory, or a path that is not in the ref, is not.
 * @param {Options} o
 * @param {string} path
 */
async function isFileAtRef(o, path) {
  try {
    return (await git(["cat-file", "-t", `${o.ref}:${path.replace(/^\.\//, "")}`], o.cwd)).trim() === "blob";
  } catch {
    return false;
  }
}

/**
 * The commits that touch a path at the ref, from ONE git log call, for the path views. Each has its id, its author
 * address (.mailmap applied and lowercased, the key the commit counts use) and its author date as YYYY-MM-DD.
 * Merges are left out, as the commit counts leave them out. A path that is a file is followed across renames.
 * @param {Options} o
 * @param {string} path
 * @returns {Promise<{ sha: string, mail: string, day: string }[]>}
 */
async function readPathCommits(o, path) {
  /** @type {{ sha: string, mail: string, day: string }[]} */
  const commits = [];
  // G13: a single file is followed across renames, so a rename does not cut its history. A directory is read as it is.
  const follow = await isFileAtRef(o, path);
  for (const line of (await git(["log", "--no-merges", ...(follow ? ["--follow"] : []), "--format=%H%x09%aE%x09%aI", o.ref, "--", path], o.cwd)).split("\n")) {
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
  add(committedByOthersLines(r));
  add(reappliedCreditLines(r));
  add(mechanicalLine(r));
  add(whitespaceOnlyLine(r));
  add(copyEffectLine(r));
  add(deepCopyLine(r));
  add(sameAddressLine(r));
  if (opts.identityHints !== false) add(identityLine(r)?.split("\n"));
  add(opts.view ? movedInLine(opts.view) : null);
  return out;
}

/** G7: a person is listed in the per-file block from this many lines of the scope, or from FILE_OWNERS_MIN_SHARE of it, whichever is smaller. */
const FILE_OWNERS_MIN_LINES = 10;
const FILE_OWNERS_MIN_SHARE = 0.03;
/** G7: a file counts as one person's file in the block when they hold at least this share of it. */
const FILE_OWNED_MIN_SHARE = 0.5;
/** G7: a single-owner file has one person at this share or more, and at least this many lines. */
const SINGLE_OWNER_MIN_SHARE = 0.9;
const SINGLE_OWNER_MIN_LINES = 20;
/** G7: the block names this many files per person, this many single-owner files and this many people. */
const FILE_OWNERS_FILES_PER_PERSON = 5;
const SINGLE_OWNER_SHOWN = 8;
const FILE_OWNERS_PEOPLE_SHOWN = 8;

/**
 * G7: the files of a path view by owner. Every file with at least one non-blank surviving line has an owner (the person
 * with the most lines in it, as the --files view says). The block keeps (a) each person who holds at least
 * min(10 lines, 3% of the scope), with the files where they own at least half of the file, and (b) the files one
 * person wrote almost alone: at least 90% of at least 20 lines. Names and merges are the ones the table uses.
 * @param {Map<string, Map<string, { name: string, lines: number, fullName?: string }>>} perFile the counts per file of the run's blame pass
 * @param {boolean} includeBots
 * @param {Map<string, { author: string, mail: string }>} canonicalOf
 * @param {Map<string, string>} nameOf
 */
export function fileOwnersOf(perFile, includeBots, canonicalOf, nameOf) {
  const files = [...perFile]
    .map(([path, counts]) => ({ path, ...ownersOfFile(counts, includeBots, canonicalOf, nameOf) }))
    .filter((f) => f.lines > 0);
  const scopeLines = files.reduce((sum, f) => sum + f.lines, 0);
  /** @type {Map<string, { author: string, lines: number, files: { path: string, lines: number, share: number }[] }>} */
  const byPerson = new Map();
  for (const f of files) {
    for (const [i, ow] of f.owners.entries()) {
      const key = foldIdentity(ow.name);
      const p = byPerson.get(key) ?? { author: ow.name, lines: 0, files: [] };
      p.lines += ow.lines;
      if (i === 0 && ow.share >= FILE_OWNED_MIN_SHARE) p.files.push({ path: f.path, lines: f.lines, share: ow.share });
      byPerson.set(key, p);
    }
  }
  const floor = Math.min(FILE_OWNERS_MIN_LINES, FILE_OWNERS_MIN_SHARE * scopeLines);
  const listed = [...byPerson.values()]
    .filter((p) => p.lines >= floor)
    .sort((x, y) => y.lines - x.lines || x.author.localeCompare(y.author));
  const people = listed.map((p) => {
    const sorted = [...p.files].sort((x, y) => y.lines - x.lines || x.path.localeCompare(y.path));
    return { author: p.author, lines: p.lines, files: sorted.slice(0, FILE_OWNERS_FILES_PER_PERSON), moreFiles: Math.max(0, sorted.length - FILE_OWNERS_FILES_PER_PERSON) };
  });
  const single = files
    .filter((f) => f.lines >= SINGLE_OWNER_MIN_LINES && (f.owners[0]?.share ?? 0) >= SINGLE_OWNER_MIN_SHARE)
    .sort((x, y) => y.lines - x.lines || x.path.localeCompare(y.path));
  return {
    scopeLines,
    people,
    singleOwnerFiles: {
      files: single.slice(0, SINGLE_OWNER_SHOWN).map((f) => ({ path: f.path, author: f.owners[0].name, lines: f.lines, share: f.owners[0].share })),
      more: Math.max(0, single.length - SINGLE_OWNER_SHOWN),
    },
  };
}

/**
 * R13 #6: the active bus factor, shared by the default view, the brief, the group blocks and the JSON so they cannot
 * disagree. It is the smallest number of people, among those with a commit in the activity window, whose lines reach
 * the threshold of the lines held by active people. That base is not the base of the headline bus factor (all lines):
 * the printed sentence names both. `value` is null when no active person holds a line.
 * @param {Map<string, { author: string, lines: number, active: boolean }>} people the people of peopleActivity, or of one group
 * @param {number} thresholdPercent
 * @param {number} activeDays
 * @returns {{ thresholdPercent: number, activeDays: number, value: number | null, authors: string[], covered: number, activeLines: number, activePeople: number, people: number, allLines: number, inactiveShare: number } | null} null when no line is held
 */
export function activeBusFactorOf(people, thresholdPercent, activeDays) {
  const all = [...people.values()].filter((p) => p.lines > 0);
  const allLines = all.reduce((s, p) => s + p.lines, 0);
  if (allLines <= 0) return null;
  const active = all.filter((p) => p.active).sort((x, y) => y.lines - x.lines || x.author.localeCompare(y.author));
  const activeLines = active.reduce((s, p) => s + p.lines, 0);
  const bf = busFactor(active.map((p) => ({ author: p.author, lines: p.lines })), thresholdPercent);
  return {
    thresholdPercent,
    activeDays,
    value: bf ? bf.value : null,
    authors: bf ? bf.authors : [],
    covered: bf ? bf.covered : 0,
    activeLines,
    activePeople: active.length,
    people: all.length,
    allLines,
    inactiveShare: (allLines - activeLines) / allLines,
  };
}

/**
 * R13 #6: the one sentence that states the active bus factor, or null when no line is held.
 * @param {ReturnType<typeof activeBusFactorOf>} a
 */
export function activeBusFactorLine(a) {
  if (!a) return null;
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const tail = a.inactiveShare > 0 ? `; ${pct(a.inactiveShare)} of all lines belong to people with no commit in that window` : "; everyone who holds lines committed in that window";
  if (a.value === null) return `active bus factor none (no one who holds lines committed in the last ${a.activeDays} days)${tail}`;
  const who = a.value === 1 ? `${a.authors[0]} alone` : `${listNames(a.authors)} together`;
  return `active bus factor ${a.value} (${a.thresholdPercent}% of the ${n(a.activeLines)} lines held by the ${a.activePeople} author${a.activePeople === 1 ? "" : "s"} active in the last ${a.activeDays} days): ${who}${tail}`;
}

/**
 * R13 #6: the active bus factor of one group block and its verdict. The verdict holds up to two separate labels and is
 * never one risk rank: `single point` (the active bus factor is 1) and `orphaned` (the group's top owner has no commit
 * in the window and nobody active holds the orphan share of the group; the same rule as for one file).
 * @param {{ lines: number, authors: { author: string, lines: number }[] }} group
 * @param {Map<string, { active: boolean }>} people the run's people, for who is active
 * @param {number} thresholdPercent
 * @param {number} activeDays
 */
export function groupActivityOf(group, people, thresholdPercent, activeDays) {
  /** @type {Map<string, { author: string, lines: number, active: boolean }>} */
  const folded = new Map();
  for (const a of group.authors) {
    const key = foldIdentity(a.author);
    const p = folded.get(key) ?? { author: a.author, lines: 0, active: people.get(key)?.active === true };
    p.lines += a.lines;
    folded.set(key, p);
  }
  const activeBusFactor = activeBusFactorOf(folded, thresholdPercent, activeDays);
  const owners = [...folded].map(([key, p]) => ({ key, lines: p.lines, author: p.author })).sort((x, y) => y.lines - x.lines || x.author.localeCompare(y.author));
  /** @type {string[]} */
  const verdict = [];
  if (activeBusFactor?.value === 1) verdict.push("single point");
  if (isOrphanFile({ lines: owners.reduce((s, p) => s + p.lines, 0), owners }, folded)) verdict.push("orphaned");
  return { activeBusFactor, verdict };
}

/** R13 #5: the oldest commit is an import when it adds more than this share of the files at the ref. */
const HISTORY_IMPORT_MIN_PERCENT = 25;
/** R13 #5: a history shorter than this many days (from the oldest commit to the ref) is young. */
const HISTORY_YOUNG_DAYS = 550;
/** R13 #5: this share of merge commits among all commits makes the workflow `merge`. */
const HISTORY_MERGE_MIN_PERCENT = 5;
/** R13 #5: this share of non-merge subjects ending in `(#<digits>)` makes the workflow `squash`. */
const HISTORY_SQUASH_MIN_PERCENT = 50;

/**
 * R13 #5: what the shape of the history says about how far the table can be trusted. Pure: the git reads are in
 * readHistoryQuality. Young and import are separate causes: a young repository is never called imported.
 * @param {{ rootDate: string, rootEpoch: number, roots: number, rootFiles: number, tracked: number, refEpoch: number, commits: number, workflow: { all: number, merges: number, squashSubjects: number } }} x
 */
export function historyQualityOf(x) {
  const importRatio = x.tracked > 0 ? x.rootFiles / x.tracked : null;
  const importLikely = x.tracked > 0 && x.rootFiles * 100 > x.tracked * HISTORY_IMPORT_MIN_PERCENT;
  const days = Math.max(0, Math.floor((x.refEpoch - x.rootEpoch) / 86400));
  const youngHistory = days < HISTORY_YOUNG_DAYS && !importLikely;
  const w = x.workflow;
  const nonMerge = w.all - w.merges;
  /** @type {"merge" | "squash" | "rebase" | null} */
  let strategy = null;
  if (w.all > 0) strategy = w.merges * 100 >= w.all * HISTORY_MERGE_MIN_PERCENT ? "merge" : nonMerge > 0 && w.squashSubjects * 100 >= nonMerge * HISTORY_SQUASH_MIN_PERCENT ? "squash" : "rebase";
  return {
    oldestRoot: { date: x.rootDate, roots: x.roots, filesAdded: x.rootFiles, filesAtRef: x.tracked, ratio: importRatio, importLikely },
    youngHistory,
    ageDays: days,
    commits: x.commits,
    workflow: strategy && { strategy, commits: w.all, merges: w.merges, mergeShare: w.merges / w.all, squashSubjects: w.squashSubjects, squashShare: nonMerge > 0 ? w.squashSubjects / nonMerge : 0 },
  };
}

/**
 * R13 #5: read the oldest root, the files it added, the files at the ref and the commits of the window. Several roots
 * (joined histories) are counted and the oldest by author date is used. Returns null for a repository with no root.
 * @param {Options} o
 */
async function readHistoryQuality(o) {
  const roots = (await git(["rev-list", "--max-parents=0", o.ref], o.cwd)).split("\n").filter(Boolean);
  if (!roots.length) return null;
  const dated = (await git(["log", "--no-walk=unsorted", "--format=%H%x09%at%x09%aI", ...roots], o.cwd))
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, epoch, iso] = l.split("\t");
      return { sha, epoch: Number(epoch), date: iso.slice(0, 10) };
    })
    .sort((a, b) => a.epoch - b.epoch || a.sha.localeCompare(b.sha));
  const root = dated[0];
  const rootFiles = (await git(["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "--root", root.sha], o.cwd)).split("\0").filter(Boolean).length;
  const tracked = (await git(["ls-tree", "-r", "--name-only", "-z", o.ref], o.cwd)).split("\0").filter(Boolean).length;
  const refEpoch = Number((await git(["log", "-1", "--format=%at", o.ref], o.cwd)).trim());
  const commits = Number((await git(["rev-list", "--no-merges", "--count", o.ref], o.cwd)).trim());
  const logArgs = ["log", "--format=%P%x09%s", o.ref];
  if (o.since) logArgs.push(`--since=${o.since}`);
  if (o.until) logArgs.push(`--until=${o.until}`);
  let all = 0;
  let merges = 0;
  let squashSubjects = 0;
  for (const line of (await git(logArgs, o.cwd)).split("\n")) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    const parents = line.slice(0, tab).split(" ").filter(Boolean).length;
    all++;
    if (parents >= 2) merges++;
    else if (/\(#\d+\)\s*$/.test(line.slice(tab + 1))) squashSubjects++;
  }
  return historyQualityOf({ rootDate: root.date, rootEpoch: root.epoch, roots: roots.length, rootFiles, tracked, refEpoch, commits, workflow: { all, merges, squashSubjects } });
}

/**
 * R13 #5: the lines under the header that say how far the table can be trusted: one for the start of the history and
 * one for the merge workflow. Empty when the result carries none (a result from another source).
 * @param {{ historyQuality?: ReturnType<typeof historyQualityOf> | null, commitWindow?: { since: string | null, until: string | null } }} r
 * @returns {string[]}
 */
export function historyLines(r) {
  const h = r.historyQuality;
  if (!h) return [];
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const root = h.oldestRoot;
  const several = root.roots > 1 ? `; ${root.roots} root commits (joined histories), the oldest by author date is read` : "";
  const share = (/** @type {number} */ x) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);
  /** @type {string[]} */
  const out = [];
  if (root.importLikely) out.push(`history: begins ${root.date} with a commit that adds ${n(root.filesAdded)} of ${n(root.filesAtRef)} files (${share(root.ratio ?? 0)}); lines older than that are credited to whoever imported them, so the table describes work since the import${several}`);
  else if (h.youngHistory) out.push(`history: ${n(h.ageDays)} days old (${n(h.commits)} commits); a short window, not an import${several}`);
  else out.push(`history: begins ${root.date}; its first commit adds ${n(root.filesAdded)} of ${n(root.filesAtRef)} files (${share(root.ratio ?? 0)}), which is not an import${several}`);
  const w = h.workflow;
  if (w) {
    const win = r.commitWindow?.since || r.commitWindow?.until ? " in the --since/--until window" : "";
    if (w.strategy === "squash") out.push(`workflow${win}: squash merges (${share(w.squashShare)} of subjects end in "(#NNN)"); the table names the squasher or PR author; only Co-authored-by trailers name anyone else`);
    else if (w.strategy === "merge") out.push(`workflow${win}: merge commits (${share(w.mergeShare)} of the commits are merges); lines are credited to the authors of the commits on the merged branches, not to whoever merged`);
    else out.push(`workflow${win}: rebase or direct commits (${n(w.merges)} merge commit${w.merges === 1 ? "" : "s"}, ${share(w.squashShare)} of subjects end in "(#NNN)"); lines are credited to the commit authors`);
  }
  return out;
}

/**
 * R13 #5: the history facts the brief carries, as one short phrase (the JSON value and the text line share it).
 * @param {ReturnType<typeof historyQualityOf> | null | undefined} h
 * @returns {string | null}
 */
export function briefHistoryOf(h) {
  if (!h) return null;
  const root = h.oldestRoot;
  const start = root.importLikely ? `begins ${root.date} with an import (${Math.round((root.ratio ?? 0) * 100)}% of the files)` : h.youngHistory ? `${h.ageDays} days old, a short window, not an import` : `begins ${root.date}, not an import`;
  const flow = h.workflow ? `; ${h.workflow.strategy === "merge" ? "merge commits" : h.workflow.strategy === "squash" ? "squash merges" : "rebase or direct commits"}` : "";
  return `${start}${root.roots > 1 ? `; ${root.roots} roots` : ""}${flow}`;
}

/**
 * R13 #5: the one short line the brief carries.
 * @param {string | null | undefined} phrase briefHistoryOf
 */
export function historyBriefLine(phrase) {
  if (!phrase) return null;
  return `history: ${phrase}${phrase.includes("with an import") ? "; the table describes work since then" : ""}`;
}

/** G11: the default activity window, in days before the ref's commit date (--active-days). */
const ACTIVE_DAYS_DEFAULT = 365;
/** G11b: a file is orphaned only when no active author holds at least this share of its non-blank lines. */
const ORPHAN_ACTIVE_MIN_SHARE = 0.2;
/** G11b: this many orphaned files are named in the one-line summary. */
const ORPHAN_NAMED = 5;
/** G11b: --orphans lists this many files (the JSON carries the same list). */
const ORPHAN_LISTED = 30;
/** G11c: a file is "known by nobody" when the leavers hold at least this share of it ... */
const WITHOUT_LOST_MIN_SHARE = 0.5;
/** G11c: ... and the best remaining author holds less than this share. */
const WITHOUT_NEXT_MAX_SHARE = 0.1;
/** G11c: a file counts as the leavers' own for the "who inherits" ranking when they hold at least this share of it. */
const WITHOUT_INHERIT_MIN_SHARE = 0.2;
/** G11c: at most this many paths per listing. */
const WITHOUT_SHOWN = 8;
/** G11c: this many heirs are named. */
const WITHOUT_HEIRS = 3;

/**
 * G11: one entry per person (rows with the same folded name are one person, as the owner lists treat them) with the
 * newest commit anywhere in the repository and whether that commit is inside the window. The window is counted back
 * from the ref's own commit date, never from today, so the same repository answers the same way on any day. A commit
 * dated after the ref (clock skew) counts as inside the window.
 * @param {{ author: string, mail: string, lines: number }[]} rows the table's rows (bots already out unless counted)
 * @param {Record<string, string>} lastCommits each row's newest commit date, from readLastCommits
 * @param {string} asOf YYYY-MM-DD
 * @param {number} activeDays
 * @returns {Map<string, { author: string, lines: number, lastCommit: string | null, active: boolean }>}
 */
export function peopleActivity(rows, lastCommits, asOf, activeDays) {
  /** @type {Map<string, { author: string, lines: number, lastCommit: string | null, active: boolean }>} */
  const people = new Map();
  for (const a of rows) {
    if (!(a.lines > 0)) continue;
    const key = foldIdentity(a.author);
    const p = people.get(key) ?? { author: a.author, lines: 0, lastCommit: null, active: false };
    p.lines += a.lines;
    const day = lastCommits[a.mail] ?? null;
    if (day !== null && (p.lastCommit === null || day > p.lastCommit)) p.lastCommit = day;
    people.set(key, p);
  }
  for (const p of people.values()) {
    p.active = p.lastCommit !== null && (Date.parse(asOf) - Date.parse(p.lastCommit)) / 86400000 <= activeDays;
  }
  return people;
}

/**
 * G11a: how many authors are still committing and how much of the code they hold.
 * @param {Map<string, { author: string, lines: number, lastCommit: string | null, active: boolean }>} people
 * @param {string} asOf
 * @param {number} activeDays
 */
export function activityOf(people, asOf, activeDays) {
  const all = [...people.values()];
  const lines = all.reduce((s, p) => s + p.lines, 0);
  if (!all.length || lines <= 0) return null;
  const active = all.filter((p) => p.active);
  const activeLines = active.reduce((s, p) => s + p.lines, 0);
  const idle = all.filter((p) => !p.active).sort((x, y) => y.lines - x.lines || x.author.localeCompare(y.author));
  return {
    asOf,
    activeDays,
    authors: all.length,
    activeAuthors: active.length,
    lines,
    activeLines,
    activeShare: activeLines / lines,
    inactiveShare: (lines - activeLines) / lines,
    largestInactive: idle.slice(0, 5).map((p) => ({ author: p.author, lines: p.lines, lineShare: p.lines / lines, lastCommit: p.lastCommit })),
  };
}

/**
 * The one line under the table, or null when everyone is active (or nobody holds a line).
 * @param {ReturnType<typeof activityOf> | null | undefined} a
 */
export function activityLine(a) {
  if (!a || a.activeAuthors >= a.authors) return null;
  return `as of ${a.asOf}: ${a.activeAuthors} of ${a.authors} author${a.authors === 1 ? "" : "s"} committed in the last ${a.activeDays} days and hold ${pct(a.activeShare)} of the non-blank lines; ${pct(a.inactiveShare)} of the lines belong to people with no commit in that time`;
}

/**
 * The owners of one file with the people folded: two addresses under one name are one person, as in fileOwnersOf.
 * @param {Map<string, { name: string, lines: number, fullName?: string }>} counts
 * @param {boolean} includeBots
 * @param {Map<string, { author: string, mail: string }>} canonicalOf
 * @param {Map<string, string>} nameOf
 */
function foldedOwners(counts, includeBots, canonicalOf, nameOf) {
  const f = ownersOfFile(counts, includeBots, canonicalOf, nameOf);
  /** @type {Map<string, { name: string, lines: number }>} */
  const byPerson = new Map();
  for (const ow of f.owners) {
    const key = foldIdentity(ow.name);
    const p = byPerson.get(key) ?? { name: ow.name, lines: 0 };
    p.lines += ow.lines;
    byPerson.set(key, p);
  }
  const owners = [...byPerson].map(([key, p]) => ({ key, ...p })).sort((x, y) => y.lines - x.lines || x.name.localeCompare(y.name));
  return { lines: f.lines, owners };
}

/**
 * G11b: the orphan rule for one file: its top owner is not active and no active author holds at least 20% of its lines.
 * --orphans and --for-diff both apply it, so the two cannot disagree.
 * @param {{ lines: number, owners: { key: string, lines: number }[] }} f the folded owners of the file, most lines first
 * @param {Map<string, { active: boolean }>} people
 */
function isOrphanFile(f, people) {
  if (f.lines <= 0 || !f.owners.length) return false;
  if (people.get(f.owners[0].key)?.active) return false;
  return !f.owners.some((ow) => people.get(ow.key)?.active && ow.lines / f.lines >= ORPHAN_ACTIVE_MIN_SHARE);
}

/**
 * G11b: files whose top owner is not active and where no active author holds at least 20% of the lines. Lines are
 * the non-blank lines of the run. The idea of an orphan share comes from the same question in other tools; the rule
 * here is this tool's own.
 * @param {Map<string, Map<string, { name: string, lines: number, fullName?: string }>>} perFile
 * @param {boolean} includeBots
 * @param {Map<string, { author: string, mail: string }>} canonicalOf
 * @param {Map<string, string>} nameOf
 * @param {Map<string, { author: string, lines: number, lastCommit: string | null, active: boolean }>} people
 */
export function orphansOf(perFile, includeBots, canonicalOf, nameOf, people) {
  let scopeLines = 0;
  /** @type {{ path: string, owner: string, lines: number, ownerShare: number, ownerLastCommit: string | null }[]} */
  const found = [];
  for (const [path, counts] of perFile) {
    const f = foldedOwners(counts, includeBots, canonicalOf, nameOf);
    if (f.lines <= 0 || !f.owners.length) continue;
    scopeLines += f.lines;
    const top = f.owners[0];
    if (!isOrphanFile(f, people)) continue;
    found.push({ path, owner: top.name, lines: f.lines, ownerShare: top.lines / f.lines, ownerLastCommit: people.get(top.key)?.lastCommit ?? null });
  }
  found.sort((x, y) => y.lines - x.lines || x.path.localeCompare(y.path));
  const lines = found.reduce((s, f) => s + f.lines, 0);
  return {
    scopeLines,
    scopeFiles: perFile.size,
    files: found.length,
    lines,
    lineShare: scopeLines ? lines / scopeLines : 0,
    minActiveShare: ORPHAN_ACTIVE_MIN_SHARE,
    items: found.slice(0, ORPHAN_LISTED),
  };
}

/**
 * The one-line orphan summary of --files and --reviewers.
 * @param {ReturnType<typeof orphansOf> | null | undefined} orphans
 */
export function orphansLine(orphans) {
  if (!orphans) return null;
  const head = `orphaned (top owner inactive, nobody active holds ${Math.round(orphans.minActiveShare * 100)}%+)`;
  if (!orphans.files) return `${head}: none`;
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const named = orphans.items.slice(0, ORPHAN_NAMED).map((f) => `${f.path} (${f.owner}, ${n(f.lines)} lines)`);
  return `${head}: ${n(orphans.files)} file${orphans.files === 1 ? "" : "s"}, ${pct(orphans.lineShare)} of the lines; largest: ${named.join(", ")}`;
}

/**
 * The --orphans listing: up to 30 files with owner, lines and the owner's last commit.
 * @param {ReturnType<typeof orphansOf> | null | undefined} orphans
 * @returns {string[]}
 */
export function orphanListLines(orphans) {
  if (!orphans || !orphans.files) return [];
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const out = [`orphaned files, largest first (${n(Math.min(orphans.files, orphans.items.length))} of ${n(orphans.files)}); "last commit" is the owner's newest commit anywhere in the repository`];
  const pathW = Math.max(4, ...orphans.items.map((f) => displayWidth(f.path)));
  const ownerW = Math.max(5, ...orphans.items.map((f) => displayWidth(f.owner)));
  for (const f of orphans.items) out.push(`${padEndDisplay(f.path, pathW)}  ${padEndDisplay(f.owner, ownerW)}  ${n(f.lines).padStart(7)} lines  last commit ${f.ownerLastCommit ?? "none found"}`);
  if (orphans.files > orphans.items.length) out.push(`… ${n(orphans.files - orphans.items.length)} more`);
  return out;
}

/** @param {string} a @param {string} b the edit distance between two short strings */
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = row;
  }
  return prev[b.length];
}

/**
 * The five authors whose name or address is closest to a query, as `Name <address>`: by edit distance on the folded name
 * and on the address before the "@", with a name that contains the query (or the reverse) counting as distance 0.
 * @param {string} q
 * @param {{ author: string, mail: string }[]} candidates
 */
function closestAuthors(q, candidates) {
  const key = foldIdentity(q);
  return [...new Map(candidates.map((a) => [foldIdentity(a.author), a])).values()]
    .map((a) => {
      const n = foldIdentity(a.author);
      const local = a.mail.split("@")[0].toLowerCase();
      const d = Math.min(editDistance(key, n), editDistance(key, local), n.includes(key) || key.includes(n) ? 0 : Infinity);
      return { a, d };
    })
    .sort((x, y) => x.d - y.d || x.a.author.localeCompare(y.a.author))
    .slice(0, 5)
    .map((x) => `${x.a.author} <${x.a.mail}>`);
}

/**
 * Match author selectors against the table's rows (so .mailmap and --merge-identities have been applied). A selector
 * matches a person by name (folded, as the owner lists fold it) or by address (any address of a merged row); a selector
 * that is not one name or address is also read as a comma-separated list. A selector that matches nobody is an error
 * that names the closest names and the option that was given. --without and --owned-by use this one resolver.
 * @template {{ author: string, mail: string }} T
 * @param {string[]} values
 * @param {T[]} rows the candidates; the caller decides whether authors without a surviving line are in it
 * @param {Map<string, string[]> | null} membersOf
 * @param {string} flag the option name, for the error
 * @param {"live" | "any"} kind what the rows are, for the error: "live" rows hold a surviving line, "any" rows hold a commit or a line
 * @returns {{ query: string, hits: T[] }[]}
 */
export function resolveAuthorSelectors(values, rows, membersOf, flag, kind) {
  const addressesOf = (/** @type {{ mail: string }} */ a) => (membersOf?.get(a.mail) ?? [a.mail]).map((m) => m.toLowerCase());
  const match = (/** @type {string} */ q) => {
    const name = foldIdentity(q);
    const mail = q.trim().toLowerCase();
    return rows.filter((a) => foldIdentity(a.author) === name || addressesOf(a).includes(mail));
  };
  /** @type {{ query: string, hits: T[] }[]} */
  const found = [];
  /** @type {string[]} */
  const missing = [];
  for (const value of values) {
    const whole = match(value);
    const queries = whole.length ? [value] : value.split(",").map((s) => s.trim()).filter(Boolean);
    for (const q of queries) {
      const hit = whole.length ? whole : match(q);
      if (!hit.length) missing.push(q);
      else found.push({ query: q, hits: hit });
    }
  }
  if (missing.length) {
    const has = kind === "live" ? "holds a surviving line" : "has a commit or a surviving line";
    const lines = missing.map((q) => `${flag}: no author named or addressed "${q}" ${has} here. Closest: ${closestAuthors(q, rows).join("; ") || "none"}`);
    const listed = kind === "live" ? "only authors with at least one surviving line are listed" : "only authors with a commit or a surviving line in the scope are listed";
    throw new Error(`${lines.join("\n")}\n(${listed}; names are matched after .mailmap${membersOf ? " and the identity merge" : ""})`);
  }
  return found;
}

/**
 * G11c: turn the --without values into the set of leaving people (see resolveAuthorSelectors). Only authors with a
 * surviving line can leave.
 * @param {string[]} values
 * @param {{ author: string, mail: string, lines: number }[]} rows
 * @param {Map<string, string[]> | null} membersOf
 * @returns {Set<string>} folded names
 */
export function resolveLeavers(values, rows, membersOf) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const { hits } of resolveAuthorSelectors(values, rows.filter((a) => a.lines > 0), membersOf, "--without", "live")) {
    for (const a of hits) out.add(foldIdentity(a.author));
  }
  return out;
}

/**
 * G11c: what the code looks like if the leavers had never written a line. This counts lines, not understanding.
 * @param {Map<string, Map<string, { name: string, lines: number, fullName?: string }>>} perFile
 * @param {boolean} includeBots
 * @param {Map<string, { author: string, mail: string }>} canonicalOf
 * @param {Map<string, string>} nameOf
 * @param {{ author: string, mail: string, lines: number }[]} rows the table's rows
 * @param {Set<string>} leavers folded names, from resolveLeavers
 * @param {number} thresholdPercent the bus factor threshold
 */
export function withoutOf(perFile, includeBots, canonicalOf, nameOf, rows, leavers, thresholdPercent) {
  const live = rows.filter((a) => a.lines > 0);
  const isLeaver = (/** @type {string} */ author) => leavers.has(foldIdentity(author));
  const totalLines = live.reduce((s, a) => s + a.lines, 0);
  const leaverRows = live.filter((a) => isLeaver(a.author));
  const leaverLines = leaverRows.reduce((s, a) => s + a.lines, 0);
  const byLines = (/** @type {typeof live} */ list) => [...list].sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail));
  const before = busFactor(byLines(live), thresholdPercent);
  const after = busFactor(byLines(live.filter((a) => !isLeaver(a.author))), thresholdPercent);
  /** @type {Map<string, { author: string, lines: number, files: number }>} */
  const heirs = new Map();
  /** @type {{ path: string, lines: number, owner: string, leaverShare: number }[]} */
  const topOwned = [];
  /** @type {{ path: string, lines: number, leaverShare: number, nextAuthor: string | null, nextShare: number }[]} */
  const lost = [];
  let files = 0;
  for (const [path, counts] of perFile) {
    const f = foldedOwners(counts, includeBots, canonicalOf, nameOf);
    if (f.lines <= 0 || !f.owners.length) continue;
    files++;
    const gone = f.owners.filter((ow) => leavers.has(ow.key));
    const goneLines = gone.reduce((s, ow) => s + ow.lines, 0);
    if (!goneLines) continue;
    const kept = f.owners.filter((ow) => !leavers.has(ow.key));
    const leaverShare = goneLines / f.lines;
    if (leavers.has(f.owners[0].key)) topOwned.push({ path, lines: f.lines, owner: f.owners[0].name, leaverShare });
    const next = kept[0] ?? null;
    const nextShare = next ? next.lines / f.lines : 0;
    if (leaverShare >= WITHOUT_LOST_MIN_SHARE && nextShare < WITHOUT_NEXT_MAX_SHARE) lost.push({ path, lines: f.lines, leaverShare, nextAuthor: next?.name ?? null, nextShare });
    if (leaverShare >= WITHOUT_INHERIT_MIN_SHARE) {
      for (const ow of kept) {
        const h = heirs.get(ow.key) ?? { author: ow.name, lines: 0, files: 0 };
        h.lines += ow.lines;
        h.files++;
        heirs.set(ow.key, h);
      }
    }
  }
  const bySize = (/** @type {{ path: string, lines: number }} */ x, /** @type {{ path: string, lines: number }} */ y) => y.lines - x.lines || x.path.localeCompare(y.path);
  topOwned.sort(bySize);
  lost.sort(bySize);
  const section = (/** @type {{ path: string, lines: number }[]} */ list) => ({ files: list.length, lines: list.reduce((s, f) => s + f.lines, 0) });
  return {
    leavers: [...new Map(leaverRows.map((a) => [foldIdentity(a.author), a])).values()]
      .map((a) => ({ author: a.author, lines: leaverRows.filter((x) => foldIdentity(x.author) === foldIdentity(a.author)).reduce((s, x) => s + x.lines, 0) }))
      .sort((x, y) => y.lines - x.lines || x.author.localeCompare(y.author)),
    totalLines,
    leaverLines,
    leaverShare: totalLines ? leaverLines / totalLines : 0,
    scopeFiles: files,
    topOwnerFiles: { ...section(topOwned), items: topOwned.slice(0, WITHOUT_SHOWN) },
    unknownFiles: { ...section(lost), minLeaverShare: WITHOUT_LOST_MIN_SHARE, maxNextShare: WITHOUT_NEXT_MAX_SHARE, items: lost.slice(0, WITHOUT_SHOWN) },
    busFactor: { thresholdPercent, before: before?.value ?? null, after: after?.value ?? null },
    heirs: [...heirs.values()].sort((x, y) => y.lines - x.lines || x.author.localeCompare(y.author)).slice(0, WITHOUT_HEIRS),
  };
}

/**
 * The --without view.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderWithout(r) {
  const w = r.without;
  if (!w) throw new Error("renderWithout needs a result from --without");
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const files = (/** @type {{ files: number }} */ s) => `${n(s.files)} file${s.files === 1 ? "" : "s"}`;
  const out = [headerLine(r), ""];
  out.push(`what if ${listNames(w.leavers.map((l) => l.author))} left  (surviving lines on the table's basis, blank lines not counted; a what-if on lines, not on understanding)`);
  out.push(`lines held by the leavers: ${n(w.leaverLines)} of ${n(w.totalLines)} (${pct(w.leaverShare)})`);
  const list = (/** @type {{ path: string, lines: number }[]} */ items, /** @type {number} */ total, /** @type {(f: any) => string} */ fmt) => {
    const named = items.map(fmt).join(", ");
    return `${named}${total > items.length ? `, and ${n(total - items.length)} more` : ""}`;
  };
  const top = w.topOwnerFiles;
  out.push(top.files ? `files whose top owner is a leaver: ${files(top)} of ${n(w.scopeFiles)}, ${n(top.lines)} lines; largest: ${list(top.items, top.files, (f) => `${f.path} (${f.owner}, ${n(f.lines)} lines)`)}` : "files whose top owner is a leaver: none");
  const lost = w.unknownFiles;
  const rule = `leavers together hold ${Math.round(lost.minLeaverShare * 100)}%+ and the best remaining author under ${Math.round(lost.maxNextShare * 100)}%`;
  out.push(lost.files ? `files nobody remaining would know (${rule}): ${files(lost)}, ${n(lost.lines)} lines; largest: ${list(lost.items, lost.files, (f) => `${f.path} (${n(f.lines)} lines, ${pct(f.leaverShare)} by leavers, best remaining ${f.nextAuthor ? `${f.nextAuthor} ${pct(f.nextShare)}` : "none"})`)}` : `files nobody remaining would know (${rule}): none`);
  const bf = w.busFactor;
  out.push(`bus factor (${bf.thresholdPercent}% of the lines): ${bf.before ?? "none"} now, ${bf.after ?? "none"} without them (the second figure is counted on the lines the remaining authors hold)`);
  out.push(w.heirs.length ? `most likely to inherit (lines held in files where the leavers hold ${Math.round(WITHOUT_INHERIT_MIN_SHARE * 100)}%+): ${w.heirs.map((h) => `${h.author} (${n(h.lines)} lines in ${files(h)})`).join(", ")}` : "most likely to inherit: nobody holds lines in those files");
  const notes = scopeNotes(r);
  if (notes.length) out.push("", ...notes);
  out.push("");
  out.push("What this cannot show: who understands the code, review work, or design done in documents.");
  out.push("It removes the leavers' lines from the count; it does not say the remaining authors can maintain what is left.");
  return out.join("\n");
}

/** R13 #1: --for-diff blames at most this many changed files, the ones with the most replaced lines. */
const FOR_DIFF_MAX_FILES = 300;
/** R13 #1: a single owner holding at least this share of a changed file is flagged. */
const FOR_DIFF_SINGLE_OWNER_MIN_SHARE = 0.8;
/** R13 #1: pre-image ranges handed to one blame process. */
const FOR_DIFF_RANGES_PER_BLAME = 100;
/** R13 #1: reviewer rows printed when --top is not given, and file lines printed under the table. */
const FOR_DIFF_REVIEWERS_SHOWN = 5;
const FOR_DIFF_FLAGGED_SHOWN = 10;
/** R13 #1: the flags of a changed file, most serious first. */
const FOR_DIFF_FLAG_ORDER = ["inactiveOwners", "orphaned", "singleOwner", "authorOnly", "newFile", "deleted", "renamed", "notBlamed"];

/**
 * R13 #1: read the value of --for-diff. `A..B` compares A with B, `A...B` compares the merge base of A and B with B,
 * and `A` alone is `A..HEAD`. An empty side is HEAD.
 * @param {string} spec
 * @returns {{ kind: "range" | "mergeBase" | "single", left: string, right: string }}
 */
export function parseDiffRange(spec) {
  const three = spec.indexOf("...");
  if (three >= 0) return { kind: "mergeBase", left: spec.slice(0, three) || "HEAD", right: spec.slice(three + 3) || "HEAD" };
  const two = spec.indexOf("..");
  if (two >= 0) return { kind: "range", left: spec.slice(0, two) || "HEAD", right: spec.slice(two + 2) || "HEAD" };
  return { kind: "single", left: spec, right: "HEAD" };
}

/** @param {string} path a path as a git pathspec that is matched literally, so glob characters in a file name are not special */
const literalPath = (path) => `:(literal)${path}`;

/**
 * R13 #1: the changed files between two commits, with their status and line counts, from `git diff --name-status` and
 * `--numstat` (both with -z and rename detection). A rename has both paths; a binary file has no line counts.
 * @param {string} nameStatus
 * @param {string} numstat
 * @returns {{ status: "A" | "D" | "M" | "R", oldPath: string | null, newPath: string | null, added: number, deleted: number, binary: boolean }[]}
 */
export function parseChangedFiles(nameStatus, numstat) {
  /** @type {Map<string, { added: number, deleted: number, binary: boolean }>} */
  const counts = new Map();
  const nrec = numstat.split("\0");
  for (let i = 0; i < nrec.length; i++) {
    if (!nrec[i]) continue;
    const [a, d, p] = nrec[i].split("\t");
    const binary = a === "-";
    // A rename is "added\tdeleted\t\0old\0new\0": the path field is empty and the two paths follow.
    const target = p === "" ? nrec[i + 2] : p;
    if (p === "") i += 2;
    counts.set(target, { added: binary ? 0 : Number(a), deleted: binary ? 0 : Number(d), binary });
  }
  /** @type {ReturnType<typeof parseChangedFiles>} */
  const out = [];
  const srec = nameStatus.split("\0");
  for (let i = 0; i < srec.length; i++) {
    const code = srec[i];
    if (!code) continue;
    const letter = code[0];
    if (letter === "R" || letter === "C") {
      const oldPath = srec[++i];
      const newPath = srec[++i];
      out.push({ status: "R", oldPath, newPath, ...(counts.get(newPath) ?? { added: 0, deleted: 0, binary: false }) });
    } else {
      const path = srec[++i];
      const c = counts.get(path) ?? { added: 0, deleted: 0, binary: false };
      if (letter === "A") out.push({ status: "A", oldPath: null, newPath: path, ...c });
      else if (letter === "D") out.push({ status: "D", oldPath: path, newPath: null, ...c });
      else out.push({ status: "M", oldPath: path, newPath: path, ...c });
    }
  }
  return out;
}

/**
 * R13 #1: the pre-image ranges a unified diff with no context replaces or deletes. The hunk header `@@ -a,b +c,d @@`
 * touches the pre-image lines a to a+b-1; b = 0 is a pure insertion and touches none; a missing count means 1.
 * @param {string} diff
 * @returns {[number, number][]}
 */
export function touchedRanges(diff) {
  /** @type {[number, number][]} */
  const ranges = [];
  for (const m of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count >= 1) ranges.push([start, start + count - 1]);
  }
  return ranges;
}

/**
 * R13 #1: everything --for-diff needs before the ownership run: the two commits, the changed files, which of them are
 * left out (lockfiles, generated files, vendored code, binary files, and what --include and --exclude remove stays
 * out of every count), and the paths the ownership run at the base commit is narrowed to. The left-out rule is the
 * run's own (dropGenerated), applied to the base commit for files that existed there and to the head commit for new files.
 * @param {Options} o
 */
async function planDiff(o) {
  const spec = o.forDiff ?? "";
  const range = parseDiffRange(spec);
  const resolve = async (/** @type {string} */ rev) => {
    try {
      return (await git(["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], o.cwd)).trim();
    } catch {
      throw new Error(`--for-diff: "${rev}" does not resolve to a commit in ${o.cwd}`);
    }
  };
  const head = await resolve(range.right);
  const left = await resolve(range.left);
  let base = left;
  if (range.kind === "mergeBase") {
    try {
      base = (await git(["merge-base", left, head], o.cwd)).trim();
    } catch {
      throw new Error(`--for-diff: ${range.left} and ${range.right} have no merge base`);
    }
  }
  const label = range.kind === "single" ? `${spec}..HEAD` : spec;
  // The change authors are everyone who committed in the range, after .mailmap. Merge commits are not authors of lines.
  /** @type {{ name: string, mail: string }[]} */
  const authors = [];
  for (const line of (await git(["log", "--no-merges", "--format=%aN%x00%aE", `${base}..${head}`], o.cwd)).split("\n")) {
    if (!line) continue;
    const [name, mail] = line.split("\0");
    if (mail && !authors.some((a) => a.mail === mail.toLowerCase())) authors.push({ name, mail: mail.toLowerCase() });
  }
  const specs = o.paths.length ? ["--", ...o.paths] : [];
  const changed = parseChangedFiles(
    await git(["diff", "--name-status", "-z", "-M", base, head, ...specs], o.cwd),
    await git(["diff", "--numstat", "-z", "-M", base, head, ...specs], o.cwd),
  );
  const includeRe = o.include.map(globToRegExp);
  const excludeRe = o.exclude.map(globToRegExp);
  const includeBare = o.include.map((g) => !g.includes("/"));
  const excludeBare = o.exclude.map((g) => !g.includes("/"));
  const nonRegularBase = await listNonRegularPaths({ ...o, ref: base });
  const nonRegularHead = await listNonRegularPaths({ ...o, ref: head });
  const entries = changed
    .filter((e) => selected(/** @type {string} */ (e.oldPath ?? e.newPath), includeRe, excludeRe, includeBare, excludeBare))
    .map((e) => ({
      ...e,
      /** @type {null | "binary" | "dropped"} */
      leftOut: e.binary ? /** @type {const} */ ("binary") : null,
      notBlamed: Boolean((e.oldPath && nonRegularBase.has(e.oldPath)) || (e.newPath && nonRegularHead.has(e.newPath))),
      skipped: false,
    }));
  const classes = Object.fromEntries(DROP_CLASSES.map((k) => [k, 0]));
  for (const e of entries) if (e.binary) classes.binary++;
  /** Run the run's own left-out rule over some of the entries at one commit; returns the paths it keeps. */
  const keptAt = async (/** @type {string} */ ref, /** @type {string[]} */ paths) => {
    const sc = { ...o, ref, paths: paths.map(literalPath) };
    const listed = await listTextFiles(sc);
    const every = o.keepGenerated ? listed : await listTextFiles({ ...o, ref, paths: [] });
    const { kept, dropped } = await dropGenerated(sc, listed, every);
    const keptSet = new Set(kept.map((f) => f.path));
    for (const k of DROP_CLASSES) classes[k] += dropped.classes[k]?.files ?? 0;
    const seen = new Set(listed.map((f) => f.path));
    // A path git does not list as text at that commit is a file git probes as binary.
    classes.binary += paths.filter((p) => !seen.has(p)).length;
    return keptSet;
  };
  const oldEntries = entries.filter((e) => e.oldPath && !e.leftOut && !e.notBlamed);
  if (oldEntries.length) {
    const kept = await keptAt(base, oldEntries.map((e) => /** @type {string} */ (e.oldPath)));
    for (const e of oldEntries) if (!kept.has(/** @type {string} */ (e.oldPath))) e.leftOut = "dropped";
  }
  const newEntries = entries.filter((e) => !e.oldPath && !e.leftOut && !e.notBlamed);
  if (newEntries.length) {
    const kept = await keptAt(head, newEntries.map((e) => /** @type {string} */ (e.newPath)));
    for (const e of newEntries) if (!kept.has(/** @type {string} */ (e.newPath))) e.leftOut = "dropped";
  }
  // At most FOR_DIFF_MAX_FILES files are blamed: the ones that replace the most lines.
  const blamable = entries.filter((e) => e.oldPath && !e.leftOut && !e.notBlamed).sort((x, y) => y.deleted - x.deleted || /** @type {string} */ (x.oldPath).localeCompare(/** @type {string} */ (y.oldPath)));
  for (const e of blamable.slice(FOR_DIFF_MAX_FILES)) e.skipped = true;
  const scope = blamable.slice(0, FOR_DIFF_MAX_FILES).map((e) => /** @type {string} */ (e.oldPath));
  return {
    range: label,
    kind: range.kind,
    left,
    base,
    head,
    authors,
    entries,
    classes,
    blamedLimit: blamable.length > FOR_DIFF_MAX_FILES ? { blamed: FOR_DIFF_MAX_FILES, of: blamable.length } : null,
    scope,
  };
}

/**
 * R13 #1: a path of the base commit that the narrowed run can use when no changed file has a pre-image, so the run
 * still has one cheap, countable file to read. The first file of the commit that the left-out rule keeps; null when
 * none of the first 200 is kept (the run then reads the whole commit, as it did before).
 * @param {Options} o
 * @param {string} base
 */
async function anyKeptPath(o, base) {
  const sc = { ...o, ref: base, paths: [] };
  const every = await listTextFiles(sc);
  const { kept } = await dropGenerated(sc, every.slice(0, 200), every);
  return kept[0]?.path ?? null;
}

/**
 * R13 #1: who owns the lines a change replaces. For each changed file with a pre-image, the lines in the removed or
 * replaced pre-image ranges are blamed at the base commit with the run's own blame arguments (copy detection,
 * ignore-revs, set-aside commits, re-applied credit) and counted with the run's own conventions (non-blank lines, bots
 * out, .mailmap and the identity merge). Nothing here is a second counting rule.
 * @param {Options} o options with ref = the base commit
 * @param {Awaited<ReturnType<typeof planDiff>>} plan
 * @param {{ perFile: Map<string, Map<string, { name: string, lines: number, fullName?: string }>> }} main
 * @param {{ author: string, mail: string, lines: number }[]} rows
 * @param {Map<string, { author: string, mail: string }>} ownerMerge
 * @param {Map<string, string>} nameOf
 * @param {string[]} mainArgs
 * @param {Set<string>} leaveOut
 * @param {ReturnType<typeof createReapplyCredit> | null} credit
 * @param {Map<string, string[]> | null} membersOf
 */
async function forDiffOf(o, plan, main, rows, ownerMerge, nameOf, mainArgs, leaveOut, credit, membersOf) {
  const postOpts = { ...o, ref: plan.head };
  const asOf = await refDay(postOpts);
  // Activity is counted back from the head commit: the people who committed inside the range are active.
  const lastCommits = await readLastCommits(postOpts, rows, membersOf);
  const people = peopleActivity(rows, lastCommits, asOf, o.activeDays);
  const authorKeys = new Set(plan.authors.map((a) => foldIdentity(ownerMerge.get(a.mail)?.author ?? a.name)));
  const counted = plan.entries.filter((e) => !e.leftOut);
  const blamed = counted.filter((e) => e.oldPath && !e.skipped && !e.notBlamed && main.perFile.has(e.oldPath));
  /** @type {Map<string, { touched: Map<string, { name: string, lines: number, fullName?: string }>, ranges: number }>} */
  const touchedOf = new Map();
  let cursor = 0;
  const worker = async () => {
    while (cursor < blamed.length) {
      const e = blamed[cursor++];
      const oldPath = /** @type {string} */ (e.oldPath);
      /** @type {Map<string, { name: string, lines: number, fullName?: string }>} */
      const touched = new Map();
      let ranges = 0;
      if (e.deleted > 0) {
        const paths = e.status === "R" ? [oldPath, /** @type {string} */ (e.newPath)] : [oldPath];
        const diff = await git(["diff", "-U0", "-M", "--no-color", "--no-ext-diff", plan.base, plan.head, "--", ...paths.map(literalPath)], o.cwd);
        const list = touchedRanges(diff);
        ranges = list.length;
        for (let i = 0; i < list.length; i += FOR_DIFF_RANGES_PER_BLAME) {
          const chunk = list.slice(i, i + FOR_DIFF_RANGES_PER_BLAME);
          let raw = dropBlameLinesOf(await git([...mainArgs, ...chunk.flatMap(([a, b]) => ["-L", `${a},${b}`]), plan.base, "--", oldPath], o.cwd), leaveOut);
          if (credit) raw = await credit.rewrite(raw);
          for (const [mail, c] of countBlameLines(dropBlankBlameLines(raw))) {
            const t = touched.get(mail) ?? { name: c.name, lines: 0, ...(c.fullName !== undefined ? { fullName: c.fullName } : {}) };
            t.lines += c.lines;
            touched.set(mail, t);
          }
        }
      }
      touchedOf.set(oldPath, { touched, ranges });
    }
  };
  await Promise.all(Array.from({ length: Math.min(o.jobs, blamed.length || 1) }, worker));

  /** @type {Map<string, { name: string, touched: number, files: number, mostIn: number, whole: number }>} */
  const reviewers = new Map();
  /** @type {{ path: string, oldPath: string | null, status: string, touchedLines: number, wholeFileLines: number, flags: { code: string, text: string }[] }[]} */
  const fileRows = [];
  let touchedTotal = 0;
  const wholeOf = new Map();
  for (const e of blamed) {
    const oldPath = /** @type {string} */ (e.oldPath);
    const whole = foldedOwners(/** @type {NonNullable<ReturnType<typeof main.perFile.get>>} */ (main.perFile.get(oldPath)), o.includeBots, ownerMerge, nameOf);
    wholeOf.set(oldPath, whole);
    const t = foldedOwners(touchedOf.get(oldPath)?.touched ?? new Map(), o.includeBots, ownerMerge, nameOf);
    touchedTotal += t.lines;
    const others = t.owners.filter((ow) => !authorKeys.has(ow.key));
    for (const ow of others) {
      const r = reviewers.get(ow.key) ?? { name: ow.name, touched: 0, files: 0, mostIn: 0, whole: 0 };
      r.touched += ow.lines;
      r.files++;
      if (ow === others[0]) r.mostIn++;
      reviewers.set(ow.key, r);
    }
  }
  // The whole-file lines a reviewer holds across the changed files that were blamed.
  for (const [key, r] of reviewers) {
    for (const whole of wholeOf.values()) r.whole += whole.owners.find((ow) => ow.key === key)?.lines ?? 0;
  }
  for (const e of counted) {
    /** @type {{ code: string, text: string }[]} */
    const flags = [];
    const oldPath = e.oldPath;
    const whole = oldPath ? wholeOf.get(oldPath) : undefined;
    const t = oldPath ? foldedOwners(touchedOf.get(oldPath)?.touched ?? new Map(), o.includeBots, ownerMerge, nameOf) : null;
    if (whole && t && t.lines > 0 && t.owners.every((ow) => !people.get(ow.key)?.active)) {
      flags.push({ code: "inactiveOwners", text: `all ${t.lines.toLocaleString("en-US")} touched line${t.lines === 1 ? "" : "s"} belong to ${listNames(t.owners.map((ow) => ow.name))} (inactive)` });
    }
    if (whole && isOrphanFile(whole, people)) flags.push({ code: "orphaned", text: `no active author holds ${Math.round(ORPHAN_ACTIVE_MIN_SHARE * 100)}% of the file` });
    if (whole && whole.lines > 0 && whole.owners[0].lines / whole.lines >= FOR_DIFF_SINGLE_OWNER_MIN_SHARE) {
      flags.push({ code: "singleOwner", text: `single owner ${whole.owners[0].name} holds ${pct(whole.owners[0].lines / whole.lines)} of the file` });
    }
    if (t && t.lines > 0 && t.owners.every((ow) => authorKeys.has(ow.key))) flags.push({ code: "authorOnly", text: "touched lines owned by the change author only" });
    if (e.status === "A") flags.push({ code: "newFile", text: "new file" });
    if (e.status === "D") flags.push({ code: "deleted", text: "deleted" });
    if (e.status === "R") flags.push({ code: "renamed", text: `renamed from ${e.oldPath}` });
    if (e.notBlamed) flags.push({ code: "notBlamed", text: "not blamed (submodule or symbolic link)" });
    if (e.skipped) flags.push({ code: "notBlamed", text: `not blamed (beyond the ${FOR_DIFF_MAX_FILES} files with the most replaced lines)` });
    flags.sort((x, y) => FOR_DIFF_FLAG_ORDER.indexOf(x.code) - FOR_DIFF_FLAG_ORDER.indexOf(y.code));
    if (!flags.length) continue;
    fileRows.push({ path: /** @type {string} */ (e.newPath ?? e.oldPath), oldPath: e.status === "R" ? e.oldPath : null, status: e.status, touchedLines: t?.lines ?? 0, wholeFileLines: whole?.lines ?? 0, flags });
  }
  const rank = (/** @type {typeof fileRows[number]} */ f) => {
    const i = FOR_DIFF_FLAG_ORDER.indexOf(f.flags[0].code);
    return i < 0 ? 99 : i;
  };
  fileRows.sort((x, y) => rank(x) - rank(y) || y.touchedLines - x.touchedLines || x.path.localeCompare(y.path));
  // The headline is the worst file by its first risk flag, never an average.
  const worst = fileRows.find((f) => rank(f) <= FOR_DIFF_FLAG_ORDER.indexOf("authorOnly")) ?? null;
  const mailOfKey = (/** @type {string} */ key) => rows.filter((a) => foldIdentity(a.author) === key).map((a) => a.mail).sort()[0] ?? "";
  const reviewerRows = [...reviewers].map(([key, r]) => {
    const p = people.get(key);
    return { author: r.name, mail: mailOfKey(key), touchedLines: r.touched, touchedShare: touchedTotal ? r.touched / touchedTotal : 0, files: r.files, filesMostTouched: r.mostIn, wholeFileLines: r.whole, lastCommit: p?.lastCommit ?? null, active: p?.active ?? false };
  }).sort((x, y) => y.touchedLines - x.touchedLines || y.wholeFileLines - x.wholeFileLines || x.mail.localeCompare(y.mail));
  const sum = (/** @type {(e: typeof counted[number]) => number} */ f) => counted.reduce((s, e) => s + f(e), 0);
  const leftOutFiles = plan.entries.length - counted.length;
  return {
    range: plan.range,
    base: plan.base,
    head: plan.head,
    mergeBase: plan.kind === "mergeBase",
    asOf,
    activeDays: o.activeDays,
    files: counted.length,
    filesBlamed: blamed.length,
    replacedLines: sum((e) => e.deleted),
    addedLines: sum((e) => e.added),
    newFiles: counted.filter((e) => e.status === "A").length,
    deletedFiles: counted.filter((e) => e.status === "D").length,
    renamedFiles: counted.filter((e) => e.status === "R").length,
    leftOut: { files: leftOutFiles, classes: plan.classes },
    notBlamed: counted.filter((e) => e.notBlamed).length,
    blamedLimit: plan.blamedLimit,
    touchedLines: touchedTotal,
    changeAuthors: plan.authors.map((a) => a.name),
    reviewers: reviewerRows,
    flaggedFiles: fileRows,
    worstFile: worst && { path: worst.path, flags: worst.flags.map((f) => f.text) },
  };
}

/**
 * The --for-diff view.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {number} top reviewer rows
 */
export function renderForDiff(r, top) {
  const d = r.forDiff;
  if (!d) throw new Error("renderForDiff needs a result from --for-diff");
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const noun = (/** @type {number} */ x, /** @type {string} */ w) => `${n(x)} ${w}${x === 1 ? "" : "s"}`;
  const out = [];
  if (r.shallow) out.push(SHALLOW_MARK);
  const parts = [noun(d.files, "file"), `${noun(d.replacedLines, "line")} replaced or deleted`, `${noun(d.addedLines, "line")} added`];
  if (d.newFiles) parts.push(`${noun(d.newFiles, "new file")}`);
  if (d.deletedFiles) parts.push(`${noun(d.deletedFiles, "deleted file")}`);
  if (d.renamedFiles) parts.push(`${noun(d.renamedFiles, "renamed file")}`);
  const kinds = DROP_CLASSES.filter((k) => d.leftOut.classes[k]).map((k) => `${n(d.leftOut.classes[k])} ${k}`);
  const left = d.leftOut.files ? `; ${noun(d.leftOut.files, "file")} left out (${kinds.length ? kinds.join(", ") : "lockfile, generated, vendored or binary"}; --keep-generated counts them)` : "";
  if (d.files === 0 && d.leftOut.files === 0) {
    out.push(`change ${d.range}: no changed files`);
    return out.join("\n");
  }
  out.push(`change ${d.range}${d.mergeBase ? " (from the merge base)" : ""}: ${parts.join(", ")}${left}`);
  out.push(`change authors: ${d.changeAuthors.length ? d.changeAuthors.join(", ") : "none (no non-merge commit in the range)"}`);
  if (d.blamedLimit) out.push(`only ${n(d.blamedLimit.blamed)} of ${n(d.blamedLimit.of)} files with a pre-image were blamed: the ones that replace the most lines`);
  if (d.notBlamed) out.push(`${noun(d.notBlamed, "file")} not blamed (submodule or symbolic link)`);
  const rows = d.reviewers.slice(0, top);
  if (!d.reviewers.length) {
    out.push(d.touchedLines ? `suggested reviewers: none, every one of the ${noun(d.touchedLines, "line")} this change replaces belongs to the change authors` : "suggested reviewers: none, this change replaces or deletes no counted line (new files and pure insertions have no earlier owner; --reviewers <path> names who owns the surrounding code)");
  } else {
    out.push(`suggested reviewers (by lines this change replaces, ${noun(d.touchedLines, "non-blank line")}):`);
    const nameCount = new Map();
    for (const a of d.reviewers) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
    const labels = rows.map((a) => rowLabel(a, nameCount));
    const nameW = Math.max(...labels.map((l) => displayWidth(l)));
    rows.forEach((a, i) => {
      out.push(`  ${padEndDisplay(labels[i], nameW)}  ${n(a.touchedLines).padStart(6)} (${pct(a.touchedShare)})  ${noun(a.files, "file")}  ${a.active ? "active" : "inactive"} (last commit anywhere ${a.lastCommit ?? "unknown"})`);
    });
    if (d.reviewers.length > rows.length) out.push(`  … ${d.reviewers.length - rows.length} more`);
  }
  if (d.worstFile) out.push(`worst file: ${d.worstFile.path}: ${d.worstFile.flags.join("; ")}`);
  const shown = d.flaggedFiles.slice(0, FOR_DIFF_FLAGGED_SHOWN);
  if (shown.length) {
    out.push("file flags:");
    for (const f of shown) out.push(`  ${f.path}: ${f.flags.map((x) => x.text).join("; ")}`);
    if (d.flaggedFiles.length > shown.length) out.push(`  … ${d.flaggedFiles.length - shown.length} more`);
  }
  out.push(`as of ${d.asOf} (head commit date; active means a commit in the ${d.activeDays} days before it)`);
  const notes = scopeNotes(r);
  if (notes.length) out.push("", ...notes);
  out.push("", "These are the lines the change replaces or deletes, not who understands the change.");
  return out.join("\n");
}

/** R13 #2: --owned-by lists at most this many files and directories per person (--top changes it). */
const OWNED_BY_SHOWN = 10;

/**
 * R13 #2: every address in the history with its first and last author date (YYYY-MM-DD), after .mailmap, merges left
 * out. The whole history of the ref, whatever --since and --until say.
 * @param {Options} o
 * @returns {Promise<Map<string, { first: string, last: string }>>}
 */
async function readCommitDays(o) {
  /** @type {Map<string, { first: string, last: string }>} */
  const days = new Map();
  for (const line of (await git(["log", "--no-merges", "--format=%aE%x09%aI", o.ref], o.cwd)).split("\n")) {
    if (!line) continue;
    const [mail, date] = line.split("\t");
    if (!date) continue;
    const key = mail.toLowerCase();
    const day = date.slice(0, 10);
    const e = days.get(key);
    if (!e) days.set(key, { first: day, last: day });
    else {
      if (day < e.first) e.first = day;
      if (day > e.last) e.last = day;
    }
  }
  return days;
}

/**
 * R13 #2: what each named person owns, from the blame counts of the run (the counts --files shows): lines on both bases,
 * files, the files they own most of or half or more of, the files nobody else has written, and the same per directory.
 * People are folded by name as in the owner lists; an author who is a bot (not counted) or who has commits but no
 * surviving line is answered as such.
 * @param {Map<string, Map<string, { name: string, lines: number, fullName?: string }>>} perFile
 * @param {Map<string, Map<string, { name: string, lines: number, fullName?: string }>>} perFileRaw the same counts with blank lines
 * @param {boolean} includeBots
 * @param {Map<string, { author: string, mail: string }>} canonicalOf
 * @param {Map<string, string>} nameOf
 * @param {{ author: string, mail: string, lines: number, commits: number }[]} rows the table's rows, including people with commits and no line
 * @param {{ author: string, mail: string, lines: number, commits: number }[]} bots the bot rows left out of the table
 * @param {string[]} selectors the --owned-by values
 * @param {Map<string, string[]> | null} membersOf
 * @param {Map<string, { first: string, last: string }>} days commit dates per address
 * @param {string} asOf
 * @param {number} activeDays
 * @param {number} depth directory depth of the per-directory lines
 * @param {number} shown list length
 */
export function ownedByOf(perFile, perFileRaw, includeBots, canonicalOf, nameOf, rows, bots, selectors, membersOf, days, asOf, activeDays, depth, shown) {
  const candidates = [...rows.map((a) => ({ ...a, bot: false })), ...bots.map((a) => ({ ...a, bot: true }))];
  const picked = resolveAuthorSelectors(selectors, candidates, membersOf, "--owned-by", "any");
  /** @type {Map<string, typeof candidates>} */
  const people = new Map();
  for (const { hits } of picked) {
    for (const h of hits) {
      const key = foldIdentity(h.author);
      if (!people.has(key)) people.set(key, candidates.filter((a) => foldIdentity(a.author) === key));
    }
  }
  /** @type {Map<string, { lines: number, withBlank: number, files: number, top: number, half: number, sole: { path: string, lines: number }[] }>} */
  const stat = new Map([...people.keys()].map((k) => [k, { lines: 0, withBlank: 0, files: 0, top: 0, half: 0, sole: [] }]));
  /** @type {Map<string, Map<string, number>>} */
  const dirs = new Map();
  let scopeLines = 0;
  let scopeFiles = 0;
  for (const [path, counts] of perFile) {
    const f = foldedOwners(counts, includeBots, canonicalOf, nameOf);
    if (f.lines <= 0 || !f.owners.length) continue;
    scopeFiles++;
    scopeLines += f.lines;
    const dir = groupKey(path, { kind: "dir", depth });
    const inDir = dirs.get(dir) ?? new Map();
    dirs.set(dir, inDir);
    for (const ow of f.owners) {
      inDir.set(ow.key, (inDir.get(ow.key) ?? 0) + ow.lines);
      const s = stat.get(ow.key);
      if (!s) continue;
      s.lines += ow.lines;
      s.files++;
      if (f.owners[0].key === ow.key) s.top++;
      if (ow.lines / f.lines >= FILE_OWNED_MIN_SHARE) s.half++;
      if (f.owners.length === 1) s.sole.push({ path, lines: ow.lines });
    }
  }
  let scopeWithBlank = 0;
  for (const counts of perFileRaw.values()) {
    const f = foldedOwners(counts, includeBots, canonicalOf, nameOf);
    scopeWithBlank += f.lines;
    for (const ow of f.owners) {
      const s = stat.get(ow.key);
      if (s) s.withBlank += ow.lines;
    }
  }
  const totalCommits = rows.reduce((s, a) => s + a.commits, 0);
  const spanOf = (/** @type {typeof candidates} */ list) => {
    const mails = list.flatMap((a) => membersOf?.get(a.mail) ?? [a.mail]).map((m) => m.toLowerCase());
    const spans = mails.map((m) => days.get(m)).filter((x) => x !== undefined);
    if (!spans.length) return { first: null, last: null };
    return { first: spans.reduce((b, x) => (x.first < b ? x.first : b), spans[0].first), last: spans.reduce((b, x) => (x.last > b ? x.last : b), spans[0].last) };
  };
  const owned = [...people].map(([key, list]) => {
    const s = /** @type {NonNullable<ReturnType<typeof stat.get>>} */ (stat.get(key));
    const lead = [...list].sort((x, y) => y.lines - x.lines || x.mail.localeCompare(y.mail))[0];
    const isBot = list.every((a) => a.bot);
    const commits = list.reduce((sum, a) => sum + a.commits, 0);
    const span = spanOf(list);
    const status = isBot ? /** @type {const} */ ("bot") : s.lines === 0 ? /** @type {const} */ ("noSurvivingLines") : /** @type {const} */ ("owner");
    const byDirectory = [...dirs]
      .filter(([, m]) => (m.get(key) ?? 0) > 0)
      .map(([dir, m]) => {
        const lines = /** @type {number} */ (m.get(key));
        const dirLines = [...m.values()].reduce((sum, x) => sum + x, 0);
        const rank = 1 + [...m].filter(([k, v]) => k !== key && (v > lines || (v === lines && k.localeCompare(key) < 0))).length;
        return { directory: dir, lines, share: dirLines ? lines / dirLines : 0, rank, topOwner: rank === 1 };
      })
      .sort((x, y) => y.lines - x.lines || x.directory.localeCompare(y.directory));
    const sole = [...s.sole].sort((x, y) => y.lines - x.lines || x.path.localeCompare(y.path));
    return {
      author: lead.author,
      mail: lead.mail,
      addresses: list.length,
      status,
      lines: s.lines,
      linesWithBlank: s.withBlank,
      share: scopeLines ? s.lines / scopeLines : 0,
      shareWithBlank: scopeWithBlank ? s.withBlank / scopeWithBlank : 0,
      files: s.files,
      topOfFiles: s.top,
      halfOrMoreFiles: s.half,
      soleAuthorFiles: { files: sole.length, items: sole.slice(0, shown) },
      byDirectory: { total: byDirectory.length, items: byDirectory.slice(0, shown) },
      commits,
      commitShare: totalCommits ? commits / totalCommits : 0,
      firstCommit: span.first,
      lastCommit: span.last,
      active: span.last !== null && (Date.parse(asOf) - Date.parse(span.last)) / 86400000 <= activeDays,
    };
  });
  return { asOf, activeDays, scopeLines, scopeLinesWithBlank: scopeWithBlank, scopeFiles, directoryDepth: depth, owned };
}

/**
 * The --owned-by view.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderOwnedBy(r) {
  const v = r.ownedBy;
  if (!v) throw new Error("renderOwnedBy needs a result from --owned-by");
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const noun = (/** @type {number} */ x, /** @type {string} */ w) => `${n(x)} ${w}${x === 1 ? "" : "s"}`;
  const ordinal = (/** @type {number} */ k) => (k === 2 ? "2nd" : k === 3 ? "3rd" : `${k}th`);
  const out = [headerLine(r)];
  for (const p of v.owned) {
    const who = `${p.author} <${p.mail}>`;
    out.push("");
    if (p.status === "bot") {
      out.push(`${who} is a bot, not counted; use --include-bots to count it (${noun(p.commits, "commit")}${p.firstCommit ? `, first ${p.firstCommit}, last ${p.lastCommit}` : ""})`);
      continue;
    }
    if (p.status === "noSurvivingLines") {
      out.push(`${who} has ${noun(p.commits, "commit")}${p.firstCommit ? ` (first ${p.firstCommit}, last ${p.lastCommit})` : ""} but none of their lines survive in this scope; --why-not "${p.author}" -- <path> explains one path`);
      continue;
    }
    const blank = p.linesWithBlank !== p.lines ? `; ${n(p.linesWithBlank)} counting blank lines, ${pct(p.shareWithBlank)} of ${n(v.scopeLinesWithBlank)}` : "";
    out.push(`${who} holds ${n(p.lines)} non-blank lines (${pct(p.share)} of ${n(v.scopeLines)}${blank}), in ${n(p.files)} of ${n(v.scopeFiles)} files`);
    out.push(`  top owner of ${noun(p.topOfFiles, "file")}, half or more of ${n(p.halfOrMoreFiles)}, the only author with lines in ${n(p.soleAuthorFiles.files)}`);
    const dirName = (/** @type {string} */ d) => (d === "." ? "./" : `${d}/`);
    const dirs = p.byDirectory.items.map((d) => `${dirName(d.directory)} ${n(d.lines)} (${Math.round(d.share * 100)}% of it${d.rank === 1 ? ", top owner" : d.rank <= 3 ? `, ${ordinal(d.rank)}` : ""})`);
    if (dirs.length) out.push(`  by directory: ${dirs.join(", ")}${p.byDirectory.total > dirs.length ? `, and ${n(p.byDirectory.total - dirs.length)} more` : ""}`);
    if (p.soleAuthorFiles.files) out.push(`  files only ${p.author} has written (${n(p.soleAuthorFiles.files)}): ${p.soleAuthorFiles.items.map((f) => f.path).join(", ")}${p.soleAuthorFiles.files > p.soleAuthorFiles.items.length ? `, and ${n(p.soleAuthorFiles.files - p.soleAuthorFiles.items.length)} more` : ""}`);
    out.push(`  commits ${n(p.commits)} (${pct(p.commitShare)} of the commits counted)`);
    out.push(`  last commit ${p.lastCommit ?? "unknown"}, ${p.active ? "active" : "inactive"} (${v.activeDays}-day window, as of ${v.asOf})`);
  }
  const notes = scopeNotes(r);
  if (notes.length) out.push("", ...notes);
  out.push("", "These are surviving lines, not who understands the code.");
  return out.join("\n");
}

/** R13 #7: --tree shows this many levels of nodes unless a depth is given. */
const TREE_DEPTH_DEFAULT = 2;
/** R13 #7: children printed under one node unless --top is given; the rest is one "... n more" line. */
const TREE_CHILDREN_SHOWN = 25;
/** R13 #7: no tree line is wider than this many terminal columns. */
const TREE_WIDTH = 100;
/** R13 #7: a node whose top owner holds less than this share is marked "no owner above 50%". */
const TREE_NO_OWNER_SHARE = 0.5;

/**
 * @typedef {{ name: string, path: string, dir: boolean, lines: number, botOnly: boolean, owners: Map<string, { name: string, lines: number }>, kids: Map<string, TreeBuild> }} TreeBuild
 * @typedef {{ name: string, path: string, kind: "dir" | "file", owner: string | null, share: number | null, lines: number, active: boolean | null, bot: boolean, children: TreeNode[], more: number, below: boolean }} TreeNode
 */

/**
 * R13 #7: the ownership tree, from the per-file blame counts of the run (the owners of --files: non-blank lines, bots
 * out, people folded by name, .mailmap and --merge-identities applied). A node's owner is the person with the most
 * surviving lines in its subtree (equal lines go by name); its share is their lines over the subtree's lines. A file whose
 * every counted line belongs to a bot has no counted lines: it is listed as a bot file and adds nothing to its directories.
 * `depth` counts levels of nodes below the root (1 = the top level); 0 shows every level. A directory whose only child is a
 * directory is one node with a joined name, and counts as one level. Each node shows its `shown` largest children (by lines);
 * directories come first, then files, each alphabetical.
 * @param {Map<string, Map<string, { name: string, lines: number, fullName?: string }>>} perFile
 * @param {boolean} includeBots
 * @param {Map<string, { author: string, mail: string }>} canonicalOf
 * @param {Map<string, string>} nameOf
 * @param {Map<string, { active: boolean }>} people
 * @param {number} depth
 * @param {number} shown
 * @param {{ asOf: string, activeDays: number }} when
 */
export function treeOf(perFile, includeBots, canonicalOf, nameOf, people, depth, shown, when) {
  /** @type {(name: string, path: string, dir: boolean) => TreeBuild} */
  const make = (name, path, dir) => ({ name, path, dir, lines: 0, botOnly: false, owners: new Map(), kids: new Map() });
  const root = make("", "", true);
  let scopeLines = 0;
  let scopeFiles = 0;
  for (const path of [...perFile.keys()].sort()) {
    const counts = /** @type {NonNullable<ReturnType<typeof perFile.get>>} */ (perFile.get(path));
    const f = foldedOwners(counts, includeBots, canonicalOf, nameOf);
    const botOnly = f.lines <= 0 && foldedOwners(counts, true, canonicalOf, nameOf).lines > 0;
    if (f.lines <= 0 && !botOnly) continue;
    if (f.lines > 0) {
      scopeLines += f.lines;
      scopeFiles++;
    }
    const parts = path.split("/");
    let at = root;
    const walked = [root];
    for (const [i, part] of parts.entries()) {
      const leaf = i === parts.length - 1;
      let next = at.kids.get(part);
      if (!next) {
        next = make(part, parts.slice(0, i + 1).join("/"), !leaf);
        at.kids.set(part, next);
      }
      at = next;
      walked.push(at);
    }
    at.botOnly = botOnly;
    for (const n of walked) {
      n.lines += f.lines;
      for (const ow of f.owners) {
        const e = n.owners.get(ow.key) ?? { name: ow.name, lines: 0 };
        e.lines += ow.lines;
        n.owners.set(ow.key, e);
      }
    }
  }
  /** @param {TreeBuild} n */
  const topOwner = (n) => [...n.owners].map(([key, e]) => ({ key, ...e })).sort((x, y) => y.lines - x.lines || x.name.localeCompare(y.name))[0] ?? null;
  /**
   * @param {TreeBuild} first
   * @param {number} level
   * @returns {TreeNode}
   */
  const shape = (first, level) => {
    let cur = first;
    let name = first.name;
    while (cur.dir && cur.kids.size === 1) {
      const only = /** @type {TreeBuild} */ ([...cur.kids.values()][0]);
      if (!only.dir) break;
      name += `/${only.name}`;
      cur = only;
    }
    const top = topOwner(cur);
    const kids = [...cur.kids.values()];
    const open = cur.dir && (depth === 0 || level < depth);
    const keep = open ? [...kids].sort((x, y) => y.lines - x.lines || x.name.localeCompare(y.name)).slice(0, shown) : [];
    keep.sort((x, y) => Number(y.dir) - Number(x.dir) || x.name.localeCompare(y.name));
    return {
      name: cur.dir ? `${name}/` : name,
      path: cur.path,
      kind: cur.dir ? "dir" : "file",
      owner: top ? top.name : null,
      share: top && cur.lines ? top.lines / cur.lines : null,
      lines: cur.lines,
      active: top ? people.get(top.key)?.active === true : null,
      bot: cur.botOnly || (!top && cur.lines === 0),
      children: keep.map((k) => shape(k, level + 1)),
      more: open ? kids.length - keep.length : 0,
      below: cur.dir && !open && kids.length > 0,
    };
  };
  const rootKids = [...root.kids.values()].sort((x, y) => y.lines - x.lines || x.name.localeCompare(y.name)).slice(0, shown);
  rootKids.sort((x, y) => Number(y.dir) - Number(x.dir) || x.name.localeCompare(y.name));
  return { ...when, depth, childrenShown: shown, scopeLines, scopeFiles, nodes: rootKids.map((k) => shape(k, 1)), more: root.kids.size - rootKids.length };
}

/**
 * The columns a string takes, cut in the middle with an ellipsis when it is wider than `max`.
 * @param {string} s
 * @param {number} max
 */
function cutMiddle(s, max) {
  if (displayWidth(s) <= max) return s;
  const chars = [...s];
  let head = Math.ceil((max - 1) / 2);
  let tail = Math.max(0, max - 1 - head);
  const build = () => `${chars.slice(0, head).join("")}…${tail ? chars.slice(-tail).join("") : ""}`;
  while ((head > 0 || tail > 0) && displayWidth(build()) > max) {
    if (head >= tail && head > 0) head--;
    else tail--;
  }
  return build();
}

/**
 * The --tree view.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderTree(r) {
  const t = r.tree;
  if (!t) throw new Error("renderTree needs a result from --tree");
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  /** @type {{ prefix: string, name: string, note: string }[]} */
  const rows = [];
  let below = false;
  /**
   * @param {TreeNode} node
   * @param {string} prefix
   * @param {string | null} parentOwner
   * @param {number} level
   * @param {{ more: number, last: boolean }} edge
   */
  const walk = (node, prefix, parentOwner, level, edge) => {
    const branch = level === 1 ? "" : edge.last ? "└── " : "├── ";
    let note = "";
    if (node.bot) note = "bot";
    else if (node.kind === "dir" || node.owner !== parentOwner) {
      note = `${node.owner} ${Math.round((node.share ?? 0) * 100)}%`;
      if (level === 1 && node.kind === "dir") note += ` (of ${n(node.lines)})`;
      if ((node.share ?? 0) < TREE_NO_OWNER_SHARE) note += " (no owner above 50%)";
      if (node.active === false) note += " (inactive)";
    }
    rows.push({ prefix: prefix + branch, name: node.name, note });
    if (node.below) below = true;
    const childPrefix = level === 1 ? "" : prefix + (edge.last ? "    " : "│   ");
    node.children.forEach((c, i) => walk(c, childPrefix, node.owner, level + 1, { more: node.more, last: i === node.children.length - 1 && node.more === 0 }));
    if (node.more) rows.push({ prefix: `${childPrefix}└── `, name: `... ${n(node.more)} more`, note: "" });
  };
  t.nodes.forEach((node) => walk(node, "", null, 1, { more: 0, last: true }));
  if (t.more) rows.push({ prefix: "", name: `... ${n(t.more)} more`, note: "" });
  const noteW = Math.max(0, ...rows.map((x) => displayWidth(x.note)));
  // A note follows the name after at least two dots and two spaces, so the name gets the rest of the width.
  const nameBudget = (/** @type {{ prefix: string }} */ x) => Math.max(8, TREE_WIDTH - displayWidth(x.prefix) - (noteW ? noteW + 4 : 0));
  const cutRows = rows.map((x) => ({ ...x, name: cutMiddle(x.name, nameBudget(x)) }));
  const col = Math.max(...cutRows.filter((x) => x.note).map((x) => displayWidth(x.prefix) + displayWidth(x.name)), 0);
  const body = cutRows.map((x) => {
    if (!x.note) return x.prefix + x.name;
    const left = x.prefix + x.name;
    return `${left} ${".".repeat(col - displayWidth(left) + 1)} ${x.note}`;
  });
  const out = [headerLine(r), `ownership tree, ${t.depth === 0 ? "every level" : `${t.depth} level${t.depth === 1 ? "" : "s"}`}: owner = most surviving non-blank lines in the subtree, share = their part of it; inactive = no commit in the ${t.activeDays} days before ${t.asOf}`, "", ...(body.length ? body : ["no file with a counted line in this scope"])];
  if (below) out.push("", `directories below level ${t.depth} are counted in their parent; --tree <n> shows more levels, --tree 0 all`);
  const notes = scopeNotes(r);
  if (notes.length) out.push("", ...notes);
  out.push("", "These are surviving lines, not who understands the code.");
  return out.join("\n");
}

/** R13 #8, #9: the default window is this many months back from the ref's commit date. */
const CHANGE_WINDOW_MONTHS = 12;
/** R13 #8: a file needs this many commits in the window to be considered (--min-commits). */
const ATTENTION_MIN_COMMITS = 3;
/** R13 #8: files listed unless --top is given. */
const ATTENTION_SHOWN = 10;
/** R13 #8: at most this many files, the ones with the most commits, are assessed; the note says so when there are more. */
const ATTENTION_ASSESSED_MAX = 200;
/** R13 #8: a file is coupled when some partner changes with it at this degree or more. */
const ATTENTION_COUPLED_MIN_DEGREE = 0.5;
/** R13 #8: the weight of each reason; the score of a file is the sum of its reasons. */
const ATTENTION_WEIGHTS = { orphaned: 3, singleOwner: 1, coupled: 1 };
/** R13 #8, #9: a partner needs this many shared commits (--min-shared). */
const COUPLING_MIN_SHARED = 3;
/** R13 #8, #9: a commit that touches more files than this says nothing about coupling and is skipped (--max-files-per-commit). */
const COUPLING_MAX_FILES = 30;

/**
 * R13 #8, #9: the first day of the change window. `--since` is used as given; without it the window starts 12 months before
 * the ref's commit date (never today). `youngerThanWindow` is true when the history starts inside the window, so the whole
 * history is used. It is null when --since is not a date that can be read.
 * @param {string | undefined} since
 * @param {string} asOf YYYY-MM-DD
 * @param {string | null} firstCommit YYYY-MM-DD, the oldest commit of the ref
 * @returns {{ since: string, label: string, start: string | null, youngerThanWindow: boolean | null }}
 */
export function changeWindowOf(since, asOf, firstCommit) {
  let start = null;
  if (since === undefined) {
    const d = new Date(`${asOf}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - CHANGE_WINDOW_MONTHS);
    start = d.toISOString().slice(0, 10);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(since.trim())) {
    start = since.trim();
  }
  return {
    since: since ?? start ?? "",
    label: since === undefined ? `${CHANGE_WINDOW_MONTHS} months` : `since ${since}`,
    start,
    youngerThanWindow: start === null || firstCommit === null ? null : firstCommit >= start,
  };
}

/**
 * R13 #8, #9: the files each commit changed, with renames followed. `log` is the output of
 * `git log --no-merges --topo-order --name-status -M --format=%x01%H%x1f%aE%x1f%aN`, newest first. Commits are replayed from
 * the newest: a rename in one commit makes the old name stand for the current file in every older commit, and an add ends
 * the history of that name (an older file of the same name is another file). Only paths in `present` (the files of the run:
 * they exist at the ref and passed the drops) are kept. Commits in `skip` (set aside as reformats or rewrites, or ignored by
 * the user) and bot commits (unless `includeBots`) change nothing here, but their renames are still replayed.
 * `touched` is the number of paths the commit changed, whether or not they are kept.
 * @param {string} log
 * @param {Set<string>} present
 * @param {Set<string>} skip full commit ids
 * @param {boolean} includeBots
 * @returns {{ sha: string, touched: number, files: string[] }[]}
 */
export function changeSetsOf(log, present, skip, includeBots) {
  /** @type {Map<string, string | null>} */
  const current = new Map();
  /** @param {string} name */
  const resolve = (name) => (current.has(name) ? /** @type {string | null} */ (current.get(name)) : name);
  /** @type {{ sha: string, touched: number, files: string[] }[]} */
  const out = [];
  for (const chunk of log.split("\x01")) {
    if (!chunk) continue;
    const eol = chunk.indexOf("\n");
    const [sha, mail, name] = (eol < 0 ? chunk : chunk.slice(0, eol)).split("\x1f");
    if (!sha) continue;
    /** @type {Set<string>} */
    const files = new Set();
    let touched = 0;
    for (const line of eol < 0 ? [] : chunk.slice(eol + 1).split("\n")) {
      if (!line) continue;
      const parts = line.split("\t");
      const status = parts[0][0];
      touched++;
      if (status === "R" || status === "C") {
        const from = unquoteGitPath(parts[1]);
        const to = unquoteGitPath(parts[2]);
        const now = resolve(to);
        if (now !== null) files.add(now);
        current.set(to, null);
        if (status === "R") current.set(from, now);
      } else {
        const path = unquoteGitPath(parts[1]);
        const now = resolve(path);
        if (now !== null) files.add(now);
        if (status === "A") current.set(path, null);
      }
    }
    if (skip.has(sha) || (!includeBots && isBotIdentity(name ?? "", (mail ?? "").toLowerCase()))) continue;
    out.push({ sha, touched, files: [...files].filter((f) => present.has(f)) });
  }
  return out;
}

/**
 * R13 #8, #9: the commits per file and the coupling between files. A commit counts for a file when it changed it (through
 * renames). Coupling uses only commits that touched at most `maxFiles` paths: a larger one is skipped, since a sweeping change
 * couples everything it touched. For two files, `shared` is the commits that touched both, and
 * degree = shared / min(commits of the one, commits of the other), both counted over the commits that are not skipped;
 * jaccard = shared / (commits of the one + commits of the other - shared). Partners need `minShared` shared commits.
 * @param {{ sha: string, touched: number, files: string[] }[]} sets
 * @param {number} minShared
 * @param {number} maxFiles
 */
export function changeIndexOf(sets, minShared, maxFiles) {
  /** @type {Map<string, number>} */
  const commits = new Map();
  /** @type {Map<string, number>} */
  const skipped = new Map();
  /** @type {Map<string, number>} */
  const revisions = new Map();
  /** @type {Map<string, string[][]>} */
  const byFile = new Map();
  let skippedTotal = 0;
  for (const c of sets) {
    const bulk = c.touched > maxFiles;
    if (bulk) skippedTotal++;
    for (const f of c.files) {
      commits.set(f, (commits.get(f) ?? 0) + 1);
      if (bulk) {
        skipped.set(f, (skipped.get(f) ?? 0) + 1);
        continue;
      }
      revisions.set(f, (revisions.get(f) ?? 0) + 1);
      const list = byFile.get(f) ?? [];
      list.push(c.files);
      byFile.set(f, list);
    }
  }
  /**
   * The partners of one file, best first: degree, then shared commits, then jaccard, then path.
   * @param {string} target
   * @returns {{ path: string, shared: number, degree: number, jaccard: number, share: number, commits: number }[]}
   */
  const partners = (target) => {
    /** @type {Map<string, number>} */
    const shared = new Map();
    for (const files of byFile.get(target) ?? []) for (const g of files) if (g !== target) shared.set(g, (shared.get(g) ?? 0) + 1);
    const ra = revisions.get(target) ?? 0;
    return [...shared]
      .filter(([, n]) => n >= minShared)
      .map(([path, n]) => {
        const rb = revisions.get(path) ?? 0;
        return { path, shared: n, degree: n / Math.min(ra, rb), jaccard: n / (ra + rb - n), share: n / ra, commits: commits.get(path) ?? 0 };
      })
      .sort((x, y) => y.degree - x.degree || y.shared - x.shared || y.jaccard - x.jaccard || x.path.localeCompare(y.path));
  };
  return { commits, skipped, revisions, skippedTotal, partners };
}

/**
 * R13 #8: the attention list. Files with at least `minCommits` commits in the window (renames followed, set-aside and bot
 * commits out) are given reasons, each with the number that caused it: orphaned (the --orphans rule, weight 3), single
 * owner (the top owner holds 80% or more of the file, weight 1) and coupled (a partner changes with it at degree 0.5 or
 * more, weight 1). The score is the sum of the weights; files with score 0 are left out; files are ranked by score, then
 * commits, then path. Only the 200 files with the most commits are assessed; the result says so.
 * @param {{
 *   sets: { sha: string, touched: number, files: string[] }[],
 *   perFile: Map<string, Map<string, { name: string, lines: number, fullName?: string }>>,
 *   includeBots: boolean, canonicalOf: Map<string, { author: string, mail: string }>, nameOf: Map<string, string>,
 *   people: Map<string, { author: string, lines: number, lastCommit: string | null, active: boolean }>,
 *   minCommits: number, minShared: number, maxFiles: number, shown: number,
 * }} a
 */
export function attentionOf(a) {
  const index = changeIndexOf(a.sets, a.minShared, a.maxFiles);
  const considered = [...index.commits].filter(([, n]) => n >= a.minCommits).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  const assessed = considered.slice(0, ATTENTION_ASSESSED_MAX);
  /** @type {{ file: string, commits: number, score: number, reasons: ({ kind: "orphaned", weight: number, owner: string, share: number, lastCommit: string | null } | { kind: "singleOwner", weight: number, owner: string, share: number } | { kind: "coupled", weight: number, partner: string, degree: number, shared: number })[] }[]} */
  const items = [];
  for (const [file, commits] of assessed) {
    /** @type {(typeof items)[number]["reasons"]} */
    const reasons = [];
    const counts = a.perFile.get(file);
    const f = counts ? foldedOwners(counts, a.includeBots, a.canonicalOf, a.nameOf) : null;
    if (f && f.lines > 0 && f.owners.length) {
      const top = f.owners[0];
      if (isOrphanFile(f, a.people)) reasons.push({ kind: "orphaned", weight: ATTENTION_WEIGHTS.orphaned, owner: top.name, share: top.lines / f.lines, lastCommit: a.people.get(top.key)?.lastCommit ?? null });
      if (top.lines / f.lines >= FOR_DIFF_SINGLE_OWNER_MIN_SHARE) reasons.push({ kind: "singleOwner", weight: ATTENTION_WEIGHTS.singleOwner, owner: top.name, share: top.lines / f.lines });
    }
    const best = index.partners(file)[0];
    if (best && best.degree >= ATTENTION_COUPLED_MIN_DEGREE) reasons.push({ kind: "coupled", weight: ATTENTION_WEIGHTS.coupled, partner: best.path, degree: best.degree, shared: best.shared });
    const score = reasons.reduce((s, r) => s + r.weight, 0);
    if (score > 0) items.push({ file, commits, score, reasons });
  }
  items.sort((x, y) => y.score - x.score || y.commits - x.commits || x.file.localeCompare(y.file));
  return {
    minCommits: a.minCommits,
    minShared: a.minShared,
    maxFilesPerCommit: a.maxFiles,
    commitsRead: a.sets.length,
    filesConsidered: considered.length,
    filesAssessed: assessed.length,
    total: items.length,
    items: items.slice(0, a.shown),
    more: Math.max(0, items.length - a.shown),
  };
}

/**
 * The --attention view.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderAttention(r) {
  const v = r.attention;
  if (!v) throw new Error("renderAttention needs a result from --attention");
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const out = [headerLine(r), `attention (${v.window.label}, files with at least ${v.minCommits} commits):`];
  for (const [i, it] of v.items.entries()) {
    const parts = it.reasons.map((x) => {
      if (x.kind === "orphaned") return `orphaned (${x.owner}, last commit ${x.lastCommit ?? "unknown"}, holds ${Math.round(x.share * 100)}%)`;
      if (x.kind === "singleOwner") return `single owner (${x.owner} ${Math.round(x.share * 100)}%)`;
      return `changes with ${x.partner} (degree ${x.degree.toFixed(2)})`;
    });
    out.push(`${i + 1}. ${it.file}: ${n(it.commits)} commit${it.commits === 1 ? "" : "s"}; ${parts.join("; ")}`);
  }
  if (v.more) out.push(`... ${n(v.more)} more`);
  if (!v.total) out.push(v.filesConsidered ? `none: no file with at least ${v.minCommits} commits in the window is orphaned, single-owner or coupled` : `none: no file has at least ${v.minCommits} commits in the window`);
  out.push("");
  if (v.window.youngerThanWindow) out.push(`The history starts ${v.window.firstCommit}, inside the window, so all of it is used.`);
  if (v.filesConsidered > v.filesAssessed) out.push(`${n(v.filesConsidered)} files have at least ${v.minCommits} commits; the ${n(v.filesAssessed)} with the most commits were assessed.`);
  out.push(`Window: commits from ${v.window.start ?? v.window.label} to the ref${r.commitWindow.until ? ` (until ${r.commitWindow.until})` : ""}, merges, bots and set-aside commits left out, renames followed (${n(v.commitsRead)} commits read). Coupling: files that change together in at least ${v.minShared} commits, commits touching more than ${v.maxFilesPerCommit} files skipped.`);
  const notes = scopeNotes(r);
  if (notes.length) out.push("", ...notes);
  out.push("", "These are surviving lines and commit counts, not defects or who understands the code.");
  return out.join("\n");
}

/** R13 #9: a file needs this many commits in the window before coupling is reported for it. */
const COUPLED_MIN_COMMITS = 3;
/** R13 #9: partners listed unless --top is given, how many of them get a top owner, and how many reviewers are named. */
const COUPLED_SHOWN = 10;
const COUPLED_OWNERS_SHOWN = 5;
const COUPLED_REVIEWERS_SHOWN = 3;

/**
 * R13 #9: the files that change together with one file. Partners come from changeIndexOf (degree, jaccard, share of the
 * target's commits); the five best get their top owner, and the reviewers are the people with the most lines across the
 * target and those five files, with the owners, the active mark and the lines of the run's own blame counts.
 * @param {{
 *   path: string, index: ReturnType<typeof changeIndexOf>,
 *   perFile: Map<string, Map<string, { name: string, lines: number, fullName?: string }>>,
 *   includeBots: boolean, canonicalOf: Map<string, { author: string, mail: string }>, nameOf: Map<string, string>,
 *   people: Map<string, { author: string, lines: number, lastCommit: string | null, active: boolean }>, shown: number,
 * }} a
 */
export function coupledOf(a) {
  const commits = a.index.commits.get(a.path) ?? 0;
  const enough = commits >= COUPLED_MIN_COMMITS;
  const all = enough ? a.index.partners(a.path) : [];
  const ownerOf = (/** @type {string} */ path) => {
    const counts = a.perFile.get(path);
    const f = counts ? foldedOwners(counts, a.includeBots, a.canonicalOf, a.nameOf) : null;
    return f && f.lines > 0 && f.owners.length ? { f, top: f.owners[0] } : null;
  };
  const partners = all.slice(0, a.shown).map((p, i) => {
    const o = i < COUPLED_OWNERS_SHOWN ? ownerOf(p.path) : null;
    return { ...p, topOwner: o ? { author: o.top.name, share: o.top.lines / o.f.lines, lines: o.top.lines, active: a.people.get(o.top.key)?.active === true } : null };
  });
  /** @type {Map<string, { author: string, lines: number }>} */
  const held = new Map();
  for (const path of [a.path, ...all.slice(0, COUPLED_OWNERS_SHOWN).map((p) => p.path)]) {
    const o = ownerOf(path);
    for (const ow of o?.f.owners ?? []) {
      const e = held.get(ow.key) ?? { author: ow.name, lines: 0 };
      e.lines += ow.lines;
      held.set(ow.key, e);
    }
  }
  const reviewers = [...held].map(([key, e]) => ({ author: e.author, lines: e.lines, active: a.people.get(key)?.active === true })).sort((x, y) => y.lines - x.lines || x.author.localeCompare(y.author)).slice(0, COUPLED_REVIEWERS_SHOWN);
  const own = ownerOf(a.path);
  return {
    path: a.path,
    commits,
    revisions: a.index.revisions.get(a.path) ?? 0,
    skippedCommits: a.index.skipped.get(a.path) ?? 0,
    enough,
    owner: own ? { author: own.top.name, share: own.top.lines / own.f.lines, active: a.people.get(own.top.key)?.active === true } : null,
    partnersTotal: all.length,
    partners,
    more: Math.max(0, all.length - partners.length),
    reviewers,
  };
}

/**
 * The --coupled view.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderCoupled(r) {
  const v = r.coupled;
  if (!v) throw new Error("renderCoupled needs a result from --coupled");
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const since = v.window.since;
  const out = [headerLine(r)];
  if (!v.enough) {
    out.push(`${v.path}: ${n(v.commits)} commit${v.commits === 1 ? "" : "s"} since ${since}; not enough history for coupling (at least ${COUPLED_MIN_COMMITS} commits: a file added together with others looks coupled to all of them)`);
  } else if (!v.partners.length) {
    out.push(`${v.path}: ${n(v.commits)} commits since ${since}; no other file shares at least ${v.minShared} of them (commits touching more than ${v.maxFilesPerCommit} files are skipped)`);
  } else {
    out.push(`${v.path}: ${n(v.commits)} commits since ${since}; changes together with:`);
    const pathW = Math.max(...v.partners.map((p) => displayWidth(p.path)));
    for (const p of v.partners) {
      const owner = p.topOwner ? `  top owner ${p.topOwner.author} ${Math.round(p.topOwner.share * 100)}% (${p.topOwner.active ? "active" : "inactive"})` : "";
      out.push(`  ${padEndDisplay(p.path, pathW)}  ${String(p.shared).padStart(3)} shared  degree ${p.degree.toFixed(2)}  jaccard ${p.jaccard.toFixed(2)}${owner}`);
    }
    if (v.more) out.push(`  ... ${n(v.more)} more`);
  }
  if (v.skippedCommits) out.push(`commits skipped for touching more than ${v.maxFilesPerCommit} files: ${n(v.skippedCommits)}`);
  if (v.partners.length) out.push(`reviewers across these files: ${v.reviewers.map((p) => `${p.author} ${n(p.lines)} lines (${p.active ? "active" : "inactive"})`).join(", ")}`);
  out.push("");
  if (v.window.youngerThanWindow) out.push(`The history starts ${v.window.firstCommit}, inside the window, so all of it is used.`);
  out.push(`degree = commits that touched both files / the smaller commit count of the two (code-maat divides by the average and prints a percent, so its numbers differ); jaccard = those commits / commits that touched either; at least ${v.minShared} shared commits are needed. Merges, bots and set-aside commits are left out and renames are followed.`);
  const notes = scopeNotes(r);
  if (notes.length) out.push("", ...notes);
  out.push("", "These are commit counts and surviving lines, not who understands the code.");
  return out.join("\n");
}

/**
 * R13 #10, #12: the files each commit changed, with their line counts, renames followed. `log` is the output of
 * `git log --no-merges --topo-order --raw --numstat -M --format=%x01%H%x1f%aE%x1f%aN%x1f%at%x1f%as`, newest first. The
 * raw lines give the status and the paths and the numstat lines give the counts; both list the files in the same order.
 * The replay is the one of changeSetsOf: a rename makes the old name stand for the current file in older commits, and an
 * add ends the history of a name. Only paths in `present` are kept. Commits in `skip` and bot commits (unless
 * `includeBots`) change nothing here, but their renames are still replayed. Binary files count 0 lines.
 * @param {string} log
 * @param {Set<string>} present
 * @param {Set<string>} skip full commit ids
 * @param {boolean} includeBots
 * @returns {{ sha: string, mail: string, name: string, time: number, day: string, files: { path: string, add: number, del: number }[] }[]}
 */
export function fileChangesOf(log, present, skip, includeBots) {
  /** @type {Map<string, string | null>} */
  const current = new Map();
  /** @param {string} name */
  const resolve = (name) => (current.has(name) ? /** @type {string | null} */ (current.get(name)) : name);
  /** @type {ReturnType<typeof fileChangesOf>} */
  const out = [];
  for (const chunk of log.split("\x01")) {
    if (!chunk) continue;
    const eol = chunk.indexOf("\n");
    const [sha, mail, name, at, day] = (eol < 0 ? chunk : chunk.slice(0, eol)).split("\x1f");
    if (!sha) continue;
    /** @type {string[][]} */
    const raw = [];
    /** @type {string[][]} */
    const stat = [];
    for (const line of eol < 0 ? [] : chunk.slice(eol + 1).split("\n")) {
      if (line.startsWith(":")) raw.push(line.split("\t"));
      else if (/^(\d+|-)\t(\d+|-)\t/.test(line)) stat.push(line.split("\t"));
    }
    /** @type {Map<string, { path: string, add: number, del: number }>} */
    const files = new Map();
    raw.forEach((parts, i) => {
      const status = parts[0].slice(parts[0].lastIndexOf(" ") + 1)[0];
      const add = stat[i] && stat[i][0] !== "-" ? Number(stat[i][0]) : 0;
      const del = stat[i] && stat[i][1] !== "-" ? Number(stat[i][1]) : 0;
      /** @param {string} now */
      const note = (now) => {
        const e = files.get(now) ?? { path: now, add: 0, del: 0 };
        e.add += add;
        e.del += del;
        files.set(now, e);
      };
      if (status === "R" || status === "C") {
        const from = unquoteGitPath(parts[1]);
        const to = unquoteGitPath(parts[2]);
        const now = resolve(to);
        if (now !== null) note(now);
        current.set(to, null);
        if (status === "R") current.set(from, now);
      } else {
        const path = unquoteGitPath(parts[1]);
        const now = resolve(path);
        if (now !== null) note(now);
        if (status === "A") current.set(path, null);
      }
    });
    const lower = (mail ?? "").toLowerCase();
    if (skip.has(sha) || (!includeBots && isBotIdentity(name ?? "", lower))) continue;
    out.push({ sha, mail: lower, name: name ?? "", time: Number(at), day: day ?? "", files: [...files.values()].filter((f) => present.has(f.path)) });
  }
  return out;
}

/** R13 #10: the log both passes of --written-since and --timeline read. */
const FILE_CHANGES_ARGS = ["log", "--no-merges", "--topo-order", "--raw", "--numstat", "-M", "--format=%x01%H%x1f%aE%x1f%aN%x1f%at%x1f%as"];

/**
 * R13 #10: ownership of recent code. For each person: the surviving lines whose author time is in the window (`written`,
 * from the blame the run already did), the lines they inserted in the same window (`inserted`, numstat of the same files,
 * same drops, bots and set-aside commits out) and `kept` = written / inserted, null when nothing was inserted. `kept` is not
 * capped here; `checkFilters` is true when it is above 1, which means the numstat was filtered more than the blame. With
 * `churn` each person also gets all-time inserted and deleted lines and the share of the inserted lines that survive.
 * A person who inserted lines in the window and holds none now still gets a row, with 0 written.
 * @param {{
 *   rows: { author: string, mail: string, lines: number }[], written: Map<string, number>, attributed: number,
 *   changes: ReturnType<typeof fileChangesOf>, from: number, to: number | null, canonicalOf: Map<string, { author: string, mail: string }>,
 *   nameOf: Map<string, string>, churn: boolean,
 * }} a
 */
export function writtenSinceOf(a) {
  /** @param {string} mail */
  const keyOf = (mail) => a.canonicalOf.get(mail)?.mail ?? mail;
  /** @type {Map<string, { author: string, mail: string, lines: number, written: number, inserted: number, insertedAll: number, deletedAll: number }>} */
  const people = new Map();
  for (const r of a.rows) people.set(keyOf(r.mail), { author: r.author, mail: keyOf(r.mail), lines: r.lines, written: 0, inserted: 0, insertedAll: 0, deletedAll: 0 });
  for (const [mail, n] of a.written) {
    const p = people.get(keyOf(mail));
    if (p) p.written += n;
  }
  for (const c of a.changes) {
    const key = keyOf(c.mail);
    let p = people.get(key);
    if (!p) {
      p = { author: a.canonicalOf.get(c.mail)?.author ?? a.nameOf.get(c.mail) ?? c.name, mail: key, lines: 0, written: 0, inserted: 0, insertedAll: 0, deletedAll: 0 };
      people.set(key, p);
    }
    const inWindow = c.time >= a.from && (a.to === null || c.time < a.to);
    for (const f of c.files) {
      p.insertedAll += f.add;
      p.deletedAll += f.del;
      if (inWindow) p.inserted += f.add;
    }
  }
  const authors = [...people.values()]
    .filter((p) => p.written > 0 || p.inserted > 0)
    .sort((x, y) => y.written - x.written || y.inserted - x.inserted || x.mail.localeCompare(y.mail))
    .map((p) => {
      const kept = p.inserted > 0 ? p.written / p.inserted : null;
      return {
        author: p.author,
        mail: p.mail,
        lines: p.lines,
        written: p.written,
        inserted: p.inserted,
        kept,
        checkFilters: kept !== null && kept > 1,
        churn: a.churn ? { inserted: p.insertedAll, deleted: p.deletedAll, survival: p.insertedAll > 0 ? p.lines / p.insertedAll : null } : null,
      };
    });
  const lines = [...people.values()].reduce((sum, p) => sum + p.written, 0);
  return { lines, linesTotal: a.attributed, share: a.attributed ? lines / a.attributed : 0, insertedTotal: authors.reduce((sum, p) => sum + p.inserted, 0), authors };
}

/**
 * The --written-since view.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderWrittenSince(r) {
  const v = r.writtenSince;
  if (!v) throw new Error("renderWrittenSince needs a result from --written-since");
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
  const out = [headerLine(r), `lines last changed between ${v.since} and ${v.until}: ${n(v.lines)} of ${n(v.linesTotal)} (${pct(v.share)})`];
  if (!v.authors.length) {
    out.push(v.beforeHistory ? `no rows: the history starts ${v.firstCommit}, after this window` : "no rows: no surviving line was written and no line was inserted in this window");
  } else {
    const nameW = Math.max(6, ...v.authors.map((p) => displayWidth(p.author)));
    const head = [padEndDisplay("author", nameW), "lines".padStart(8), "written-since".padStart(13), "inserted".padStart(9), "kept".padStart(7)];
    if (v.churn) head.push("all inserted".padStart(12), "all deleted".padStart(11), "survival".padStart(9));
    out.push("", head.join("  "));
    for (const p of v.authors) {
      const kept = p.kept === null ? "-" : p.checkFilters ? "100%*" : pct(p.kept);
      const cols = [padEndDisplay(p.author, nameW), n(p.lines).padStart(8), n(p.written).padStart(13), (p.inserted ? n(p.inserted) : "-").padStart(9), kept.padStart(7)];
      if (v.churn) cols.push(n(p.churn?.inserted ?? 0).padStart(12), n(p.churn?.deleted ?? 0).padStart(11), (p.churn?.survival == null ? "-" : pct(p.churn.survival)).padStart(9));
      out.push(cols.join("  "));
    }
    if (v.authors.some((p) => p.checkFilters)) out.push("", "* kept would be above 100%: check filters (the line counts were filtered differently from the blame)");
  }
  out.push("", `written-since = surviving lines whose author date is at or after ${v.since} and before ${v.until} (UTC; the author date, not the committer date that git --since reads). inserted = lines added in that window by \`git log --numstat -M\` over the same files (files no longer in the tree are not counted), without bots and set-aside commits. kept = written-since / inserted.`);
  const notes = scopeNotes(r);
  if (notes.length) out.push("", ...notes);
  out.push("", "These are surviving lines and inserted lines, not who understands the code.");
  return out.join("\n");
}

/** R13 #12: a handover needs the new winner to hold at least this share of its bucket. */
const TIMELINE_HANDOVER_SHARE = 0.5;

/**
 * R13 #12: the bucket size for a span of days: yearly above 5 years, monthly above 60 days, else daily (git-who's rule).
 * @param {number} spanDays
 * @returns {"yearly" | "monthly" | "daily"}
 */
export function timelineResolution(spanDays) {
  return spanDays > 5 * 365 ? "yearly" : spanDays > 60 ? "monthly" : "daily";
}

/**
 * R13 #12: ownership over time from the commits. Each commit goes in the bucket of its author date (as the author's zone
 * wrote it); the bucket's winner is the person with the most commits (or lines added plus removed), ties to the name that
 * sorts first. Empty buckets between the first and the last are listed with no winner. A handover is a change of winner
 * between consecutive non-empty buckets when the new winner holds at least half of its bucket.
 * @param {{
 *   changes: ReturnType<typeof fileChangesOf>, by: "commits" | "lines", canonicalOf: Map<string, { author: string, mail: string }>,
 *   nameOf: Map<string, string>,
 * }} a
 */
export function timelineOf(a) {
  /** @param {string} mail */
  const keyOf = (mail) => a.canonicalOf.get(mail)?.mail ?? mail;
  /** @type {{ day: string, key: string, name: string, weight: number }[]} */
  const items = [];
  for (const c of a.changes) {
    if (!c.files.length) continue;
    const weight = a.by === "commits" ? 1 : c.files.reduce((sum, f) => sum + f.add + f.del, 0);
    if (weight > 0) items.push({ day: c.day, key: keyOf(c.mail), name: a.canonicalOf.get(c.mail)?.author ?? a.nameOf.get(c.mail) ?? c.name, weight });
  }
  if (!items.length) return { by: a.by, resolution: null, first: null, last: null, commits: 0, buckets: [] };
  const days = items.map((i) => i.day).sort();
  const first = days[0];
  const last = days[days.length - 1];
  const dayNum = (/** @type {string} */ d) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  const resolution = timelineResolution(dayNum(last) - dayNum(first));
  const width = resolution === "yearly" ? 4 : resolution === "monthly" ? 7 : 10;
  /** @type {string[]} */
  const labels = [];
  if (resolution === "yearly") for (let y = Number(first.slice(0, 4)); y <= Number(last.slice(0, 4)); y++) labels.push(String(y));
  else if (resolution === "monthly") {
    let y = Number(first.slice(0, 4));
    let m = Number(first.slice(5, 7));
    while (y < Number(last.slice(0, 4)) || (y === Number(last.slice(0, 4)) && m <= Number(last.slice(5, 7)))) {
      labels.push(`${y}-${String(m).padStart(2, "0")}`);
      if (++m > 12) { m = 1; y++; }
    }
  } else for (let d = dayNum(first); d <= dayNum(last); d++) labels.push(new Date(d * 86_400_000).toISOString().slice(0, 10));
  /** @type {Map<string, Map<string, { name: string, weight: number }>>} */
  const byBucket = new Map();
  for (const i of items) {
    const label = i.day.slice(0, width);
    const m = byBucket.get(label) ?? new Map();
    const e = m.get(i.key) ?? { name: i.name, weight: 0 };
    e.weight += i.weight;
    m.set(i.key, e);
    byBucket.set(label, m);
  }
  /** @type {string | null} */
  let previous = null;
  /** @type {{ bucket: string, winner: string | null, count: number, total: number, share: number | null, handover: { from: string, to: string } | null }[]} */
  const buckets = [];
  /** @type {Map<string, string>} */
  const names = new Map();
  for (const label of labels) {
    const m = byBucket.get(label);
    if (!m) {
      buckets.push({ bucket: label, winner: null, count: 0, total: 0, share: null, handover: null });
      continue;
    }
    const ranked = [...m].map(([key, e]) => ({ key, ...e })).sort((x, y) => y.weight - x.weight || x.name.localeCompare(y.name) || x.key.localeCompare(y.key));
    const total = ranked.reduce((sum, e) => sum + e.weight, 0);
    const top = ranked[0];
    const share = top.weight / total;
    names.set(top.key, top.name);
    const handover = previous !== null && previous !== top.key && share >= TIMELINE_HANDOVER_SHARE ? { from: names.get(previous) ?? previous, to: top.name } : null;
    buckets.push({ bucket: label, winner: top.name, count: top.weight, total, share, handover });
    previous = top.key;
  }
  return { by: a.by, resolution, first, last, commits: items.length, buckets };
}

/**
 * The --timeline view.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderTimeline(r) {
  const v = r.timeline;
  if (!v) throw new Error("renderTimeline needs a result from --timeline");
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const out = [headerLine(r)];
  const scope = v.path || "whole repository";
  if (!v.buckets.length) {
    out.push(`${scope}: no commits to count (${v.by}) in the window`);
  } else {
    const range = v.resolution === "yearly" ? (v.first.slice(0, 4) === v.last.slice(0, 4) ? v.first.slice(0, 4) : `${v.first.slice(0, 4)}-${v.last.slice(0, 4)}`) : `${v.first} to ${v.last}`;
    out.push(`${scope} (${v.by}, ${v.resolution}, ${range})`);
    const nameW = Math.max(...v.buckets.map((b) => (b.winner ? displayWidth(b.winner) : 0)));
    const totalW = Math.max(...v.buckets.map((b) => n(b.total).length));
    for (const b of v.buckets) {
      if (b.winner === null) {
        out.push(b.bucket);
        continue;
      }
      const hand = b.handover ? `   handover: ${b.handover.from} -> ${b.handover.to}` : "";
      out.push(`${b.bucket}  ${padEndDisplay(b.winner, nameW)}  ${n(b.count).padStart(totalW)} of ${n(b.total).padStart(totalW)}  ${String(Math.round((b.share ?? 0) * 100)).padStart(3)}%${hand}`);
    }
  }
  if (v.at.length) {
    out.push("", "bus factor and the three largest holders of surviving lines at each date (blame at that commit):");
    for (const d of v.at) {
      if (!d.commit) out.push(`  ${d.date}: no commit before this date`);
      else out.push(`  ${d.date} (${d.commit.slice(0, 7)}): ${d.busFactor === null ? "no lines" : `bus factor ${d.busFactor}`}; ${d.top.map((t) => `${t.author} ${Math.round(t.share * 100)}%`).join(", ")}`);
    }
  }
  out.push("");
  out.push(v.by === "commits" ? "Winners are counted in commits, not surviving lines." : "Winners are counted in lines added plus removed, not surviving lines.");
  const notes = scopeNotes(r);
  if (notes.length) out.push("", ...notes);
  return out.join("\n");
}

/** R13 #4: where GitHub looks for the file, in its order; the first one that exists is used. */
export const CODEOWNERS_LOCATIONS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"];
/** R13 #4: a file of this size or more gets a warning; GitHub does not read a file above its limit. */
export const CODEOWNERS_WARN_BYTES = 2 * 1024 * 1024;
export const CODEOWNERS_LIMIT_BYTES = 3 * 1024 * 1024;
/** R13 #4: an observed owner holds at least this share of the lines a rule covers, and at most this many are named. */
export const CODEOWNERS_OBSERVED_MIN_SHARE = 0.2;
export const CODEOWNERS_OBSERVED_MAX = 3;
/** R13 #4: an undeclared person who holds this share of the covered lines is a shadow owner. */
export const CODEOWNERS_SHADOW_SHARE = 0.5;
/** R13 #4: a declared owner with no line and no commit in the covered files for this many days is a phantom. */
export const CODEOWNERS_PHANTOM_DAYS = 365;
/** R13 #4: the text view prints this many findings of each kind. */
export const CODEOWNERS_SHOWN = 10;

/**
 * Split one CODEOWNERS line into tokens. Whitespace separates tokens unless a backslash escapes it; a `#` at the start of
 * a token begins a comment that runs to the end of the line; `\#` at the start of a token is a literal `#`. Backslash
 * pairs stay in the token, so the matcher can read them.
 * @param {string} line
 */
function splitCodeownersLine(line) {
  /** @type {string[]} */
  const tokens = [];
  let cur = "";
  let inToken = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\" && i + 1 < line.length) {
      cur += c + line[++i];
      inToken = true;
    } else if (c === " " || c === "\t") {
      if (inToken) tokens.push(cur);
      cur = "";
      inToken = false;
    } else if (c === "#" && !inToken) {
      break;
    } else {
      cur += c;
      inToken = true;
    }
  }
  if (inToken) tokens.push(cur);
  return tokens;
}

/**
 * Why GitHub does not apply a pattern, or null. A leading `!` (negation) and `[...]` ranges are not supported.
 * @param {string} pattern
 */
function unsupportedReason(pattern) {
  if (pattern.startsWith("!")) return "negation (!)";
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "\\") i++;
    else if (pattern[i] === "[") return "character range ([...])";
  }
  return null;
}

/**
 * Read a CODEOWNERS file: one rule per line with a pattern and its owners. A rule without owners is kept (it removes
 * ownership on purpose). Lines GitHub does not apply (`!` negation, `[...]` ranges) are listed in `unsupported` and are
 * not rules.
 * @param {string} text
 * @returns {{ rules: { line: number, pattern: string, owners: string[], text: string }[], unsupported: { line: number, pattern: string, reason: string }[] }}
 */
export function parseCodeowners(text) {
  /** @type {{ line: number, pattern: string, owners: string[], text: string }[]} */
  const rules = [];
  /** @type {{ line: number, pattern: string, reason: string }[]} */
  const unsupported = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const tokens = splitCodeownersLine(raw);
    if (!tokens.length) return;
    const [pattern, ...owners] = tokens;
    const reason = unsupportedReason(pattern);
    if (reason) unsupported.push({ line: idx + 1, pattern, reason });
    else rules.push({ line: idx + 1, pattern, owners, text: tokens.join(" ") });
  });
  return { rules, unsupported };
}

/** @param {string} c */
const regexEscape = (c) => c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * The regular expression for one path segment: `*` stays inside the segment, a backslash makes the next character literal.
 * @param {string} seg
 */
function segmentRegex(seg) {
  let out = "";
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    if (c === "\\" && i + 1 < seg.length) out += regexEscape(seg[++i]);
    else if (c === "*") {
      while (seg[i + 1] === "*") i++;
      out += "[^/]*";
    } else out += regexEscape(c);
  }
  return out;
}

/**
 * A matcher for one CODEOWNERS pattern with GitHub's rules. A leading `/` anchors at the root and so does a `/` inside the
 * pattern; a name without either floats to any depth. `*` stays inside one segment, `**` crosses segments. A trailing `/`
 * matches the files inside a directory. A pattern naming a directory (not ending in a wildcard segment) also covers
 * everything inside it, but `dir/*` covers direct children only.
 * @param {string} pattern
 * @returns {(path: string) => boolean}
 */
export function codeownersMatcher(pattern) {
  const leading = pattern.startsWith("/");
  const dirOnly = pattern.endsWith("/");
  const segs = pattern.replace(/^\//, "").replace(/\/$/, "").split("/").filter((s) => s !== "");
  if (!segs.length) return () => false;
  const anchored = leading || segs.length > 1;
  let source = anchored ? "^" : "^(?:.*/)?";
  segs.forEach((seg, k) => {
    const last = k === segs.length - 1;
    if (seg === "**") {
      source += segs.length === 1 ? ".*" : last ? ".*" : "(?:.*/)?";
      return;
    }
    source += segmentRegex(seg) + (last ? "" : "/");
  });
  const re = new RegExp(`${source}$`);
  const wildcardLast = /(^|[^\\])\*/.test(segs[segs.length - 1]);
  const insideOk = dirOnly || !wildcardLast;
  return (path) => {
    if (!dirOnly && re.test(path)) return true;
    if (!insideOk) return false;
    let at = path.indexOf("/");
    while (at !== -1) {
      if (re.test(path.slice(0, at))) return true;
      at = path.indexOf("/", at + 1);
    }
    return false;
  };
}

/**
 * The CODEOWNERS file text to check: the explicit file (the working tree first, then the ref), or the first default
 * location that exists at the ref. Throws with the locations tried.
 * @param {Options} o
 * @returns {Promise<{ path: string, text: string }>}
 */
async function readCodeownersFile(o) {
  const explicit = o.checkCodeowners ? o.checkCodeowners : null;
  /** @type {string[]} */
  const tried = [];
  if (explicit) {
    tried.push(`${explicit} in the working tree`);
    try {
      return { path: explicit, text: readFileSync(resolve(o.cwd, explicit), "utf8") };
    } catch {
      // Not on disk: try the same path at the ref.
    }
  }
  for (const loc of explicit ? [explicit.replace(/^\.\//, "")] : CODEOWNERS_LOCATIONS) {
    tried.push(`${loc} at ${o.ref}`);
    try {
      return { path: loc, text: await git(["cat-file", "blob", `${o.ref}:${loc}`], o.cwd) };
    } catch {
      // Not there: try the next location.
    }
  }
  throw new Error(`--check-codeowners: no CODEOWNERS file found; tried ${tried.join(", ")}`);
}

/**
 * The newest author date (YYYY-MM-DD) of a non-merge commit per file and person, over the whole history of the ref.
 * Renames are not followed: a file is known by the path it has at the ref.
 * @param {Options} o
 * @param {Set<string>} paths
 * @param {(mail: string) => string} keyOf
 * @returns {Promise<Map<string, Map<string, string>>>}
 */
async function readLastTouch(o, paths, keyOf) {
  /** @type {Map<string, Map<string, string>>} */
  const out = new Map();
  const log = await git(["log", "--no-merges", "--name-only", "--format=%x01%aE%x09%aI", o.ref], o.cwd);
  for (const chunk of log.split("\x01")) {
    if (!chunk) continue;
    const [head, ...files] = chunk.split("\n");
    const [mail, date] = head.split("\t");
    if (!mail || !date) continue;
    const key = keyOf(mail.toLowerCase());
    const day = date.slice(0, 10);
    for (const f of files) {
      if (!f) continue;
      const path = unquoteGitPath(f);
      if (!paths.has(path)) continue;
      const m = out.get(path) ?? new Map();
      if ((m.get(key) ?? "") < day) m.set(key, day);
      out.set(path, m);
    }
  }
  return out;
}

/**
 * R13 #4: compare a CODEOWNERS file with the evidence of the run. Pure: every input is passed in.
 * Findings (each with its CODEOWNERS line number):
 * - missing: files no rule covers, by top directory.
 * - stale: rules that match no file.
 * - changed: the declared owners and the observed owners (people with at least 20% of the lines the rule covers, at most
 *   three) share nobody.
 * - phantom: a declared owner with no line in the covered files and no commit there for 365 days.
 * - shadow: one undeclared person holds at least half of the covered lines while owners are declared.
 * - inactiveDeclared: a declared owner with no commit anywhere in the active window.
 * - notComparable: team handles and handles or addresses that cannot be mapped to a person offline. They are listed and
 *   never counted as drift; a rule that names one skips the changed and shadow checks, because the missing person could
 *   be the observed one.
 * A rule without owners removes ownership on purpose: its files count as covered and it is not checked further.
 * @param {{
 *   file: string, text: string, ref: string, asOf: string, activeDays: number, sampleEvery: number,
 *   files: { path: string, lines: Map<string, number> }[],
 *   names: Map<string, string>,
 *   days: Map<string, { first: string, last: string }>,
 *   keyOf: (mail: string) => string,
 *   lastTouch: Map<string, Map<string, string>>,
 * }} a
 */
export function checkCodeownersOf(a) {
  const { rules, unsupported } = parseCodeowners(a.text);
  const bytes = Buffer.byteLength(a.text);
  /** @type {string[]} */
  const warnings = [];
  if (bytes > CODEOWNERS_LIMIT_BYTES) warnings.push(`the file is ${bytes.toLocaleString("en-US")} bytes, above GitHub's limit of ${CODEOWNERS_LIMIT_BYTES.toLocaleString("en-US")} bytes (3 MB); GitHub does not read it at all`);
  else if (bytes >= CODEOWNERS_WARN_BYTES) warnings.push(`the file is ${bytes.toLocaleString("en-US")} bytes, close to GitHub's limit of ${CODEOWNERS_LIMIT_BYTES.toLocaleString("en-US")} bytes (3 MB)`);
  const matchers = rules.map((r) => codeownersMatcher(r.pattern));
  /** @type {Map<string, string>} */
  const lastByKey = new Map();
  for (const [mail, d] of a.days) {
    const key = a.keyOf(mail);
    if ((lastByKey.get(key) ?? "") < d.last) lastByKey.set(key, d.last);
  }
  const daysBefore = (/** @type {string} */ day, /** @type {string} */ from) => (Date.parse(from) - Date.parse(day)) / 86400000;

  /** @param {string} token */
  const resolveOwner = (token) => {
    /** @type {Set<string>} */
    const keys = new Set();
    const byLogin = (/** @type {string} */ login) => {
      for (const mail of a.days.keys()) if (githubLogin(mail) === login) keys.add(a.keyOf(mail));
    };
    if (token.startsWith("@")) {
      const body = token.slice(1);
      if (body.includes("/")) return { token, keys, comparable: false, reason: "team handle" };
      byLogin(body.toLowerCase());
      return keys.size ? { token, keys, comparable: true, reason: "" } : { token, keys, comparable: false, reason: "no noreply address for this handle in the history" };
    }
    if (token.includes("@")) {
      const mail = token.toLowerCase();
      if (a.days.has(mail)) keys.add(a.keyOf(mail));
      else {
        const login = githubLogin(mail);
        if (login) byLogin(login);
      }
      return keys.size ? { token, keys, comparable: true, reason: "" } : { token, keys, comparable: false, reason: "no commit under this address in the history" };
    }
    return { token, keys, comparable: false, reason: "not a handle, team or address" };
  };

  /** @type {Set<number>} */
  const matchedAny = new Set();
  /** @type {Map<number, { path: string, lines: Map<string, number> }[]>} */
  const covered = new Map();
  /** @type {string[]} */
  const uncovered = [];
  for (const f of a.files) {
    let owner = -1;
    for (let i = rules.length - 1; i >= 0; i--) {
      if (!matchers[i](f.path)) continue;
      matchedAny.add(i);
      if (owner === -1) owner = i;
    }
    if (owner === -1) uncovered.push(f.path);
    else covered.set(owner, [...(covered.get(owner) ?? []), f]);
  }
  /** @type {Map<string, number>} */
  const byDir = new Map();
  for (const p of uncovered) {
    const dir = p.includes("/") ? `${p.slice(0, p.indexOf("/"))}/` : "(root files)";
    byDir.set(dir, (byDir.get(dir) ?? 0) + 1);
  }
  const missing = [...byDir].map(([dir, files]) => ({ dir, files })).sort((x, y) => y.files - x.files || x.dir.localeCompare(y.dir));
  const stale = rules.flatMap((r, i) => (matchedAny.has(i) ? [] : [{ line: r.line, rule: r.text }]));

  /** @type {{ line: number, rule: string, declared: string[], observed: { name: string, lines: number, share: number }[], files: number, lines: number }[]} */
  const changed = [];
  /** @type {{ line: number, rule: string, owner: string, lines: number, lastCommitAtPath: string | null, files: number }[]} */
  const phantom = [];
  /** @type {{ line: number, rule: string, author: string, share: number, declared: string[], files: number, lines: number }[]} */
  const shadow = [];
  /** @type {{ line: number, rule: string, owner: string, lastCommit: string, files: number, lines: number }[]} */
  const inactiveDeclared = [];
  /** @type {{ line: number, rule: string, owner: string, reason: string }[]} */
  const notComparable = [];
  const floor = new Date(Date.parse(a.asOf) - CODEOWNERS_PHANTOM_DAYS * 86400000).toISOString().slice(0, 10);
  rules.forEach((r, i) => {
    if (!r.owners.length) return;
    const owners = r.owners.map(resolveOwner);
    for (const ow of owners) if (!ow.comparable) notComparable.push({ line: r.line, rule: r.text, owner: ow.token, reason: ow.reason });
    const files = covered.get(i) ?? [];
    if (!files.length) return;
    /** @type {Map<string, number>} */
    const agg = new Map();
    let total = 0;
    for (const f of files) for (const [key, n] of f.lines) { agg.set(key, (agg.get(key) ?? 0) + n); total += n; }
    const ranked = [...agg].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
    const observed = ranked.filter(([, n]) => total > 0 && n / total >= CODEOWNERS_OBSERVED_MIN_SHARE).slice(0, CODEOWNERS_OBSERVED_MAX).map(([key, n]) => ({ key, name: a.names.get(key) ?? key, lines: n, share: n / total }));
    const comparable = owners.filter((ow) => ow.comparable);
    const declaredKeys = new Set(comparable.flatMap((ow) => [...ow.keys]));
    const allComparable = comparable.length === owners.length;
    const here = { line: r.line, rule: r.text, files: files.length, lines: total };
    const shown = observed.map(({ name, lines, share }) => ({ name, lines, share }));
    if (allComparable && observed.length && !observed.some((ob) => declaredKeys.has(ob.key))) changed.push({ ...here, declared: r.owners, observed: shown });
    const top = observed[0];
    if (allComparable && declaredKeys.size && top && top.share >= CODEOWNERS_SHADOW_SHARE && !declaredKeys.has(top.key)) shadow.push({ ...here, author: top.name, share: top.share, declared: r.owners });
    for (const ow of comparable) {
      const held = [...ow.keys].reduce((s, k) => s + (agg.get(k) ?? 0), 0);
      let last = "";
      for (const f of files) for (const k of ow.keys) { const d = a.lastTouch.get(f.path)?.get(k); if (d && d > last) last = d; }
      if (held === 0 && last < floor) phantom.push({ ...here, owner: ow.token, lines: held, lastCommitAtPath: last || null, files: files.length });
      let seen = "";
      for (const k of ow.keys) { const d = lastByKey.get(k); if (d && d > seen) seen = d; }
      if (seen && daysBefore(seen, a.asOf) > a.activeDays) inactiveDeclared.push({ ...here, owner: ow.token, lastCommit: seen });
    }
  });
  changed.sort((x, y) => y.lines - x.lines || x.line - y.line);
  phantom.sort((x, y) => y.files - x.files || x.line - y.line);
  shadow.sort((x, y) => y.share - x.share || x.line - y.line);
  inactiveDeclared.sort((x, y) => y.lines - x.lines || x.line - y.line);
  return {
    file: a.file,
    ref: a.ref,
    asOf: a.asOf,
    activeDays: a.activeDays,
    phantomDays: CODEOWNERS_PHANTOM_DAYS,
    sampleEvery: a.sampleEvery,
    bytes,
    rules: rules.length,
    unsupported,
    filesChecked: a.files.length,
    filesWithoutRule: uncovered.length,
    warnings,
    missing,
    stale,
    changed,
    phantom,
    shadow,
    inactiveDeclared,
    notComparable,
  };
}

/**
 * The --check-codeowners view: counts and the worst CODEOWNERS_SHOWN of each kind, with line numbers.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderCodeownersCheck(r) {
  const c = r.codeownersCheck;
  if (!c) throw new Error("renderCodeownersCheck needs a result from --check-codeowners");
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const out = [];
  if (r.shallow) out.push(SHALLOW_MARK);
  out.push(`CODEOWNERS (${c.file}, ${n(c.rules)} rule${c.rules === 1 ? "" : "s"}), checked against ${n(c.filesChecked)} file${c.filesChecked === 1 ? "" : "s"} at ${c.ref}${c.sampleEvery > 1 ? ` (sample 1 in ${c.sampleEvery})` : ""}, as of ${c.asOf}.`);
  for (const w of c.warnings) out.push(`Warning: ${w}.`);
  if (c.unsupported.length) out.push(`Not supported by GitHub, skipped and not applied: ${c.unsupported.slice(0, CODEOWNERS_SHOWN).map((u) => `line ${u.line} "${u.pattern}" (${u.reason})`).join("; ")}${c.unsupported.length > CODEOWNERS_SHOWN ? `; ${c.unsupported.length - CODEOWNERS_SHOWN} more` : ""}.`);
  /** @template T @param {string} label @param {T[]} list @param {(x: T) => string} line */
  const section = (label, list, line) => {
    if (!list.length) return out.push(`${label}: none.`);
    out.push(`${label}: ${list.length}.`);
    for (const x of list.slice(0, CODEOWNERS_SHOWN)) out.push(`  ${line(x)}`);
    if (list.length > CODEOWNERS_SHOWN) out.push(`  ... and ${n(list.length - CODEOWNERS_SHOWN)} more (--json lists all).`);
  };
  const lineOf = (/** @type {{ line: number, rule: string }} */ x) => `line ${x.line} "${x.rule}"`;
  const pctOf = (/** @type {number} */ x) => `${Math.round(x * 100)}%`;
  if (c.filesWithoutRule) out.push(`Missing: ${n(c.filesWithoutRule)} of ${n(c.filesChecked)} files have no rule (${c.missing.slice(0, CODEOWNERS_SHOWN).map((m) => `${m.dir} ${n(m.files)}`).join(", ")}${c.missing.length > CODEOWNERS_SHOWN ? `, ${c.missing.length - CODEOWNERS_SHOWN} more directories` : ""}).`);
  else out.push("Missing: none.");
  section("Stale (rules that match no file)", c.stale, lineOf);
  section("Changed (declared and observed owners share nobody)", c.changed, (x) => `${lineOf(x)}: declared ${x.declared.join(" ")}; observed ${x.observed.map((o) => `${o.name} ${pctOf(o.share)}`).join(", ")} of ${n(x.lines)} lines in ${n(x.files)} file${x.files === 1 ? "" : "s"}`);
  section("Phantom (declared, no line and no recent commit there)", c.phantom, (x) => `${lineOf(x)}: ${x.owner} holds 0 lines there and has ${x.lastCommitAtPath ? `no commit since ${x.lastCommitAtPath}` : "no commit there"} (${c.phantomDays}-day window before ${c.asOf})`);
  section("Shadow (an undeclared person holds half or more)", c.shadow, (x) => `${lineOf(x)}: ${x.author} holds ${pctOf(x.share)} and is not listed`);
  section("Inactive declared (no commit anywhere in the window)", c.inactiveDeclared, (x) => `${lineOf(x)}: ${x.owner} has no commit since ${x.lastCommit} (window ${c.activeDays} days before ${c.asOf})`);
  if (c.notComparable.length) {
    out.push(`Not comparable offline (not counted as drift): ${c.notComparable.length}.`);
    for (const x of c.notComparable.slice(0, CODEOWNERS_SHOWN)) out.push(`  ${lineOf(x)}: ${x.owner} (${x.reason})`);
    if (c.notComparable.length > CODEOWNERS_SHOWN) out.push(`  ... and ${n(c.notComparable.length - CODEOWNERS_SHOWN)} more (--json lists all).`);
  } else out.push("Not comparable offline: none.");
  out.push("", "This compares the file with surviving lines and commit dates. It does not judge who should own the code, and rules that name teams or unmapped handles are not checked.");
  return out.join("\n");
}

/** R13 #3: --why-not suggests the three people with the most lines, as the reviewers view does. */
const WHY_NOT_CUT = 3;

/** @param {number} k */
const ordinalOf = (k) => `${k}${k % 100 >= 11 && k % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[k % 10] ?? "th")}`;

/**
 * R13 #3: why one person is not among the suggested reviewers of a path, with the numbers that decided it. The numbers
 * are the ones the reviewers view uses (its three people with the most lines), so the answer cannot disagree with it.
 * The first branch that fits wins: unknown identity, a bot, never touched, no surviving lines, below the cut, listed but
 * inactive; a person who is listed and active is said to be listed. When another address of the same person has
 * lines and counting them together would put the person inside the cut, the branch is "split identity".
 * @param {{
 *   selector: string, path: string, ref: string,
 *   repoPeople: { name: string, mail: string, commits: number }[],
 *   rows: { author: string, mail: string, lines: number, commits: number }[],
 *   membersOf: Map<string, string[]> | null,
 *   view: { asOf: string, inactiveAfterDays: number },
 *   ranked: { author: string, lines: number, lineShare: number, lastCommit: string | null, active: boolean }[],
 *   pathCommits: { mail: string, day: string }[],
 *   days: Map<string, { first: string, last: string }>,
 *   groups: { members: { author: string, mail: string, lines: number }[], weakAdditions: { member: { author: string, mail: string, lines: number } }[] }[],
 *   sampleEvery: number,
 * }} a
 */
export function whyNotOf(a) {
  const q = a.selector.trim();
  const qName = foldIdentity(q);
  const qMail = q.toLowerCase();
  const addressesOf = (/** @type {{ mail: string }} */ r) => (a.membersOf?.get(r.mail) ?? [r.mail]).map((m) => m.toLowerCase());
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const noun = (/** @type {number} */ x, /** @type {string} */ w) => `${n(x)} ${w}${x === 1 ? "" : "s"}`;
  const sampled = a.sampleEvery > 1 ? ` (sample 1 in ${a.sampleEvery}: only a sample of the files was read)` : "";
  const seen = a.repoPeople.filter((p) => foldIdentity(p.name) === qName || p.mail === qMail);
  const seenRows = a.rows.filter((r) => foldIdentity(r.author) === qName || addressesOf(r).includes(qMail));
  const none = { author: null, mail: null, lines: 0, share: null, rank: null, of: null, cutLines: null, commitsAtPath: 0, firstCommitAtPath: null, lastCommitAtPath: null, lastCommitAnywhere: null, active: null, alsoAppearsAs: /** @type {{ author: string, mail: string, lines: number }[]} */ ([]), combinedLines: null, combinedRank: null, closest: /** @type {string[]} */ ([]) };
  const result = (/** @type {string} */ classification, /** @type {string} */ message, /** @type {Partial<typeof none>} */ extra = {}) => ({ query: a.selector, path: a.path, classification, message: `${message}${sampled}`, asOf: a.view.asOf, inactiveAfterDays: a.view.inactiveAfterDays, sampleEvery: a.sampleEvery, ...none, ...extra });
  if (!seen.length && !seenRows.length) {
    const closest = closestAuthors(q, a.repoPeople.map((p) => ({ author: p.name, mail: p.mail })));
    return result("unknownIdentity", `"${a.selector}" is not a known author: no name or address in the history matches after .mailmap${a.membersOf ? " and the identity merge" : ""}. Closest: ${closest.join("; ") || "none"}.`, { closest });
  }
  const key = foldIdentity([...seen].sort((x, y) => y.commits - x.commits || x.mail.localeCompare(y.mail))[0]?.name ?? seenRows[0].author);
  const mails = new Set([...a.repoPeople.filter((p) => foldIdentity(p.name) === key).map((p) => p.mail), ...a.rows.filter((r) => foldIdentity(r.author) === key).flatMap(addressesOf), ...seen.filter((p) => p.mail === qMail).map((p) => p.mail)]);
  const person = a.ranked.find((p) => foldIdentity(p.author) === key) ?? null;
  const name = person?.author ?? a.rows.find((r) => foldIdentity(r.author) === key)?.author ?? seen.find((p) => foldIdentity(p.name) === key)?.name ?? a.selector;
  const mail = [...mails].sort()[0] ?? "";
  const span = (/** @type {string[]} */ ms) => {
    const list = ms.map((m) => a.days.get(m)).filter((x) => x !== undefined);
    return list.length ? list.reduce((b, x) => (x.last > b ? x.last : b), list[0].last) : null;
  };
  const lastAnywhere = span([...mails]);
  const mine = a.pathCommits.filter((c) => mails.has(c.mail));
  const firstAtPath = mine.length ? mine.reduce((b, c) => (c.day < b ? c.day : b), mine[0].day) : null;
  const lastAtPath = mine.length ? mine.reduce((b, c) => (c.day > b ? c.day : b), mine[0].day) : null;
  const base = { author: name, mail, commitsAtPath: mine.length, firstCommitAtPath: firstAtPath, lastCommitAtPath: lastAtPath, lastCommitAnywhere: lastAnywhere };
  if (!person && !a.rows.some((r) => foldIdentity(r.author) === key) && isBotIdentity(name, mail)) {
    return result("bot", `${name} is a bot identity, not counted as an author, so it is never suggested as a reviewer; --include-bots counts bots.`, base);
  }
  if (!person && mine.length === 0) return result("neverTouched", `${name} is not a suggested reviewer of ${a.path}: no commit by ${name} touches ${a.path} in the history up to ${a.ref}.`, base);
  const cutDay = new Date(Date.parse(a.view.asOf) - a.view.inactiveAfterDays * 86400000).toISOString().slice(0, 10);
  const tail = `Last commit at the path ${lastAtPath ?? "none"}, anywhere ${lastAnywhere ?? "none"}; ${person?.active ? "active" : "inactive"} under the ${a.view.inactiveAfterDays}-day window (a commit at the path from ${cutDay} to ${a.view.asOf}).`;
  // Another address of the same person, when the identity suggestions link one that holds lines.
  const group = a.groups.find((g) => g.members.some((m) => foldIdentity(m.author) === key));
  const others = group ? [...group.members, ...group.weakAdditions.map((w) => w.member)].filter((m) => foldIdentity(m.author) !== key && m.lines > 0) : [];
  const lines = person?.lines ?? 0;
  const otherKeys = new Set(others.map((m) => foldIdentity(m.author)));
  const combined = lines + others.reduce((s, m) => s + m.lines, 0);
  const combinedRank = others.length ? 1 + a.ranked.filter((p) => foldIdentity(p.author) !== key && !otherKeys.has(foldIdentity(p.author)) && p.lines > combined).length : null;
  const also = others.length ? ` Also appears as ${others.map((m) => `${m.author} <${m.mail}> with ${noun(m.lines, "line")}`).join(", ")}; counted together (${noun(combined, "line")}) they would rank ${ordinalOf(/** @type {number} */ (combinedRank))}. Only you can confirm it is one person.` : "";
  const alsoFields = { alsoAppearsAs: others.map((m) => ({ author: m.author, mail: m.mail, lines: m.lines })), combinedLines: others.length ? combined : null, combinedRank };
  const rank = person ? a.ranked.indexOf(person) + 1 : null;
  const of = a.ranked.length;
  const cut = a.ranked[WHY_NOT_CUT - 1]?.lines ?? 0;
  const numbers = { ...base, lines, share: person?.lineShare ?? 0, rank, of, cutLines: cut, active: person?.active ?? false, ...alsoFields };
  const splitHelps = others.length > 0 && combinedRank !== null && combinedRank <= WHY_NOT_CUT;
  if (lines === 0) {
    const top = a.ranked[0];
    const owner = top ? ` The largest current owner is ${top.author} (${noun(top.lines, "line")}, ${pct(top.lineShare)}).` : "";
    if (splitHelps) return result("splitIdentity", `${name} is not a suggested reviewer of ${a.path} under this address: no line survives (${noun(mine.length, "commit")}, first ${firstAtPath}, last ${lastAtPath}).${also}`, numbers);
    return result("noSurvivingLines", `${name} is not a suggested reviewer of ${a.path}: ${noun(mine.length, "commit")} ${mine.length === 1 ? "touches" : "touch"} it (first ${firstAtPath}, last ${lastAtPath}), but all lines of theirs here were replaced or removed.${owner}${also}`, numbers);
  }
  const where = `${noun(lines, "line")} (${pct(person?.lineShare ?? 0)}), ranked ${ordinalOf(/** @type {number} */ (rank))} of ${n(of)}`;
  if (/** @type {number} */ (rank) > WHY_NOT_CUT) {
    if (splitHelps) return result("splitIdentity", `${name} is not a suggested reviewer of ${a.path} under this address: ${where}; the third place holds ${noun(cut, "line")}, so the cut is ${noun(cut, "line")}.${also}`, numbers);
    return result("belowCut", `${name} is not a suggested reviewer of ${a.path}: ${where}; the third place holds ${noun(cut, "line")}, so the cut is ${noun(cut, "line")} (the three people with the most lines are suggested). ${tail}${also}`, numbers);
  }
  if (!person?.active) return result("listedInactive", `${name} is a suggested reviewer of ${a.path} (${where}) but is marked inactive. ${tail}${also}`, numbers);
  return result("listed", `${name} is a suggested reviewer of ${a.path}: ${where}. ${tail}${also}`, numbers);
}

/**
 * The --why-not view.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderWhyNot(r) {
  const w = r.whyNot;
  if (!w) throw new Error("renderWhyNot needs a result from --why-not");
  const out = [];
  if (r.shallow) out.push(SHALLOW_MARK);
  out.push(w.message);
  const notes = scopeNotes(r);
  if (notes.length) out.push("", ...notes);
  return out.join("\n");
}

/** G12: a commit is named when at least this many of its lines survive in the scope and its committer is someone else than its author. */
const COMMITTED_BY_OTHERS_MIN_LINES = 5;
/** G12: this many such commits are named; the rest are counted. */
const COMMITTED_BY_OTHERS_SHOWN = 5;

/**
 * G12: the blamed commits whose committer is not their author. The credit goes to the author, so a reader needs to
 * know which lines were committed by someone else. The two identities are compared after .mailmap (the blame output
 * has it applied) and the identity merge: the same address, the same merged person, or the same name is one person.
 * Bots as authors are left out unless they are counted. The subjects of the listed commits come from one git call.
 * @param {Options} o
 * @param {Map<string, { name: string, mail: string, lines: number, committer?: string, committerMail?: string }>} blamedByCommit
 * @param {Map<string, { author: string, mail: string }>} canonicalOf
 * @param {Set<string>} [skip] commits credited to an original author (G14); their author is not the person who wrote them, so the note does not apply
 */
export async function committedByOthers(o, blamedByCommit, canonicalOf, skip = new Set()) {
  const idOf = (/** @type {string} */ mail) => canonicalOf.get(mail)?.mail ?? mail;
  const hits = [...blamedByCommit]
    .filter(([sha]) => !skip.has(sha))
    .filter(([, b]) => b.lines >= COMMITTED_BY_OTHERS_MIN_LINES && b.committerMail !== undefined && b.committerMail !== "" && idOf(b.committerMail) !== idOf(b.mail) && foldIdentity(b.committer ?? "") !== foldIdentity(b.name))
    .filter(([, b]) => o.includeBots || !isBotIdentity(b.name, b.mail))
    .sort((x, y) => y[1].lines - x[1].lines || x[0].localeCompare(y[0]));
  const shown = hits.slice(0, COMMITTED_BY_OTHERS_SHOWN);
  /** @type {Map<string, string>} */
  const subjects = new Map();
  if (shown.length) {
    try {
      for (const line of (await git(["log", "--no-walk=unsorted", "--format=%H%x09%s", ...shown.map(([sha]) => sha)], o.cwd)).split("\n")) {
        const tab = line.indexOf("\t");
        if (tab > 0) subjects.set(line.slice(0, tab), line.slice(tab + 1));
      }
    } catch {
      // A subject is a label; the commit is still named by its id.
    }
  }
  return {
    total: hits.length,
    commits: shown.map(([sha, b]) => ({ sha, shortSha: sha.slice(0, 7), subject: subjects.get(sha) ?? "", lines: b.lines, author: b.name, authorMail: b.mail, committer: b.committer ?? "", committerMail: b.committerMail ?? "" })),
  };
}

/**
 * G14: the unique commit id a revert message names (`This reverts commit <id>`), or null when there is none or the
 * message names more than one.
 * @param {string} body
 * @returns {string | null}
 */
export function revertTargetOf(body) {
  const ids = new Set([...body.matchAll(/This reverts commit ([0-9a-f]{7,64})\b/gi)].map((m) => m[1].toLowerCase()));
  return ids.size === 1 ? [...ids][0] : null;
}

/**
 * G14: the commit id of the `(cherry picked from commit <id>)` trailer that `git cherry-pick -x` writes, or null.
 * @param {string} body
 * @returns {string | null}
 */
export function cherryPickSourceOf(body) {
  const m = /\(cherry picked from commit ([0-9a-f]{7,64})\)/i.exec(body);
  return m ? m[1].toLowerCase() : null;
}

/** @typedef {{ sha: string, name: string, mail: string, time: string, body: string }} CommitInfo */

/**
 * G14: the author (after .mailmap) and message of each given commit id, or null for an id that is not a commit in the
 * repository. Two git calls for the whole list: `cat-file --batch-check` to see which exist, then one `log --stdin`.
 * @param {string} cwd
 * @param {string[]} refs
 * @returns {Promise<Map<string, CommitInfo | null>>}
 */
async function readCommitInfos(cwd, refs) {
  /** @type {Map<string, CommitInfo | null>} */
  const out = new Map();
  if (!refs.length) return out;
  /** @type {string[]} */
  let checked = [];
  try {
    checked = (await git(["cat-file", "--batch-check"], cwd, { input: refs.join("\n") + "\n" })).split("\n");
  } catch {
    // Nothing can be resolved; every id stays unresolved.
  }
  /** @type {[string, string][]} */
  const existing = [];
  refs.forEach((ref, i) => {
    const m = /^([0-9a-f]{40}|[0-9a-f]{64}) commit /.exec(checked[i] ?? "");
    if (m) existing.push([ref, m[1]]);
    else out.set(ref, null);
  });
  if (!existing.length) return out;
  /** @type {Map<string, CommitInfo>} */
  const byOid = new Map();
  try {
    const log = await git(["log", "--no-walk=unsorted", "--stdin", "--format=%x01%H%x1f%aN%x1f%aE%x1f%at%x1f%B"], cwd, { input: [...new Set(existing.map(([, oid]) => oid))].join("\n") + "\n" });
    for (const rec of log.split("\x01")) {
      const parts = rec.split("\x1f");
      if (parts.length < 5) continue;
      byOid.set(parts[0], { sha: parts[0], name: parts[1], mail: parts[2].toLowerCase(), time: parts[3], body: parts.slice(4).join("\x1f") });
    }
  } catch {
    // The log failed: the ids stay unresolved.
  }
  for (const [ref, oid] of existing) out.set(ref, byOid.get(oid) ?? null);
  return out;
}

/**
 * G14: a blamed commit whose surviving lines belong to someone else: it re-applies a reverted change, or it is a
 * `git cherry-pick -x` copy of a commit by another author.
 * @typedef {{ name: string, mail: string, via: "revert" | "cherry-pick", reappliedBy: string, reappliedByMail: string, subject: string }} Reapplied
 */

/**
 * G14: credit for re-applied work. A revert chain is followed through the `This reverts commit <id>` lines: a commit
 * that reverts a revert (an even number of reverts, two or more, before a commit that is not a revert) brings back the
 * change of that last commit, so its lines are the original author's. The same holds for a commit with a
 * `(cherry picked from commit <id>)` trailer whose source is in the repository and has another author. A chain that
 * cannot be followed to the end (a commit not in the repository, a loop) changes nothing.
 * `rewrite` takes `git blame --line-porcelain` text and returns it with the author headers of such commits replaced by
 * the original author's, so every count made from it agrees.
 * @param {string} cwd
 * @returns {ReapplyCredit}
 */
export function createReapplyCredit(cwd) {
  /** @type {Map<string, CommitInfo | null>} */
  const infos = new Map();
  /** @type {Map<string, Reapplied | null>} */
  const known = new Map();
  /** R13 #10: the author time of the commit each re-applied commit is credited to, so a time window agrees with the credit. */
  /** @type {Map<string, string>} */
  const originTime = new Map();
  /** @param {string[]} refs */
  const load = async (refs) => {
    const need = [...new Set(refs)].filter((r) => !infos.has(r));
    if (!need.length) return;
    for (const [ref, info] of await readCommitInfos(cwd, need)) infos.set(ref, info);
  };
  /** @param {string} sha @returns {Promise<Reapplied | null>} */
  const resolveOne = async (sha) => {
    const info = infos.get(sha);
    if (!info) return null;
    /** @type {CommitInfo | null} */
    let origin = null;
    /** @type {"revert" | "cherry-pick"} */
    let via = "revert";
    let cur = info;
    let reverts = 0;
    let broken = false;
    const seen = new Set([info.sha]);
    for (;;) {
      const target = revertTargetOf(cur.body);
      if (!target) break;
      await load([target]);
      const next = infos.get(target);
      if (!next || seen.has(next.sha)) {
        broken = true;
        break;
      }
      seen.add(next.sha);
      reverts++;
      cur = next;
    }
    if (!broken && reverts >= 2 && reverts % 2 === 0) origin = cur;
    if (!origin) {
      const source = cherryPickSourceOf(info.body);
      if (source) {
        await load([source]);
        origin = infos.get(source) ?? null;
        via = "cherry-pick";
      }
    }
    if (!origin || origin.mail === info.mail || foldIdentity(origin.name) === foldIdentity(info.name)) return null;
    originTime.set(sha, origin.time);
    return { name: origin.name, mail: origin.mail, via, reappliedBy: info.name, reappliedByMail: info.mail, subject: info.body.split("\n")[0] };
  };
  return {
    origins: known,
    creditedShas: () => new Set([...known].filter(([, v]) => v).map(([sha]) => sha)),
    async rewrite(porcelain) {
      /** @type {Set<string>} */
      const shas = new Set();
      for (const m of porcelain.matchAll(/^([0-9a-f]{40}|[0-9a-f]{64}) \d+ \d+/gm)) shas.add(m[1]);
      const todo = [...shas].filter((s) => !known.has(s));
      if (todo.length) {
        await load(todo);
        for (const sha of todo) known.set(sha, await resolveOne(sha));
      }
      if (![...shas].some((s) => known.get(s))) return porcelain;
      let sha = "";
      return porcelain
        .split("\n")
        .map((line) => {
          const header = /^([0-9a-f]{40}|[0-9a-f]{64}) \d+ \d+/.exec(line);
          if (header) sha = header[1];
          const credited = known.get(sha);
          if (!credited) return line;
          if (line.startsWith("author ")) return `author ${credited.name}`;
          if (line.startsWith("author-mail ")) return `author-mail <${credited.mail}>`;
          if (line.startsWith("author-time ") && originTime.has(sha)) return `author-time ${originTime.get(sha)}`;
          return line;
        })
        .join("\n");
    },
  };
}

/**
 * @typedef {{ origins: Map<string, Reapplied | null>, creditedShas: () => Set<string>, rewrite: (porcelain: string) => Promise<string> }} ReapplyCredit
 */

/** G14: this many re-applied commits are named; the rest are counted. */
const REAPPLIED_SHOWN = 5;

/**
 * G14: the re-applied commits that still hold lines in the scope, largest first.
 * @param {ReapplyCredit | null} credit
 * @param {Map<string, { lines: number }>} blamedByCommit
 */
export function reappliedCreditOf(credit, blamedByCommit) {
  const hits = credit
    ? [...credit.origins]
        .flatMap(([sha, v]) => (v && (blamedByCommit.get(sha)?.lines ?? 0) > 0 ? [{ sha, v, lines: blamedByCommit.get(sha)?.lines ?? 0 }] : []))
        .sort((x, y) => y.lines - x.lines || x.sha.localeCompare(y.sha))
    : [];
  return {
    total: hits.length,
    commits: hits.slice(0, REAPPLIED_SHOWN).map(({ sha, v, lines }) => ({ sha, shortSha: sha.slice(0, 7), subject: v.subject, lines, credited: v.name, creditedMail: v.mail, reappliedBy: v.reappliedBy, reappliedByMail: v.reappliedByMail, via: v.via })),
  };
}

/**
 * The people of the reviewers view, most surviving lines first (ties by name): rows with the same folded name are one
 * person, placeholder identities are left out, and a person is active when any of their addresses is. --reviewers
 * suggests the first three; --why-not explains a person's place in this list.
 * @param {{ mail: string, lastCommit: string | null, active: boolean }[]} authors the view's rows with their last commit and activity
 * @param {{ author: string, mail: string, lines: number, lineShare: number, linesWithBlank?: number, shareWithBlank?: number }[]} rows
 * @param {(mail: string) => string[]} memberMails
 */
function rankReviewers(authors, rows, memberMails) {
  const lastOf = new Map(authors.map((a) => [a.mail, a]));
  /** @type {Map<string, { author: string, mails: string[], lines: number, lineShare: number, linesWithBlank: number, shareWithBlank: number, lastCommit: string | null, active: boolean }>} */
  const people = new Map();
  for (const b of rows) {
    if (b.lines <= 0 || isPlaceholderIdentity(b.author, b.mail)) continue;
    const a = lastOf.get(b.mail);
    const key = foldIdentity(b.author);
    const p = people.get(key) ?? { author: b.author, mails: [], lines: 0, lineShare: 0, linesWithBlank: 0, shareWithBlank: 0, lastCommit: null, active: false };
    p.mails.push(...memberMails(b.mail));
    p.lines += b.lines;
    p.lineShare += b.lineShare;
    p.linesWithBlank += b.linesWithBlank ?? b.lines;
    p.shareWithBlank += b.shareWithBlank ?? b.lineShare;
    if (a?.lastCommit && (p.lastCommit === null || a.lastCommit > p.lastCommit)) p.lastCommit = a.lastCommit;
    p.active = p.active || Boolean(a?.active);
    people.set(key, p);
  }
  return [...people.values()].sort((x, y) => y.lines - x.lines || x.author.localeCompare(y.author));
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
 * @param {{ author: string, mail: string, lines: number, lineShare: number, commits: number, addresses?: number, linesWithBlank?: number, shareWithBlank?: number }[]} rows the table's rows
 * @param {boolean} applied whether the rows have the suspected reformat commits left out
 * @param {Map<string, string[]> | null} membersOf under --merge-identities, each merged row's canonical address to every address it holds
 * @param {{ mail: string, day: string }[]} pathCommits the commits at the path, from readPathCommits
 * @param {Record<string, string>} [lastCommits] each row's newest commit anywhere in the repository, from readLastCommits (G13)
 */
async function reviewersView(o, path, rows, applied, membersOf, pathCommits, lastCommits = {}) {
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
      return { author: a.author, mail: a.mail, lines: a.lines, lineShare: a.lineShare, linesWithBlank: a.linesWithBlank ?? a.lines, shareWithBlank: a.shareWithBlank ?? a.lineShare, commits: a.commits, lastCommit, lastAnywhere: lastCommits[a.mail] ?? null, active: daysSince <= INACTIVE_AFTER_DAYS, ...(a.addresses ? { addresses: a.addresses } : {}) };
    });
  const ranked = rankReviewers(authors, rows, memberMails);
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
 * @param {{ author: string, mail: string, lines: number, lineShare: number, commits: number, addresses?: number, linesWithBlank?: number, shareWithBlank?: number }[]} rows the table's rows
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
      linesWithBlank: row.linesWithBlank ?? row.lines,
      shareWithBlank: row.shareWithBlank ?? row.lineShare,
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
 * @param {{ author: string, mail: string, lines: number, linesWithBlank?: number }[]} list
 * @param {number} total
 * @param {Map<string, { author: string, mail: string }>} canonicalOf
 * @param {number} thresholdPercent
 * @param {number} [totalWithBlank] the same total counting blank lines; given, the rows' with-blank shares are recomputed on it
 */
function mergedLines(list, total, canonicalOf, thresholdPercent, totalWithBlank) {
  const authors = foldAddresses(list, canonicalOf)
    .map((a) => ({ ...a, lineShare: total ? a.lines / total : 0, ...(totalWithBlank !== undefined && a.linesWithBlank !== undefined ? { shareWithBlank: totalWithBlank ? a.linesWithBlank / totalWithBlank : 0 } : {}) }))
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
 * @param {Map<string, { name: string, lines: number, fullName?: string }>} [rawCounts] the same file's counts with blank lines included; given, the result also carries the with-blank figures
 * @returns {{ lines: number, linesWithBlank?: number, owners: { name: string, lines: number, share: number, linesWithBlank?: number }[] }}
 */
export function ownersOfFile(counts, includeBots, canonicalOf, nameOf, rawCounts) {
  /** @type {Map<string, { name: string, lines: number, withBlank: number }>} */
  const people = new Map();
  let total = 0;
  for (const [mail, c] of counts) {
    const name = nameOf.get(mail) ?? c.fullName ?? c.name;
    if (!includeBots && isBotIdentity(name, mail)) continue;
    const canon = canonicalOf.get(mail);
    const key = canon?.mail ?? mail;
    const p = people.get(key) ?? { name: canon?.author ?? name, lines: 0, withBlank: 0 };
    p.lines += c.lines;
    total += c.lines;
    people.set(key, p);
  }
  let totalWithBlank = 0;
  if (rawCounts) {
    for (const [mail, c] of rawCounts) {
      const name = nameOf.get(mail) ?? c.fullName ?? c.name;
      if (!includeBots && isBotIdentity(name, mail)) continue;
      totalWithBlank += c.lines;
      const p = people.get(canonicalOf.get(mail)?.mail ?? mail);
      if (p) p.withBlank += c.lines;
    }
  }
  const owners = [...people.entries()]
    .sort((x, y) => y[1].lines - x[1].lines || x[0].localeCompare(y[0]))
    .map(([, p]) => ({ name: p.name, lines: p.lines, share: total ? p.lines / total : 0, ...(rawCounts ? { linesWithBlank: p.withBlank } : {}) }));
  return { lines: total, ...(rawCounts ? { linesWithBlank: totalWithBlank } : {}), owners };
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
 * @param {{ blameArgs: string[], credit?: ReapplyCredit | null, perFile: Map<string, Map<string, { name: string, lines: number, fullName?: string }>>, nameOf: Map<string, string>, canonicalOf: Map<string, { author: string, mail: string }> }} ctx how to find who holds a file now; `credit` rewrites a fresh blame the way the run did
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
          const fresh = await git([...ctx.blameArgs, o.ref, "--", f.path], o.cwd, { timeout: left });
          counts = countBlameLines(ctx.credit ? await ctx.credit.rewrite(fresh) : fresh);
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
 * @param {Map<string, Map<string, { name: string, lines: number, fullName?: string }>>} [perFileRaw] the same counts with blank lines included; given, rows carry their with-blank figures
 */
export function filesView(limit, perFile, includeBots, canonicalOf, nameOf, perFileRaw) {
  const all = [...perFile]
    .map(([path, counts]) => ({ path, ...ownersOfFile(counts, includeBots, canonicalOf, nameOf, perFileRaw?.get(path)) }))
    .filter((f) => f.lines > 0)
    .sort((x, y) => y.lines - x.lines || x.path.localeCompare(y.path));
  const files = all.slice(0, limit).map((f) => ({ path: f.path, lines: f.lines, ...(f.linesWithBlank !== undefined ? { linesWithBlank: f.linesWithBlank } : {}), owners: f.owners.slice(0, 3) }));
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
  // The with-blank size is printed when some file's size differs with and without its blank lines.
  const both = files.some((f) => f.linesWithBlank !== undefined && f.linesWithBlank !== f.lines);
  const head = `${padEndDisplay("file", pathW)}  ${"lines".padStart(7)}${both ? `  ${"with blank".padStart(10)}` : ""}  ${padEndDisplay("top owner", ownerW)}  ${"share".padStart(6)}  next two owners`;
  out.push(head);
  out.push("-".repeat(displayWidth(head)));
  for (const f of files) {
    const [top, ...next] = f.owners;
    out.push(`${padEndDisplay(f.path, pathW)}  ${n(f.lines).padStart(7)}${both ? `  ${n(f.linesWithBlank ?? f.lines).padStart(10)}` : ""}  ${padEndDisplay(top?.name ?? "", ownerW)}  ${(top ? pct(top.share) : "").padStart(6)}  ${next.slice(0, 2).map(owner).join(", ")}`.trimEnd());
  }
  if (sum && sum.total > sum.shown) out.push(`… ${n(sum.total - sum.shown)} more file${sum.total - sum.shown === 1 ? "" : "s"}`);
  if (sum) out.push(`files: ${n(sum.total)}; one owner above 80% in ${n(sum.oneOwnerAbove80Percent)}; no owner above 50% in ${n(sum.noOwnerAbove50Percent)}`);
  const activeLine = activityLine(r.activity);
  if (activeLine) out.push(activeLine);
  const orphanLine = orphansLine(r.orphans);
  if (orphanLine) out.push(orphanLine);
  if (r.orphans?.requested) out.push("", ...orphanListLines(r.orphans));
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
  // --for-diff reads the ownership of the files the change touches, as they were at the base commit. The run is the usual
  // one, narrowed to those files at that commit; the change itself is read afterwards (forDiffOf).
  /** @type {Awaited<ReturnType<typeof planDiff>> | null} */
  let diffPlan = null;
  if (o.forDiff !== undefined) {
    diffPlan = await planDiff(o);
    const fallback = diffPlan.scope.length ? null : await anyKeptPath(o, diffPlan.base);
    o = { ...o, ref: diffPlan.base, paths: (fallback ? [fallback] : diffPlan.scope).map(literalPath) };
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

  if (o.coupled !== undefined) {
    const wanted = o.coupled.trim().replace(/^\.\//, "");
    const dirName = wanted.replace(/\/+$/, "");
    if (wanted.endsWith("/") || (!all.some((f) => f.path === wanted) && all.some((f) => f.path.startsWith(`${dirName}/`)))) {
      throw new Error(`--coupled takes one file; "${o.coupled}" is a directory, which is not supported yet`);
    }
    if (!all.some((f) => f.path === wanted)) {
      throw new Error(`--coupled: "${o.coupled}" is not a counted file at ref "${o.ref}" (it does not exist there, or it is a lockfile, generated or vendored file, or binary, or is left out by --include or --exclude)`);
    }
    o = { ...o, coupled: wanted };
  }
  const sampled = all.filter((f) => inSample(f.path, o.sample, o.seed));
  if (sampled.length === 0) {
    throw new Error(`no files sampled from ${all.length} files with --sample ${o.sample}${o.seed ? ` and --seed "${o.seed}"` : ""}`);
  }

  // R13 #4: the CODEOWNERS file is read before any blame, so a missing file fails at once.
  const codeownersFile = o.checkCodeowners !== undefined ? await readCodeownersFile(o) : null;
  const errStream = o.stderr ?? process.stderr;
  const showProgress = !o.quiet && Boolean(errStream && errStream.isTTY);

  // -C follows code moved out of a file changed in the same commit back to its first author; --copies deep (-C -C) also
  // looks in the files of the commit that created the file. Every blame then looks in more files, so above this many
  // files it is off unless asked for.
  // The work is the files actually blamed (the sample) times the commits that touch the run's paths, inside --since when
  // it is set. The history is measured only when the file count alone does not decide it.
  const forced = o.noCopies || o.copies;
  const commitCount = !forced && sampled.length <= COPY_DETECTION_MAX_FILES ? Number((await git(["rev-list", "--count", ...(o.since ? ["--since", o.since] : []), o.ref, "--", ...o.paths], o.cwd)).trim()) : 0;
  const blamedLines = sampled.reduce((sum, f) => sum + f.lines, 0);
  const copyOn = !o.noCopies && (o.copies || copyDetectionDefault(sampled.length, commitCount, o.copyWorkLimit, blamedLines, o.copyLineWorkLimit));
  const workLimit = o.copyWorkLimit ?? COPY_DETECTION_MAX_WORK;
  const lineWorkLimit = o.copyLineWorkLimit ?? COPY_DETECTION_MAX_LINE_WORK;
  const copyDetection = {
    on: copyOn,
    reason: copyOn
      ? null
      : o.noCopies
        ? "--no-copies"
        : sampled.length > COPY_DETECTION_MAX_FILES
          ? `${sampled.length.toLocaleString("en-US")} files to blame, more than ${COPY_DETECTION_MAX_FILES}`
          : sampled.length * commitCount > workLimit
            ? `${sampled.length.toLocaleString("en-US")} files times ${commitCount.toLocaleString("en-US")} commits is more than ${workLimit.toLocaleString("en-US")}`
            : `${blamedLines.toLocaleString("en-US")} lines times ${commitCount.toLocaleString("en-US")} commits is more than ${lineWorkLimit.toLocaleString("en-US")}`,
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

  // The brief reads the first-level directories, so it groups the way --group-by dir does, internally.
  const grouping = o.groupBy === undefined ? (o.brief ? /** @type {{ kind: "dir", depth: number }} */ ({ kind: "dir", depth: 1 }) : null) : parseGroupBy(o.groupBy);
  const needTrailers = o.coAuthors === "share" || o.aiBreakdown;
  const credit = o.reapplyCredit ? createReapplyCredit(o.cwd) : null;
  const first = await blamePass(o, sampled, blameArgs, grouping, showProgress ? errStream : null, new Set(), credit);
  // The reformat candidates are judged against what the first pass attributed, before bots leave the totals.
  const blamedTotal = first.attributed;

  // --identities lists addresses and never mentions a reformat, so it does not look for one.
  const detect = o.detectReformat && !o.identities && supportsIgnoreRevs(versionOutput);
  const judged = detect ? await judgeReformats(o, first.blamedByCommit, blamedTotal) : { suspects: [], listed: [] };
  const suspects = judged.suspects;
  // The correction: the main numbers are a second pass with the suspects ignored, so every output reads one result.
  // --keep-reformat keeps the first pass, and --co-authors share keeps it too: its split is not a plain line count.
  const applied = suspects.length > 0 && !o.keepReformat && o.coAuthors !== "share";
  const ignoredByUser = new Set(userRevs);
  if (ignoreRevs) for (const m of readFileSync(ignoreRevs.path, "utf8").matchAll(/^\s*([0-9a-f]{40}|[0-9a-f]{64})\b/gim)) ignoredByUser.add(m[1].toLowerCase());
  const mechanicalCheck = await findMechanicalCandidates(o, first.blamedByCommit, new Set(applied ? suspects.map((x) => x.sha) : []), ignoredByUser.size, undefined, judged.listed);
  /** @type {ReturnType<typeof linesSummary> | null} */
  let uncorrected = null;
  let main = first;
  let mainArgs = blameArgs;
  // R9-9: a commit that shows both signs of a mechanical rewrite (the same small change in at least 10 files AND a
  // formatter, lint fix or codemod named in the subject) is set aside the way a reformat is: its lines go back to the
  // people who wrote them before it. A commit with only one sign stays a named candidate that is not set aside.
  const strongRewrites = mechanicalCheck && detect && !o.keepReformat && o.coAuthors !== "share" && supportsIgnoreRevs(versionOutput) ? mechanicalCheck.candidates.filter((c) => c.both) : [];
  const leaveOut = new Set(strongRewrites.filter((c) => c.reason === "boilerplate").map((c) => c.sha));
  if (applied || strongRewrites.length) {
    const ignored = [...(applied ? suspects.map((x) => ({ sha: x.sha, shortSha: x.shortSha })) : []), ...strongRewrites];
    for (const s of ignored) shownFlags.push("--ignore-rev", s.shortSha, "(auto)");
    mainArgs = [...blameArgs, ...ignored.flatMap((s) => ["--ignore-rev", s.sha])];
    main = await blamePass(o, sampled, mainArgs, grouping, null, leaveOut, credit);
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
  const copyShift = copyOn && o.coAuthors !== "share" ? await copyShiftOf(o, sampled, main.copiedFiles, mainArgs, leaveOut, credit) : null;
  const authors = main.authors;
  let attributed = main.attributed;
  const blamedByCommit = main.blamedByCommit;
  const groupAcc = main.groupAcc;

  const logArgs = ["log", "--no-merges", "--format=%aE%x09%aN", o.ref];
  // G13: the commit counts of a single-file path view follow the file across renames, as the dates of the view do.
  const pathViewTarget = o.reviewers ?? o.history ?? (o.whyNot !== undefined ? o.paths[0] : undefined);
  if (pathViewTarget !== undefined && (await isFileAtRef(o, pathViewTarget))) logArgs.splice(2, 0, "--follow");
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
  if (groups && o.mergeIdentities) groups = groups.map((g) => ({ ...g, ...mergedLines(g.authors, g.lines, canonicalOf, o.busFactorThreshold, g.linesWithBlank) }));
  if (uncorrected && o.mergeIdentities) uncorrected = { ...uncorrected, ...mergedLines(uncorrected.authors, uncorrected.linesAttributed, canonicalOf, o.busFactorThreshold) };
  // One log call at the path serves both path views; --reviewers and --history cannot be asked for together.
  const pathView = o.reviewers ?? o.history ?? (o.whyNot !== undefined ? o.paths[0] : undefined);
  const pathCommits = pathView === undefined ? [] : await readPathCommits(o, pathView);
  // R10-3 and R10-2 read the run's own blame counts, with the names and merges the table uses.
  const nameOf = new Map([...authors].map(([mail, a]) => [mail, a.name]));
  const ownerMerge = o.mergeIdentities ? canonicalOf : new Map();
  const lastCommits = await readLastCommits(o, rows, membersOf);
  // G11: who is still committing, as of the ref's own commit date (never today), and what follows from it.
  const asOfDay = await refDay(o);
  const people = peopleActivity(rows, lastCommits, asOfDay, o.activeDays);
  const activity = activityOf(people, asOfDay, o.activeDays);
  // R13 #6: one function gives the active bus factor of the run and of every group block, so no view recounts it.
  const activeBusFactor = activeBusFactorOf(people, o.busFactorThreshold, o.activeDays);
  if (groups) groups = groups.map((g) => ({ ...g, ...groupActivityOf(g, people, o.busFactorThreshold, o.activeDays) }));
  const historyQuality = await readHistoryQuality(o);
  const orphanScope = o.coAuthors === "share" ? null : orphansOf(main.perFile, o.includeBots, ownerMerge, nameOf, people);
  const withoutResult = o.without.length ? withoutOf(main.perFile, o.includeBots, ownerMerge, nameOf, rows, resolveLeavers(o.without, rows, membersOf), o.busFactorThreshold) : null;
  const ownedByResult = o.ownedBy.length ? ownedByOf(main.perFile, main.perFileRaw, o.includeBots, ownerMerge, nameOf, rows, botRows, o.ownedBy, membersOf, await readCommitDays(o), asOfDay, o.activeDays, grouping?.kind === "dir" ? grouping.depth : 1, o.topGiven ? o.top : OWNED_BY_SHOWN) : null;
  const treeResult = o.tree !== undefined ? treeOf(main.perFile, o.includeBots, ownerMerge, nameOf, people, o.tree, o.topGiven ? o.top : TREE_CHILDREN_SHOWN, { asOf: asOfDay, activeDays: o.activeDays }) : null;
  /** @type {ReturnType<typeof whyNotOf> | null} */
  let whyNotResult = null;
  if (o.whyNot !== undefined) {
    const wnPath = o.paths[0];
    const view = await reviewersView(o, wnPath, rows, applied, membersOf, pathCommits, lastCommits);
    whyNotResult = whyNotOf({ selector: o.whyNot, path: wnPath, ref: o.ref, repoPeople: await readAddressNames(o), rows, membersOf, view, ranked: rankReviewers(view.authors, rows, (mail) => membersOf?.get(mail) ?? [mail]), pathCommits, days: await readCommitDays(o), groups: suggested, sampleEvery: o.sample });
  }
  /** @type {ReturnType<typeof checkCodeownersOf> | null} */
  let codeownersResult = null;
  if (codeownersFile) {
    const keyOf = (/** @type {string} */ mail) => ownerMerge.get(mail)?.mail ?? mail;
    /** @type {Map<string, string>} */
    const names = new Map();
    const checkFiles = [...main.perFile].map(([path, counts]) => {
      /** @type {Map<string, number>} */
      const lines = new Map();
      for (const [mail, c] of counts) {
        const name = nameOf.get(mail) ?? c.fullName ?? c.name;
        if (!o.includeBots && isBotIdentity(name, mail)) continue;
        const key = keyOf(mail);
        lines.set(key, (lines.get(key) ?? 0) + c.lines);
        if (!names.has(key)) names.set(key, ownerMerge.get(mail)?.author ?? name);
      }
      return { path, lines };
    });
    codeownersResult = checkCodeownersOf({ file: codeownersFile.path, text: codeownersFile.text, ref: o.ref, asOf: asOfDay, activeDays: o.activeDays, sampleEvery: o.sample, files: checkFiles, names, days: await readCommitDays(o), keyOf, lastTouch: await readLastTouch(o, new Set(checkFiles.map((f) => f.path)), keyOf) });
  }
  const forDiffResult = diffPlan ? await forDiffOf(o, diffPlan, main, rows, ownerMerge, nameOf, mainArgs, leaveOut, credit, membersOf) : null;
  // G7: the per-file owners of the path views, from the blame counts of the run.
  const fileOwners = pathView === undefined ? null : fileOwnersOf(main.perFile, o.includeBots, ownerMerge, nameOf);
  const reviewers = o.reviewers === undefined ? null : { ...(await reviewersView(o, o.reviewers, rows, applied, membersOf, pathCommits, lastCommits)), movedIn: movedInFor(main.origins, o.reviewers), fileOwners };
  const history = o.history === undefined ? null : { ...(await historyView(o, o.history, rows, membersOf, pathCommits, suspects, applied)), movedIn: movedInFor(main.origins, o.history), fileOwners };
  const skipShas = new Set([...ignoredByUser, ...(applied ? suspects.map((x) => x.sha) : []), ...strongRewrites.map((c) => c.sha)]);
  const whitespace = await findWhitespaceOnlyCommits(o, new Set(all.map((f) => f.path)), skipShas, { blameArgs: mainArgs, credit, perFile: main.perFileRaw, nameOf, canonicalOf: ownerMerge });
  /** @type {(Awaited<ReturnType<typeof attentionOf>> & { window: ReturnType<typeof changeWindowOf> & { firstCommit: string | null, until: string | null } }) | null} */
  let attentionResult = null;
  /** @type {(ReturnType<typeof coupledOf> & { window: ReturnType<typeof changeWindowOf> & { firstCommit: string | null, until: string | null }, minShared: number, maxFilesPerCommit: number, commitsRead: number }) | null} */
  let coupledResult = null;
  if (o.attention || o.coupled !== undefined) {
    const firstDays = [...(await readCommitDays(o)).values()].map((d) => d.first).sort();
    const firstCommit = firstDays[0] ?? null;
    const window = { ...changeWindowOf(o.since, asOfDay, firstCommit), firstCommit, until: o.until ?? null };
    const log = await git(["log", "--no-merges", "--topo-order", "--name-status", "-M", "--format=%x01%H%x1f%aE%x1f%aN", `--since=${window.since}`, ...(o.until ? [`--until=${o.until}`] : []), o.ref], o.cwd);
    const sets = changeSetsOf(log, new Set(all.map((f) => f.path)), skipShas, o.includeBots);
    const minShared = o.minShared ?? COUPLING_MIN_SHARED;
    const maxFiles = o.maxFilesPerCommit ?? COUPLING_MAX_FILES;
    if (o.attention) {
      attentionResult = { window, ...attentionOf({ sets, perFile: main.perFile, includeBots: o.includeBots, canonicalOf: ownerMerge, nameOf, people, minCommits: o.minCommits ?? ATTENTION_MIN_COMMITS, minShared, maxFiles, shown: o.topGiven ? o.top : ATTENTION_SHOWN }) };
    } else if (o.coupled !== undefined) {
      coupledResult = { window, minShared, maxFilesPerCommit: maxFiles, commitsRead: sets.length, ...coupledOf({ path: o.coupled, index: changeIndexOf(sets, minShared, maxFiles), perFile: main.perFile, includeBots: o.includeBots, canonicalOf: ownerMerge, nameOf, people, shown: o.topGiven ? o.top : COUPLED_SHOWN }) };
    }
  }
  /** @type {(ReturnType<typeof writtenSinceOf> & { since: string, until: string, sinceEpoch: number, untilEpoch: number | null, churn: boolean, firstCommit: string | null, beforeHistory: boolean }) | null} */
  let writtenResult = null;
  if (o.writtenSince !== undefined && o.writtenFrom !== undefined) {
    const changes = fileChangesOf(await git([...FILE_CHANGES_ARGS, o.ref], o.cwd), new Set(sampled.map((f) => f.path)), skipShas, o.includeBots);
    const firstCommit = [...(await readCommitDays(o)).values()].map((d) => d.first).sort()[0] ?? null;
    const untilDay = o.writtenTo === undefined ? null : new Date(o.writtenTo * 1000).toISOString().slice(0, 10);
    writtenResult = {
      since: o.writtenSince,
      until: o.writtenUntil ?? asOfDay,
      sinceEpoch: o.writtenFrom,
      untilEpoch: o.writtenTo ?? null,
      churn: o.churn,
      firstCommit,
      beforeHistory: firstCommit !== null && untilDay !== null && firstCommit >= untilDay,
      ...writtenSinceOf({ rows, written: main.written, attributed, changes, from: o.writtenFrom, to: o.writtenTo ?? null, canonicalOf: ownerMerge, nameOf, churn: o.churn }),
    };
  }
  /** @type {(ReturnType<typeof timelineOf> & { path: string | null, at: { date: string, commit: string | null, busFactor: number | null, top: { author: string, lines: number, share: number }[], note: string | null }[] }) | null} */
  let timelineResult = null;
  if (o.timeline !== undefined) {
    const log = await git([...FILE_CHANGES_ARGS, ...(o.since ? ["--since", o.since] : []), ...(o.until ? ["--until", o.until] : []), o.ref], o.cwd);
    const changes = fileChangesOf(log, new Set(all.map((f) => f.path)), skipShas, o.includeBots);
    /** @type {NonNullable<typeof timelineResult>["at"]} */
    const at = [];
    for (const date of o.at) {
      const commit = (await git(["rev-list", "-1", "--first-parent", `--before=${date}`, o.ref], o.cwd)).trim() || null;
      if (!commit) {
        at.push({ date, commit: null, busFactor: null, top: [], note: null });
        continue;
      }
      try {
        const then = await analyse({ ...o, timeline: undefined, at: [], by: undefined, ref: commit, quiet: true });
        at.push({ date, commit, busFactor: then.busFactor?.value ?? null, top: then.authors.slice(0, 3).map((x) => ({ author: x.author, lines: x.lines, share: x.lineShare })), note: null });
      } catch (err) {
        at.push({ date, commit, busFactor: null, top: [], note: String(err instanceof Error ? err.message : err) });
      }
    }
    timelineResult = { path: o.timeline || null, ...timelineOf({ changes, by: o.by ?? "commits", canonicalOf: ownerMerge, nameOf }), at };
  }
  const filesResult = o.files === undefined ? null : filesView(o.files, main.perFile, o.includeBots, ownerMerge, nameOf, main.perFileRaw);
  const mailmap = await readMailmapMerges(o, blamedByCommit, rows);
  // G12: the strong identity groups count as one person here whether or not --merge-identities merged them.
  const committedElsewhere = await committedByOthers(o, blamedByCommit, canonicalOf, credit ? credit.creditedShas() : new Set());
  const reapplied = reappliedCreditOf(credit, blamedByCommit);
  const result = {
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
    activity,
    activeBusFactor,
    historyQuality,
    orphans: orphanScope && { requested: o.orphans, ...orphanScope },
    without: withoutResult,
    forDiff: forDiffResult,
    ownedBy: ownedByResult,
    tree: treeResult,
    attention: attentionResult,
    coupled: coupledResult,
    writtenSince: writtenResult,
    timeline: timelineResult,
    whyNot: whyNotResult,
    codeownersCheck: codeownersResult,
    committedByOthers: committedElsewhere,
    reappliedCredit: reapplied,
    reviewers,
    history,
    authors: rows,
  };
  if (!o.brief) return result;
  // The brief reads the result above and three more facts: the commit id, the single-owner files and the bus factor of
  // the people who still commit (counted on their lines, as --without counts the people who remain).
  const sha = (await git(["rev-parse", `${o.ref}^{commit}`], o.cwd)).trim();
  const singleOwner = fileOwnersOf(main.perFile, o.includeBots, ownerMerge, nameOf).singleOwnerFiles;
  const brief = briefOf(result, {
    sha,
    scope: { paths: o.paths, include: o.include, exclude: o.exclude, since: o.since ?? null, until: o.until ?? null },
    singleOwner,
    activeBusFactor: activeBusFactor && activeBusFactor.value !== null ? { value: activeBusFactor.value, authors: activeBusFactor.authors, people: activeBusFactor.activePeople } : null,
  });
  return { ...result, brief };
}

/** The brief (--brief): how many people, directories and files each list names at most. */
const BRIEF_OWNERS = 6;
const BRIEF_DIRECTORIES = 5;
const BRIEF_SINGLE_OWNER = 5;
const BRIEF_ORPHANS_NAMED = 3;
const BRIEF_SET_ASIDE = 5;
/** The brief stays within this many lines and about this many characters; lists shrink first when it does not. */
export const BRIEF_MAX_LINES = 40;
export const BRIEF_MAX_CHARS = 3000;
/** The last line of the brief, word for word. */
export const BRIEF_QUOTE_RULE = "quote rule: quote both line counts; identity merges above are proposals; for a named directory or language re-run with -- <dir> or --include";

/**
 * The facts of the brief, from the analysis result the other views use. Nothing is counted again here: every figure is
 * one the result already holds, so the brief and the full views cannot disagree.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {{ sha: string, scope: { paths: string[], include: string[], exclude: string[], since: string | null, until: string | null }, singleOwner: ReturnType<typeof fileOwnersOf>["singleOwnerFiles"], activeBusFactor: { value: number, authors: string[], people: number } | null }} x
 */
export function briefOf(r, x) {
  const live = [...r.authors].filter((a) => a.lines > 0).sort((p, q) => q.lines - p.lines || p.mail.localeCompare(q.mail));
  const nameCount = new Map();
  for (const a of live) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const shown = live.slice(0, BRIEF_OWNERS);
  const rest = live.slice(BRIEF_OWNERS);
  const bf = r.busFactor;
  const act = r.activity;
  const orphans = r.orphans;
  const dropped = r.dropped;
  const droppedClasses = dropped?.applied ? DROP_CLASSES.filter((k) => dropped.classes[k]?.files).map((k) => ({ class: k, files: dropped.classes[k].files, lines: dropped.classes[k].lines })) : [];
  const botRows = r.bots?.included ? [] : r.bots?.excluded ?? [];
  const reformat = r.reformat?.applied ? r.reformat.suspects : [];
  const stillCounted = r.reformat?.applied ? [] : r.reformat?.suspects ?? [];
  /** @type {{ sha: string, subject: string, kind: string }[]} */
  const setAside = [
    ...reformat.map((s) => ({ sha: s.shortSha, subject: s.subject, kind: "reformat" })),
    ...(r.mechanicalCheck?.setAsideCommits ?? []).map((c) => ({ sha: c.shortSha, subject: c.subject, kind: c.reason === "boilerplate" ? "boilerplate" : "mechanical rewrite" })),
  ];
  const merged = r.identityMerge?.applied ? r.identityMerge.groups : [];
  /** @type {{ names: string[], addresses: string[], lines: number, lineShare: number, strength: string, source: string }[]} */
  const proposals = [
    ...r.identityHints.people.filter((p) => p.lines > 0 && !(merged.length && p.strength === "strong")).map((p) => ({ names: [p.name], addresses: p.addresses, lines: p.lines, lineShare: p.lineShare, strength: p.strength, source: "identity hint" })),
    ...r.possibleSamePerson.suggestions.filter((s) => s.lines > 0).map((s) => ({ names: [...new Set(s.addresses.map((a) => a.name || a.mail))], addresses: s.addresses.map((a) => a.mail), lines: s.lines, lineShare: s.lineShare, strength: s.strength, source: "possible same person" })),
  ];
  const directories = (r.grouping?.groups ?? [])
    .filter((g) => g.lines > 0 && g.authors.length)
    .slice(0, BRIEF_DIRECTORIES)
    .map((g) => ({ dir: g.key, lines: g.lines, lineShare: r.sample.linesAttributed ? g.lines / r.sample.linesAttributed : 0, topOwner: g.authors[0].author, topOwnerLines: g.authors[0].lines, topOwnerShare: g.authors[0].lineShare }));
  const committed = r.committedByOthers;
  const reapplied = r.reappliedCredit;
  return {
    view: "brief",
    ref: r.ref,
    sha: x.sha.slice(0, 7),
    asOf: act?.asOf ?? null,
    shallow: r.shallow,
    scope: { paths: x.scope.paths, include: x.scope.include, exclude: x.scope.exclude, since: x.scope.since, until: x.scope.until, sampleEvery: r.sample.every },
    files: r.sample.filesSampled,
    filesTotal: r.sample.filesTotal,
    commits: r.commitWindow.commits,
    history: briefHistoryOf(r.historyQuality),
    lines: r.sample.linesAttributed,
    linesWithBlank: live.reduce((s, a) => s + a.linesWithBlank, 0),
    owners: {
      total: live.length,
      shown: shown.map((a) => ({ author: a.author, mail: a.mail, ...((a.addresses ?? 0) > 1 ? { addresses: a.addresses } : {}), sharedName: (nameCount.get(a.author) ?? 0) > 1, lines: a.lines, lineShare: a.lineShare, linesWithBlank: a.linesWithBlank, shareWithBlank: a.shareWithBlank, commits: a.commits, commitShare: a.commitShare })),
      others: { people: rest.length, lines: rest.reduce((s, a) => s + a.lines, 0), lineShare: rest.reduce((s, a) => s + a.lineShare, 0), linesWithBlank: rest.reduce((s, a) => s + a.linesWithBlank, 0), shareWithBlank: rest.reduce((s, a) => s + a.shareWithBlank, 0) },
    },
    busFactor: bf && {
      thresholdPercent: bf.thresholdPercent,
      value: bf.value,
      authors: bf.authors,
      withBlank: bf.withBlank ? bf.withBlank.value : null,
      authorsFor80Percent: bf.authorsFor80Percent,
      active: x.activeBusFactor,
    },
    activity: act && { activeDays: act.activeDays, authors: act.authors, activeAuthors: act.activeAuthors, activeShare: act.activeShare, inactiveShare: act.inactiveShare, largestInactive: act.largestInactive.slice(0, 3) },
    orphans: orphans && { files: orphans.files, scopeFiles: orphans.scopeFiles, lines: orphans.lines, lineShare: orphans.lineShare, largest: orphans.items.slice(0, BRIEF_ORPHANS_NAMED).map((f) => ({ path: f.path, owner: f.owner, lines: f.lines })) },
    leftOut: {
      bots: { identities: botRows.length, names: botRows.map((b) => b.author).slice(0, 3), lines: botRows.reduce((s, b) => s + b.lines, 0), commits: botRows.reduce((s, b) => s + b.commits, 0) },
      dropped: { files: dropped?.applied ? dropped.files : 0, lines: dropped?.applied ? dropped.lines : 0, classes: droppedClasses },
      setAside: setAside.slice(0, BRIEF_SET_ASIDE),
      setAsideTotal: setAside.length,
      suspectedStillCounted: stillCounted.slice(0, 3).map((s) => ({ sha: s.shortSha, subject: s.subject })),
    },
    identity: { mergeApplied: Boolean(r.identityMerge?.applied), appliedGroups: merged.length, proposals: proposals.slice(0, 5), proposalsTotal: proposals.length },
    directories,
    singleOwnerFiles: { files: x.singleOwner.files.slice(0, BRIEF_SINGLE_OWNER), more: x.singleOwner.more + Math.max(0, x.singleOwner.files.length - BRIEF_SINGLE_OWNER) },
    committedByOthers: { total: committed?.total ?? 0, commits: (committed?.commits ?? []).slice(0, 2).map((c) => ({ sha: c.shortSha, subject: c.subject, lines: c.lines, author: c.author, committer: c.committer })) },
    reappliedCredit: { total: reapplied?.total ?? 0, commits: (reapplied?.commits ?? []).slice(0, 2).map((c) => ({ sha: c.shortSha, subject: c.subject, lines: c.lines, credited: c.credited, reappliedBy: c.reappliedBy })) },
    quoteRule: BRIEF_QUOTE_RULE,
  };
}

/** @param {string} s @param {number} max the string cut to max characters, with an ellipsis when it was longer */
function cut(s, max) {
  const flat = s.replace(/[\r\n\t]+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, Math.max(1, max - 3))}...` : flat;
}

/** @param {string} p @param {number} max a path cut from the left to max characters, so the file name stays */
function cutPath(p, max) {
  return p.length > max ? `...${p.slice(p.length - max + 3)}` : p;
}

/**
 * The brief as plain text: at most BRIEF_MAX_LINES lines and about BRIEF_MAX_CHARS characters. The lists shrink step by
 * step until it fits; the facts that carry a number (owners, bus factor, activity) never shrink.
 * @param {ReturnType<typeof briefOf>} b
 * @returns {string}
 */
export function renderBrief(b) {
  const steps = [
    { dirs: BRIEF_DIRECTORIES, single: BRIEF_SINGLE_OWNER, aside: BRIEF_SET_ASIDE, subject: 48, hints: 3, orphans: BRIEF_ORPHANS_NAMED, notes: 2 },
    { dirs: 4, single: 3, aside: 3, subject: 36, hints: 2, orphans: 2, notes: 1 },
    { dirs: 3, single: 2, aside: 2, subject: 28, hints: 1, orphans: 1, notes: 1 },
    { dirs: 2, single: 1, aside: 1, subject: 20, hints: 1, orphans: 1, notes: 1 },
  ];
  for (const limits of steps) {
    const text = briefLines(b, limits).join("\n");
    if (text.length <= BRIEF_MAX_CHARS && text.split("\n").length <= BRIEF_MAX_LINES) return text;
  }
  // Last resort: every line is cut, never a number dropped from the owner lines.
  return briefLines(b, steps[steps.length - 1]).map((l) => cut(l, 230)).slice(0, BRIEF_MAX_LINES).join("\n");
}

/**
 * @param {ReturnType<typeof briefOf>} b
 * @param {{ dirs: number, single: number, aside: number, subject: number, hints: number, orphans: number, notes: number }} lim
 * @returns {string[]}
 */
function briefLines(b, lim) {
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const name = (/** @type {string} */ s) => cut(s, 40);
  const people = (/** @type {number} */ k) => `${n(k)} ${k === 1 ? "person" : "people"}`;
  const sampleNote = b.scope.sampleEvery > 1 ? `; sample: 1 file in ${b.scope.sampleEvery}` : "";
  /** @type {string[]} */
  const out = [];
  out.push(`surviving-lines brief; ref ${b.ref} @ ${b.sha}${b.asOf ? `; as of ${b.asOf}` : ""}; files ${n(b.files)}; commits ${n(b.commits)}, merges excluded${sampleNote}${b.shallow ? `; ${SHALLOW_MARK}` : ""}`);
  const scope = [
    b.scope.paths.length ? `paths ${b.scope.paths.join(" ")}` : "",
    b.scope.include.length ? `include ${b.scope.include.join(" ")}` : "",
    b.scope.exclude.length ? `exclude ${b.scope.exclude.join(" ")}` : "",
    b.scope.since ? `since ${b.scope.since}` : "",
    b.scope.until ? `until ${b.scope.until}` : "",
  ].filter(Boolean);
  out.push(cut(`scope: ${scope.length ? scope.join("; ") : "whole repository"}; ${n(b.lines)} non-blank lines, ${n(b.linesWithBlank)} counting blank lines`, 230));
  const historyBrief = historyBriefLine(b.history);
  if (historyBrief) out.push(cut(historyBrief, 160));
  if (!b.owners.shown.length) {
    out.push("owners: nobody holds a counted line");
  } else {
    out.push(`owners, top ${b.owners.shown.length} of ${b.owners.total}: non-blank lines (share) | counting blank lines (share) | commits (share)`);
    for (const a of b.owners.shown) {
      const label = a.addresses ? `${a.author} (${a.addresses} addresses)` : a.sharedName ? `${a.author} <${a.mail}>` : a.author;
      out.push(`  ${name(label)}: ${n(a.lines)} (${pct(a.lineShare)}) | ${n(a.linesWithBlank)} (${pct(a.shareWithBlank)}) | ${n(a.commits)} (${pct(a.commitShare)})`);
    }
    if (b.owners.others.people) out.push(`  ${people(b.owners.others.people)} more: ${n(b.owners.others.lines)} (${pct(b.owners.others.lineShare)}) | ${n(b.owners.others.linesWithBlank)} (${pct(b.owners.others.shareWithBlank)})`);
  }
  const bf = b.busFactor;
  if (bf) {
    const named = bf.authors.slice(0, 3).map(name).join(", ") + (bf.authors.length > 3 ? ", ..." : "");
    const reach = typeof bf.authorsFor80Percent === "number" ? `; to reach 80%: ${bf.authorsFor80Percent}` : "";
    const blank = bf.withBlank !== null ? `; counting blank lines: ${bf.withBlank}` : "";
    const active = bf.active ? `; active people only: ${bf.active.value} (${bf.active.authors.slice(0, 3).map(name).join(", ")}${bf.active.authors.length > 3 ? ", ..." : ""}; counted on the lines of the ${people(bf.active.people)} with a commit in the last ${b.activity?.activeDays ?? 365} days)` : "; active people only: none committed in the window";
    out.push(`bus factor (smallest number of authors holding ${bf.thresholdPercent}% of the lines): ${bf.value} (${named})${blank}${reach}${active}`);
  }
  if (b.activity) {
    const a = b.activity;
    out.push(a.activeAuthors >= a.authors
      ? `activity as of ${b.asOf}: all ${people(a.authors)} holding lines committed in the last ${a.activeDays} days`
      : `activity as of ${b.asOf}: ${a.activeAuthors} of ${a.authors} people committed in the last ${a.activeDays} days and hold ${pct(a.activeShare)} of the non-blank lines; ${pct(a.inactiveShare)} belong to people with no commit then${a.largestInactive.length ? ` (largest: ${a.largestInactive.slice(0, 2).map((p) => `${name(p.author)} ${pct(p.lineShare)}`).join(", ")})` : ""}`);
  }
  if (b.orphans) {
    const o = b.orphans;
    out.push(o.files
      ? `orphaned files (top owner inactive, nobody active holds 20%+): ${n(o.files)} of ${n(o.scopeFiles)}, ${pct(o.lineShare)} of the lines; largest: ${o.largest.slice(0, lim.orphans).map((f) => `${cutPath(f.path, 44)} (${name(f.owner)}, ${n(f.lines)})`).join(", ")}`
      : "orphaned files (top owner inactive, nobody active holds 20%+): none");
  }
  const left = [];
  if (b.leftOut.bots.identities) left.push(`bots ${b.leftOut.bots.identities} (${b.leftOut.bots.names.map(name).join(", ")}; ${n(b.leftOut.bots.lines)} lines, ${n(b.leftOut.bots.commits)} commit${b.leftOut.bots.commits === 1 ? "" : "s"})`);
  if (b.leftOut.dropped.files) left.push(`${n(b.leftOut.dropped.files)} file${b.leftOut.dropped.files === 1 ? "" : "s"}, ${n(b.leftOut.dropped.lines)} lines (${b.leftOut.dropped.classes.map((c) => `${c.class} ${n(c.files)}`).join(", ")}; --keep-generated counts them)`);
  out.push(`left out of every number: ${left.length ? left.join("; ") : "no bots, no lockfile, generated, vendored or binary files"}`);
  if (b.leftOut.setAsideTotal) {
    const shown = b.leftOut.setAside.slice(0, lim.aside).map((c) => `${c.sha} "${cut(c.subject, lim.subject)}" (${c.kind})`);
    const more = b.leftOut.setAsideTotal - shown.length;
    out.push(`set-aside commits (their lines go back to earlier authors): ${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}`);
  }
  if (b.leftOut.suspectedStillCounted.length) out.push(`suspected reformat commits still counted (--keep-reformat): ${b.leftOut.suspectedStillCounted.map((c) => `${c.sha} "${cut(c.subject, lim.subject)}"`).join("; ")}`);
  const idLead = b.identity.mergeApplied ? `identity: --merge-identities applied ${b.identity.appliedGroups} strong group${b.identity.appliedGroups === 1 ? "" : "s"} in memory; further proposals, NOT applied` : "identity hints, proposals only, NOT applied";
  if (b.identity.proposalsTotal) {
    const shown = b.identity.proposals.slice(0, lim.hints).map((p) => `${p.names.slice(0, 3).map(name).join(" / ")}${p.names.length > 3 ? ` / and ${p.names.length - 3} more` : ""} (${p.addresses.slice(0, 3).join(", ")}) ${n(p.lines)} lines ${pct(p.lineShare)} if one person, ${p.strength}`);
    const more = b.identity.proposalsTotal - shown.length;
    out.push(`${idLead}: ${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}`);
  } else {
    out.push(`${idLead}: none suspected from names and addresses (that does not prove there are none)`);
  }
  if (b.directories.length) {
    out.push(`first-level directories (lines, share of all, top owner and their share of it): ${b.directories.slice(0, lim.dirs).map((d) => `${d.dir === "." ? "(root files)" : `${cutPath(d.dir, 30)}/`} ${n(d.lines)} ${pct(d.lineShare)}, ${name(d.topOwner)} ${pct(d.topOwnerShare)}`).join("; ")}`);
  }
  if (b.singleOwnerFiles.files.length) {
    const more = b.singleOwnerFiles.more + Math.max(0, b.singleOwnerFiles.files.length - lim.single);
    out.push(`single-owner files (one person holds ${Math.round(SINGLE_OWNER_MIN_SHARE * 100)}%+ of at least ${SINGLE_OWNER_MIN_LINES} lines): ${b.singleOwnerFiles.files.slice(0, lim.single).map((f) => `${cutPath(f.path, 44)} (${name(f.author)}, ${n(f.lines)})`).join(", ")}${more > 0 ? `, and ${more} more` : ""}`);
  }
  if (b.committedByOthers.total) {
    const c = b.committedByOthers;
    out.push(`committed by someone else, lines credited to the author: ${n(c.total)} commit${c.total === 1 ? "" : "s"}; ${c.commits.slice(0, lim.notes).map((x) => `${n(x.lines)} lines of ${x.sha} "${cut(x.subject, lim.subject)}" are ${name(x.author)}'s, committed by ${name(x.committer)}`).join("; ")}`);
  }
  if (b.reappliedCredit.total) {
    const c = b.reappliedCredit;
    out.push(`re-applied work credited to the original author: ${n(c.total)} commit${c.total === 1 ? "" : "s"}; ${c.commits.slice(0, lim.notes).map((x) => `${n(x.lines)} lines of ${x.sha} "${cut(x.subject, lim.subject)}" credited to ${name(x.credited)}, re-applied by ${name(x.reappliedBy)}`).join("; ")}`);
  }
  out.push(b.quoteRule);
  return out;
}

/**
 * The brief as JSON: a small object with the schema version and the tool, then the facts of briefOf.
 * @param {ReturnType<typeof briefOf>} b
 */
export function renderBriefJson(b) {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, tool: { name: "surviving-lines", version: toolVersion() }, ...b }, null, 2);
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
 * @param {Pick<Awaited<ReturnType<typeof analyse>>, "ref" | "sample"> & { shallow?: boolean, blame?: { copyDetection?: { on?: boolean, reason?: string | null } } }} r
 */
function headerLine(r) {
  const s = r.sample;
  return `ref ${r.ref}  ·  files ${s.filesSampled}/${s.filesTotal} sampled (1 in ${s.every}${s.seed ? `, seed "${s.seed}"` : ""})  ·  ${s.linesAttributed.toLocaleString("en-US")} of ${s.linesInRef.toLocaleString("en-US")} lines attributed${s.linesWithBlank > s.linesInRef ? ` (non-blank; ${s.linesWithBlank.toLocaleString("en-US")} with blank lines)` : ""}${r.shallow ? `  ·  ${SHALLOW_MARK}` : ""}${copyOffMark(r)}`;
}

/**
 * The header's mention of copy detection when it switched itself off (too many files, or too many files times commits).
 * Empty when it is on, or when the user turned it off with --no-copies. The fuller note stays with the scope notes.
 * @param {{ blame?: { copyDetection?: { on?: boolean, reason?: string | null } } }} r
 */
function copyOffMark(r) {
  const c = r.blame?.copyDetection;
  return c && c.on === false && c.reason && c.reason !== "--no-copies" ? `  ·  copy detection off (${c.reason})` : "";
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
  const one = (/** @type {{ shortSha: string, subject: string, author: string, survivingLines: number, reason?: string }} */ c) => `${c.shortSha} "${c.subject}" by ${c.author}, ${n(c.survivingLines)} surviving line${c.survivingLines === 1 ? "" : "s"}${c.reason === "boilerplate" ? ", boilerplate, its lines left out" : ""}`;
  const looked = m.setAsideCommits?.length ? `; rewrites looked through (the same small change in many files and a tool named in the subject, or the same lines added to several existing files with nothing deleted, "boilerplate", whose lines are left out; the other lines go back to the people who wrote them before): ${m.setAsideCommits.slice(0, 5).map(one).join("; ")}` : "";
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
 * True for a row that exists only because of blank lines: no counted line and no commit in the window. Such a row means
 * something only next to the with-blank column; a list that does not print that column leaves it out.
 * @param {{ lines: number, commits?: number, linesWithBlank?: number }} a
 */
function isBlankOnlyRow(a) {
  return a.lines === 0 && (a.commits ?? 0) === 0 && (a.linesWithBlank ?? 0) > 0;
}

/**
 * The rows of a list view and whether it prints the with-blank column. The column is printed when one of the first
 * `top` rows differs with and without blank lines. Without it, blank-only rows are dropped from the list, so they are
 * neither listed nor counted among the "more" authors.
 * @template {{ lines: number, commits?: number, linesWithBlank?: number }} T
 * @param {T[]} authors
 * @param {number} top
 * @returns {{ pool: T[], both: boolean }}
 */
function listRows(authors, top) {
  if (hasBlankBasis(authors.slice(0, top))) return { pool: authors, both: true };
  return { pool: authors.filter((a) => !isBlankOnlyRow(a)), both: false };
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
 * The block for an applied correction: what each suspect commit rewrote (lines and files, with no total next to the
 * committer's name), one line on the people who gain lines because the commit is left out (largest gain first, at most
 * five, with their figures with and without the correction), how to reproduce it, and the bus factor of the plain count.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {NonNullable<Awaited<ReturnType<typeof analyse>>["reformat"]["uncorrected"]>} counted
 * @param {Awaited<ReturnType<typeof analyse>>["reformat"]["suspects"]} suspects
 * @param {string} it "it" or "them"
 * @returns {string[]}
 */
function appliedBlock(r, counted, suspects, it) {
  const many = suspects.length > 1;
  const out = [`reformat commit${many ? "s" : ""} ignored (looks like whitespace and quote changes only): ${suspects.length} commit${many ? "s" : ""}`];
  // The block describes what the commit rewrote. It prints no line total next to the committer's name: those lines are
  // not that person's code, and a total beside the name reads as if they were.
  for (const s of suspects) {
    const rewritten = s.addedLines ?? (typeof s.changedLines === "number" ? Math.ceil(s.changedLines / 2) : s.survivingLines);
    const files = s.filesChanged ?? 0;
    out.push(`  commit ${s.shortSha} "${s.subject}" rewrote ${rewritten.toLocaleString("en-US")} line${rewritten === 1 ? "" : "s"} in ${files.toLocaleString("en-US")} file${files === 1 ? "" : "s"} (formatting only)`);
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
  const shown = new Map(r.authors.map((a) => [a.mail, a]));
  const plain = new Map(counted.authors.map((a) => [a.mail, a]));
  // The comparison lists only the people who gain lines because the commit is left out, largest gain first, at most
  // five. The people who committed the reformat are never listed: their drop is the point of the correction.
  const committers = new Set(suspects.map((s) => s.mail));
  const gained = [...nameOf.keys()]
    .filter((mail) => !committers.has(mail))
    .map((mail) => ({ label: label(mail), now: shown.get(mail)?.lines ?? 0, nowShare: shown.get(mail)?.lineShare ?? 0, before: plain.get(mail)?.lines ?? 0, beforeShare: plain.get(mail)?.lineShare ?? 0 }))
    .filter((m) => m.now > m.before)
    .sort((x, y) => y.now - y.before - (x.now - x.before) || x.label.localeCompare(y.label))
    .slice(0, 5);
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const gains = gained.length ? ` Authors who gain lines from this: ${gained.map((m) => `${m.label} ${n(m.now)} (${pct(m.nowShare)}) with the correction, ${n(m.before)} (${pct(m.beforeShare)}) without`).join("; ")}.` : "";
  const flags = many ? suspects.map((s) => `--ignore-rev ${s.sha}`).join(" ") : `--ignore-rev ${suspects[0].shortSha}`;
  out.push(`  The table above does not count ${it}.${gains} --keep-reformat counts ${it}; ${flags} (or an entry in .git-blame-ignore-revs) sets ${it} aside by hand.`);
  // The bus factor of the plain count, named the way the table names its own.
  const plainBf = counted.busFactor;
  if (plainBf) {
    // When the committer of a reformat is among the people named, the usual words would put a share of the lines next to
    // that name. Then the names are given without a figure.
    const committerNames = new Set(suspects.map((s) => s.author));
    const names = labelledBusNames(plainBf, counted.authors, r.authors);
    const words = plainBf.authors.some((name) => committerNames.has(name)) ? `${listNames(names)} ${plainBf.value === 1 ? "alone leads" : "together lead"} the plain count` : busFactorWords(plainBf, "lines", names);
    out.push(`  bus factor without the correction: ${plainBf.value} (${words})`);
  }
  return out;
}

/**
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @param {number} top
 */
/**
 * One plain sentence with both line counts of the top author, so a single quoted line carries the non-blank figure and
 * the blank-inclusive figure. The top author is the one with the most non-blank lines in the run's rows; the first of
 * them wins a tie. Null when no author holds a line.
 * @param {{ authors: { author: string, mail: string, lines: number, lineShare: number, linesWithBlank?: number, shareWithBlank?: number, addresses?: number }[] }} r
 * @returns {string | null}
 */
export function topAuthorLine(r) {
  if (!r.authors.length) return null;
  const top = r.authors.reduce((best, a) => (a.lines > best.lines ? a : best));
  const withBlank = top.linesWithBlank ?? top.lines;
  if (top.lines <= 0 && withBlank <= 0) return null;
  const nameCount = new Map();
  for (const a of r.authors) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  return `top: ${rowLabel(top, nameCount)} holds ${n(top.lines)} non-blank lines (${pct(top.lineShare)}), ${n(withBlank)} counting blank lines (${pct(top.shareWithBlank ?? top.lineShare)})`;
}

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
  lines.push(...historyLines(r));
  lines.push("");
  const nameCount = new Map();
  for (const a of r.authors) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const label = (/** @type {{author: string, mail: string, addresses?: number}} */ a) => rowLabel(a, nameCount);
  const byDefault = top === null;
  const shown = byDefault ? Math.min(DEFAULT_MAX_ROWS, Math.max(DEFAULT_MIN_ROWS, r.authors.filter((a) => a.lineShare >= DEFAULT_ROW_SHARE || (hasBlankBasis(r.authors) && (a.shareWithBlank ?? 0) >= DEFAULT_ROW_SHARE)).length)) : top;
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
  const topLine = topAuthorLine(r);
  if (topLine) lines.push(topLine);
  const activeLine = activityLine(r.activity);
  if (activeLine) lines.push(activeLine);
  const bus = busFactorBlock(r.busFactor, r.authors);
  const activeBus = activeBusFactorLine(r.activeBusFactor);
  if (bus.length && activeBus) bus.splice(1, 0, activeBus);
  if (bus.length) lines.push("", ...bus);
  if (r.orphans?.requested) lines.push("", orphansLine(r.orphans) ?? "", ...orphanListLines(r.orphans));
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
  const lines = [headerLine(r), ...historyLines(r)];
  lines.push("", `who should review ${v.path}  (surviving lines in ${v.path}, as of ${v.asOf})`);
  const nameCount = new Map();
  for (const a of v.authors) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const label = (/** @type {{author: string, mail: string, addresses?: number}} */ a) => rowLabel(a, nameCount);
  const { pool, both } = listRows(v.authors, top);
  const shown = pool.slice(0, top);
  const nameW = Math.max(6, ...shown.map((a) => displayWidth(label(a))));
  const head = `${padEndDisplay("author", nameW)}  ${"lines".padStart(9)}  ${"share".padStart(6)}${both ? `  ${"with blank".padStart(10)}  ${"share".padStart(6)}` : ""}  ${"commits".padStart(7)}  ${"last commit".padEnd(11)}  ${"last anywhere".padEnd(13)}  activity`;
  lines.push(head);
  lines.push("-".repeat(displayWidth(head)));
  for (const a of shown) {
    lines.push(`${padEndDisplay(label(a), nameW)}  ${a.lines.toLocaleString("en-US").padStart(9)}  ${pct(a.lineShare).padStart(6)}${both ? `  ${(a.linesWithBlank ?? a.lines).toLocaleString("en-US").padStart(10)}  ${pct(a.shareWithBlank ?? a.lineShare).padStart(6)}` : ""}  ${a.commits.toLocaleString("en-US").padStart(7)}  ${(a.lastCommit ?? "-").padEnd(11)}  ${(a.lastAnywhere ?? "-").padEnd(13)}  ${a.active ? "active" : "inactive"}`);
  }
  if (pool.length > top) lines.push(`… ${pool.length - top} more author${pool.length - top === 1 ? "" : "s"}`);
  const topLine = topAuthorLine(r);
  if (topLine) lines.push(topLine);
  lines.push(`rows are ordered by surviving lines; the last commit date (at this path) and the active marker (a commit at this path in the ${v.inactiveAfterDays} days before ${v.asOf}) are information and do not change the order. "last anywhere" is the newest commit in the whole repository: a person with an old date at the path and a recent one there has left the path, not the project.`);
  // The run's bus factor is the path's: the rows were blamed over the path alone.
  const bus = busFactorBlock(r.busFactor, r.authors);
  if (bus.length) lines.push("", ...bus, "");
  const manySuspects = (r.reformat?.suspects.length ?? 0) > 1;
  const heading = v.suggestedBasis === "reformatIgnored" ? `suggested by surviving lines (with the suspected reformat commit${manySuspects ? "s" : ""} ignored)` : "suggested by surviving lines";
  const person = (/** @type {typeof v.suggested[number]} */ p) => `${p.author} (${p.lines.toLocaleString("en-US")} lines, ${pct(p.lineShare)}${p.linesWithBlank !== undefined && p.linesWithBlank !== p.lines ? `, ${p.linesWithBlank.toLocaleString("en-US")} with blank, ${pct(p.shareWithBlank)}` : ""}${p.mails.length > 1 ? `, ${p.mails.length} addresses` : ""}, last commit ${p.lastCommit ?? "unknown"}, ${p.active ? "active" : "inactive"})`;
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
  const activeLine = activityLine(r.activity);
  if (activeLine) lines.push(activeLine);
  const orphanLine = orphansLine(r.orphans);
  if (orphanLine) lines.push(orphanLine);
  if (r.orphans?.requested) lines.push("", ...orphanListLines(r.orphans));
  const owned = fileOwnersLines(v.path, v.fileOwners);
  if (owned.length) lines.push("", ...owned);
  const notes = scopeNotes(r, { view: v });
  if (notes.length) lines.push("", ...notes);
  return lines.join("\n");
}

/**
 * G7: the "files in <path> by owner" block of the path views, about twenty lines at most; empty when the path holds no
 * non-blank surviving line or no person reaches the floor.
 * @param {string} path
 * @param {ReturnType<typeof fileOwnersOf> | null | undefined} fo
 * @returns {string[]}
 */
function fileOwnersLines(path, fo) {
  if (!fo || fo.scopeLines === 0 || fo.people.length === 0) return [];
  const n = (/** @type {number} */ x) => x.toLocaleString("en-US");
  const out = [`files in ${path} by owner (${n(fo.scopeLines)} non-blank surviving lines in the files below it; an owner is the person with the most lines of a file):`];
  for (const p of fo.people.slice(0, FILE_OWNERS_PEOPLE_SHOWN)) {
    const named = p.files.map((f) => `${f.path} (${n(f.lines)} lines, ${pct(f.share)})`);
    out.push(
      p.files.length
        ? `  ${p.author} (${n(p.lines)} lines): owns ${named.join(", ")}${p.moreFiles ? `, and ${n(p.moreFiles)} more` : ""}`
        : `  ${p.author} (${n(p.lines)} lines): no file where they hold half or more`,
    );
  }
  if (fo.people.length > FILE_OWNERS_PEOPLE_SHOWN) out.push(`  and ${fo.people.length - FILE_OWNERS_PEOPLE_SHOWN} more people`);
  const one = fo.singleOwnerFiles;
  if (one.files.length) {
    out.push(`files only one person has written (${pct(SINGLE_OWNER_MIN_SHARE)} or more of at least ${SINGLE_OWNER_MIN_LINES} lines): ${one.files.map((f) => `${f.path} (${f.author}, ${n(f.lines)} lines, ${pct(f.share)})`).join(", ")}${one.more ? `, and ${n(one.more)} more` : ""}`);
  }
  return out;
}

/**
 * G12: one line per blamed commit whose author is not its committer, up to five, then a count of the rest. Empty when
 * there is none.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 * @returns {string[]}
 */
export function committedByOthersLines(r) {
  const c = r.committedByOthers;
  if (!c || c.total === 0) return [];
  const out = c.commits.map((x) => `credited to the author: ${x.lines.toLocaleString("en-US")} lines of ${x.shortSha} "${x.subject}" are credited to ${x.author}, committed by ${x.committer}`);
  if (c.total > c.commits.length) out.push(`and ${c.total - c.commits.length} more commit${c.total - c.commits.length === 1 ? "" : "s"} committed by someone else`);
  return out;
}

/**
 * G14: one line per re-applied commit that still holds lines, up to five, then a count of the rest. Empty when there is none.
 * @param {{ reappliedCredit?: ReturnType<typeof reappliedCreditOf> }} r
 * @returns {string[]}
 */
export function reappliedCreditLines(r) {
  const c = r.reappliedCredit;
  if (!c || c.total === 0) return [];
  const out = c.commits.map((x) => `re-applied work credited to the original author: ${x.lines.toLocaleString("en-US")} lines of ${x.shortSha} "${x.subject}" credited to ${x.credited} (re-applied by ${x.reappliedBy})`);
  if (c.total > c.commits.length) out.push(`and ${c.total - c.commits.length} more re-applied commit${c.total - c.commits.length === 1 ? "" : "s"}`);
  return out;
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
  const lines = [headerLine(r), ...historyLines(r)];
  const people = h.authors.length;
  lines.push("", `history of ${h.path} (${people} ${people === 1 ? "person" : "people"} changed it, oldest first; surviving lines as of ${h.asOf})`);
  const nameCount = new Map();
  for (const a of h.authors) nameCount.set(a.author, (nameCount.get(a.author) ?? 0) + 1);
  const label = (/** @type {{author: string, mail: string, addresses?: number}} */ a) => rowLabel(a, nameCount);
  const shown = h.authors.slice(0, top);
  const nameW = Math.max(6, ...shown.map((a) => displayWidth(label(a))));
  const both = hasBlankBasis(shown);
  const head = `${padEndDisplay("author", nameW)}  ${"first commit".padEnd(12)}  ${"last commit".padEnd(12)}  ${"commits".padStart(7)}  ${"lines now".padStart(9)}  ${"share".padStart(6)}${both ? `  ${"with blank".padStart(10)}  ${"share".padStart(6)}` : ""}`;
  if (h.authors.length) {
    lines.push(head);
    lines.push("-".repeat(displayWidth(head)));
    for (const a of shown) {
      lines.push(`${padEndDisplay(label(a), nameW)}  ${a.firstCommit.padEnd(12)}  ${a.lastCommit.padEnd(12)}  ${a.commits.toLocaleString("en-US").padStart(7)}  ${a.lines.toLocaleString("en-US").padStart(9)}  ${pct(a.lineShare).padStart(6)}${both ? `  ${(a.linesWithBlank ?? a.lines).toLocaleString("en-US").padStart(10)}  ${pct(a.shareWithBlank ?? a.lineShare).padStart(6)}` : ""}`);
    }
    if (h.authors.length > top) lines.push(`… ${h.authors.length - top} more ${h.authors.length - top === 1 ? "person" : "people"}`);
    const topLine = topAuthorLine(r);
    if (topLine) lines.push(topLine);
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
  const activeLine = activityLine(r.activity);
  if (activeLine) lines.push("", activeLine);
  const owned = fileOwnersLines(h.path, h.fileOwners);
  if (owned.length) lines.push("", ...owned);
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
    const { pool, both } = listRows(g.authors, top);
    lines.push(`${g.key}  ·  ${g.filesSampled} file${g.filesSampled === 1 ? "" : "s"} sampled  ·  ${g.lines.toLocaleString("en-US")} lines${both && g.linesWithBlank !== undefined ? `, ${g.linesWithBlank.toLocaleString("en-US")} counting blank lines` : ""}`);
    const rows = pool.slice(0, top);
    const nameW = Math.max(6, ...rows.map((a) => displayWidth(label(a))));
    const head = `${padEndDisplay("author", nameW)}  ${"lines".padStart(9)}  ${"share".padStart(6)}${both ? `  ${"with blank".padStart(10)}  ${"share".padStart(6)}` : ""}`;
    lines.push(head);
    lines.push("-".repeat(displayWidth(head)));
    for (const a of rows) lines.push(`${padEndDisplay(label(a), nameW)}  ${a.lines.toLocaleString("en-US").padStart(9)}  ${pct(a.lineShare).padStart(6)}${both ? `  ${(a.linesWithBlank ?? a.lines).toLocaleString("en-US").padStart(10)}  ${pct(a.shareWithBlank ?? a.lineShare).padStart(6)}` : ""}`);
    if (pool.length > top) lines.push(`… ${pool.length - top} more author${pool.length - top === 1 ? "" : "s"}`);
    const groupLine = busFactorLine(g.busFactor, g.authors);
    if (groupLine) {
      lines.push("", groupLine);
      const activeLine = activeBusFactorLine(g.activeBusFactor);
      if (activeLine) lines.push(activeLine);
      if (g.verdict?.length) lines.push(`verdict: ${g.verdict.join(", ")} (separate findings, not one risk rank)`);
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

/** R13 #11: a second or third owner of a path must hold at least this share of its surviving lines, and a path whose top author is gone needs an active author with this share. */
export const CODEOWNERS_CO_OWNER_MIN_SHARE = 0.2;
/** R13 #11: a CODEOWNERS rule names at most this many owners. */
export const CODEOWNERS_MAX_OWNERS = 3;

/**
 * CODEOWNERS lines for a `--group-by dir` result. Printed, never written. Only people with a commit in the
 * `--active-days` window before the ref date are named. A directory gets an owner line when its top author is active and
 * holds at least OWNER_THRESHOLD of its sampled surviving lines, or when its top author is gone and an active author
 * holds at least CODEOWNERS_CO_OWNER_MIN_SHARE; the line names up to CODEOWNERS_MAX_OWNERS active authors who each hold that share. When
 * the top author is gone, a comment above the rule says how much they wrote and when they last committed. When nobody
 * active holds that share, the directory is an `orphaned` comment and has no owner line. Files at the root are skipped:
 * the pattern that matches only them does not exist, and `/*` would also match every directory.
 * @param {Awaited<ReturnType<typeof analyse>>} r
 */
export function renderCodeowners(r) {
  const asOf = r.activity?.asOf ?? null;
  const activeDays = r.activity?.activeDays ?? ACTIVE_DAYS_DEFAULT;
  const out = [
    "# CODEOWNERS suggestions from sampled surviving lines. Printed only; nothing was written.",
    "# Surviving lines say who wrote the code that is left, not who should review changes to it.",
    `# Only people with a commit in the ${activeDays} days before ${asOf ?? "the ref date"} are named as owners.`,
  ];
  const lastOf = (/** @type {{ mail: string }} */ a) => r.lastCommits?.[a.mail] ?? null;
  const isActive = (/** @type {{ mail: string }} */ a) => {
    const day = lastOf(a);
    return asOf !== null && day !== null && (Date.parse(asOf) - Date.parse(day)) / 86400000 <= activeDays;
  };
  const whole = (/** @type {number} */ x) => `${Math.round(x * 100)}%`;
  // A later CODEOWNERS pattern overrides an earlier one, so a directory is listed before the directories inside it.
  const ordered = [...(r.grouping?.groups ?? [])].sort((x, y) => x.key.localeCompare(y.key));
  for (const g of ordered) {
    if (g.key === ".") {
      out.push("# (files at the repository root) skipped: a CODEOWNERS pattern for them would also match every directory");
      continue;
    }
    const top = g.authors.find((a) => a.lines > 0);
    const basis = `${g.filesSampled} sampled file${g.filesSampled === 1 ? "" : "s"}`;
    if (!top) {
      out.push(`# /${g.key}/ no surviving lines in ${basis}`);
      continue;
    }
    const topActive = isActive(top);
    if (topActive && top.lineShare < OWNER_THRESHOLD) {
      out.push(`# /${g.key}/ no author holds half of ${g.lines.toLocaleString("en-US")} lines in ${basis}; top is ${top.author} at ${pct(top.lineShare)}`);
      continue;
    }
    const owners = g.authors.filter((a) => a.lines > 0 && isActive(a) && a.lineShare >= CODEOWNERS_CO_OWNER_MIN_SHARE).slice(0, CODEOWNERS_MAX_OWNERS);
    if (!owners.length) {
      out.push(`# orphaned: nobody active holds ${whole(CODEOWNERS_CO_OWNER_MIN_SHARE)} of /${g.key}/`);
      continue;
    }
    if (!topActive) {
      const day = lastOf(top);
      out.push(`# /${g.key}/: ${top.author} wrote ${whole(top.lineShare)} of the lines but has ${day ? `no commit since ${day}` : "no known commit"}`);
    }
    const tokens = owners.map((a) => {
      const login = githubLogin(a.mail);
      return login ? `@${login}` : a.mail;
    });
    const shares = owners.length === 1 ? `${owners[0].author} holds ${pct(owners[0].lineShare)}` : `${owners.map((a) => `${a.author} ${pct(a.lineShare)}`).join(", ")}`;
    out.push(`/${g.key}/ ${tokens.join(" ")}  # ${shares} of ${g.lines.toLocaleString("en-US")} lines in ${basis}`);
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
  const days = await readCommitDays(o);
  /** @type {Record<string, string>} */
  const out = {};
  for (const a of rows) {
    let best = "";
    for (const m of membersOf?.get(a.mail) ?? [a.mail]) {
      const day = days.get(m.toLowerCase())?.last;
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
  // The with-blank count is added after the non-blank one when the two differ, so either convention can read it.
  const blankNote = (/** @type {{ lines: number, linesWithBlank?: number }} */ m) => (m.linesWithBlank !== undefined && m.linesWithBlank !== m.lines ? ` (${m.linesWithBlank.toLocaleString("en-US")} counting blank lines)` : "");
  for (const g of groups) {
    lines.push(`${g.canonical.author || g.canonical.mail}`);
    for (const m of g.members) {
      const mark = m.mail === g.canonical.mail ? "keep" : "map ";
      lines.push(`  ${mark} ${m.mail}  ${m.commits} commit${m.commits === 1 ? "" : "s"}, ${m.lines.toLocaleString("en-US")} line${m.lines === 1 ? "" : "s"}${blankNote(m)}`);
    }
    for (const r of g.reasons) lines.push(`  because ${r}`);
    lines.push(`  strength: ${g.strength}${g.strength === "strong" ? "" : " (a guess; not merged by --merge-identities, confirm before writing a .mailmap line)"}`);
    for (const w of g.weakAdditions ?? []) lines.push(`  weak addition, not in the group above and not merged by --merge-identities: ${w.member.mail}  ${w.member.commits} commit${w.member.commits === 1 ? "" : "s"}, ${w.member.lines.toLocaleString("en-US")} line${w.member.lines === 1 ? "" : "s"}${blankNote(w.member)}, because ${w.reasons.join("; ")}`);
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
  // --time-budget: when the run is slower than the budget it stops its git processes, prints nothing and exits 0.
  const budget = o.timeBudget === undefined ? null : setTimeout(() => {
    stopGitProcesses();
    process.exit(0);
  }, o.timeBudget * 1000);
  budget?.unref();
  try {
    const r = await analyse(o);
    if (budget) clearTimeout(budget);
    let output;

    if (o.brief && "brief" in r) {
      console.log(o.json ? renderBriefJson(r.brief) : renderBrief(r.brief));
      return;
    }
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
    } else if (r.codeownersCheck) {
      output = renderCodeownersCheck(r);
    } else if (r.whyNot) {
      output = renderWhyNot(r);
    } else if (r.ownedBy) {
      output = renderOwnedBy(r);
    } else if (r.tree) {
      output = renderTree(r);
    } else if (r.attention) {
      output = renderAttention(r);
    } else if (r.coupled) {
      output = renderCoupled(r);
    } else if (r.writtenSince) {
      output = renderWrittenSince(r);
    } else if (r.timeline) {
      output = renderTimeline(r);
    } else if (r.forDiff) {
      output = renderForDiff(r, o.topGiven ? o.top : FOR_DIFF_REVIEWERS_SHOWN);
    } else if (r.without) {
      output = renderWithout(r);
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
