#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(packageDir, "package.json");
const packageLockPath = path.join(packageDir, "package-lock.json");
const options = parseArgs(process.argv.slice(2));

const packageJson = readJson(packageJsonPath);
const packageName = stringValue(packageJson.name, "");
let version = stringValue(packageJson.version, "");

if (!packageName || !version) {
  throw new Error("package.json must contain name and version.");
}

let attempts = 0;
while (isVersionPublished(options.packageManager, packageName, version)) {
  if (options.bump === "none") {
    console.error(`${packageName}@${version} is already published.`);
    console.error("Pass --bump patch|minor|major or update package.json before publishing.");
    process.exit(1);
  }

  const nextVersion = bumpVersion(version, options.bump);
  console.log(`${packageName}@${version} is already published. Bumping ${options.bump}: ${nextVersion}`);
  version = nextVersion;
  attempts += 1;

  if (attempts > 20) {
    throw new Error("Stopped after 20 version bump attempts.");
  }
}

if (version === packageJson.version) {
  console.log(`${packageName}@${version} is not published yet.`);
  process.exit(0);
}

if (options.dryRun) {
  console.log(`Dry run: would update ${packageName} to ${version}.`);
  process.exit(0);
}

packageJson.version = version;
writeJson(packageJsonPath, packageJson);

if (existsSync(packageLockPath)) {
  const packageLock = readJson(packageLockPath);
  packageLock.name = packageJson.name;
  packageLock.version = version;
  if (packageLock.packages?.[""]) {
    packageLock.packages[""].name = packageJson.name;
    packageLock.packages[""].version = version;
    packageLock.packages[""].bin = packageJson.bin;
  }
  writeJson(packageLockPath, packageLock);
}

console.log(`Updated package version to ${packageName}@${version}.`);

function parseArgs(args) {
  const parsed = {
    bump: "patch",
    packageManager: "npm",
    dryRun: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--bump":
        parsed.bump = stringArg(args, index);
        index += 1;
        break;
      case "--package-manager":
        parsed.packageManager = stringArg(args, index);
        index += 1;
        break;
      case "--dry-run":
        parsed.dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["patch", "minor", "major", "none"].includes(parsed.bump)) {
    throw new Error("--bump must be patch, minor, major, or none.");
  }
  if (!["npm", "pnpm"].includes(parsed.packageManager)) {
    throw new Error("--package-manager must be npm or pnpm.");
  }

  return parsed;
}

function stringArg(args, index) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${args[index]}.`);
  }
  return value;
}

function isVersionPublished(packageManager, packageName, version) {
  try {
    const output = execFileSync(
      packageManager,
      ["view", `${packageName}@${version}`, "version", "--json"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();

    return output.length > 0 && output !== "null";
  } catch (error) {
    const stderr = String(error.stderr ?? "");
    if (stderr.includes("E404") || stderr.includes("404 Not Found")) {
      return false;
    }
    throw error;
  }
}

function bumpVersion(version, bump) {
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

function stringValue(value, fallback) {
  return typeof value === "string" ? value : fallback;
}
