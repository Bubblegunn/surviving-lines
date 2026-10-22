import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bench = join(root, "bench", "head-to-head");
const py = (args, cwd) => execFileSync("python3", ["-I", ...args], { cwd, encoding: "utf8" });

test("scrub.py self-test passes (addresses, keys and tokens, local paths, gzip check)", () => {
  assert.match(py([join(bench, "scrub.py"), "--self-test"], root), /scrub self-test OK/);
});

for (const round of ["round7-claude-sonnet-5-5", "round8-claude-sonnet-5-5", "round9-devgate-claude-sonnet-5-5"]) {
  const dir = join(bench, "results", round);
  test(`${round}: SUMMARY.md equals score.py output, redaction check passes, SHA256SUMS lists every file`, () => {
    assert.ok(existsSync(join(dir, "SUMMARY.md")));
    assert.match(py(["score.py", "--check"], dir), /matches/);
    py([join(bench, "scrub.py"), "--check", dir], root);
    for (const f of ["PROTOCOL.md", "arms.json", "env.json", "REPRODUCE.md", "VERIFY.md", "SHA256SUMS", "score.py"]) {
      assert.ok(existsSync(join(dir, f)), f);
    }
    const out = execFileSync("shasum", ["-a", "256", "-c", "SHA256SUMS"], { cwd: dir, encoding: "utf8" });
    assert.ok(!/FAILED/.test(out));
  });
}
