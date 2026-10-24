// Round 13, section 3: the skill rules that came from reading the rival tools' prompts, in this project's words. Each
// rule is pinned by a phrase of its own, so removing a rule fails a test. The skill stays within its size budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../skills/surviving-lines/SKILL.md", import.meta.url), "utf8");
/** The skill was 23,223 characters before these rules; they may add 1,500 at most. */
const SKILL_MAX_CHARS = 23223 + 1777;
const bullet = (/** @type {string} */ start) => skill.split("\n").find((l) => l.startsWith(start)) ?? "";

test("bus factor answers give every printed figure and say which one the headline is", () => {
  const b = bullet("- Give every bus factor figure the tool prints");
  assert.match(b, /`bus factor` and `to reach 80%`/);
  assert.match(b, /non-blank base and the `counting blank lines` base/);
  assert.match(b, /merged and unmerged figures when an identity hint exists/);
  assert.match(b, /Say which figure the headline is/);
  assert.match(b, /leading with only the higher one understates the risk/);
  assert.match(b, /`active bus factor` line/);
  assert.match(b, /not on all lines/);
});

test("a single point of failure and orphaned code are two verdicts, never one risk rank", () => {
  const b = bullet("- A single point of failure");
  assert.match(b, /`single point`/);
  assert.match(b, /`orphaned`/);
  assert.match(b, /two separate verdicts/);
  assert.match(b, /A group can have both, one or neither/);
  assert.match(b, /Never fold them into one risk rank/);
});

test("the top owner by surviving lines is named first with the share, the most active owner is the contact", () => {
  const b = bullet("- Who to ask:");
  assert.match(b, /name the top owner \(most surviving lines in the scope\) first, as the main source of knowledge, with the share/);
  assert.match(b, /Say plainly if that person has no commit in the activity window/);
  assert.match(b, /Then name the most active owner as the practical contact/);
  assert.match(b, /Never call an inactive person reachable; never omit the top owner/);
  assert.doesNotMatch(skill, /Name only active people as someone to ask/);
});

test("a young or imported history is said to limit the table, and the workflow line is quoted", () => {
  const b = bullet("- When a `history:` line");
  assert.match(b, /import, young or starts late/);
  assert.match(b, /the table describes the work since that start/);
  assert.match(b, /older lines go to whoever imported them/);
  assert.match(b, /`workflow:` line/);
});

test("figures reported separately are not merged without saying so", () => {
  const b = bullet("- Do not merge what the tool reports separately");
  assert.match(b, /people, files, periods, the two line bases, merged and unmerged figures/);
  assert.match(b, /saying so and naming the parts/);
});

test("a number the tool did not print is labelled as the agent's own computation with its command", () => {
  assert.match(skill, /A number SL did not print is your own computation: label it so and name the command you ran\./);
});

test("the older pinned rules survive and the skill stays within its size budget", () => {
  assert.match(skill, /Say which copy detection setting the figures use/);
  assert.match(skill, /Say that mechanical rewrites were checked, and name each commit of the `mechanical rewrites checked` line as set aside or kept/);
  assert.match(skill, /Give every bus factor figure/);
  assert.ok(skill.length <= SKILL_MAX_CHARS, `${skill.length} characters`);
});
