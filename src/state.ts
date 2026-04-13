import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ResourceRef } from "./types.js";

export type DokployState = {
  version: 1;
  project?: ResourceRef;
  environment?: ResourceRef;
  applications: Record<string, ResourceRef>;
  compose: Record<string, ResourceRef>;
  databases: Record<string, ResourceRef>;
  backupDestinations: Record<string, ResourceRef>;
  backups: Record<string, ResourceRef>;
  volumeBackups: Record<string, ResourceRef>;
};

export function createEmptyState(): DokployState {
  return {
    version: 1,
    applications: {},
    compose: {},
    databases: {},
    backupDestinations: {},
    backups: {},
    volumeBackups: {},
  };
}

export async function readState(statePath: string): Promise<DokployState> {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DokployState>;

    return {
      ...createEmptyState(),
      ...parsed,
      version: 1,
      applications: parsed.applications ?? {},
      compose: parsed.compose ?? {},
      databases: parsed.databases ?? {},
      backupDestinations: parsed.backupDestinations ?? {},
      backups: parsed.backups ?? {},
      volumeBackups: parsed.volumeBackups ?? {},
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return createEmptyState();
    }
    throw error;
  }
}

export async function writeState(statePath: string, state: DokployState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function resolveStatePath(
  configPath: string,
  statePathOption?: string,
  configStateFile?: string,
): string {
  const statePath = statePathOption ?? configStateFile ?? "dokploy-state.json";
  if (path.isAbsolute(statePath)) return statePath;
  return path.resolve(path.dirname(configPath), statePath);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
