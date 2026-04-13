#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(packageDir, "package.json");
const changelogPath = path.join(packageDir, "CHANGELOG.md");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

const packageJson = readJson(packageJsonPath);
const version = stringValue(packageJson.version, "0.0.0");
const today = new Date().toISOString().slice(0, 10);
const lastTag = getLastTag();
const commits = getCommits(lastTag);
const section = renderVersionSection(version, today, lastTag, commits);

if (dryRun) {
  console.log(section.trimEnd());
  process.exit(0);
}

const currentChangelog = readChangelog();
const nextChangelog = upsertVersionSection(currentChangelog, version, section);
writeFileSync(changelogPath, nextChangelog, "utf8");

console.log(`Updated CHANGELOG.md for ${packageJson.name}@${version}`);

function getLastTag() {
  try {
    return execFileSync("git", ["-C", packageDir, "describe", "--tags", "--abbrev=0"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function getCommits(tag) {
  const range = tag ? [`${tag}..HEAD`] : [];
  const output = execFileSync(
    "git",
    [
      "-C",
      packageDir,
      "log",
      "--date=short",
      "--pretty=format:%H%x1f%ad%x1f%s%x1f%b%x1e",
      ...range,
    ],
    { encoding: "utf8" },
  );

  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map(parseCommit);
}

function parseCommit(record) {
  const [hash = "", date = "", subject = "", body = ""] = record.split("\x1f");
  const conventional = subject.match(/^([a-z]+)(\([a-z0-9._/-]+\))?(!)?: (.+)$/);

  if (!conventional) {
    return {
      hash,
      date,
      type: "other",
      breaking: /\nBREAKING[ -]CHANGE:/m.test(body),
      subject,
    };
  }

  return {
    hash,
    date,
    type: conventional[1],
    breaking: Boolean(conventional[3]) || /\nBREAKING[ -]CHANGE:/m.test(body),
    subject: conventional[4],
  };
}

function renderVersionSection(nextVersion, date, tag, commits) {
  const lines = [`## ${nextVersion} - ${date}`, ""];
  lines.push(tag ? `_Changes since ${tag}._` : "_Initial changelog generated from repository history._");
  lines.push("");

  if (commits.length === 0) {
    lines.push("- No commits found since the last tag.", "");
    return `${lines.join("\n")}\n`;
  }

  const breaking = commits.filter((commit) => commit.breaking);
  appendGroup(lines, "Breaking Changes", breaking);

  const grouped = [
    ["Features", ["feat"]],
    ["Fixes", ["fix"]],
    ["Performance", ["perf"]],
    ["Refactoring", ["refactor"]],
    ["Documentation", ["docs"]],
    ["Tests", ["test"]],
    ["Build", ["build"]],
    ["CI", ["ci"]],
    ["Chores", ["chore"]],
    ["Styles", ["style"]],
    ["Reverts", ["revert"]],
    ["Other Changes", ["other"]],
  ];

  for (const [title, types] of grouped) {
    appendGroup(
      lines,
      title,
      commits.filter((commit) => types.includes(commit.type) && !commit.breaking),
    );
  }

  return `${lines.join("\n").trimEnd()}\n\n`;
}

function appendGroup(lines, title, commits) {
  if (commits.length === 0) return;

  lines.push(`### ${title}`, "");
  for (const commit of commits) {
    lines.push(`- ${commit.subject} (${commit.hash.slice(0, 7)})`);
  }
  lines.push("");
}

function upsertVersionSection(currentChangelog, nextVersion, section) {
  const header = "# Changelog\n\n";
  const body = currentChangelog.startsWith("# Changelog\n")
    ? currentChangelog.slice(header.length)
    : currentChangelog.trimStart();
  const versionHeader = `## ${nextVersion} - `;
  const start = body.indexOf(versionHeader);

  if (start === -1) {
    return `${header}${section}${body.trimStart()}`;
  }

  const nextSectionStart = body.indexOf("\n## ", start + 1);
  const before = body.slice(0, start);
  const after = nextSectionStart === -1 ? "" : body.slice(nextSectionStart + 1);

  return `${header}${before}${section}${after}`.replace(/\n{3,}/g, "\n\n");
}

function readChangelog() {
  try {
    return readFileSync(changelogPath, "utf8");
  } catch {
    return "# Changelog\n\n";
  }
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function stringValue(value, fallback) {
  return typeof value === "string" ? value : fallback;
}
