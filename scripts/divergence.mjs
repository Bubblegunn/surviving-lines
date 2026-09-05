// Does an author's share of commits predict their share of the code still alive?
//
// Line survival is studied (Spinellis et al. 2021, doi 10.7717/peerj-cs.372; Gurov 2026,
// arXiv 2606.04993) but both measure lines, not people. This harness measures both shares
// per author, over a sample of repositories, and writes one row per author.
//
// Clone, measure, delete, stream: disk stays bounded and the sample can grow later.
// Usage: node scripts/divergence.mjs repos.txt out.tsv [sample] [seeds]
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, appendFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = join(fileURLToPath(new URL(".", import.meta.url)), "..", "bin", "surviving-lines.js");
const [listPath, outPath, sampleArg, seedsArg] = process.argv.slice(2);
if (!listPath || !outPath) { console.error("usage: divergence.mjs repos.txt out.tsv [sample] [seeds]"); process.exit(2); }
const sample = sampleArg ?? "5";
const seeds = (seedsArg ?? "a,b,c").split(",");

const repos = readFileSync(listPath, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
if (!existsSync(outPath)) appendFileSync(outPath, ["repo", "seed", "author", "commits", "commitShare", "lines", "lineShare", "gap", "filesSampled", "filesTotal", "authorsTotal"].join("\t") + "\n");

const done = new Set(existsSync(outPath) ? readFileSync(outPath, "utf8").split("\n").slice(1).map((l) => l.split("\t")[0] + "\t" + l.split("\t")[1]) : []);

for (const repo of repos) {
  const dir = mkdtempSync(join(tmpdir(), "div-"));
  const work = join(dir, "r");
  try {
    if (seeds.every((s) => done.has(`${repo}\t${s}`))) { console.log(`skip ${repo}`); continue; }
    execFileSync("git", ["clone", "--quiet", "--single-branch", `https://github.com/${repo}.git`, work], { stdio: ["ignore", "ignore", "pipe"], timeout: 600000 });
    for (const seed of seeds) {
      if (done.has(`${repo}\t${seed}`)) continue;
      const out = execFileSync(process.execPath, [bin, "--cwd", work, "--sample", sample, "--seed", seed, "--top", "1000", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 900000 });
      const r = JSON.parse(out);
      const rows = r.authors.map((a) =>
        [repo, seed, a.author.replace(/\t/g, " "), a.commits, a.commitShare.toFixed(6), a.lines, a.lineShare.toFixed(6), (a.lineShare - a.commitShare).toFixed(6), r.sample.filesSampled, r.sample.filesTotal, r.authors.length].join("\t"),
      );
      appendFileSync(outPath, rows.join("\n") + "\n");
      console.log(`${repo} seed ${seed}: ${r.authors.length} authors, ${r.sample.filesSampled}/${r.sample.filesTotal} files`);
    }
  } catch (err) {
    console.error(`skip ${repo}: ${String(err.message ?? err).split("\n")[0].slice(0, 120)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
