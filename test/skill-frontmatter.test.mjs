// The skill's front matter: a description of at most 1,024 characters (the limit that skill indexes and
// directories enforce), the trigger phrases users type, and a license field.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../skills/surviving-lines/SKILL.md", import.meta.url), "utf8");
const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
const field = (name) => new RegExp(`^${name}:[ \\t]*(.*)$`, "m").exec(front)?.[1] ?? "";

test("the skill description is at most 1,024 characters", () => {
  const description = field("description");
  assert.ok(description.length > 0, "description is missing");
  assert.ok(description.length <= 1024, `description is ${description.length} characters`);
});

test("the skill description keeps the phrases people type", () => {
  const description = field("description");
  for (const phrase of ["who owns", "bus factor", "duplicate authors", ".mailmap", "CODEOWNERS", "git-fame", "who should review", "commit counts look misleading"]) {
    assert.ok(description.includes(phrase), `missing trigger phrase: ${phrase}`);
  }
});

test("the skill front matter names the licence and the skill", () => {
  assert.equal(field("license"), "MIT");
  assert.equal(field("name"), "surviving-lines");
});
