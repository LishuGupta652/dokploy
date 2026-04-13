#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.SKIP_DOKPLOY_VERSION_BUMP === "1") {
  process.exit(0);
}

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(packageDir, "package.json");
const packageLockPath = path.join(packageDir, "package-lock.json");

const packageJson = readJson(packageJsonPath);
const nextVersion = bumpPatch(packageJson.version);
packageJson.version = nextVersion;
writeJson(packageJsonPath, packageJson);

const packageLock = readJson(packageLockPath);
packageLock.name = packageJson.name;
packageLock.version = nextVersion;
if (packageLock.packages?.[""]) {
  packageLock.packages[""].name = packageJson.name;
  packageLock.packages[""].version = nextVersion;
  packageLock.packages[""].bin = packageJson.bin;
}
writeJson(packageLockPath, packageLock);

console.log(`Bumped ${packageJson.name} to ${nextVersion}`);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function bumpPatch(version) {
  if (typeof version !== "string") {
    throw new Error("package.json version must be a string");
  }

  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(-.+)?$/);
  if (!match) {
    throw new Error(`Unsupported semver version: ${version}`);
  }

  const major = match[1];
  const minor = match[2];
  const patch = Number(match[3]) + 1;
  return `${major}.${minor}.${patch}`;
}
