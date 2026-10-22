import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../skills/surviving-lines/SKILL.md", import.meta.url), "utf8");
const lines = skill.split("\n");
const identityBullet = lines.find((l) => l.startsWith("- An `identity hint` line")) ?? "";
const hintBullet = lines.find((l) => l.startsWith("- A note from the surviving-lines prompt hint")) ?? "";

test("identity bullet: writes the .mailmap when asked, with a proposal comment, and not for a plain question", () => {
  assert.match(identityBullet, /write the suggested lines to the repository's `\.mailmap` whenever the user asked you to fix or count each person once/);
  assert.match(identityBullet, /do not stop to ask first/);
  assert.match(identityBullet, /# proposed by surviving-lines, confirm before relying on them/);
  assert.match(identityBullet, /If the user only asked a question, show the lines and do not write the file/);
});

test("hint bullet: writes under a proposal comment and calls the merges guesses", () => {
  assert.match(hintBullet, /write them to `\.mailmap` under a comment line that marks them as proposals to confirm/);
  assert.match(hintBullet, /guesses until the user confirms them/);
});

test("no gate that waits for confirmation before writing", () => {
  for (const bullet of [identityBullet, hintBullet]) {
    assert.doesNotMatch(bullet, /ask before writing|confirm before writing|wait for (the user|confirmation)/i);
  }
});
