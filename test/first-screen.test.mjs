// @ts-check
// Pins the first screen and the discoverability text. Each later task of the Phase 2 plan appends tests below.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
/** @param {string} f path relative to the repository root */
const read = (f) => readFileSync(join(root, f), "utf8");

export const CATEGORY = "surviving-lines is a command-line tool that counts the lines of code each author still has in a git repository, using git blame, and shows them next to each author's share of commits.";
export const PAIN = "I want to know who wrote the code that is still in this repo, but commit counts only show who was busy, and my own blame scripts credit formatter commits and bots and list one person twice.";

test("the package description is the category sentence", () => {
  assert.equal(JSON.parse(read("package.json")).description, CATEGORY);
});

test("package keywords carry the search phrases and have no duplicates", () => {
  const keywords = JSON.parse(read("package.json")).keywords;
  for (const k of ["git-blame", "git-fame", "git-fame-alternative", "lines-per-author", "lines-of-code", "code-ownership", "codeowners", "authorship", "mailmap", "git-statistics", "cli", "npx"]) {
    assert.ok(keywords.includes(k), `missing keyword ${k}`);
  }
  assert.equal(new Set(keywords).size, keywords.length);
});

test("COMPARISON.md states the blame-window loss and the name-grouping caveat, and has no bare hyphen cell", () => {
  const doc = read("docs/COMPARISON.md");
  assert.match(doc, /also applies to the blame side/, "stated loss for the --since window");
  assert.match(doc, /groups authors by name/, "P16 caveat");
  assert.doesNotMatch(doc, / \| - \| /, "an empty cell must read 'none', not a spaced hyphen");
});

test("the terminal recording is committed, scripted and small", () => {
  for (const f of ["docs/demo.tape", "docs/demo.gif", "docs/demo/setup.sh", "docs/demo/make-split.mjs"]) assert.ok(existsSync(join(root, f)), f);
  const gif = readFileSync(join(root, "docs/demo.gif"));
  assert.equal(gif.subarray(0, 3).toString("latin1"), "GIF");
  assert.ok(gif.length <= 600_000, `${gif.length} bytes is over 600000`);
  assert.match(read("docs/demo.tape"), /^Output docs\/demo\.gif$/m);
});

test("README opens with the pain sentence, the category sentence and the bare command, then the recording", () => {
  const readme = read("README.md");
  const head = readme.split("\n").slice(0, 12).join("\n");
  assert.ok(head.includes(PAIN), "pain sentence in the first 12 lines");
  assert.ok(head.indexOf(CATEGORY) > head.indexOf(PAIN), "category sentence after the pain sentence");
  const firstHeading = readme.indexOf("\n## ");
  const command = readme.indexOf("```\nnpx surviving-lines\n```");
  assert.ok(command !== -1 && command < firstHeading, "the bare command comes before the first section");
  const gif = readme.indexOf("docs/demo.gif");
  assert.ok(gif > command && gif < firstHeading, "the recording comes right after the command");
  assert.ok(readme.includes("(docs/demo.tape)"), "the tape is linked");
});

test("no star, download or bundle-size badge in either README", () => {
  for (const f of ["README.md", "README.tr.md"]) {
    assert.doesNotMatch(read(f), /shields\.io\/(github\/stars|npm\/dm|bundlephobia)/, f);
  }
});

test("every row of How this differs is a tie or ours-only row of COMPARISON.md", () => {
  const readme = read("README.md");
  const start = readme.indexOf("## How this differs");
  const end = readme.indexOf("<p>", start);
  assert.ok(start !== -1 && end > start, "section found");
  const section = readme.slice(start, end);
  const doc = read("docs/COMPARISON.md");
  /** @type {Map<string, string>} */
  const verdict = new Map();
  for (const line of doc.split("\n")) {
    const m = /^\| (P\d\d) \|/.exec(line);
    if (!m) continue;
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
    verdict.set(m[1], cells[7]);
  }
  let rows = 0;
  for (const line of section.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length !== 5 || !/^P\d\d(, P\d\d)*$/.test(cells[3])) continue;
    rows += 1;
    for (const id of cells[3].split(", ")) {
      assert.ok(["tie", "ours only"].includes(verdict.get(id) ?? "missing"), `${id} is ${verdict.get(id)} in COMPARISON.md`);
    }
  }
  assert.ok(rows >= 9, `only ${rows} rows`);
  // The sentence that names where git-fame is ahead must cite rows that really are not wins.
  const ahead = /git-fame is ahead[^\n]*/.exec(section)?.[0] ?? "";
  for (const id of ahead.match(/P\d\d/g) ?? []) {
    assert.ok(["differs", "ours lacks (stated loss)"].includes(verdict.get(id) ?? "missing"), `${id} is ${verdict.get(id)}`);
  }
  assert.match(ahead, /P05/);
  assert.match(section, /docs\/COMPARISON\.md/);
  assert.match(section, /docs\/FAQ\.md/);
});

test("the README first screen makes no speed claim and shows no stale sample", () => {
  const readme = read("README.md");
  assert.doesNotMatch(readme.slice(0, readme.indexOf("\n## Why sample")), /faster|seconds|well under a minute|commits 339/);
});

test("README samples show no real person's email address", () => {
  for (const f of ["README.md", "README.tr.md"]) {
    const t = read(f);
    const emails = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g) ?? [];
    for (const e of emails) {
      // .example is reserved for documentation (RFC 2606), so a name under it is never a real person's address.
      assert.match(e, /@(example\.(com|org)|[a-z0-9-]+\.example|laptop\.example\.org|anthropic\.com)$/, `${f} contains ${e}`);
    }
    assert.doesNotMatch(t, /Colin Francis|Brace Sproul|zan22ye/, `${f} names an openwiki author`);
  }
});

test("README claims are narrowed to what git-fame 4.2.1 and the benchmarks allow", () => {
  const r = read("README.md");
  assert.doesNotMatch(r, /appears to be unpublished/);
  assert.doesNotMatch(r, /well under a minute/);
  assert.doesNotMatch(r, /prints commit share next to line share so the gap is visible/);
  assert.doesNotMatch(r, /git fame or a custom/);
  assert.doesNotMatch(r, /14,722|12,609|13,071|52\.4%|18\.0%|commits 339/, "stale pre-0.3.0 sample figures");
  assert.match(r, /we did not find a published\s+measurement/);
  assert.match(r, /## Compared with git shortlog and git-fame\n[\s\S]*docs\/COMPARISON\.md/);
});

test("the Turkish README has the same first screen facts and none of the stale figures", () => {
  const tr = read("README.tr.md");
  assert.ok(tr.split("\n").slice(0, 12).join("\n").includes("surviving-lines, bir git deposunda"), "category sentence in Turkish");
  assert.ok(tr.indexOf("```\nnpx surviving-lines\n```") < tr.indexOf("\n## "), "bare command first");
  assert.ok(tr.includes("docs/demo.gif"));
  assert.doesNotMatch(tr, /0,3 saniye|bir dakikanın epey altındadır|commits 339|14,722|14\.722|%52,4|%18,0/);
  assert.match(tr, /docs\/COMPARISON\.md/);
});

test("llms.txt carries the category sentence and every relative link resolves", () => {
  const t = read("llms.txt");
  assert.ok(t.includes(`> ${CATEGORY}`));
  for (const m of t.matchAll(/\]\(([^)#]+)\)/g)) {
    if (!/^https?:/.test(m[1])) assert.ok(existsSync(join(root, m[1])), `llms.txt links to missing ${m[1]}`);
  }
});

test("FAQ answers in question form and GEO prompts are exactly five", () => {
  const faq = read("docs/FAQ.md");
  const questions = faq.match(/^## .+$/gm) ?? [];
  assert.ok(questions.length >= 12, `${questions.length} questions`);
  for (const q of questions) assert.ok(q.endsWith("?"), q);
  assert.equal((read("docs/GEO-PROMPTS.md").match(/^\| G[1-5] \|/gm) ?? []).length, 5);
});

test("LISTINGS.md uses the category sentence, the package keywords and the Action description", () => {
  const listings = read("docs/LISTINGS.md");
  assert.ok(listings.includes(CATEGORY));
  for (const k of JSON.parse(read("package.json")).keywords) assert.ok(listings.includes(k), `keyword ${k} missing from LISTINGS.md`);
  const action = /^description: '?(.*?)'?$/m.exec(read("action.yml"))?.[1] ?? "";
  assert.ok(action.length > 0 && action.length <= 125, `action description is ${action.length} characters`);
  assert.ok(listings.includes(`Short description, at most 125 characters: ${action}`), "Marketplace text equals action.yml");
});

test("no em dash in the new text", () => {
  for (const f of ["README.md", "README.tr.md", "llms.txt", "docs/FAQ.md", "docs/GEO-PROMPTS.md", "docs/LISTINGS.md"]) {
    assert.ok(!read(f).includes("—"), `${f} contains an em dash`);
  }
});

test("research and roadmap no longer say what 0.3.0 made false", () => {
  assert.match(read("research/README.md"), /\*\*Update, 20 October 2026\.\*\*/);
  const roadmap = read("ROADMAP.md");
  assert.doesNotMatch(roadmap, /GitHub Action that comments/);
  assert.match(roadmap, /issue #34/);
});

test("the 0.3.0 CHANGELOG entry covers the Phase 2 documentation", () => {
  const log = read("CHANGELOG.md");
  assert.match(log, /^## 0\.3\.0 \((?:unreleased|\d{4}-\d{2}-\d{2})\)$/m);
  const entry = log.slice(log.indexOf("## 0.3.0"), log.indexOf("## 0.2.4"));
  assert.match(entry, /The README opens with the problem, one command and a recording\./);
  assert.match(entry, /Corrections to claims that git-fame 4\.2\.1 had made false\./);
  assert.ok(!entry.includes("\u2014"));
});

test("no unbacked speed claim about large repositories in either README", () => {
  for (const f of ["README.md", "README.tr.md"]) {
    assert.doesNotMatch(read(f), /slow on large repositories|makes the run cheap|büyük depolarda yavaştır|ucuzlatır/, f);
  }
});
