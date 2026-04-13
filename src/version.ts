import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function readPackageVersion(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = path.resolve(currentDir, "../package.json");

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      version?: unknown;
    };
    return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
