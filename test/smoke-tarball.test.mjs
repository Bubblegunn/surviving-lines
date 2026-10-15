import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("Git subcommand aliases the existing executable", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const lock = JSON.parse(
    readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
  );

  assert.equal(pkg.bin["git-surviving-lines"], pkg.bin["surviving-lines"]);
  assert.deepEqual(lock.packages[""].bin, pkg.bin);
});

test("tarball smoke test fails when a declared bin target is missing", {
  skip: process.platform === "win32",
}, () => {
  const fixture = mkdtempSync(join(tmpdir(), "surviving-lines-missing-bin-"));

  try {
    mkdirSync(join(fixture, "bin"), { recursive: true });
    mkdirSync(join(fixture, "scripts"), { recursive: true });

    writeFileSync(
      join(fixture, "package.json"),
      JSON.stringify(
        {
          name: "surviving-lines-smoke-fixture",
          version: "0.0.0",
          description: "Tarball smoke-test fixture",
          license: "MIT",
          type: "module",
          bin: {
            "surviving-lines": "bin/surviving-lines.js",
            "git-surviving-lines": "bin/missing.js",
          },
          files: ["bin", "README.md", "LICENSE"],
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(join(fixture, "README.md"), "fixture\n");
    writeFileSync(join(fixture, "LICENSE"), "fixture\n");
    cpSync(
      fileURLToPath(new URL("../bin/surviving-lines.js", import.meta.url)),
      join(fixture, "bin/surviving-lines.js"),
    );
    cpSync(
      fileURLToPath(new URL("../scripts/smoke-tarball.sh", import.meta.url)),
      join(fixture, "scripts/smoke-tarball.sh"),
    );

    const result = spawnSync("sh", ["scripts/smoke-tarball.sh"], {
      cwd: fixture,
      encoding: "utf8",
      timeout: 60000,
      env: {
        ...process.env,
        npm_config_audit: "false",
        npm_config_fund: "false",
        npm_config_offline: "true",
      },
    });

    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 1, result.stdout + "\n" + result.stderr);
    assert.match(result.stderr, /bin failed: git-surviving-lines --help/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
