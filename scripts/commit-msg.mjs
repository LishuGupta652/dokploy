#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowedTypes = new Set([
  "feat",
  "fix",
  "perf",
  "refactor",
  "docs",
  "test",
  "build",
  "ci",
  "chore",
  "style",
  "revert",
]);

const bumpByType = new Map([
  ["feat", "minor"],
  ["fix", "patch"],
  ["perf", "patch"],
]);

const messagePath = process.argv[2];
if (!messagePath) {
  console.error("Missing commit message file path.");
  process.exit(1);
}

const message = readFileSync(messagePath, "utf8");
const header = firstCommitMessageLine(message);

if (!header) {
  fail("Commit message is empty.");
}

if (process.env.SKIP_DOKPLOY_COMMIT_CHECK === "1") {
  process.exit(0);
}

if (isGeneratedCommit(header)) {
  process.exit(0);
}

const parsed = parseConventionalCommit(header);
if (!parsed) {
  fail(`Invalid commit message: ${header}`);
}

if (!allowedTypes.has(parsed.type)) {
  fail(`Unsupported commit type "${parsed.type}".`);
}

if (parsed.subject.trim().length === 0) {
  fail("Commit subject cannot be empty.");
}

const bump = resolveBump(parsed, message);
if (!bump) {
  console.log(`Commit type "${parsed.type}" does not change the package version.`);
  process.exit(0);
}

if (process.env.SKIP_DOKPLOY_VERSION_BUMP === "1") {
  console.log(`Skipping ${bump} version bump because SKIP_DOKPLOY_VERSION_BUMP=1.`);
  process.exit(0);
}

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(packageDir, "package.json");
const packageLockPath = path.join(packageDir, "package-lock.json");

const packageJson = readJson(packageJsonPath);
const nextVersion = bumpVersion(packageJson.version, bump);

if (process.env.DOKPLOY_VERSION_DRY_RUN === "1") {
  console.log(`${parsed.type} commit will create ${bump} version: ${packageJson.version} -> ${nextVersion}`);
  process.exit(0);
}

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

execFileSync("git", ["-C", packageDir, "add", packageJsonPath, packageLockPath], {
  stdio: "inherit",
});

console.log(`${parsed.type} commit created ${bump} version: ${packageJson.name}@${nextVersion}`);

function firstCommitMessageLine(rawMessage) {
  return rawMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));
}

function isGeneratedCommit(headerLine) {
  return (
    headerLine.startsWith("Merge ") ||
    headerLine.startsWith("Revert ") ||
    headerLine.startsWith("fixup!") ||
    headerLine.startsWith("squash!")
  );
}

function parseConventionalCommit(headerLine) {
  const match = headerLine.match(/^([a-z]+)(\([a-z0-9._/-]+\))?(!)?: (.+)$/);
  if (!match) return undefined;

  return {
    type: match[1],
    breaking: Boolean(match[3]),
    subject: match[4],
  };
}

function resolveBump(parsedCommit, rawMessage) {
  if (parsedCommit.breaking || /\nBREAKING[ -]CHANGE:/m.test(rawMessage)) {
    return "major";
  }
  return bumpByType.get(parsedCommit.type);
}

function bumpVersion(version, bump) {
  if (typeof version !== "string") {
    throw new Error("package.json version must be a string");
  }

  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(-.+)?$/);
  if (!match) {
    throw new Error(`Unsupported semver version: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  switch (bump) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unsupported bump type: ${bump}`);
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fail(messageText) {
  console.error(messageText);
  console.error("");
  console.error("Use Conventional Commits:");
  console.error("  feat: add project listing");
  console.error("  fix(projects): normalize Dokploy host");
  console.error("  feat!: change config schema");
  console.error("");
  console.error("Version bump rules:");
  console.error("  feat or feat(scope)  -> minor");
  console.error("  fix/perf             -> patch");
  console.error("  ! or BREAKING CHANGE -> major");
  console.error("  docs/chore/etc.      -> no version bump");
  process.exit(1);
}
