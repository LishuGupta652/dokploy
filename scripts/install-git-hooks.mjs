#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = execFileSync("git", ["-C", packageDir, "rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const hooksPath = path.relative(repoRoot, path.join(packageDir, ".githooks"));

execFileSync("git", ["-C", repoRoot, "config", "core.hooksPath", hooksPath], {
  stdio: "inherit",
});

console.log(`Installed git hooks path: ${hooksPath}`);
