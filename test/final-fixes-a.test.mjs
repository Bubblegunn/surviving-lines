// @ts-check
// The final-review fixes for reformat detection and the output details around it: cost that does not grow with the
// candidates, file-type aware quote folding, the lines on the suggested: line, plural and labelled reformat text,
// and the two option checks. Fixtures are built here with fixed authors and dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRepo, commitAs, lines, removeRepo, buildFixture, PEOPLE } from "../scripts/fixtures.mjs";

const { parseArgs, analyse, renderTable, renderMarkdown, renderReviewers, normaliseForFormat, isFormatOnlyChange, findReformatSuspects, configDirFor } = await import("../bin/surviving-lines.js");

const D = (/** @type {string} */ m, /** @type {string} */ d) => `2026-${m}-${d}T10:00:00Z`;
const quoted = (/** @type {string} */ q, /** @type {string} */ tag) => Array.from({ length: 25 }, (_, i) => `x${tag}(${q}${i}${q});`).join("\n") + "\n";

/** A git runner that honours stdin and binary output, like the one the tool uses, and records each call. */
function recordingRun(/** @type {string} */ dir, /** @type {string[][]} */ calls, /** @type {(args: string[], opts?: any) => string | undefined} */ intercept = () => undefined) {
  return async (/** @type {string[]} */ args, /** @type {{ input?: string, binary?: boolean } | undefined} */ opts) => {
    calls.push(args);
    const forced = intercept(args, opts);
    if (forced !== undefined) return forced;
    const r = spawnSync("git", args, { cwd: dir, input: opts?.input, encoding: opts?.binary ? "latin1" : "utf8", maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout;
  };
}

/** Ada writes `n` files with single quotes; then `n` different people-less formatter commits each switch one to double quotes. */
function manyFormatters(/** @type {number} */ n) {
  const dir = createRepo("sl-many-fmt-");
  /** @type {Record<string, string>} */
  const base = {};
  for (let i = 0; i < n; i++) base[`src/f${i}.js`] = quoted("'", String(i));
  commitAs(dir, "ada", D("01", "10"), "ada: files", base);
  /** @type {Map<string, { name: string, mail: string, lines: number }>} */
  const blamed = new Map();
  for (let i = 0; i < n; i++) {
    const sha = commitAs(dir, "bob", D("02", String(10 + i)), `style: quotes ${i}`, { [`src/f${i}.js`]: quoted('"', String(i)) });
    blamed.set(sha, { name: "Bob", mail: "bob@example.com", lines: 25 });
  }
  return { dir, blamed };
}

test("the git calls for reformat detection do not grow with the number of candidates", async () => {
  const { dir, blamed } = manyFormatters(6);
  try {
    /** @type {string[][]} */
    const calls = [];
    const suspects = await findReformatSuspects(/** @type {any} */ ({ cwd: dir, ref: "HEAD", jobs: 4 }), blamed, 150, recordingRun(dir, calls));
    assert.equal(suspects.length, 6);
    assert.ok(calls.length <= 3, `${calls.length} git calls for 6 candidates: ${calls.map((c) => c.join(" ")).join(" | ")}`);
    assert.equal(calls.filter((c) => c[0] === "log").length, 1, "one log call gives parents, subject, date, files and counts");
    assert.equal(calls.filter((c) => c[0] === "show").length, 0, "no per-file show calls");
    assert.equal(calls.filter((c) => c[0] === "cat-file" && c[1] === "--batch").length, 1, "one cat-file process reads every blob");
  } finally {
    removeRepo(dir);
  }
});

test("candidates over the byte cap are not suspects, and their blobs are never read", async () => {
  const { dir, blamed } = manyFormatters(2);
  try {
    /** @type {string[][]} */
    const calls = [];
    // Every blob claims to be 30 MB, so each commit is over the 20 MB cap.
    const huge = recordingRun(dir, calls, (args, opts) => (args[1] === "--batch-check" ? String(opts.input).split("\n").filter(Boolean).map((oid) => `${oid} blob 30000000\n`).join("") : undefined));
    const suspects = await findReformatSuspects(/** @type {any} */ ({ cwd: dir, ref: "HEAD", jobs: 2 }), blamed, 50, huge);
    assert.deepEqual(suspects, []);
    assert.equal(calls.filter((c) => c[0] === "cat-file" && c[1] === "--batch").length, 0, "nothing over the cap is read");
  } finally {
    removeRepo(dir);
  }
});

/**
 * Writes commits through `git fast-import`, which is how a 1000-file commit is built in well under a second.
 * @param {string} dir
 * @param {{ who: keyof typeof PEOPLE, date: string, message: string, files: Record<string, string> }[]} commits
 */
function fastImport(dir, commits) {
  const branch = spawnSync("git", ["symbolic-ref", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
  let stream = "";
  for (const c of commits) {
    const [name, mail] = PEOPLE[c.who];
    const when = `${Math.floor(Date.parse(c.date) / 1000)} +0000`;
    stream += `commit ${branch}\nauthor ${name} <${mail}> ${when}\ncommitter ${name} <${mail}> ${when}\ndata ${Buffer.byteLength(c.message)}\n${c.message}\n`;
    for (const [path, text] of Object.entries(c.files)) stream += `M 100644 inline ${path}\ndata ${Buffer.byteLength(text)}\n${text}\n`;
  }
  const r = spawnSync("git", ["fast-import", "--quiet"], { cwd: dir, input: stream, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return spawnSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).stdout.trim();
}

test("a commit that modifies 301 files is judged now that the limit is 1000, and one with 1001 is not", async () => {
  for (const [n, expected] of [[301, 1], [1001, 0]]) {
    const dir = createRepo("sl-wide-");
    try {
      /** @type {Record<string, string>} */
      const before = {};
      /** @type {Record<string, string>} */
      const after = {};
      for (let i = 0; i < n; i++) {
        before[`src/f${i}.js`] = `x('${i}');\n`;
        after[`src/f${i}.js`] = `x("${i}");\n`;
      }
      const sha = fastImport(dir, [
        { who: "ada", date: D("01", "10"), message: "ada: files", files: before },
        { who: "bob", date: D("02", "01"), message: "style: quotes everywhere", files: after },
      ]);
      const blamed = new Map([[sha, { name: "Bob", mail: "bob@example.com", lines: n }]]);
      const suspects = await findReformatSuspects(/** @type {any} */ ({ cwd: dir, ref: "HEAD", jobs: 4 }), blamed, n, recordingRun(dir, []));
      assert.equal(suspects.length, expected, `${n} files`);
    } finally {
      removeRepo(dir);
    }
  }
});

test("--identities does no reformat detection, and --csv skips the second pass but still names the suspects", async () => {
  const dir = buildFixture("quotes");
  try {
    const ids = await analyse(parseArgs(["--cwd", dir, "--identities"]));
    assert.equal(ids.reformat.detection, false);
    assert.deepEqual(ids.reformat.suspects, []);
    const csv = await analyse(parseArgs(["--cwd", dir, "--csv"]));
    assert.equal(csv.reformat.suspects.length, 1, "the suspects still reach stderr");
    assert.equal(csv.reformat.applied, true, "the correction reaches the CSV rows");
    assert.ok(csv.reformat.uncorrected, "the plain count is kept under --csv too");
    const json = await analyse(parseArgs(["--cwd", dir, "--json"]));
    assert.ok(json.reformat.uncorrected, "--json keeps the plain count");
  } finally {
    removeRepo(dir);
  }
});

test("--reviewers cannot be combined with pathspecs after --", () => {
  assert.throws(() => parseArgs(["--reviewers", "src", "--", "lib"]), /--reviewers.*pathspec/);
  assert.doesNotThrow(() => parseArgs(["--reviewers", "src"]));
});

test("normaliseForFormat folds quotes only for the languages where they are layout", () => {
  assert.equal(normaliseForFormat("a = 'x'", "deploy.sh"), "a='x'");
  assert.equal(normaliseForFormat("a = 'x'", "Makefile"), "a='x'");
  assert.equal(normaliseForFormat("a = 'x'", "src/app.JS"), 'a="x"');
  assert.equal(normaliseForFormat("a = 'x'", "styles/site.scss"), 'a="x"');
  assert.equal(normaliseForFormat("a = 'x'"), 'a="x"', "no path keeps both folds");
  assert.equal(isFormatOnlyChange("echo '$HOME'", 'echo "$HOME"', "run.sh"), false);
  assert.equal(isFormatOnlyChange("echo '$HOME'", 'echo "$HOME"', "run.js"), true);
  assert.equal(isFormatOnlyChange("f(a,\n b)", "f(a, b)", "run.sh"), true, "whitespace still folds everywhere");
});

test("a quote change in a shell script is not a reformat suspect, the same change in a .js file is", async () => {
  for (const [ext, expected] of [["sh", 0], ["js", 1]]) {
    const dir = createRepo("sl-ext-");
    try {
      commitAs(dir, "ada", D("01", "10"), "ada: script", { [`bin/run.${ext}`]: quoted("'", "") });
      commitAs(dir, "bob", D("02", "01"), "style: quotes", { [`bin/run.${ext}`]: quoted('"', "") });
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.reformat.suspects.length, expected, ext);
    } finally {
      removeRepo(dir);
    }
  }
});

test("a relative XDG_CONFIG_HOME is ignored like an unset one", () => {
  assert.equal(configDirFor({ XDG_CONFIG_HOME: "/abs/xdg" }, "/home/u"), "/abs/xdg/surviving-lines");
  assert.equal(configDirFor({ XDG_CONFIG_HOME: "relative/xdg" }, "/home/u"), "/home/u/.config/surviving-lines");
  assert.equal(configDirFor({ XDG_CONFIG_HOME: "" }, "/home/u"), "/home/u/.config/surviving-lines");
  assert.equal(configDirFor({}, "/home/u"), "/home/u/.config/surviving-lines");
});

/** Two formatters, so the --reviewers suggestion has two suspects. */
function twoFormatters() {
  const dir = createRepo("sl-two-fmt-");
  commitAs(dir, "ada", D("01", "10"), "ada: two files", { "src/a.js": quoted("'", "a"), "src/b.js": quoted("'", "b") });
  commitAs(dir, "bob", D("02", "01"), "style: quotes a", { "src/a.js": quoted('"', "a") });
  commitAs(dir, "charlie", D("02", "02"), "style: quotes b", { "src/b.js": quoted('"', "b") });
  return dir;
}

test("the reviewers suggestion says commits when several are suspected, and gives the lines", async () => {
  const dir = twoFormatters();
  try {
    const r = await analyse(parseArgs(["--cwd", dir, "--reviewers", "src"]));
    const text = renderReviewers(r, 5);
    assert.ok(text.includes("suggested by surviving lines (with the suspected reformat commits ignored): Ada (50 lines, 100.0%"), text);
    assert.ok(text.includes("reformat commits ignored (looks like whitespace and quote changes only): 2 commits"), text);
  } finally {
    removeRepo(dir);
  }
});

/** Ada and her laptop identity share a name; the laptop identity made the reformat. */
function sameName() {
  const dir = createRepo("sl-same-name-");
  commitAs(dir, "ada", D("01", "10"), "ada: files", { "src/a.js": quoted("'", "a"), "src/b.js": lines("b", 10) });
  commitAs(dir, "adaLaptop", D("02", "01"), "style: quotes", { "src/a.js": quoted('"', "a") });
  return dir;
}

test("two rows with one display name are told apart by address in the ignored list and the bus factor lines", async () => {
  const dir = sameName();
  try {
    const r = await analyse(parseArgs(["--cwd", dir]));
    const text = renderTable(r, 10);
    const ada = PEOPLE.ada[1];
    const laptop = PEOPLE.adaLaptop[1];
    // The corrected rows give the 25 lines back to the address that wrote them; the plain count gave them to the laptop.
    assert.ok(text.includes(`bus factor 1: Ada <${ada}> alone holds 100.0% of 35 surviving lines`), text);
    assert.ok(text.includes(`Authors who gain lines from this: Ada <${ada}> 35 (100.0%) with the correction, 10 (28.6%) without.`), text);
    assert.doesNotMatch(text, /Ada <[^>]*> 25 \(/, "no total next to the committer's address");
    assert.ok(text.includes(`bus factor without the correction: 1 (Ada <${laptop}> alone leads the plain count)`), text);
  } finally {
    removeRepo(dir);
  }
});

test("--markdown separates the bus factor line, its definition and the reformat block into paragraphs", async () => {
  const dir = sameName();
  try {
    const out = renderMarkdown(await analyse(parseArgs(["--cwd", dir])), 10).split("\n");
    const at = out.findIndex((l) => l.startsWith("bus factor 1:"));
    assert.equal(out[at + 1], "", "blank line after the bus factor line");
    assert.ok(out[at + 2].startsWith("bus factor = "));
    assert.equal(out[at + 3], "", "blank line before the reformat block");
    assert.ok(out[at + 4].startsWith("reformat commit ignored"));
  } finally {
    removeRepo(dir);
  }
});
