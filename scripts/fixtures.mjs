// Deterministic fixture repositories, shared by the tests and by the comparison harness
// (scripts/compare). Every commit has a fixed author, date and message, so a fixture built twice
// has the same commit ids. Node built-ins only.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** name and address per person. The bot rows use the identities GitHub gives its apps. */
export const PEOPLE = {
  ada: ["Ada", "ada@example.com"],
  bob: ["Bob", "bob@example.com"],
  charlie: ["Charlie", "charlie@example.com"],
  dependabot: ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"],
  renovate: ["renovate[bot]", "29139614+renovate[bot]@users.noreply.github.com"],
  // Names and addresses that merely look like a bot's. They are people and must be counted.
  botHawkins: ["Bot Hawkins", "bot.hawkins@example.com"],
  botticelli: ["Botticelli", "botticelli@example.com"],
  // The same name on a second address, which --identities should link to ada.
  adaLaptop: ["Ada", "ada@laptop.example.org"],
  // Two addresses for one person, for the identity hint (test/identity-hint.test.mjs).
  troy: ["Troy Goode", "troy@laptop.example"],
  troyWork: ["Troy Goode", "troy@work.example"],
  // A formatter whose commit only switches quotes (test/history.test.mjs).
  fiona: ["Fiona Formatter", "fiona@formatter.example"],
};

/** @param {string} prefix @param {number} n @returns {string} n lines, each ending in a newline */
export const lines = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix} ${i}`).join("\n") + "\n";

/** @param {string} dir @param {string[]} args @param {Record<string, string>} [env] */
export function git(dir, args, env = {}) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

/** @param {string} prefix a name for the temporary directory @returns {string} the new repository */
export function createRepo(prefix = "sl-fixture-") {
  // The real path, not the symlinked one: on macOS $TMPDIR is under /var, a symlink to /private/var, and
  // git-who prints an empty tree for a repository reached through it.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "core.autocrlf", "false"]);
  return dir;
}

/**
 * Write files, then commit them as one person on one date.
 * @param {string} dir
 * @param {keyof typeof PEOPLE} who
 * @param {string} date an ISO timestamp
 * @param {string} message the whole commit message, trailers included
 * @param {Record<string, string | Buffer | null>} files path to content; null removes the file
 * @returns {string} the new commit id
 */
export function commitAs(dir, who, date, message, files) {
  return commitAsIdentity(dir, PEOPLE[who], date, message, files);
}

/**
 * Like commitAs, for an identity that is not in PEOPLE (the hint-hook tests need names PEOPLE does not have).
 * @param {string} dir
 * @param {[string, string]} identity the author name and address
 * @param {string} date an ISO timestamp
 * @param {string} message the whole commit message, trailers included
 * @param {Record<string, string | Buffer | null>} files path to content; null removes the file
 * @param {[string, string]} [committer] the committer name and address; the author when omitted
 * @returns {string} the new commit id
 */
export function commitAsIdentity(dir, identity, date, message, files, committer) {
  const [name, email] = identity;
  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const removed = [];
  for (const [path, content] of Object.entries(files)) {
    if (content === null) {
      removed.push(path);
    } else {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
      added.push(path);
    }
  }
  if (added.length) git(dir, ["add", "--", ...added]);
  if (removed.length) git(dir, ["rm", "-q", "--", ...removed]);
  const env = { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: committer?.[0] ?? name, GIT_COMMITTER_EMAIL: committer?.[1] ?? email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  git(dir, ["commit", "-q", "--allow-empty", "-m", message], env);
  return git(dir, ["rev-parse", "HEAD"]).trim();
}

/** @param {string} dir */
export const removeRepo = (dir) => rmSync(dir, { recursive: true, force: true });


/** True on Windows, where the POSIX shell hooks and shims run only through Git Bash. */
export const WINDOWS = process.platform === "win32";

/**
 * A path with forward slashes on Windows, so a POSIX sh (Git Bash) and the hook's JSON-reading patterns accept it.
 * Other platforms get the path unchanged: a backslash can be part of a name there.
 * @param {string} p
 */
export const posixPath = (p) => (WINDOWS ? p.replace(/\\/g, "/") : p);

/**
 * The environment for a hook child process: PATH, HOME, the Windows variables a child needs to start, and
 * CLAUDE_PLUGIN_ROOT (forward slashes on Windows). `extra` overrides any of them.
 * @param {string} pluginRoot @param {Record<string, string>} [extra]
 * @returns {Record<string, string>}
 */
export function hookEnv(pluginRoot, extra = {}) {
  /** @type {Record<string, string | undefined>} */
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, CLAUDE_PLUGIN_ROOT: posixPath(pluginRoot) };
  if (WINDOWS) for (const k of ["SystemRoot", "USERPROFILE", "TEMP", "TMP", "ComSpec"]) env[k] = process.env[k];
  for (const [k, v] of Object.entries(extra)) env[k] = k === "CLAUDE_PLUGIN_ROOT" ? posixPath(v) : v;
  return /** @type {Record<string, string>} */ (Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)));
}

/** Option for node:test: skip a test that runs a POSIX sh shim as `git` or `node`, which Windows cannot execute by name. */
export const SKIP_ON_WINDOWS_SHIM = { skip: WINDOWS ? "POSIX sh shim; covered on Linux and macOS" : false };

const D = (m, d) => `2026-${m}-${d}T10:00:00Z`;

/**
 * A split person in a grouped repository (test/identity-hint.test.mjs). Ada writes lib/a.js (12 lines) and, from her
 * second address, lib/b.js (8 lines); Bob writes docs/c.md (10 lines). Grouped by directory, lib and docs are two groups.
 */
function groupSplit() {
  const dir = createRepo("sl-group-split-");
  commitAs(dir, "ada", D("01", "10"), "ada: desktop", { "lib/a.js": lines("a", 12) });
  commitAs(dir, "adaLaptop", D("01", "11"), "ada: laptop", { "lib/b.js": lines("b", 8) });
  commitAs(dir, "bob", D("01", "12"), "bob: notes", { "docs/c.md": lines("c", 10) });
  return dir;
}

/**
 * Two people who each write from two addresses (test/identity-hint.test.mjs). Ada writes 20 lines from her two addresses,
 * Troy Goode 16 from his. Both names are split, so the identity hint names both.
 */
function troySplit() {
  const dir = createRepo("sl-troy-split-");
  commitAs(dir, "ada", D("01", "10"), "ada: desktop", { "src/a.js": lines("a", 12) });
  commitAs(dir, "adaLaptop", D("01", "11"), "ada: laptop", { "src/b.js": lines("b", 8) });
  commitAs(dir, "troy", D("01", "12"), "troy: laptop", { "src/c.js": lines("c", 10) });
  commitAs(dir, "troyWork", D("01", "13"), "troy: work", { "src/d.js": lines("d", 6) });
  return dir;
}

/**
 * Two addresses for Ada, one line each way, for the bus factor under --merge-identities (test/merge-identities.test.mjs).
 * Ada writes 6 lines from each address (12 in all), Bob 10 and Charlie 8. Unmerged, Bob and Charlie reach half of the 30
 * lines (the top two are Bob and Charlie); merged, Ada holds 12 of 30 and Bob takes the bus factor to two with Ada.
 */
function splitBus() {
  const dir = createRepo("sl-split-bus-");
  commitAs(dir, "ada", D("01", "10"), "ada: desktop", { "src/a.js": lines("a", 6) });
  commitAs(dir, "adaLaptop", D("01", "11"), "ada: laptop", { "src/b.js": lines("b", 6) });
  commitAs(dir, "bob", D("01", "12"), "bob: c", { "src/c.js": lines("c", 10) });
  commitAs(dir, "charlie", D("01", "13"), "charlie: d", { "src/d.js": lines("d", 8) });
  return dir;
}

/**
 * A formatter commit with a split person (test/merge-identities.test.mjs). Ada writes src/app.js (20 single-quoted lines)
 * and src/keep.js (5 lines) from her desktop address; Bob switches every quote in app.js to a double one; Ada's laptop
 * address writes src/b.js (8 lines). Corrected, Ada holds 33 lines; plain, Bob holds 20 and Ada 13 across her two addresses.
 */
function reformatSplit() {
  const dir = createRepo("sl-reformat-split-");
  commitAs(dir, "ada", D("01", "10"), "ada: app", {
    "src/app.js": Array.from({ length: 20 }, (_, i) => `const s${i} = 'value ${i}';`).join("\n") + "\n",
    "src/keep.js": lines("keep", 5),
  });
  commitAs(dir, "bob", D("02", "01"), "style: switch app.js to double quotes", { "src/app.js": Array.from({ length: 20 }, (_, i) => `const s${i} = "value ${i}";`).join("\n") + "\n" });
  commitAs(dir, "adaLaptop", D("03", "01"), "ada: laptop", { "src/b.js": lines("b", 8) });
  return dir;
}

/** Ada 11 and Bob 10 surviving lines; Ada 1 commit and Bob 2; a binary file that is skipped. */
function basic() {
  const dir = createRepo("sl-basic-");
  commitAs(dir, "ada", D("01", "10"), "ada: initial", { "src/a.js": lines("line", 10), "src/b.js": lines("b", 5), "logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]) });
  commitAs(dir, "bob", D("03", "10"), "bob: rewrite tail, add c", { "src/a.js": ["line 0", "line 1", "line 2", "line 3", "line 4", "line 5", "bob 6", "bob 7", "bob 8", "bob 9"].join("\n") + "\n", "src/c.js": lines("c", 6) });
  git(dir, ["mv", "src/b.js", "src/renamed.js"]);
  commitAs(dir, "bob", D("03", "11"), "bob: rename b", {});
  return dir;
}

/**
 * Ada writes src/app.js (20 lines), Bob reformats every one of them, Ada adds 10 lines elsewhere,
 * then Ada records Bob's reformat commit in .git-blame-ignore-revs (2 lines: a comment and the id).
 * Without the file Bob holds src/app.js; with it Ada does.
 */
function reformat() {
  const dir = createRepo("sl-reformat-");
  commitAs(dir, "ada", D("01", "10"), "ada: app", { "src/app.js": lines("line", 20) });
  const formatId = commitAs(dir, "bob", D("02", "01"), "bob: run the formatter", { "src/app.js": Array.from({ length: 20 }, (_, i) => `line ${i};`).join("\n") + "\n" });
  commitAs(dir, "ada", D("03", "01"), "ada: extra", { "src/extra.js": lines("extra", 10) });
  commitAs(dir, "ada", D("03", "02"), "ada: ignore the formatter commit", { ".git-blame-ignore-revs": `# formatter\n${formatId}\n` });
  return dir;
}

/** Ada 11, Bob 6, Botticelli 4 and Bot Hawkins 2 lines are people; dependabot holds 17 and renovate 3. */
function bots() {
  const dir = createRepo("sl-bots-");
  commitAs(dir, "ada", D("01", "10"), "ada: a", { "src/a.js": lines("a", 10) });
  commitAs(dir, "bob", D("01", "11"), "bob: b", { "src/b.js": lines("b", 6) });
  commitAs(dir, "botticelli", D("01", "12"), "botticelli: t", { "src/t.js": lines("t", 4) });
  commitAs(dir, "botHawkins", D("01", "13"), "bot hawkins: h", { "src/h.js": lines("h", 2) });
  commitAs(dir, "dependabot", D("02", "01"), "chore(deps): bump one", { "docs/deps.txt": lines("dep", 12) });
  commitAs(dir, "dependabot", D("02", "02"), "chore(deps): bump two", { "docs/deps2.txt": lines("dep2", 5) });
  commitAs(dir, "renovate", D("02", "03"), "chore(deps): renovate", { "docs/ren.txt": lines("ren", 3) });
  commitAs(dir, "ada", D("02", "04"), "ada: more", { "src/a2.js": lines("a2", 1) });
  return dir;
}

/**
 * Trailers. Bob pairs with Ada (10 lines), with Claude (8 lines) and with Ada's old address (6
 * lines, which .mailmap folds into Ada); one commit carries an Assisted-by trailer with no
 * address (4 lines); one commit mentions Co-authored-by in prose, which is not a trailer (3 lines).
 */
function trailerRepo(withAssisted) {
  const dir = createRepo(withAssisted ? "sl-coauthor-" : "sl-pairing-");
  commitAs(dir, "ada", D("01", "10"), "ada: solo", { "src/solo.js": lines("solo", 10), ".mailmap": "Ada <ada@example.com> <ada@old.example.com>\n" });
  commitAs(dir, "bob", D("01", "11"), "bob: pair\n\nCo-authored-by: Ada <ada@example.com>", { "src/pair.js": lines("pair", 10) });
  commitAs(dir, "bob", D("01", "12"), "bob: with claude\n\nCo-Authored-By: Claude <noreply@anthropic.com>", { "src/claude.js": lines("claude", 8) });
  commitAs(dir, "bob", D("01", "13"), "bob: old address\n\nCo-authored-by: Ada Lovelace <ada@old.example.com>", { "src/old.js": lines("old", 6) });
  if (withAssisted) commitAs(dir, "bob", D("01", "14"), "bob: assisted\n\nAssisted-by: AGENT:model-1", { "src/assisted.js": lines("assisted", 4) });
  commitAs(dir, "bob", D("01", "15"), "bob: prose\n\nCo-authored-by: Mallory <mallory@example.com> is only mentioned in this paragraph.\nIt is not a trailer.\n\nSigned-off-by: Bob <bob@example.com>", { "src/prose.js": lines("prose", 3) });
  return dir;
}

/** Directory layout for --group-by: root, one level, and a deep path. */
function dirs() {
  const dir = createRepo("sl-dirs-");
  commitAs(dir, "ada", D("01", "10"), "ada: files", { "src/a/x.js": lines("x", 10), "docs/guide.md": lines("g", 6), "README.md": lines("r", 3) });
  commitAs(dir, "bob", D("01", "11"), "bob: files", { "src/a/y.js": lines("y", 4), "src/b/z.js": lines("z", 10), "lib/deep/er/q.js": lines("q", 5) });
  return dir;
}

/** 120 files of 40 lines over three authors, for timing. */
function wide() {
  const dir = createRepo("sl-wide-");
  const who = /** @type {const} */ (["ada", "bob", "charlie"]);
  for (let w = 0; w < 3; w++) {
    /** @type {Record<string, string>} */
    const files = {};
    for (let i = w; i < 120; i += 3) files[`pkg${i % 10}/f${i}.js`] = lines(`f${i}`, 40);
    commitAs(dir, who[w], D("01", String(10 + w)), `${who[w]}: files`, files);
  }
  return dir;
}

const coauthor = () => trailerRepo(true);
/** The same history without the Assisted-by commit: git-fame 4.2.1 stops with a traceback on a trailer that has no address. */
const pairing = () => trailerRepo(false);

/** Ada on two addresses (12 and 8 lines) and Bob on one (10 lines): one person split in two. */
function split() {
  const dir = createRepo("sl-split-");
  commitAs(dir, "ada", D("01", "10"), "ada: desktop", { "src/a.js": lines("a", 12) });
  commitAs(dir, "adaLaptop", D("01", "11"), "ada: laptop", { "src/b.js": lines("b", 8) });
  commitAs(dir, "bob", D("01", "12"), "bob: c", { "src/c.js": lines("c", 10) });
  return dir;
}

/**
 * Reformat detection (test/reformat-detect.test.mjs). Fixed authors, dates and messages, so commit ids are stable.
 *  quotes      Ada writes src/app.js (30 single-quoted lines) and Bob changes every quote to a double one;
 *              Ada then adds docs/notes.md (5 lines).
 *  indent      Ada writes src/run.js (25 long calls on one line, one tab-indented line); Bob re-indents to 4 spaces
 *              and breaks every call over four lines.
 *  pureIndent  Ada writes src/style.js (30 lines, 2 spaces); Bob re-indents it to 4 spaces and nothing else.
 *  feature     Ada writes src/app.js and src/lib.js (30 lines each); Bob adds 80 lines and changes 10 existing lines,
 *              then adds src/big.js (200 lines); Charlie renames fetchUser to loadUser in src/lib.js.
 */
function quotes() {
  const dir = createRepo("sl-quotes-");
  commitAs(dir, "ada", D("01", "10"), "ada: app", { "src/app.js": Array.from({ length: 30 }, (_, i) => `const s${i} = 'value ${i}';`).join("\n") + "\n" });
  commitAs(dir, "bob", D("02", "01"), "style: switch app.js to double quotes", { "src/app.js": Array.from({ length: 30 }, (_, i) => `const s${i} = "value ${i}";`).join("\n") + "\n" });
  commitAs(dir, "ada", D("03", "01"), "ada: notes", { "docs/notes.md": lines("note", 5) });
  return dir;
}

function indent() {
  const dir = createRepo("sl-indent-");
  const call = (/** @type {number} */ i) => `const v${i} = compute(alpha, beta, gamma, delta, epsilon, zeta, eta, theta, ${i});`;
  const broken = (/** @type {number} */ i) => [`    const v${i} = compute(`, "      alpha, beta, gamma, delta,", `      epsilon, zeta, eta, theta, ${i}`, "    );"];
  commitAs(dir, "ada", D("01", "10"), "ada: run", { "src/run.js": ["function run() {", ...Array.from({ length: 25 }, (_, i) => `  ${call(i)}`), "\treturn 1;", "}", ""].join("\n") });
  commitAs(dir, "bob", D("02", "01"), "style: 4-space indent, break long calls", { "src/run.js": ["function run() {", ...Array.from({ length: 25 }, (_, i) => broken(i)).flat(), "    return 1;", "}", ""].join("\n") });
  return dir;
}

function pureIndent() {
  const dir = createRepo("sl-pure-indent-");
  commitAs(dir, "ada", D("01", "10"), "ada: style", { "src/style.js": Array.from({ length: 30 }, (_, i) => `  const x${i} = ${i};`).join("\n") + "\n" });
  commitAs(dir, "bob", D("02", "01"), "style: 4-space indent", { "src/style.js": Array.from({ length: 30 }, (_, i) => `    const x${i} = ${i};`).join("\n") + "\n" });
  return dir;
}

/**
 * A reformat that changes quotes and indentation together, with no .git-blame-ignore-revs file, so nobody listed it
 * (compare probe P21). Ada writes src/app.js (20 lines, 2 spaces, single quotes); Bob changes every line to 4 spaces
 * and double quotes; Ada adds docs/notes.md (5 lines). Plain blame gives Bob 20 lines; ignored, Ada holds all 25.
 */
function quoteIndent() {
  const dir = createRepo("sl-quote-indent-");
  commitAs(dir, "ada", D("01", "10"), "ada: app", { "src/app.js": Array.from({ length: 20 }, (_, i) => `  const s${i} = 'value ${i}';`).join("\n") + "\n" });
  commitAs(dir, "bob", D("02", "01"), "style: 4 spaces and double quotes", { "src/app.js": Array.from({ length: 20 }, (_, i) => `    const s${i} = "value ${i}";`).join("\n") + "\n" });
  commitAs(dir, "ada", D("03", "01"), "ada: notes", { "docs/notes.md": lines("note", 5) });
  return dir;
}

function feature() {
  const dir = createRepo("sl-feature-");
  commitAs(dir, "ada", D("01", "10"), "ada: app and lib", {
    "src/app.js": lines("line", 30),
    "src/lib.js": Array.from({ length: 30 }, (_, i) => `function fetchUser${i}() { return ${i}; }`).join("\n") + "\n",
  });
  const changed = Array.from({ length: 10 }, (_, i) => `changed ${i}`);
  const kept = Array.from({ length: 20 }, (_, i) => `line ${i + 10}`);
  const added = Array.from({ length: 80 }, (_, i) => `feature ${i}`);
  commitAs(dir, "bob", D("02", "01"), "feat: checkout", { "src/app.js": [...changed, ...kept, ...added].join("\n") + "\n" });
  commitAs(dir, "bob", D("02", "02"), "feat: big module", { "src/big.js": lines("big", 200) });
  commitAs(dir, "charlie", D("02", "03"), "refactor: rename fetchUser", { "src/lib.js": Array.from({ length: 30 }, (_, i) => `function loadUser${i}() { return ${i}; }`).join("\n") + "\n" });
  return dir;
}

/**
 * The --reviewers view (test/reviewers.test.mjs). The ref commit is Bob's on 2026-04-12, so that is the as-of date.
 *  lib/old.js   Charlie writes 40 lines on 2024-01-05: the most lines, and more than a year before the as-of date.
 *  lib/core.js  Ada writes 20 lines on 2026-01-10, with .mailmap folding her second address into her own.
 *  lib/laptop.js Ada's second address writes 6 lines on 2026-04-10, so her last commit there is that one.
 *  lib/bob.js   Bob writes 8 lines on 2026-04-01.
 *  lib/deps.txt Dependabot writes 12 lines on 2026-04-02: a bot, so it is left out.
 *  docs/note.md Bob's ref commit does not touch lib/.
 */
function owners() {
  const dir = createRepo("sl-owners-");
  commitAs(dir, "charlie", "2024-01-05T10:00:00Z", "charlie: old module", { "lib/old.js": lines("old", 40) });
  commitAs(dir, "ada", D("01", "10"), "ada: core", { "lib/core.js": lines("core", 20), ".mailmap": "Ada <ada@example.com> <ada@laptop.example.org>\n" });
  commitAs(dir, "bob", D("04", "01"), "bob: helper", { "lib/bob.js": lines("bob", 8) });
  commitAs(dir, "dependabot", D("04", "02"), "chore(deps): bump", { "lib/deps.txt": lines("dep", 12) });
  commitAs(dir, "adaLaptop", D("04", "10"), "ada: laptop", { "lib/laptop.js": lines("laptop", 6) });
  commitAs(dir, "bob", D("04", "12"), "bob: notes", { "docs/note.md": lines("note", 2) });
  return dir;
}

/**
 * The --reviewers suggestion with a formatter (test/reviewers.test.mjs). The table counts Bob's quote change as his;
 * the suggestion counts the lines as they were before it.
 *  lib/app.js   Ada writes 30 single-quoted lines on 2026-01-10; Bob switches every quote on 2026-02-01 (30 lines).
 *  lib/extra.js Ada writes 10 lines on 2026-03-01.
 *  lib/old.js   Charlie writes 3 lines on 2024-01-05, more than a year before the as-of date.
 *  docs/note.md Ada's ref commit on 2026-04-12 does not touch lib/.
 */
function reviewFormat() {
  const dir = createRepo("sl-review-format-");
  commitAs(dir, "ada", D("01", "10"), "ada: app", { "lib/app.js": Array.from({ length: 30 }, (_, i) => `const s${i} = 'value ${i}';`).join("\n") + "\n" });
  commitAs(dir, "bob", D("02", "01"), "style: switch app.js to double quotes", { "lib/app.js": Array.from({ length: 30 }, (_, i) => `const s${i} = "value ${i}";`).join("\n") + "\n" });
  commitAs(dir, "ada", D("03", "01"), "ada: extra", { "lib/extra.js": lines("extra", 10) });
  commitAs(dir, "charlie", "2024-01-05T10:00:00Z", "charlie: old", { "lib/old.js": lines("old", 3) });
  commitAs(dir, "ada", D("04", "12"), "ada: notes", { "docs/note.md": lines("note", 2) });
  return dir;
}

/**
 * The --history view (test/history.test.mjs). The ref commit is Ada's on 2026-04-12, so that is the as-of date.
 *  lib/old.js    Charlie writes 40 lines on 2024-01-05: the first commit at the path.
 *  lib/app.js    Ada writes 30 single-quoted lines on 2025-01-10; Fiona switches every quote on 2025-02-01 (format only).
 *  lib/b.js      Bob writes 8 lines on 2025-03-01, the day of Troy's first commit: a tie, ordered by address.
 *  lib/t.js      Troy writes 10 lines on 2025-03-01 from his laptop address.
 *  lib/w.js      Troy writes 6 lines on 2025-04-01 from his work address: one name, so one person when merged.
 *  docs/note.md  Ada's ref commit does not touch lib/.
 */
function history() {
  const dir = createRepo("sl-history-");
  commitAs(dir, "charlie", "2024-01-05T10:00:00Z", "charlie: old", { "lib/old.js": lines("old", 40) });
  commitAs(dir, "ada", "2025-01-10T10:00:00Z", "ada: app", { "lib/app.js": Array.from({ length: 30 }, (_, i) => `const s${i} = 'value ${i}';`).join("\n") + "\n" });
  commitAs(dir, "fiona", "2025-02-01T10:00:00Z", "style: switch app.js to double quotes", { "lib/app.js": Array.from({ length: 30 }, (_, i) => `const s${i} = "value ${i}";`).join("\n") + "\n" });
  commitAs(dir, "bob", "2025-03-01T10:00:00Z", "bob: b", { "lib/b.js": lines("b", 8) });
  commitAs(dir, "troy", "2025-03-01T10:00:00Z", "troy: laptop", { "lib/t.js": lines("t", 10) });
  commitAs(dir, "troyWork", "2025-04-01T10:00:00Z", "troy: work", { "lib/w.js": lines("w", 6) });
  commitAs(dir, "ada", D("04", "12"), "ada: notes", { "docs/note.md": lines("note", 2) });
  return dir;
}

/**
 * Five people whose last commits at lib/ are all in 2023, so none is active at the as-of date (2026-04-12, Ada's ref
 * commit). Lines: Ada 10, Bob 9, Charlie 8, Botticelli 7, Bot Hawkins 6 (Bot Hawkins is a person, not a bot).
 */
function staleOwners() {
  const dir = createRepo("sl-stale-owners-");
  commitAs(dir, "ada", "2023-03-01T10:00:00Z", "ada: a", { "lib/a.js": lines("a", 10) });
  commitAs(dir, "bob", "2023-03-02T10:00:00Z", "bob: b", { "lib/b.js": lines("b", 9) });
  commitAs(dir, "charlie", "2023-03-03T10:00:00Z", "charlie: c", { "lib/c.js": lines("c", 8) });
  commitAs(dir, "botticelli", "2023-03-04T10:00:00Z", "botticelli: t", { "lib/t.js": lines("t", 7) });
  commitAs(dir, "botHawkins", "2023-03-05T10:00:00Z", "bot hawkins: h", { "lib/h.js": lines("h", 6) });
  commitAs(dir, "ada", D("04", "12"), "ada: notes", { "docs/note.md": lines("note", 2) });
  return dir;
}

/**
 * One person on two addresses, one of them stale (test/reviewers.test.mjs). The ref commit is adaLaptop's on 2026-04-12.
 *  lib/a.js  Ada writes 10 lines on 2023-03-01 (her old address).
 *  lib/c.js  Ada's second address writes 6 lines on 2026-04-10; same name, so one person, active.
 *  lib/b.js  Bob writes 5 lines on 2023-03-02 and has no later commit: inactive.
 */
function twoAddressStale() {
  const dir = createRepo("sl-two-address-stale-");
  commitAs(dir, "ada", "2023-03-01T10:00:00Z", "ada: old", { "lib/a.js": lines("a", 10) });
  commitAs(dir, "bob", "2023-03-02T10:00:00Z", "bob: old", { "lib/b.js": lines("b", 5) });
  commitAs(dir, "adaLaptop", D("04", "10"), "ada: laptop", { "lib/c.js": lines("c", 6) });
  commitAs(dir, "adaLaptop", D("04", "12"), "ada: notes", { "docs/note.md": lines("note", 2) });
  return dir;
}

/**
 * The bus factor (test/bus-factor.test.mjs). Ada writes 60 lines in src/a.js, Bob 25 in src/b.js and Charlie 15 in
 * docs/c.md. Dependabot writes 50 lines in docs/deps.txt: a bot, so the run counts 100 lines and docs/ counts 15.
 */
function busfactor() {
  const dir = createRepo("sl-busfactor-");
  commitAs(dir, "ada", D("01", "10"), "ada: a", { "src/a.js": lines("a", 60) });
  commitAs(dir, "bob", D("01", "11"), "bob: b", { "src/b.js": lines("b", 25) });
  commitAs(dir, "charlie", D("01", "12"), "charlie: c", { "docs/c.md": lines("c", 15) });
  commitAs(dir, "dependabot", D("01", "13"), "chore(deps): bump", { "docs/deps.txt": lines("dep", 50) });
  return dir;
}

/**
 * A suspected reformat that changes the bus factor (test/bus-factor.test.mjs). Ada writes src/app.js (30 single-quoted
 * lines) and src/c.js (25 lines); Charlie writes src/b.js (25 lines); Bob changes every quote in app.js (format only).
 * With Bob's commit counted, Bob (30) and Ada (25) together hold 2 of 80 lines; ignored, Ada alone holds 55 of 80, so 1.
 */
function reformatBus() {
  const dir = createRepo("sl-reformat-bus-");
  commitAs(dir, "ada", D("01", "10"), "ada: app", { "src/app.js": Array.from({ length: 30 }, (_, i) => `const s${i} = 'value ${i}';`).join("\n") + "\n" });
  commitAs(dir, "ada", D("01", "11"), "ada: c", { "src/c.js": lines("c", 25) });
  commitAs(dir, "charlie", D("01", "12"), "charlie: b", { "src/b.js": lines("b", 25) });
  commitAs(dir, "bob", D("02", "01"), "style: switch app.js to double quotes", { "src/app.js": Array.from({ length: 30 }, (_, i) => `const s${i} = "value ${i}";`).join("\n") + "\n" });
  return dir;
}

/**
 * The bus factor must follow the lines, not the commit order (test/bus-factor.test.mjs). Ada makes four commits of 10
 * lines each (40 lines), Bob one of 60 and Charlie one of 20. By lines Bob holds exactly half alone; sorted by commits
 * Ada comes first and would be wrongly counted with him.
 */
function busSort() {
  const dir = createRepo("sl-bus-sort-");
  for (let i = 1; i <= 4; i++) commitAs(dir, "ada", D("01", `0${i}`), `ada: part ${i}`, { [`src/a${i}.js`]: lines(`a${i}`, 10) });
  commitAs(dir, "bob", D("02", "01"), "bob: big", { "src/b.js": lines("b", 60) });
  commitAs(dir, "charlie", D("02", "02"), "charlie: c", { "src/c.js": lines("c", 20) });
  return dir;
}

export const FIXTURES = { split, splitBus, reformatSplit, basic, reformat, bots, coauthor, pairing, dirs, wide, quotes, indent, pureIndent, quoteIndent, feature, owners, reviewFormat, history, staleOwners, twoAddressStale, busfactor, reformatBus, busSort, troySplit, groupSplit };

/** @param {keyof typeof FIXTURES} name @returns {string} a new repository; remove it with removeRepo */
export const buildFixture = (name) => FIXTURES[name]();
