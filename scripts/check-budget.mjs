// Audits exactly the Git-visible submission paths without changing Git metadata.
import { execFileSync } from "node:child_process";
import { lstat, readFile, writeFile } from "node:fs/promises";
const paths = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  ),
];
let bytes = 0;
const sizes = [];
const violations = [];
for (const path of paths) {
  if (path.startsWith(".imd/") || path.startsWith("test/scratch/")) continue;
  const stat = await lstat(path);
  if (stat.isSymbolicLink())
    violations.push(`Symlink must be reviewed: ${path}`);
  if (
    /(^|\/)(node_modules|\.vite|\.cache|npm-cache|\.npm)(\/|$)|\.tgz$|\.tsbuildinfo$/.test(
      path,
    )
  )
    violations.push(`Generated dependency/cache: ${path}`);
  if (/(^|\/)\.env(?:\.|$)|^\.github\//.test(path))
    violations.push(`Forbidden submission path: ${path}`);
  if (stat.isFile()) {
    bytes += stat.size;
    sizes.push({ path, bytes: stat.size });
  }
}
const ignoreBytes = (await readFile(".gitignore")).length;
if (ignoreBytes > 1024)
  violations.push("Ignore file exceeds its explicit 1024-byte budget");
const exported = paths.filter((p) => p.startsWith("dist/"));
if (!exported.includes("dist/index.html"))
  violations.push("Production dist/index.html is missing or ignored");
const pathBudgets = [
  {
    path: "dist/**",
    limitBytes: 3 * 1024 * 1024,
    actualBytes: sizes
      .filter((x) => x.path.startsWith("dist/"))
      .reduce((sum, x) => sum + x.bytes, 0),
  },
  {
    path: "artifacts/**",
    limitBytes: 2 * 1024 * 1024,
    actualBytes: sizes
      .filter((x) => x.path.startsWith("artifacts/"))
      .reduce((sum, x) => sum + x.bytes, 0),
  },
  {
    path: "source, manifests, docs, public assets and other allowed files",
    limitBytes: 3 * 1024 * 1024,
    actualBytes: sizes
      .filter(
        (x) => !x.path.startsWith("dist/") && !x.path.startsWith("artifacts/"),
      )
      .reduce((sum, x) => sum + x.bytes, 0),
  },
];
for (const budget of pathBudgets)
  if (budget.actualBytes > budget.limitBytes)
    violations.push(`Path budget exceeded: ${budget.path}`);
const report = {
  limitBytes: 8388608,
  totalBytes: bytes,
  remainingBytes: 8388608 - bytes,
  files: sizes.length,
  exportedFiles: exported.length,
  ignoreBudgetBytes: 1024,
  ignoreActualBytes: ignoreBytes,
  violations,
  pathBudgets,
  largestFiles: sizes.sort((a, b) => b.bytes - a.bytes).slice(0, 12),
};
console.log(JSON.stringify(report, null, 2));
await writeFile(
  "artifacts/submission-budget.json",
  JSON.stringify(report, null, 2) + "\n",
);
if (bytes > 8388608 || violations.length) process.exitCode = 1;
