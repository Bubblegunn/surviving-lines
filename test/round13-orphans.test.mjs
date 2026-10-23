// @ts-check
// Round 13, G11b: orphaned code. A file is orphaned when its top owner is inactive and no active author holds at
// least 20% of its non-blank lines. Fixtures are tiny repositories with invented names and fixed dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTable, renderFiles, renderReviewers, renderJson } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  ada: ["Ada Quill", "ada@quill.example"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  dee: ["Dee Fern", "dee@fern.example"],
};
/** @param {string} dir @param {string} who @param {string} date @param {Record<string, string>} files */
const commit = (dir, who, date, files) => commitAsIdentity(dir, WHO[who], `${date}T10:00:00Z`, `${who}: change`, files);

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-orphans-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} [extra] */
const run = (dir, extra = []) => analyse(parseArgs(["--cwd", dir, ...extra]));

// Ref date 2026-03-10 (Cal, active). Ada and Bea last committed in 2024, so both are inactive.
/** @param {string} dir */
function mixed(dir) {
  commit(dir, "ada", "2024-01-10", { "src/gone.js": lines("g", 40), "src/edge20.js": lines("e", 16), "src/edge15.js": lines("f", 17), "src/pair.js": lines("p", 14) });
  commit(dir, "bea", "2024-01-11", { "src/pair.js": lines("p", 14) + lines("q", 6) });
  // edge20: Cal adds 4 of 20 lines, exactly 20%. edge15: Cal adds 3 of 20, 15%.
  commit(dir, "cal", "2026-03-09", { "src/edge20.js": lines("e", 16) + lines("c", 4), "src/edge15.js": lines("f", 17) + lines("c", 3) });
  commit(dir, "cal", "2026-03-10", { "src/live.js": lines("l", 12) });
}

test("a file is orphaned when its top owner is inactive and no active author holds 20% of it", async () => {
  await withRepo(mixed, async (dir) => {
    const r = await run(dir);
    assert.ok(r.orphans);
    // gone.js (Ada alone), edge15.js (Cal 15%), pair.js (Ada 14 / Bea 6, nobody active). edge20.js is kept by Cal's exact 20%.
    assert.deepEqual(r.orphans.items.map((f) => [f.path, f.owner, f.lines]), [["src/gone.js", "Ada Quill", 40], ["src/edge15.js", "Ada Quill", 20], ["src/pair.js", "Ada Quill", 20]]);
    assert.equal(r.orphans.files, 3);
    assert.equal(r.orphans.lines, 80);
    assert.equal(r.orphans.scopeLines, 112);
    assert.equal(r.orphans.scopeFiles, 5);
    assert.equal(r.orphans.items[0].ownerLastCommit, "2024-01-10");
  });
});

test("--files and --reviewers print the orphaned line; the default table does not unless --orphans is given", async () => {
  await withRepo(mixed, async (dir) => {
    const want = "orphaned (top owner inactive, nobody active holds 20%+): 3 files, 71.4% of the lines; largest: src/gone.js (Ada Quill, 40 lines), src/edge15.js (Ada Quill, 20 lines), src/pair.js (Ada Quill, 20 lines)";
    assert.ok(renderFiles(await run(dir, ["--files"])).split("\n").includes(want));
    assert.ok(renderReviewers(await run(dir, ["--reviewers", "src"]), 5).split("\n").includes(want));
    assert.doesNotMatch(renderTable(await run(dir), null), /orphaned/);
    assert.doesNotMatch(renderFiles(await run(dir, ["--files"])), /orphaned files, largest first/, "the list needs --orphans");
  });
});

test("--orphans lists the files with owner, lines and the owner's last commit, in --files, --reviewers and the table", async () => {
  await withRepo(mixed, async (dir) => {
    for (const [extra, render] of /** @type {[string[], (r: any) => string][]} */ ([
      [["--files"], renderFiles],
      [["--reviewers", "src"], (r) => renderReviewers(r, 5)],
      [[], (r) => renderTable(r, null)],
    ])) {
      const r = await run(dir, [...extra, "--orphans"]);
      const text = render(r);
      assert.match(text, /^orphaned files, largest first \(3 of 3\)/m, extra.join(" "));
      assert.match(text, /^src\/gone\.js\s+Ada Quill\s+40 lines\s+last commit 2024-01-10$/m, text);
      assert.match(text, /^src\/pair\.js\s+Ada Quill\s+20 lines\s+last commit 2024-01-10$/m);
      assert.doesNotMatch(text, /^src\/edge20\.js\s+Ada/m);
      assert.equal(r.orphans.requested, true);
    }
  });
});

test("the summary names five paths at most and --orphans lists thirty at most, with the rest counted", async () => {
  await withRepo(
    (dir) => {
      /** @type {Record<string, string>} */
      const files = {};
      for (let i = 0; i < 32; i++) files[`old/f${String(i).padStart(2, "0")}.js`] = lines(`f${i}`, 3 + (i % 3));
      commit(dir, "ada", "2024-01-10", files);
      commit(dir, "cal", "2026-03-10", { "new/c.js": lines("c", 10) });
    },
    async (dir) => {
      const r = await run(dir, ["--files", "--orphans"]);
      assert.equal(r.orphans?.files, 32);
      assert.equal(r.orphans?.items.length, 30);
      const text = renderFiles(r);
      const summary = text.split("\n").find((l) => l.startsWith("orphaned (")) ?? "";
      assert.equal(summary.split("), ").length, 5, summary);
      assert.match(summary, /^orphaned \(top owner inactive, nobody active holds 20%\+\): 32 files, /);
      assert.match(text, /^… 2 more$/m);
      assert.equal(text.split("\n").filter((l) => /^old\/f\d+\.js\s+Ada Quill/.test(l)).length, 30);
    },
  );
});

test("the owner's activity window decides: 365 days before the ref keeps the file, 366 orphans it", async () => {
  /** @param {string} adaDay */
  const build = (adaDay) => (/** @type {string} */ dir) => {
    commit(dir, "ada", adaDay, { "a.js": lines("a", 30) });
    commit(dir, "cal", "2026-03-10", { "c.js": lines("c", 10) });
  };
  await withRepo(build("2025-03-10"), async (dir) => assert.equal((await run(dir)).orphans?.files, 0));
  await withRepo(build("2025-03-09"), async (dir) => assert.equal((await run(dir)).orphans?.files, 1));
  await withRepo(build("2025-03-10"), async (dir) => assert.equal((await run(dir, ["--active-days", "364"])).orphans?.files, 1));
});

test("an active author who is not the top owner keeps the file only at 20%; a second inactive author does not", async () => {
  await withRepo(
    (dir) => {
      // Bea (inactive) is the top owner; Dee (active) holds 5 of 25 = 20%.
      commit(dir, "bea", "2024-01-10", { "k.js": lines("k", 20) });
      commit(dir, "dee", "2026-01-10", { "k.js": lines("k", 20) + lines("d", 5), "n.js": lines("n", 20) });
      commit(dir, "cal", "2026-03-10", { "c.js": lines("c", 10) });
    },
    async (dir) => {
      const r = await run(dir);
      assert.deepEqual(r.orphans?.items.map((f) => f.path), []);
    },
  );
});

test("an active top owner keeps the file even when the file is so shared that the owner holds under 20%", async () => {
  await withRepo(
    (dir) => {
      // Six inactive writers add 3 lines each, then Dee (active) adds 4: Dee is the top owner with 4 of 22 lines, 18%.
      let content = "";
      for (let i = 1; i <= 6; i++) {
        content += lines(`w${i}`, 3);
        commitAsIdentity(dir, [`Writer ${i}`, `w${i}@many.example`], `2024-01-0${i}T10:00:00Z`, `writer ${i}`, { "shared.js": content });
      }
      commit(dir, "dee", "2026-01-10", { "shared.js": content + lines("d", 4) });
      commit(dir, "cal", "2026-03-10", { "c.js": lines("c", 10) });
    },
    async (dir) => {
      const r = await run(dir);
      assert.equal(r.orphans?.files, 0);
    },
  );
});

test("a file whose top owner is active is never orphaned, and nothing is orphaned when everyone is active", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2026-02-10", { "a.js": lines("a", 30) });
      commit(dir, "cal", "2026-03-10", { "c.js": lines("c", 10) });
    },
    async (dir) => {
      const r = await run(dir, ["--files"]);
      assert.equal(r.orphans?.files, 0);
      assert.ok(renderFiles(r).split("\n").includes("orphaned (top owner inactive, nobody active holds 20%+): none"));
    },
  );
});

test("--reviewers <dir> measures the orphans of that directory only", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "ada", "2024-01-10", { "old/a.js": lines("a", 30), "kept/k.js": lines("k", 30) });
      commit(dir, "cal", "2026-03-09", { "kept/k.js": lines("k", 30) + lines("c", 30) });
      commit(dir, "cal", "2026-03-10", { "kept/c.js": lines("c", 10) });
    },
    async (dir) => {
      const old = await run(dir, ["--reviewers", "old"]);
      assert.equal(old.orphans?.scopeFiles, 1);
      assert.equal(old.orphans?.files, 1);
      const kept = await run(dir, ["--reviewers", "kept"]);
      assert.equal(kept.orphans?.scopeFiles, 2);
      assert.equal(kept.orphans?.files, 0, "Ada's 30 lines of kept/k.js are half of it, but Cal holds the other half");
    },
  );
});

test("--orphans cannot be combined with --history, --group-by, --csv, --markdown or --identities; the JSON key matches the schema", async () => {
  for (const other of [["--history", "x"], ["--group-by", "dir"], ["--csv"], ["--markdown"], ["--identities"]]) {
    assert.throws(() => parseArgs([...other, "--orphans"]), /--orphans lists files under the table/, other.join(" "));
  }
  await withRepo(mixed, async (dir) => {
    const json = JSON.parse(renderJson(await run(dir)));
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    assert.deepEqual(schemaErrors(schema, json), []);
    assert.equal(json.orphans.files, 3);
    assert.equal(json.orphans.requested, false);
    assert.equal(json.orphans.minActiveShare, 0.2);
  });
});
