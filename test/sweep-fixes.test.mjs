// @ts-check
// Round 13 sweep fixes: submodules and symlinks, binary-like files, copy detection on long histories, bot names, and
// authors who hold only blank lines. Repositories are tiny and built inside each test with invented names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepo, commitAsIdentity, git, lines, removeRepo } from "../scripts/fixtures.mjs";

const mod = await import("../bin/surviving-lines.js");
const { parseArgs, analyse, renderTable } = mod;

const DATE = "2026-01-01T00:00:00Z";
const ANN = /** @type {[string, string]} */ (["Ann", "ann@x.org"]);

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} fn */
async function withRepo(build, fn) {
  const dir = createRepo("sl-sweep-");
  try {
    build(dir);
    await fn(dir);
  } finally {
    removeRepo(dir);
  }
}

/** Commit the staged index (a gitlink or symlink added by hand) as Ann. @param {string} dir @param {string} message */
function commitIndex(dir, message) {
  const env = { GIT_AUTHOR_NAME: "Ann", GIT_AUTHOR_EMAIL: "ann@x.org", GIT_COMMITTER_NAME: "Ann", GIT_COMMITTER_EMAIL: "ann@x.org", GIT_AUTHOR_DATE: DATE, GIT_COMMITTER_DATE: DATE };
  git(dir, ["commit", "-q", "-m", message], env);
}

for (const extra of [[], ["--keep-generated"]]) {
  test(`S1: a submodule outside a vendor directory does not stop the run (${extra.join(" ") || "default options"})`, async () => {
    await withRepo(
      (dir) => {
        commitAsIdentity(dir, ANN, DATE, "code", { "src/a.js": lines("a", 6) });
        git(dir, ["update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},thirdparty/lib`]);
        git(dir, ["update-index", "--add", "--cacheinfo", `160000,${"2".repeat(40)},vendor/dep`]);
        commitIndex(dir, "add submodules");
      },
      async (dir) => {
        const r = await analyse(parseArgs(["--cwd", dir, ...extra]));
        assert.equal(r.sample.filesTotal, 1);
        assert.equal(r.sample.linesInRef, 6);
        assert.equal(r.authors[0].lines, 6);
      },
    );
  });
}

test("S1: a real submodule added with git submodule add is not counted", async () => {
  const sub = createRepo("sl-sweep-sub-");
  try {
    commitAsIdentity(sub, ["Sue", "sue@x.org"], DATE, "lib", { "lib.js": lines("lib", 9) });
    await withRepo(
      (dir) => {
        commitAsIdentity(dir, ANN, DATE, "code", { "a.js": lines("a", 4) });
        git(dir, ["-c", "protocol.file.allow=always", "submodule", "add", "-q", sub, "third_lib"]);
        commitIndex(dir, "add submodule");
      },
      async (dir) => {
        for (const extra of [[], ["--keep-generated"]]) {
          const r = await analyse(parseArgs(["--cwd", dir, ...extra]));
          // a.js and .gitmodules; the submodule entry itself is not a file.
          assert.equal(r.sample.filesTotal, 2);
          assert.equal(r.sample.linesInRef, 4 + 3);
        }
      },
    );
  } finally {
    removeRepo(sub);
  }
});

test("S6: a symbolic link is not blamed and not counted as one line", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ANN, DATE, "code", { "real.js": lines("r", 5) });
      symlinkSync("real.js", join(dir, "link.js"));
      git(dir, ["add", "link.js"]);
      commitIndex(dir, "add link");
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.sample.filesTotal, 1);
      assert.equal(r.sample.linesInRef, 5);
      assert.equal(r.authors[0].lines, 5);
    },
  );
});

test("S1: --files, --group-by, --reviewers and --history run on a repository with a submodule and a link", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ANN, DATE, "code", { "src/a.js": lines("a", 6), "src/b.js": lines("b", 6) });
      symlinkSync("a.js", join(dir, "src/link.js"));
      git(dir, ["add", "src/link.js"]);
      git(dir, ["update-index", "--add", "--cacheinfo", `160000,${"3".repeat(40)},src/sub`]);
      commitIndex(dir, "add link and submodule");
    },
    async (dir) => {
      for (const extra of [["--files"], ["--group-by", "dir"], ["--reviewers", "src"], ["--history", "src"], ["--copies", "deep"], ["--sample", "2"]]) {
        const r = await analyse(parseArgs(["--cwd", dir, ...extra]));
        assert.ok(renderTable(r, null).length > 0, extra.join(" "));
        assert.equal(r.sample.linesInRef, 12, extra.join(" "));
      }
    },
  );
});

/** @param {number} head text bytes before the NUL */
const nulFile = (head) => Buffer.concat([Buffer.from("line\n".repeat(Math.ceil(head / 5))), Buffer.from([0]), Buffer.from("tail\n".repeat(50))]);

test("S2: a file with a NUL byte beyond git's probe is left out and reported as binary; a plain text file counts", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ANN, DATE, "files", { "plain.txt": lines("p", 8), "late-nul.dat": nulFile(9000) });
    },
    async (dir) => {
      const numstat = git(dir, ["diff", "--numstat", git(dir, ["hash-object", "-t", "tree", "--stdin"]).trim(), "HEAD"]);
      assert.match(numstat, /late-nul\.dat/, "git itself calls the file text, so the NUL is beyond its probe");
      assert.doesNotMatch(numstat, /^-\t-\tlate-nul\.dat/m);
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.equal(r.sample.filesTotal, 1);
      assert.equal(r.sample.linesInRef, 8);
      assert.equal(r.dropped.classes.binary.files, 1);
      assert.ok(r.dropped.classes.binary.lines > 50);
      assert.equal(r.dropped.paths[0].path, "late-nul.dat");
      const line = mod.droppedLine(r);
      assert.match(line ?? "", /binary 1 file [\d,]+ lines/);
      assert.match(renderTable(r, null), /dropped: 1 file, .*binary 1 file/);
      const kept = await analyse(parseArgs(["--cwd", dir, "--keep-generated"]));
      assert.equal(kept.sample.filesTotal, 2);
      assert.equal(kept.dropped.classes.binary.files, 0);
    },
  );
});

test("S3: copy detection is on at the files x commits limit and off one above it, and off above 2000 files", () => {
  const { copyDetectionDefault, COPY_DETECTION_MAX_WORK } = mod;
  assert.equal(COPY_DETECTION_MAX_WORK, 2_000_000);
  assert.equal(copyDetectionDefault(1000, 1999), true, "below");
  assert.equal(copyDetectionDefault(1000, 2000), true, "at");
  assert.equal(copyDetectionDefault(1000, 2001), false, "above");
  assert.equal(copyDetectionDefault(2000, 1000), true, "at the file limit and the work limit");
  assert.equal(copyDetectionDefault(2001, 1), false, "above the file limit with a short history");
  assert.equal(copyDetectionDefault(3, 600_000), true);
  assert.equal(copyDetectionDefault(3, 700_000), false);
  assert.equal(copyDetectionDefault(5, 3, 15), true, "explicit limit, at");
  assert.equal(copyDetectionDefault(5, 4, 15), false, "explicit limit, above");
});

test("S3: a history too long for the file count turns -C off and prints the note; --copies forces it on", async () => {
  await withRepo(
    (dir) => {
      for (let i = 0; i < 4; i++) commitAsIdentity(dir, ANN, `2026-01-0${i + 1}T00:00:00Z`, `c${i}`, { "a.js": lines("a", 3 + i), "b.js": lines("b", 3 + i) });
    },
    async (dir) => {
      // 2 files x 4 commits = 8; a limit of 7 puts this repository just above it.
      const off = parseArgs(["--cwd", dir]);
      off.copyWorkLimit = 7;
      const r = await analyse(off);
      assert.equal(r.blame.copyDetection.on, false);
      assert.equal(r.blame.copyDetection.flags, null);
      assert.match(r.blame.copyDetection.reason ?? "", /^2 files times 4 commits is more than 7$/);
      assert.match(renderTable(r, 10), /^copy detection off: 2 files times 4 commits is more than 7, so code moved .*--copies turns it on/m);
      const at = parseArgs(["--cwd", dir]);
      at.copyWorkLimit = 8;
      assert.equal((await analyse(at)).blame.copyDetection.on, true);
      const forced = parseArgs(["--cwd", dir, "--copies"]);
      forced.copyWorkLimit = 7;
      assert.equal((await analyse(forced)).blame.copyDetection.on, true);
      const none = parseArgs(["--cwd", dir, "--no-copies"]);
      assert.equal((await analyse(none)).blame.copyDetection.reason, "--no-copies");
    },
  );
});

test("S4: isBotIdentity recognises the bot names and addresses of the sweep", () => {
  const { isBotIdentity } = mod;
  const bots = [
    ["jekyllbot", "jekyllbot@example.org"],
    ["vue-bot", "bot@example.org"],
    ["vue-bot", "someone@example.org"],
    ["StepSecurity Bot", "int-bot@example.org"],
    ["StepSecurity Bot", "x@example.org"],
    ["Release Bot", "release@example.org"],
    ["ZodBot", "zod@example.org"],
    ["bot", "x@example.org"],
    ["Copybara-Service", "copybara-worker@example.org"],
    ["Acme Copybara Service", "worker@example.org"],
    ["Some-Service", "svc@example.org"],
    ["Frankenstein", "frankensteinbot@example.org"],
    ["Frankenstein", "42+frankensteinbot@users.noreply.example.org"],
    ["dependabot[bot]", "x@example.org"],
  ];
  for (const [name, mail] of bots) assert.equal(isBotIdentity(name, mail), true, `${name} <${mail}>`);
});

test("S4: isBotIdentity keeps people whose names or addresses only look like a bot", () => {
  const { isBotIdentity } = mod;
  const people = [
    ["Bot Hawkins", "bot.hawkins@example.org"],
    ["Botticelli", "botticelli@example.org"],
    ["Talbot", "talbot@example.org"],
    ["Abbot Smith", "abbot@example.org"],
    ["Elbot", "elbot@example.org"],
    ["Robotnik", "robotnik@example.org"],
    ["Jane Service", "jane@example.org"],
    ["Ann Abbot", "ann.abbot@example.org"],
    ["Ann", "talbot@example.org"],
    ["Ann", "abbot@example.org"],
    ["Ann", "dabbot@example.org"],
    ["jekyllbot2", "jekyllbot2@example.org"],
    ["jekyllbot", "other@example.org"],
  ];
  for (const [name, mail] of people) assert.equal(isBotIdentity(name, mail), false, `${name} <${mail}>`);
});

test("S4: a widened bot name is excluded from the shares and counted in the exclusion line", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ANN, DATE, "a", { "a.js": lines("a", 5) });
      commitAsIdentity(dir, ["Release Bot", "rel@example.org"], DATE, "b", { "b.js": lines("b", 4) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      assert.deepEqual(r.authors.map((a) => a.author), ["Ann"]);
      assert.equal(r.bots.excluded.length, 1);
    },
  );
});

/** @param {any} r */
function blankTotals(r) {
  const perAuthor = r.authors.reduce((/** @type {number} */ s, /** @type {any} */ a) => s + a.linesWithBlank, 0);
  return { perAuthor, header: r.sample.linesWithBlank, bus: r.busFactor?.withBlank?.total };
}

test("S5: an author whose surviving lines are all blank shows their blank count, and the with-blank totals agree", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ANN, "2026-01-01T00:00:00Z", "a", { "a.js": lines("a", 6) });
      commitAsIdentity(dir, ["Bob", "bob@x.org"], "2026-01-02T00:00:00Z", "b", { "b.txt": "\n".repeat(10) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir]));
      const bob = r.authors.find((/** @type {any} */ a) => a.author === "Bob");
      assert.equal(bob?.lines, 0);
      assert.equal(bob?.linesWithBlank, 10);
      const t = blankTotals(r);
      assert.equal(r.sample.linesWithBlank, 16);
      assert.equal(t.perAuthor, t.header);
      assert.equal(t.bus, t.header);
    },
  );
});

test("S5: a blank-only author with no commit in the --since window still appears, and the totals agree", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Bob", "bob@x.org"], "2025-01-02T00:00:00Z", "b", { "b.txt": "\n".repeat(10) });
      commitAsIdentity(dir, ANN, "2026-01-01T00:00:00Z", "a", { "a.js": lines("a", 6) });
    },
    async (dir) => {
      const r = await analyse(parseArgs(["--cwd", dir, "--since", "2025-12-01"]));
      const bob = r.authors.find((/** @type {any} */ a) => a.author === "Bob");
      assert.equal(bob?.linesWithBlank, 10);
      assert.equal(bob?.commits, 0);
      const t = blankTotals(r);
      assert.equal(t.perAuthor, t.header);
      assert.equal(t.bus, t.header);
    },
  );
});
