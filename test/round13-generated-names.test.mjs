// @ts-check
// Round 13: files that tools write are recognised by name (classifyPath, the generated class). Names are invented.
import { test } from "node:test";
import assert from "node:assert/strict";
import { commitAs, createRepo, lines, removeRepo } from "../scripts/fixtures.mjs";

const { classifyPath, parseArgs, analyse, droppedLine } = await import("../bin/surviving-lines.js");

const GENERATED = [
  "data/rows.generated.json", "web/Client.GENERATED.ts", "api/types.gen.ts", "a/b/x.gen.go",
  "lib/model.g.dart", "lib/model.freezed.dart", "rpc/svc.pb.go", "rpc/svc.pb.cc", "rpc/svc.pb.h",
  "py/svc_pb2.py", "py/svc_pb2_grpc.py", "Forms/Main.Designer.cs", "Models/Thing.g.cs",
  "gen/store_generated.go", "src/table_generated.rs", "Sources/App.generated.swift",
  "App.xcodeproj/project.pbxproj", "ios/project.pbxproj", "ios/App.xcodeproj/xcshareddata/x.xcscheme",
  "App.xcworkspace/contents.xcworkspacedata", "tests/__snapshots__/a.test.js.snap", "Tests/B.SNAP",
];
const KEPT = [
  "data/rows.json", "config.json.example", "src/App.csproj", "src/App.sln", "src/generator.ts", "src/generated.ts", "src/regen.go",
  "src/gentle.ts", "lib/model.dart", "rpc/svc.go", "py/svc.py", "Forms/Main.cs", "src/pb2.py",
  "src/my_generated_file.go", "docs/snap.md", "src/App.xcodeprojx/a.txt", "src/project.pbxprojx",
];

test("classifyPath: generator names are in the generated class, root is the file", () => {
  for (const p of GENERATED) assert.deepEqual(classifyPath(p), { kind: "generated", root: p }, p);
});

test("classifyPath: ordinary names stay unclassified", () => {
  for (const p of KEPT) assert.equal(classifyPath(p), null, p);
});

test("a run drops the named files, lists them in the dropped line, and --keep-generated counts them", async () => {
  const dir = createRepo("sl-genname-");
  try {
    const files = { "keep.txt": lines("k", 5), "data/rows.json": lines("r", 6), "data/rows.generated.json": lines("g", 6), "App.xcodeproj/project.pbxproj": lines("x", 6), "a.csproj": lines("c", 6) };
    commitAs(dir, "ada", "2026-01-01T10:00:00Z", "feat: add the files", files);
    const r = await analyse(parseArgs(["--cwd", dir]));
    assert.deepEqual(r.dropped.paths.map((/** @type {any} */ p) => p.path).sort(), ["App.xcodeproj/project.pbxproj", "data/rows.generated.json"]);
    assert.equal(r.dropped.classes.generated.files, 2);
    assert.match(droppedLine(r) ?? "", /rows\.generated\.json/);
    const k = await analyse(parseArgs(["--cwd", dir, "--keep-generated"]));
    assert.equal(k.dropped.files, 0);
  } finally {
    removeRepo(dir);
  }
});
