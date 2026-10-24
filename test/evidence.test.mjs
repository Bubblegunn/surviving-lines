import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bench = join(root, "bench", "head-to-head");
const py = (args, cwd) => execFileSync("python3", ["-I", ...args], { cwd, encoding: "utf8" });
// Windows runners may have no `python3`; everywhere else a missing python3 stays a failure.
const noPython = process.platform === "win32" && spawnSync("python3", ["--version"]).error ? "python3 is not installed on this Windows machine" : false;

/** Checks a `sha256sum`-style list in node, so the test needs no `shasum`: every listed file exists and matches. */
function verifySums(dir) {
  const entries = readFileSync(join(dir, "SHA256SUMS"), "utf8").split("\n").filter(Boolean);
  assert.ok(entries.length > 0, "SHA256SUMS lists no file");
  for (const line of entries) {
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
    assert.ok(m, `unreadable SHA256SUMS line: ${line}`);
    assert.equal(createHash("sha256").update(readFileSync(join(dir, m[2]))).digest("hex"), m[1], `${m[2]}: FAILED`);
  }
}

test("scrub.py self-test passes (addresses, keys and tokens, local paths, gzip check)", { skip: noPython }, () => {
  assert.match(py([join(bench, "scrub.py"), "--self-test"], root), /scrub self-test OK/);
});

for (const round of ["round7-claude-sonnet-5-5", "round8-claude-sonnet-5-5", "round9-devgate-claude-sonnet-5-5"]) {
  const dir = join(bench, "results", round);
  test(`${round}: SUMMARY.md equals score.py output, redaction check passes, SHA256SUMS lists every file`, { skip: noPython }, () => {
    assert.ok(existsSync(join(dir, "SUMMARY.md")));
    assert.match(py(["score.py", "--check"], dir), /matches/);
    py([join(bench, "scrub.py"), "--check", dir], root);
    for (const f of ["PROTOCOL.md", "arms.json", "env.json", "REPRODUCE.md", "VERIFY.md", "SHA256SUMS", "score.py"]) {
      assert.ok(existsSync(join(dir, f)), f);
    }
    verifySums(dir);
  });
}
