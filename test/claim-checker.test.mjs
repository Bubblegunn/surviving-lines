// @ts-check
// The claim-checker agent file: standard front matter (name, description, model, tools) and a pointer in SKILL.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("agents/claim-checker.md has the standard front matter and names the haiku model", () => {
  const text = readFileSync(join(ROOT, "agents", "claim-checker.md"), "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, "front matter");
  const fm = Object.fromEntries(m[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()]));
  assert.equal(fm.name, "claim-checker");
  assert.equal(fm.model, "haiku");
  assert.equal(fm.tools, "Read, Bash");
  assert.match(fm.description, /not backed by a number printed by surviving-lines/);
  assert.match(text, /surviving-lines --brief|--brief/);
  assert.match(readFileSync(join(ROOT, "skills", "surviving-lines", "SKILL.md"), "utf8"), /claim-checker/);
});
