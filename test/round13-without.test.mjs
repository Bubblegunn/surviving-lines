// @ts-check
// Round 13, G11c: --without <author>[,<author>...], the knowledge-loss what-if. Fixtures are tiny repositories with
// invented names and fixed dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderWithout, renderJson } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  ada: ["Ada Quill", "ada@quill.example"],
  adaOld: ["Ada Quill", "ada@old.quill.example"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  dee: ["Dee Fern", "dee@fern.example"],
};
let day = 0;
/** @param {string} dir @param {string} who @param {Record<string, string>} files */
const commit = (dir, who, files) => commitAsIdentity(dir, WHO[who], `2026-01-${String(++day).padStart(2, "0")}T10:00:00Z`, `${who}: change`, files);

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-without-");
  day = 0;
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} extra */
const run = (dir, extra) => analyse(parseArgs(["--cwd", dir, ...extra]));

/**
 * Ada is the leaver. a.js: Ada alone. b.js: Ada 30, Cal 2 (Cal 6.25%). c.js: Ada 30, Cal 4 (Cal 11.8%).
 * d.js: Ada 21, Bea 19. e.js: Ada 9, Bea 31 (Ada 22.5%). f.js: Ada 4, Bea 36 (Ada 10%). g.js: Bea alone.
 * @param {string} dir
 */
function team(dir) {
  commit(dir, "ada", { "a.js": lines("a", 40), "b.js": lines("b", 30), "c.js": lines("c", 30), "d.js": lines("d", 21), "e.js": lines("e", 9), "f.js": lines("f", 4) });
  commit(dir, "cal", { "b.js": lines("b", 30) + lines("x", 2), "c.js": lines("c", 30) + lines("x", 4) });
  commit(dir, "bea", { "d.js": lines("d", 21) + lines("y", 19), "e.js": lines("e", 9) + lines("y", 31), "f.js": lines("f", 4) + lines("y", 36), "g.js": lines("g", 15) });
}

test("the what-if counts the leaver's lines, the files they own, and the files nobody remaining would know", async () => {
  await withRepo(team, async (dir) => {
    const r = await run(dir, ["--without", "Ada Quill"]);
    const w = r.without;
    assert.ok(w);
    assert.deepEqual(w.leavers, [{ author: "Ada Quill", lines: 134 }]);
    // Ada 40+30+30+21+9+4 = 134; Cal 6; Bea 19+31+36+15 = 101.
    assert.equal(w.totalLines, 241);
    assert.equal(w.leaverLines, 134);
    assert.equal(Math.round(w.leaverShare * 1000), 556);
    assert.equal(w.scopeFiles, 7);
    // Ada is the top owner of a, b, c, d (21 of 40). Not e, f (Bea) and not g.
    assert.deepEqual(w.topOwnerFiles.items.map((f) => [f.path, f.lines]), [["a.js", 40], ["b.js", 32], ["c.js", 34], ["d.js", 40]].sort((x, y) => /** @type {number} */ (y[1]) - /** @type {number} */ (x[1]) || String(x[0]).localeCompare(String(y[0]))));
    assert.equal(w.topOwnerFiles.files, 4);
    // Lost: Ada holds 50%+ and the best remaining author holds under 10%: a (no one) and b (Cal 6.25%). c has Cal at 11.8%, d has Bea at 47.5%.
    assert.deepEqual(w.unknownFiles.items.map((f) => [f.path, f.nextAuthor, Math.round(f.nextShare * 10000)]), [["a.js", null, 0], ["b.js", "Cal Dune", 625]]);
    assert.equal(w.unknownFiles.files, 2);
    assert.equal(w.unknownFiles.lines, 72);
  });
});

test("the bus factor is given before and after, the second on the lines the remaining authors hold", async () => {
  await withRepo(team, async (dir) => {
    const r = await run(dir, ["--without", "Ada Quill"]);
    // Before: Ada 134 of 241 is over half: 1. After: Bea 101 of 107 remaining lines: still 1. With a 90% threshold: before 2, after 2.
    assert.deepEqual(r.without?.busFactor, { thresholdPercent: 50, before: 1, after: 1 });
    const strict = await run(dir, ["--without", "Bea Marsh", "--bus-factor-threshold", "90"]);
    // Before: Ada 134 + Bea 101 = 235 of 241 (97.5%): 2 for 90%. After: Ada 134 of 140 (95.7%): 1.
    assert.deepEqual(strict.without?.busFactor, { thresholdPercent: 90, before: 2, after: 1 });
  });
});

test("the heir is the remaining author with the most lines in files where the leavers hold 20% or more", async () => {
  await withRepo(team, async (dir) => {
    const r = await run(dir, ["--without", "Ada Quill"]);
    // Files with Ada at 20%+: a (none left), b (Cal 2), c (Cal 4), d (Bea 19), e (Bea 31; Ada 22.5%). f has Ada at 10%: not counted.
    assert.deepEqual(r.without?.heirs, [{ author: "Bea Marsh", lines: 50, files: 2 }, { author: "Cal Dune", lines: 6, files: 2 }]);
  });
});

test("the thresholds are exact: the leaver at 50% and the next author at 10% of a file", async () => {
  await withRepo(
    (dir) => {
      /** @param {string} path @param {number} ada @param {number} others */
      const shared = (path, ada, others) => {
        let content = lines(`${path}a`, ada);
        commit(dir, "ada", { [path]: content });
        for (let i = 1; i <= others; i++) {
          content += lines(`${path}${i}`, 1);
          commitAsIdentity(dir, [`Writer ${i}`, `w${i}@many.example`], `2026-02-${String(i).padStart(2, "0")}T10:00:00Z`, `writer ${i}`, { [path]: content });
        }
      };
      shared("h50.js", 6, 6); // Ada 6 of 12 = 50%, best remaining 1 of 12 = 8.3%: lost
      shared("h45.js", 5, 6); // Ada 5 of 11 = 45.5%: kept
      // n10: Ada 9, Bea 1: the best remaining holds exactly 10%, not under it. n9: Ada 10, Bea 1: 9.1%, lost.
      commit(dir, "ada", { "n10.js": lines("n", 9), "n9.js": lines("m", 10) });
      commit(dir, "bea", { "n10.js": lines("n", 9) + lines("z", 1), "n9.js": lines("m", 10) + lines("z", 1) });
    },
    async (dir) => {
      const r = await run(dir, ["--without", "Ada Quill"]);
      assert.deepEqual(r.without?.unknownFiles.items.map((f) => f.path).sort(), ["h50.js", "n9.js"]);
    },
  );
});

test("several leavers are judged together, and the value may be a name, an address, or a comma-separated list", async () => {
  await withRepo(
    (dir) => {
      // pair.js: Ada 15, Bea 15, Cal 2: each leaver is under 50% alone, the two together hold 93.75% and Cal 6.25%.
      commit(dir, "ada", { "pair.js": lines("p", 15) });
      commit(dir, "bea", { "pair.js": lines("p", 15) + lines("q", 15) });
      commit(dir, "cal", { "pair.js": lines("p", 15) + lines("q", 15) + lines("c", 2), "other.js": lines("o", 40) });
    },
    async (dir) => {
      const alone = await run(dir, ["--without", "Ada Quill"]);
      assert.equal(alone.without?.unknownFiles.files, 0);
      for (const args of [["--without", "Ada Quill,Bea Marsh"], ["--without", "ada@quill.example", "--without", "BEA@marsh.example"], ["--without", "ada quill, bea marsh"]]) {
        const both = await run(dir, args);
        assert.deepEqual(both.without?.leavers.map((l) => l.author), ["Ada Quill", "Bea Marsh"], args.join(" "));
        assert.deepEqual(both.without?.unknownFiles.items.map((f) => f.path), ["pair.js"], args.join(" "));
        assert.equal(both.without?.leaverLines, 30);
      }
    },
  );
});

test("a name that contains a comma is matched whole before the value is split", async () => {
  await withRepo(
    (dir) => {
      commitAsIdentity(dir, ["Quill, Ada", "ada@quill.example"], "2026-01-01T10:00:00Z", "ada", { "a.js": lines("a", 10) });
      commit(dir, "cal", { "c.js": lines("c", 10) });
    },
    async (dir) => {
      const r = await run(dir, ["--without", "Quill, Ada"]);
      assert.deepEqual(r.without?.leavers.map((l) => l.author), ["Quill, Ada"]);
    },
  );
});

test("an author is found after .mailmap and after --merge-identities by any of their addresses", async () => {
  await withRepo(
    (dir) => {
      commit(dir, "adaOld", { "a.js": lines("a", 20) });
      commit(dir, "cal", { "c.js": lines("c", 10), ".mailmap": "Ada Quill <ada@quill.example> <ada@old.quill.example>\n" });
    },
    async (dir) => {
      // The commit carries the old address; .mailmap maps it to the new one, which is the one the table shows.
      const byNew = await run(dir, ["--without", "ada@quill.example"]);
      assert.equal(byNew.without?.leaverLines, 20);
    },
  );
  await withRepo(
    (dir) => {
      commit(dir, "adaOld", { "a.js": lines("a", 20) });
      commit(dir, "ada", { "n.js": lines("n", 5) });
      commit(dir, "cal", { "c.js": lines("c", 10) });
    },
    async (dir) => {
      const merged = await run(dir, ["--merge-identities", "--without", "ada@old.quill.example"]);
      assert.equal(merged.without?.leaverLines, 25, "the other address of the merged person is found, and both rows leave");
      // Without the merge, the same name is still one person: both addresses leave.
      const plain = await run(dir, ["--without", "ada@old.quill.example"]);
      assert.equal(plain.without?.leaverLines, 25);
    },
  );
});

test("an author who is not found is an error that lists the closest names", async () => {
  await withRepo(team, async (dir) => {
    await assert.rejects(() => run(dir, ["--without", "Ada Quil,Zed Nobody"]), (/** @type {Error} */ err) => {
      assert.match(err.message, /--without: no author named or addressed "Zed Nobody" holds a surviving line here\. Closest: /);
      assert.match(err.message, /Ada Quill <ada@quill\.example>/);
      return true;
    });
    await assert.rejects(() => run(dir, ["--without", "Ada Quil"]), /no author named or addressed "Ada Quil".*Closest: Ada Quill <ada@quill\.example>/s);
  });
});

test("each listing is capped at eight paths, with the rest counted", async () => {
  await withRepo(
    (dir) => {
      /** @type {Record<string, string>} */
      const files = {};
      for (let i = 0; i < 10; i++) files[`own/f${String(i).padStart(2, "0")}.js`] = lines(`f${i}`, 10 + i);
      commit(dir, "ada", files);
      commit(dir, "cal", { "c.js": lines("c", 10) });
    },
    async (dir) => {
      const r = await run(dir, ["--without", "Ada Quill"]);
      assert.equal(r.without?.topOwnerFiles.files, 10);
      assert.equal(r.without?.topOwnerFiles.items.length, 8);
      assert.equal(r.without?.unknownFiles.items.length, 8);
      const text = renderWithout(r);
      assert.match(text, /^files whose top owner is a leaver: 10 files of 11, 145 lines; largest: own\/f09\.js \(Ada Quill, 19 lines\)/m);
      assert.match(text, /, and 2 more/);
    },
  );
});

test("the text view states the rule, the bus factor and the heir; the JSON matches the schema; without the flag the key is null", async () => {
  await withRepo(team, async (dir) => {
    const r = await run(dir, ["--without", "Ada Quill"]);
    const text = renderWithout(r);
    assert.match(text, /^what if Ada Quill left /m);
    assert.match(text, /^lines held by the leavers: 134 of 241 \(55\.6%\)$/m);
    assert.match(text, /^files nobody remaining would know \(leavers together hold 50%\+ and the best remaining author under 10%\): 2 files, 72 lines; largest: a\.js \(40 lines, 100\.0% by leavers, best remaining none\), b\.js \(32 lines, 93\.8% by leavers, best remaining Cal Dune 6\.3%\)$/m);
    assert.match(text, /^bus factor \(50% of the lines\): 1 now, 1 without them/m);
    assert.match(text, /^most likely to inherit .*: Bea Marsh \(50 lines in 2 files\), Cal Dune \(6 lines in 2 files\)$/m);
    assert.match(text, /not on understanding/);
    const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
    assert.deepEqual(schemaErrors(schema, JSON.parse(renderJson(r))), []);
    const plain = JSON.parse(renderJson(await run(dir, [])));
    assert.equal(plain.without, null);
    assert.deepEqual(schemaErrors(schema, plain), []);
  });
});

test("--without prints its own view: it can be combined with --json only", () => {
  for (const other of [["--files"], ["--orphans"], ["--reviewers", "x"], ["--history", "x"], ["--group-by", "dir"], ["--csv"], ["--markdown"], ["--identities"], ["--co-authors", "share"]]) {
    assert.throws(() => parseArgs(["--without", "Ada", ...other]), /--without prints its own view/, other.join(" "));
  }
  assert.doesNotThrow(() => parseArgs(["--without", "Ada", "--json"]));
  assert.throws(() => parseArgs(["--without"]), /needs a value/);
});
