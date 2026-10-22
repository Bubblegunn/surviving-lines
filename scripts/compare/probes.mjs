// One probe per feature a competitor advertises. A probe builds nothing on import and returns an outcome
// when run, so the test suite can load this file without any competitor installed.
import { spawnSync } from "node:child_process";
import { fetchedStatus, gitFamePrints, runGitExtras, runGitFame, runGitWho, runGitWhoTree, runOurs, sameNumbers, compact, upstreamPaths } from "./adapters.mjs";

/**
 * @typedef {import("./report.mjs").Outcome} Outcome
 * @typedef {import("./adapters.mjs").Result} Result
 * @typedef {{ dir: string, build: (name: keyof typeof import("../fixtures.mjs").FIXTURES) => string }} Ctx
 * @typedef {{ id: string, feature: string, competitor: string, fixture: keyof typeof import("../fixtures.mjs").FIXTURES, run: (ctx: Ctx) => Outcome }} Probe
 */

const FAME = ["-w", "-M"];

/** @param {Result} r */
const failed = (r) => r.status !== "ok";
/** @param {Result} r @param {string} who */
const why = (r, who) => (r.status === "unsupported" ? `${who}: no such option` : `${who}: ${r.error ?? r.status}`);

/**
 * Both ran; same numbers is a tie, otherwise `differs` with the given reason.
 * @param {Result} ours
 * @param {Result} theirs
 * @param {("lines" | "commits")[]} fields
 * @param {string} reasonIfDiffers
 * @returns {Outcome}
 */
function numbers(ours, theirs, fields, reasonIfDiffers) {
  if (ours.status === "unsupported") return { verdict: "ours-lacks", ours: "no such option", theirs: fields.map((f) => compact(theirs.rows, f)).join("; "), note: "not built yet" };
  if (failed(ours) || failed(theirs)) return { verdict: "not-run", ours: failed(ours) ? why(ours, "ours") : "ran", theirs: failed(theirs) ? why(theirs, "them") : "ran", note: "a tool did not run" };
  const same = fields.every((f) => sameNumbers(ours.rows, theirs.rows, f, { tolerance: 1e-6 }));
  const show = (/** @type {Result} */ r) => fields.map((f) => `${f}: ${compact(r.rows, f)}`).join("; ");
  return { verdict: same ? "tie" : "differs", ours: show(ours), theirs: show(theirs), note: same ? "same numbers" : reasonIfDiffers };
}

/** Run our CLI for text output (not --json). @param {string} dir @param {string[]} args */
function oursText(dir, args) {
  const r = spawnSync(process.execPath, [upstreamPaths().ours, "--cwd", dir, "-q", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** @param {string} dir @param {string} flag */
const oursHasFlag = (dir, flag) => !/unknown option/.test(oursText(dir, [flag]).stderr);

/** @param {() => Result} f @returns {number} median wall time in seconds over three runs */
function medianSeconds(f) {
  const t = [f(), f(), f()].map((r) => (r.ms ?? NaN) / 1000).sort((a, b) => a - b);
  return t[1];
}

/** @type {Probe[]} */
export const PROBES = [
  {
    id: "P01", feature: "Surviving lines per author (git blame -w -M)", competitor: "git-fame", fixture: "basic",
    run: ({ dir }) => numbers(runOurs(dir), runGitFame(dir, FAME), ["lines"], "unexpected: the two blame the same files with the same flags"),
  },
  {
    id: "P02", feature: "Commit count per author", competitor: "git-fame", fixture: "basic",
    run: ({ dir }) => numbers(runOurs(dir), runGitFame(dir, FAME), ["commits"], "git-fame counts commits per author differently"),
  },
  {
    id: "P03", feature: "Commit count per author", competitor: "git-who", fixture: "basic",
    run: ({ dir }) => numbers(runOurs(dir), runGitWho(dir), ["commits"], "git-who counts commits differently"),
  },
  {
    id: "P04", feature: "Same surviving lines as a plain blame tally", competitor: "git-extras (git summary --line)", fixture: "basic",
    run: ({ dir }) => {
      const ours = runOurs(dir);
      const theirs = runGitExtras(dir);
      if (failed(ours) || failed(theirs)) return { verdict: "not-run", ours: ours.status, theirs: why(theirs, "them"), note: "a tool did not run" };
      // git-extras keys by name, ours by address: key ours by name too.
      const byName = new Map(ours.extra.authors.map((/** @type {any} */ a) => [a.author.toLowerCase(), { lines: a.lines }]));
      const same = sameNumbers(byName, theirs.rows, "lines");
      return { verdict: same ? "tie" : "differs", ours: compact(byName, "lines"), theirs: compact(theirs.rows, "lines"), note: same ? "same numbers" : "git summary --line blames without -w -M" };
    },
  },
  {
    id: "P05", feature: "--since / --until window", competitor: "git-fame", fixture: "basic",
    run: ({ dir }) => {
      const w = ["--since", "2026-02-01", "--until", "2026-04-01"];
      return numbers(runOurs(dir, w), runGitFame(dir, [...FAME, ...w]), ["lines", "commits"], "git-fame applies the window to the blame side as well; this tool windows only the commit side (issue #11)");
    },
  },
  {
    id: "P06", feature: "Blame ignore-revs file (a reformat commit does not take ownership)", competitor: "git-fame", fixture: "reformat",
    run: ({ dir }) => numbers(runOurs(dir), runGitFame(dir, [...FAME, "--ignore-revs-file", ".git-blame-ignore-revs"]), ["lines"], "this tool does not read .git-blame-ignore-revs yet"),
  },
  {
    id: "P07", feature: "Bots left out of both shares by default", competitor: "git-fame", fixture: "bots",
    run: ({ dir }) => {
      const ours = runOurs(dir);
      const theirs = runGitFame(dir, [...FAME, "--ignore-author", "bot"]);
      if (failed(ours)) return { verdict: "not-run", ours: why(ours, "ours"), theirs: "-", note: "ours did not run" };
      const botRows = [...ours.rows.keys()].filter((m) => /\[bot\]@/.test(m)).length;
      const lacks = theirs.status === "unsupported";
      if (botRows > 0) return { verdict: "differs", ours: `${botRows} bot identities counted as authors`, theirs: lacks ? "no option to leave bots out; its table counts them" : "has an option", note: "this tool does not exclude bots yet" };
      return { verdict: lacks ? "ours-only" : "differs", ours: `bots excluded: ${ours.extra.bots.excluded.length} identities`, theirs: lacks ? "no option to leave bots out; its table counts them" : "has an option", note: "git-fame 4.2.1 --help lists no author filter" };
    },
  },
  {
    id: "P08", feature: "Co-authored-by credit, equal split", competitor: "git-fame (--auth share)", fixture: "pairing",
    run: ({ dir }) => numbers(runOurs(dir, ["--co-authors", "share"]), runGitFame(dir, [...FAME, "--auth", "share"]), ["lines", "commits"], "unexpected: both split each line and commit equally between the author and every trailer identity"),
  },
  {
    id: "P09", feature: "An Assisted-by trailer with no address does not stop the run", competitor: "git-fame (--auth share)", fixture: "coauthor",
    run: ({ dir }) => {
      const ours = runOurs(dir, ["--co-authors", "share"]);
      const theirs = runGitFame(dir, [...FAME, "--auth", "share"]);
      if (ours.status === "unsupported") return { verdict: "ours-lacks", ours: "no such option", theirs: theirs.status === "ok" ? "ran" : why(theirs, "them"), note: "not built yet" };
      return { verdict: ours.status === "ok" && theirs.status === "error" ? "ours-only" : "differs", ours: ours.status === "ok" ? "ran to the end" : ours.status, theirs: theirs.status === "error" ? `stopped: ${theirs.error}` : theirs.status, note: "Assisted-by: AGENT:model-1 has no <address>" };
    },
  },
  {
    id: "P10", feature: "AI-assistant breakdown from documented trailers", competitor: "git-fame", fixture: "coauthor",
    run: ({ dir }) => {
      const ours = runOurs(dir, ["--ai-breakdown"]);
      const theirs = runGitFame(dir, ["--ai-breakdown"]);
      if (ours.status === "unsupported") return { verdict: "ours-lacks", ours: "no such option", theirs: why(theirs, "them"), note: "not built yet" };
      const a = ours.extra.aiAssisted;
      return { verdict: theirs.status === "unsupported" ? "ours-only" : "differs", ours: `${a.lines} lines, ${a.commits} commits, by ${a.assistants.map((/** @type {any} */ x) => x.name).join("+")}`, theirs: why(theirs, "them"), note: "counts trailers, not authorship" };
    },
  },
  {
    id: "P11", feature: "Surviving lines per file extension", competitor: "git-fame (--bytype)", fixture: "dirs",
    run: ({ dir }) => {
      const ours = runOurs(dir, ["--group-by", "ext"]);
      const theirs = runGitFame(dir, [...FAME, "--bytype"]);
      if (ours.status === "unsupported") return { verdict: "ours-lacks", ours: "no such option", theirs: failed(theirs) ? why(theirs, "them") : "per-extension totals", note: "not built yet" };
      if (failed(ours) || failed(theirs)) return { verdict: "not-run", ours: ours.status, theirs: theirs.status, note: "a tool did not run" };
      /** @type {Map<string, {lines: number}>} */
      const o = new Map(ours.extra.grouping.groups.map((/** @type {any} */ g) => [g.key, { lines: g.lines }]));
      /** @type {Map<string, {lines: number}>} */
      const t = new Map(Object.entries(theirs.extra.total).filter(([k]) => k.startsWith(".")).map(([k, v]) => [k, { lines: Number(v) }]));
      const same = sameNumbers(o, t, "lines");
      return { verdict: same ? "tie" : "differs", ours: compact(o, "lines"), theirs: compact(t, "lines"), note: same ? "same totals per extension" : "totals differ" };
    },
  },
  {
    id: "P12", feature: "Ownership per directory", competitor: "git-who (tree)", fixture: "dirs",
    run: ({ dir }) => {
      const ours = runOurs(dir, ["--group-by", "dir"]);
      const tree = runGitWhoTree(dir);
      if (ours.status === "unsupported") return { verdict: "ours-lacks", ours: "no such option", theirs: tree.status === "ok" ? "tree view: author per path" : why(tree, "them"), note: "not built yet" };
      const g = ours.extra.grouping.groups.map((/** @type {any} */ x) => `${x.key}: ${x.authors[0]?.author} ${x.lines} lines`).join("; ");
      return { verdict: "differs", ours: g, theirs: tree.status === "ok" ? "tree view: leading author per path, ranked by commits" : why(tree, "them"), note: "different measure: git-who ranks by edits, this tool by surviving lines" };
    },
  },
  {
    id: "P13", feature: "Several repositories in one run", competitor: "git-fame (-R / several paths)", fixture: "basic",
    run: ({ dir, build }) => {
      const second = build("basic");
      const theirs = runGitFame(dir, [...FAME, second]);
      return { verdict: "ours-lacks", ours: "one repository per run (issue #34)", theirs: theirs.status === "ok" ? `aggregated: ${compact(theirs.rows, "lines")}` : why(theirs, "them"), note: "stated loss" };
    },
  },
  {
    id: "P14", feature: "Output formats", competitor: "git-fame", fixture: "basic",
    run: ({ dir }) => {
      const ours = ["--json", "--csv", "--markdown", "--svg", "--yaml"].filter((f) => oursHasFlag(dir, f)).map((f) => f.slice(2));
      const fame = ["json", "csv", "md", "svg", "yaml"].filter((f) => gitFamePrints(dir, f));
      const lacking = fame.filter((f) => !ours.includes(f === "md" ? "markdown" : f));
      return { verdict: lacking.length ? "ours-lacks" : "tie", ours: ours.join(", "), theirs: fame.join(", "), note: lacking.length ? `ours has no ${lacking.join(", ")}` : "every format git-fame prints, ours prints" };
    },
  },
  {
    id: "P15", feature: "Deterministic file sampling (--sample, --seed)", competitor: "git-fame", fixture: "wide",
    run: ({ dir }) => {
      const a = runOurs(dir, ["--sample", "5", "--seed", "x"]);
      const b = runOurs(dir, ["--sample", "5", "--seed", "x"]);
      const theirs = runGitFame(dir, ["--sample", "5"]);
      if (failed(a) || failed(b)) return { verdict: "not-run", ours: why(a, "ours"), theirs: "-", note: "ours did not run" };
      const same = sameNumbers(a.rows, b.rows, "lines");
      return { verdict: same && theirs.status === "unsupported" ? "ours-only" : "differs", ours: `two runs ${same ? "agree" : "differ"}: ${a.extra.sample.filesSampled} of ${a.extra.sample.filesTotal} files`, theirs: theirs.status === "unsupported" ? "no sampling option" : theirs.status, note: "same seed, same files, same numbers" };
    },
  },
  {
    id: "P16", feature: "Suggest .mailmap lines for one person on two addresses", competitor: "git-fame", fixture: "split",
    run: ({ dir }) => {
      const ours = oursText(dir, ["--identities"]);
      const theirs = runGitFame(dir, ["--identities"]);
      const found = ours.status === 0 && ours.stdout.includes("ada@laptop.example.org");
      return { verdict: found && theirs.status === "unsupported" ? "ours-only" : "differs", ours: found ? "found the split and printed .mailmap lines" : "did not find it", theirs: theirs.status === "unsupported" ? "no such option" : theirs.status, note: "git-fame prints no suggestions and groups authors by name, so it merges one name on two addresses without saying so and never links two different names" };
    },
  },
  {
    id: "P17", feature: "Wall time, 120 files of 40 lines", competitor: "git-fame", fixture: "wide",
    run: ({ dir }) => {
      const full = medianSeconds(() => runOurs(dir));
      const sampled = medianSeconds(() => runOurs(dir, ["--sample", "5"]));
      const fame = medianSeconds(() => runGitFame(dir, FAME));
      return { verdict: "info", ours: `${full.toFixed(2)} s for every file, ${sampled.toFixed(2)} s with --sample 5`, theirs: `${fame.toFixed(2)} s`, note: "median of three runs on this machine; not a claim about large repositories (issue #35)" };
    },
  },
  {
    id: "P18", feature: "Visual workspace for a repository", competitor: "git-truck", fixture: "basic",
    run: () => {
      const s = fetchedStatus("git-truck");
      return { verdict: "ours-lacks", ours: "terminal tables only", theirs: `browser visualisation (${s.note})`, note: "stated loss; git-truck prints no numbers to compare" };
    },
  },
  {
    id: "P19", feature: "Burndown of lines over time, per author", competitor: "hercules", fixture: "basic",
    run: () => {
      const s = fetchedStatus("hercules");
      return { verdict: "ours-lacks", ours: "a single point in time (issues #15, #18)", theirs: s.ran ? s.note : `not run: ${s.note}`, note: "stated loss; hercules was last released in 2020" };
    },
  },
  {
    id: "P20", feature: "git-fame shows surviving share and commit share side by side (distribution column)", competitor: "git-fame (distribution column)", fixture: "split",
    run: ({ dir }) => {
      // git-fame's text table: a `distribution` column holding loc/commits/files shares as "x.x/y.y/z.z" per author.
      const fame = spawnSync(upstreamPaths().gitFame, [...FAME, dir], { encoding: "utf8" });
      const fameOut = fame.stdout ?? "";
      const fameHeader = /^\|\s*Author\s*\|.*\|\s*distribution\s*\|\s*$/m.test(fameOut);
      const fameTriples = (fameOut.match(/\|\s*\d+\.\d\/\d+\.\d\/\d+\.\d\s*\|/g) ?? []).length;
      const fameShows = fame.status === 0 && fameHeader && fameTriples > 0;
      // surviving-lines' own text table: a `share` column for lines and one for commits.
      const ours = oursText(dir, []);
      const oursShows = ours.status === 0 && /lines\s+share\s+commits\s+share/.test(ours.stdout);
      const verdict = fame.status !== 0 ? "not-run" : fameShows && oursShows ? "tie" : fameShows ? "ours-lacks" : oursShows ? "ours-only" : "differs";
      return {
        verdict,
        ours: oursShows ? "table prints a lines share and a commits share side by side" : "no lines and commits share columns side by side",
        theirs: fameShows ? `distribution column, ${fameTriples} author rows of loc/commits/files shares` : fame.status !== 0 ? `not run: ${fame.stderr?.trim().split("\n").pop() ?? "exit " + fame.status}` : "no distribution column",
        note: "both put the surviving-line share next to the commit share; git-fame also prints a files share in the same cell",
      };
    },
  },
  {
    id: "P21", feature: "Reformat commit nobody listed: detected and the numbers with it ignored", competitor: "git-fame", fixture: "quoteIndent",
    run: ({ dir }) => {
      // No ignore file in this fixture, so the only way to learn the formatter's commit is the reformat heuristic.
      const ours = runOurs(dir);
      const theirs = runGitFame(dir, FAME);
      if (failed(ours) || failed(theirs)) return { verdict: "not-run", ours: failed(ours) ? why(ours, "ours") : "ran", theirs: failed(theirs) ? why(theirs, "them") : "ran", note: "a tool did not run" };
      const suspects = ours.extra.reformat?.suspects ?? [];
      const ignored = ours.extra.reformat?.ifIgnored?.authors ?? [];
      const bobSuspected = suspects.some((/** @type {any} */ s) => s.mail === "bob@example.com");
      const adaCredited = ignored.some((/** @type {any} */ a) => a.mail === "ada@example.com" && a.lines > 0) && !ignored.some((/** @type {any} */ a) => a.mail === "bob@example.com");
      const fameCreditsBob = (theirs.rows?.get("bob@example.com")?.lines ?? 0) > 0;
      const oursOk = bobSuspected && adaCredited;
      return {
        verdict: oursOk && fameCreditsBob ? "ours-only" : "differs",
        ours: oursOk ? `suspect ${suspects.map((/** @type {any} */ s) => s.shortSha).join(", ")} (Bob); ignored: ${ignored.map((/** @type {any} */ a) => `${a.author}=${a.lines}`).join(", ")}` : "no suspect, or the ignored numbers do not credit Ada",
        theirs: `lines: ${compact(theirs.rows, "lines")}; no suspect list`,
        note: "git-fame 4.2.1 has no reformat detection, so its plain numbers credit the formatter with the lines it rewrote",
      };
    },
  },
];

/** Features a competitor has that no probe can run, kept visible. */
export const LOSSES = [
  { feature: "Cost estimates (COCOMO, person-hours) from the history", who: "git-fame --cost", issue: "Not planned: the tool measures survival, not effort." },
  { feature: "A hosted badge and API for public GitHub repositories", who: "git-fame", issue: "Not planned: the tool needs no server (ROADMAP.md)." },
  { feature: "Install through pip, conda, snap, docker or Homebrew", who: "git-fame, git-extras", issue: "This tool installs with npm or npx only (Node 22 or newer)." },
  { feature: "A time series of surviving lines", who: "hercules, git-of-theseus", issue: "Issues #15 and #18 are open." },
  { feature: "A --since / --until window that also applies to the blame side", who: "git-fame", issue: "Issue #11 is open." },
];
