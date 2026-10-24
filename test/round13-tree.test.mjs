// @ts-check
// Round 13: --tree [depth], the ownership tree. Fixtures are tiny repositories with invented names and fixed dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { commitAsIdentity, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";
import { schemaErrors } from "../scripts/schema-check.mjs";

const { parseArgs, analyse, renderTree, renderJson, displayWidth } = await import("../bin/surviving-lines.js");

/** @type {Record<string, [string, string]>} */
const WHO = {
  ada: ["Ada Quill", "ada@quill.example"],
  adaB: ["Ada Quill", "ada@home.example"],
  bea: ["Bea Marsh", "bea@marsh.example"],
  cal: ["Cal Dune", "cal@dune.example"],
  dee: ["Dee Fern", "dee@fern.example"],
  bot: ["dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com"],
};
/** @param {string} dir @param {string} who @param {string} date @param {Record<string, string | null>} files */
const commit = (dir, who, date, files) => commitAsIdentity(dir, WHO[who], `${date}T10:00:00Z`, `${who}: change`, files);

/**
 * Cal (no commit since 2024): lib/core/deep/jit.js 30 lines, lib/core/deep/ops.js 10. Ada and Bea, active:
 * app/api/x.js (Ada 10, Bea 12), app/api/v1/h.js (Ada 6), app/util.js (Ada 8, Bea 9), docs/a.md (Ada 5), CHANGES.md (Ada 3),
 * README.md (Ada 4), tie/t.js (Ada 5, Bea 5), spread/s.js (Ada 4, Bea 3, Dee 3). A bot wrote gen/lock.txt (7 lines).
 * @param {string} dir
 */
function team(dir) {
  commit(dir, "cal", "2024-01-05", { "lib/core/deep/jit.js": lines("j", 30), "lib/core/deep/ops.js": lines("o", 10) });
  commit(dir, "ada", "2026-01-05", {
    "app/api/x.js": lines("x", 10),
    "app/api/v1/h.js": lines("h", 6),
    "app/util.js": lines("u", 8),
    "docs/a.md": lines("d", 5),
    "CHANGES.md": lines("c", 3),
    "README.md": lines("r", 4),
    "tie/t.js": lines("t", 5),
    "spread/s.js": lines("s", 4),
  });
  commit(dir, "bea", "2026-01-10", { "app/api/x.js": lines("x", 10) + lines("xb", 12), "app/util.js": lines("u", 8) + lines("ub", 9), "tie/t.js": lines("t", 5) + lines("tb", 5), "spread/s.js": lines("s", 4) + lines("sb", 3) });
  commit(dir, "dee", "2026-01-11", { "spread/s.js": lines("s", 4) + lines("sb", 3) + lines("sc", 3) });
  commit(dir, "bot", "2026-01-12", { "gen/lock.txt": lines("g", 7) });
}

/** @param {(dir: string) => void} build @param {(dir: string) => Promise<void>} check */
async function withRepo(build, check) {
  const dir = createRepo("sl-tree-");
  try {
    build(dir);
    await check(dir);
  } finally {
    removeRepo(dir);
  }
}
/** @param {string} dir @param {string[]} extra */
const run = (dir, extra) => analyse(parseArgs(["--cwd", dir, "-q", ...extra]));
/** @param {string} dir @param {string[]} extra the body lines of the text view, without the header and the notes */
const body = async (dir, extra) => {
  const text = renderTree(await run(dir, extra));
  const parts = text.split("\n\n");
  return parts[1].split("\n");
};

test("every node has the owner with the most lines in its subtree; directories first, then files, each alphabetical", async () => {
  await withRepo(team, async (dir) => {
    const t = (await run(dir, ["--tree"])).tree;
    assert.ok(t);
    assert.deepEqual(t.nodes.map((x) => x.name), ["app/", "docs/", "gen/", "lib/core/deep/", "spread/", "tie/", "CHANGES.md", "README.md"]);
    const node = (/** @type {string} */ name) => /** @type {NonNullable<typeof t>["nodes"][number]} */ (t.nodes.find((x) => x.name === name));
    // app: Ada 10+6+8 = 24, Bea 12+9 = 21 of 45.
    assert.deepEqual([node("app/").owner, node("app/").lines, Math.round((node("app/").share ?? 0) * 1000)], ["Ada Quill", 45, 533]);
    assert.deepEqual([node("lib/core/deep/").owner, node("lib/core/deep/").lines, node("lib/core/deep/").share], ["Cal Dune", 40, 1]);
    assert.equal(t.scopeFiles, 10);
    assert.equal(t.scopeLines, 45 + 5 + 40 + 10 + 10 + 3 + 4);
    // Inside app/: api/ is a directory, util.js a file; the directory comes first.
    assert.deepEqual(node("app/").children.map((x) => x.name), ["api/", "util.js"]);
    assert.deepEqual(node("app/").children.map((x) => [x.owner, x.lines]), [["Ada Quill", 28], ["Bea Marsh", 17]]);
  });
});

test("the text view: dotted leaders, a note on directories and on files whose owner differs from the parent, (of N) on the top level", async () => {
  await withRepo(team, async (dir) => {
    const rows = await body(dir, ["--tree"]);
    assert.deepEqual(rows, [
      "app/ ........... Ada Quill 53% (of 45)",
      "├── api/ ....... Ada Quill 57%",
      "└── util.js .... Bea Marsh 53%",
      "docs/ .......... Ada Quill 100% (of 5)",
      "└── a.md",
      "gen/ ........... bot",
      "└── lock.txt ... bot",
      "lib/core/deep/ . Cal Dune 100% (of 40) (inactive)",
      "├── jit.js",
      "└── ops.js",
      "spread/ ........ Ada Quill 40% (of 10) (no owner above 50%)",
      "└── s.js",
      "tie/ ........... Ada Quill 50% (of 10)",
      "└── t.js",
      "CHANGES.md ..... Ada Quill 100%",
      "README.md ...... Ada Quill 100%",
    ]);
  });
});

test("a directory whose only child is a directory is one line; a single file child does not join, and the chain counts as one level", async () => {
  await withRepo(team, async (dir) => {
    const t = (await run(dir, ["--tree", "1"])).tree;
    assert.ok(t);
    const lib = /** @type {NonNullable<typeof t>["nodes"][number]} */ (t.nodes.find((x) => x.path === "lib/core/deep"));
    assert.equal(lib.name, "lib/core/deep/");
    // docs/ has one child, a file: its name stays.
    assert.equal(t.nodes.find((x) => x.path === "docs")?.name, "docs/");
    // app/ has a directory and a file: no joining.
    assert.equal(t.nodes.find((x) => x.path === "app")?.name, "app/");
    // Depth 2 reaches the files of the joined directory: one level for the whole chain.
    const t2 = (await run(dir, ["--tree"])).tree;
    assert.deepEqual(t2?.nodes.find((x) => x.path === "lib/core/deep")?.children.map((x) => x.name), ["jit.js", "ops.js"]);
  });
});

test("depth counts levels of nodes: 1 is the top level, the default is 2, 0 is every level", async () => {
  await withRepo(team, async (dir) => {
    const names = (/** @type {any[]} */ nodes) => nodes.flatMap((x) => [x.name, ...names(x.children)]);
    const one = names((await run(dir, ["--tree", "1"])).tree?.nodes ?? []);
    const dflt = names((await run(dir, ["--tree"])).tree?.nodes ?? []);
    const three = names((await run(dir, ["--tree", "3"])).tree?.nodes ?? []);
    const all = names((await run(dir, ["--tree", "0"])).tree?.nodes ?? []);
    assert.ok(!one.includes("api/") && one.includes("app/"));
    assert.ok(dflt.includes("api/") && dflt.includes("util.js") && !dflt.includes("x.js"));
    assert.ok(three.includes("x.js") && three.includes("v1/") && !three.includes("h.js"));
    assert.ok(all.includes("h.js"));
    const t1 = (await run(dir, ["--tree", "1"])).tree;
    assert.equal(t1?.depth, 1);
    assert.equal(t1?.nodes.find((x) => x.path === "app")?.below, true);
    assert.equal(t1?.nodes.find((x) => x.path === "CHANGES.md")?.below, false);
    assert.equal((await run(dir, ["--tree", "0"])).tree?.nodes.find((x) => x.path === "app")?.below, false);
    // The text view tells the reader that deeper levels exist.
    assert.match(renderTree(await run(dir, ["--tree", "1"])), /directories below level 1 are counted in their parent/);
    assert.doesNotMatch(renderTree(await run(dir, ["--tree", "0"])), /directories below level/);
  });
});

test("a tie goes to the name that sorts first; exactly half is not marked, less than half is", async () => {
  await withRepo(team, async (dir) => {
    const t = (await run(dir, ["--tree"])).tree;
    const tie = t?.nodes.find((x) => x.path === "tie");
    assert.deepEqual([tie?.owner, tie?.share], ["Ada Quill", 0.5]);
    const text = renderTree(await run(dir, ["--tree"]));
    assert.match(text, /^spread\/ .* Ada Quill 40% .*\(no owner above 50%\)$/m);
    assert.doesNotMatch(text, /^tie\/.*no owner above 50%/m);
  });
});

test("an owner with no commit in the activity window is marked inactive; --active-days moves the edge", async () => {
  await withRepo(team, async (dir) => {
    const text = renderTree(await run(dir, ["--tree"]));
    assert.match(text, /^lib\/core\/deep\/ .*\(inactive\)$/m);
    assert.doesNotMatch(text, /^app\/.*inactive/m);
    // Ada's newest commit is 7 days before the head commit; with a 5-day window she is inactive too.
    const short = renderTree(await run(dir, ["--tree", "--active-days", "5"]));
    assert.match(short, /^app\/ .*Ada Quill 53% \(of 45\) \(inactive\)$/m);
    assert.equal((await run(dir, ["--tree"])).tree?.nodes.find((x) => x.path === "app")?.active, true);
    assert.equal((await run(dir, ["--tree"])).tree?.nodes.find((x) => x.path === "lib/core/deep")?.active, false);
  });
});

test("a file written only by a bot is listed as a bot file and adds no lines; --include-bots makes the bot an owner", async () => {
  await withRepo(team, async (dir) => {
    const t = (await run(dir, ["--tree"])).tree;
    const gen = t?.nodes.find((x) => x.path === "gen");
    assert.ok(gen);
    assert.deepEqual([gen.bot, gen.owner, gen.lines], [true, null, 0]);
    assert.equal(t?.scopeLines, 117);
    assert.match(renderTree(await run(dir, ["--tree"])), /^gen\/ \.+ bot$/m);
    const withBots = (await run(dir, ["--tree", "--include-bots"])).tree;
    const g2 = withBots?.nodes.find((x) => x.path === "gen");
    assert.deepEqual([g2?.bot, g2?.owner, g2?.lines], [false, "dependabot[bot]", 7]);
    assert.equal(withBots?.scopeLines, 124);
  });
});

test("--top caps the children of a node at the largest ones and counts the rest", async () => {
  const many = (/** @type {string} */ dir) => {
    /** @type {Record<string, string>} */
    const files = {};
    for (let i = 0; i < 30; i++) files[`many/f${String(i).padStart(2, "0")}.js`] = lines(`f${i}`, i + 1);
    commit(dir, "ada", "2026-01-05", files);
  };
  await withRepo(many, async (dir) => {
    const t = (await run(dir, ["--tree", "--top", "3"])).tree;
    const node = t?.nodes[0];
    assert.deepEqual(node?.children.map((x) => x.name), ["f27.js", "f28.js", "f29.js"]);
    assert.equal(node?.more, 27);
    assert.match(renderTree(await run(dir, ["--tree", "--top", "3"])), /└── \.\.\. 27 more$/m);
    // Default: 25 children and five more.
    const d = (await run(dir, ["--tree"])).tree?.nodes[0];
    assert.deepEqual([d?.children.length, d?.more], [25, 5]);
    // The last printed child before the "more" line is not drawn as the last one.
    const rows = await body(dir, ["--tree", "--top", "3"]);
    assert.ok(rows.some((r) => r.startsWith("├── f29.js")) || rows.some((r) => r.startsWith("├── f29")), rows.join("\n"));
  });
});

test("--top also caps the top level and says how many are left", async () => {
  await withRepo((dir) => {
    /** @type {Record<string, string>} */
    const files = {};
    for (let i = 0; i < 6; i++) files[`top${i}.js`] = lines(`t${i}`, i + 1);
    commit(dir, "ada", "2026-01-05", files);
  }, async (dir) => {
    const t = (await run(dir, ["--tree", "--top", "4"])).tree;
    assert.deepEqual(t?.nodes.map((x) => x.name), ["top2.js", "top3.js", "top4.js", "top5.js"]);
    assert.equal(t?.more, 2);
    const rows = await body(dir, ["--tree", "--top", "4"]);
    assert.equal(rows.at(-1), "... 2 more");
  });
});

test("no line is wider than 100 columns; a long name is cut in the middle", async () => {
  const long = `${"deep".repeat(20)}-directory`;
  await withRepo((dir) => commit(dir, "ada", "2026-01-05", { [`${long}/${"file".repeat(15)}-name.js`]: lines("l", 4), "short.js": lines("s", 2) }), async (dir) => {
    const text = (await body(dir, ["--tree", "2"])).join("\n");
    for (const row of text.split("\n")) assert.ok(displayWidth(row) <= 100, `${displayWidth(row)} columns: ${row}`);
    assert.match(text, /deepdeep.*…/);
    // The short name is untouched.
    assert.match(text, /^short\.js /m);
  });
});

test("-- <path> roots the tree at that path", async () => {
  await withRepo(team, async (dir) => {
    const t = (await run(dir, ["--tree", "--", "app"])).tree;
    assert.deepEqual(t?.nodes.map((x) => x.path), ["app"]);
    assert.equal(t?.scopeLines, 45);
    const api = (await run(dir, ["--tree", "--", "app/api"])).tree;
    assert.equal(api?.nodes[0].name, "app/api/");
  });
});

test("one person with two addresses is one owner of a node", async () => {
  await withRepo((dir) => {
    commit(dir, "ada", "2026-01-05", { "pkg/a.js": lines("a", 6) });
    commit(dir, "adaB", "2026-01-06", { "pkg/b.js": lines("b", 6) });
    commit(dir, "bea", "2026-01-07", { "pkg/c.js": lines("c", 10) });
  }, async (dir) => {
    const pkg = (await run(dir, ["--tree"])).tree?.nodes[0];
    assert.deepEqual([pkg?.owner, pkg?.lines, Math.round((pkg?.share ?? 0) * 100)], ["Ada Quill", 22, 55]);
  });
});

test("--tree prints its own view: only --json combines; the depth is optional", () => {
  assert.equal(parseArgs(["--tree"]).tree, 2);
  assert.equal(parseArgs(["--tree", "5"]).tree, 5);
  assert.equal(parseArgs(["--tree", "0"]).tree, 0);
  assert.equal(parseArgs(["--tree", "--", "src"]).tree, 2);
  assert.deepEqual(parseArgs(["--tree", "--", "src"]).paths, ["src"]);
  assert.equal(parseArgs(["--tree", "--json"]).json, true);
  for (const other of [["--csv"], ["--markdown"], ["--identities"], ["--group-by", "dir"], ["--files"], ["--orphans"], ["--brief"], ["--co-authors", "share"], ["--owned-by", "Ada"], ["--without", "Ada"], ["--reviewers", "src"]]) {
    assert.throws(() => parseArgs(["--tree", ...other]), /--[a-z-]+ prints its own view; it can be combined with --json only, not with --/, other.join(" "));
  }
  assert.throws(() => parseArgs(["--tree", "--csv"]), /--tree prints its own view; it can be combined with --json only, not with --csv$/);
  assert.throws(() => parseArgs(["--owned-by", "Ada", "--tree"]), /prints its own view/);
});

test("JSON: tree is null unless asked, and the tree matches the published schema", async () => {
  const schema = JSON.parse(await readFile(join(import.meta.dirname, "..", "schema", "surviving-lines.schema.json"), "utf8"));
  await withRepo(team, async (dir) => {
    const plain = JSON.parse(renderJson(await run(dir, [])));
    assert.equal(plain.tree, null);
    const asked = JSON.parse(renderJson(await run(dir, ["--tree", "0"])));
    assert.deepEqual(schemaErrors(schema, asked), []);
    assert.ok(asked.tree.nodes.length > 0);
    // The checker follows $ref: a wrong type deep in the tree is reported.
    asked.tree.nodes[0].children[0].lines = "many";
    assert.ok(schemaErrors(schema, asked).some((e) => e.includes("tree.nodes[0].children[0].lines")));
  });
});
