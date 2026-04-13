import type { DokployClient } from "../client.js";
import { DokployApiError } from "../client.js";
import type { Entity } from "../types.js";

export function asArray(value: unknown): Entity[] {
  if (Array.isArray(value)) return value.filter(isEntity);
  if (!isEntity(value)) return [];

  for (const key of ["items", "data", "results", "rows", "projects", "environments"]) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.filter(isEntity);
  }

  return [];
}

export function getEntityId(entity: Entity | undefined, preferredIdField?: string): string | undefined {
  if (!entity) return undefined;

  const idFields = [
    preferredIdField,
    "id",
    "projectId",
    "environmentId",
    "applicationId",
    "composeId",
    "domainId",
    "postgresId",
    "mysqlId",
    "mariadbId",
    "mongoId",
    "redisId",
    "destinationId",
    "backupId",
    "volumeBackupId",
  ].filter(Boolean) as string[];

  for (const field of idFields) {
    const value = entity[field];
    if (typeof value === "string" && value.length > 0) return value;
  }

  return undefined;
}

export async function getOneById(
  client: DokployClient,
  endpoint: string,
  idField: string,
  id: string | undefined,
): Promise<Entity | undefined> {
  if (!id) return undefined;

  try {
    const entity = await client.get(endpoint, { [idField]: id });
    return isEntity(entity) ? entity : undefined;
  } catch (error) {
    if (error instanceof DokployApiError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
}

export async function findByName(
  client: DokployClient,
  endpoint: string,
  name: string,
  query: Record<string, string | number | boolean | null | undefined> = {},
): Promise<Entity | undefined> {
  const result = await client.get(endpoint, {
    ...query,
    name,
    limit: 100,
    offset: 0,
  });
  const matches = asArray(result);
  return matches.find((entity) => entity.name === name || entity.appName === name);
}

export function cleanPayload<T extends Record<string, unknown>>(payload: T): T {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as T;
}

export function formatEnv(value: string | Record<string, string> | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return Object.entries(value)
    .map(([key, envValue]) => `${key}=${envValue}`)
    .join("\n");
}

export function slugifyAppName(name: string): string {
  const slug = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (slug || "app").slice(0, 63);
}

export function isDryRunId(id: string): boolean {
  return id.startsWith("dry-run:");
}

export function isEntity(value: unknown): value is Entity {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
