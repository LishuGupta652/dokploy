import chalk from "chalk";
import { DokployApiError } from "../client.js";
import { getOneById } from "../resources/common.js";
import { createRuntime, type RuntimeOptions } from "../runtime.js";
import type { ResourceRef } from "../types.js";

export async function statusCommand(options: RuntimeOptions): Promise<void> {
  const runtime = await createRuntime(options);
  const rows: Array<Record<string, unknown>> = [];

  runtime.log.header("Dokploy Status", runtime.statePath);

  if (runtime.state.project) {
    rows.push(await getStatus(runtime.state.project, "project", "project.one", "projectId", runtime));
  }
  if (runtime.state.environment) {
    rows.push(await getStatus(runtime.state.environment, "environment", "environment.one", "environmentId", runtime));
  }

  for (const ref of Object.values(runtime.state.databases)) {
    const idField = `${ref.type}Id`;
    rows.push(await getStatus(ref, `${ref.type} database`, `${ref.type}.one`, idField, runtime));
  }

  for (const ref of Object.values(runtime.state.applications)) {
    rows.push(await getStatus(ref, "application", "application.one", "applicationId", runtime));
  }

  for (const ref of Object.values(runtime.state.compose)) {
    rows.push(await getStatus(ref, "compose", "compose.one", "composeId", runtime));
  }

  for (const ref of Object.values(runtime.state.backupDestinations)) {
    rows.push(await getStatus(ref, "backup destination", "destination.one", "destinationId", runtime));
  }

  for (const ref of Object.values(runtime.state.backups)) {
    rows.push(await getStatus(ref, "backup", "backup.one", "backupId", runtime));
  }

  for (const ref of Object.values(runtime.state.volumeBackups)) {
    rows.push(await getStatus(ref, "volume backup", "volumeBackups.one", "volumeBackupId", runtime));
  }

  runtime.log.table(rows, [
    { key: "type", label: "Type" },
    { key: "name", label: "Name" },
    { key: "status", label: "Status" },
    { key: "id", label: "ID" },
  ]);
}

async function getStatus(
  ref: ResourceRef,
  label: string,
  endpoint: string,
  idField: string,
  runtime: Awaited<ReturnType<typeof createRuntime>>,
): Promise<Record<string, unknown>> {
  try {
    const remote = await getOneById(runtime.client, endpoint, idField, ref.id);
    if (!remote) {
      return statusRow(ref, label, "missing");
    }

    const status = pickStatus(remote);
    return statusRow(ref, label, status ?? "exists");
  } catch (error) {
    if (error instanceof DokployApiError && error.status === 404) {
      return statusRow(ref, label, "missing");
    }
    throw error;
  }
}

function pickStatus(remote: Record<string, unknown>): string | undefined {
  for (const key of ["applicationStatus", "composeStatus", "status"]) {
    const value = remote[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function statusRow(ref: ResourceRef, type: string, status: string): Record<string, unknown> {
  return {
    type,
    name: ref.name,
    status: colorStatus(status),
    id: chalk.gray(ref.id),
  };
}

function colorStatus(status: string): string {
  if (status === "exists" || status === "done" || status === "running") {
    return chalk.green(status);
  }
  if (status === "missing" || status === "error") {
    return chalk.red(status);
  }
  if (status === "idle") {
    return chalk.cyan(status);
  }
  return status;
}
