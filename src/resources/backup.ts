import type {
  BackupDestinationConfig,
  ScheduledBackupConfig,
  VolumeBackupConfig,
} from "../config.js";
import type { ResourceContext, ResourceRef } from "../types.js";
import {
  asArray,
  cleanPayload,
  getEntityId,
  getOneById,
  isDryRunId,
} from "./common.js";

export async function ensureBackupDestination(
  destination: BackupDestinationConfig,
  context: ResourceContext,
): Promise<ResourceRef> {
  const existing = await findDestination(destination.name, context);

  if (existing) {
    const id = getEntityId(existing, "destinationId");
    if (!id) throw new Error(`Backup destination ${destination.name} exists but no id was returned.`);

    if (context.dryRun) {
      context.log.action("would update", `backup destination ${destination.name}`);
    } else {
      await context.client.post("destination.update", {
        ...buildDestinationPayload(destination),
        destinationId: id,
      });
      context.log.action("updated", `backup destination ${destination.name}`);
    }

    const ref = { id, name: destination.name };
    context.state.backupDestinations[destination.name] = ref;
    return ref;
  }

  if (context.dryRun) {
    context.log.action("would create", `backup destination ${destination.name}`);
    return { id: `dry-run:destination:${destination.name}`, name: destination.name };
  }

  const created = await context.client.post("destination.create", buildDestinationPayload(destination));
  const id =
    getEntityId(created && typeof created === "object" ? (created as Record<string, unknown>) : undefined, "destinationId") ??
    getEntityId(await findDestination(destination.name, context), "destinationId");

  if (!id) {
    throw new Error(`Created backup destination ${destination.name}, but could not resolve its id.`);
  }

  context.log.action("created", `backup destination ${destination.name}`);
  const ref = { id, name: destination.name };
  context.state.backupDestinations[destination.name] = ref;
  return ref;
}

export async function ensureScheduledBackup(
  backup: ScheduledBackupConfig,
  context: ResourceContext,
): Promise<ResourceRef> {
  const destination = context.state.backupDestinations[backup.destination];
  if (!destination) {
    throw new Error(`Backup ${backup.name} references unknown destination ${backup.destination}.`);
  }

  const targetIdFields = resolveTargetIdFields(backup.target, backup.databaseType, backup.backupType, context);
  const existing = await getOneById(
    context.client,
    "backup.one",
    "backupId",
    context.state.backups[backup.name]?.id,
  );

  if (existing) {
    const id = getEntityId(existing, "backupId");
    if (!id) throw new Error(`Backup ${backup.name} exists but no id was returned.`);

    if (context.dryRun) {
      context.log.action("would update", `backup ${backup.name}`);
    } else {
      await context.client.post("backup.update", {
        ...buildScheduledBackupPayload(backup, destination.id, targetIdFields),
        backupId: id,
      });
      context.log.action("updated", `backup ${backup.name}`);
    }

    const ref = { id, name: backup.name };
    context.state.backups[backup.name] = ref;
    return ref;
  }

  if (context.dryRun || isDryRunId(destination.id)) {
    context.log.action("would create", `backup ${backup.name}`);
    return { id: `dry-run:backup:${backup.name}`, name: backup.name };
  }

  const created = await context.client.post(
    "backup.create",
    buildScheduledBackupPayload(backup, destination.id, targetIdFields),
  );
  const id = getEntityId(
    created && typeof created === "object" ? (created as Record<string, unknown>) : undefined,
    "backupId",
  );
  if (!id) {
    throw new Error(`Created backup ${backup.name}, but could not resolve its id.`);
  }

  context.log.action("created", `backup ${backup.name}`);
  const ref = { id, name: backup.name };
  context.state.backups[backup.name] = ref;
  return ref;
}

export async function ensureVolumeBackup(
  backup: VolumeBackupConfig,
  context: ResourceContext,
): Promise<ResourceRef> {
  const destination = context.state.backupDestinations[backup.destination];
  if (!destination) {
    throw new Error(`Volume backup ${backup.name} references unknown destination ${backup.destination}.`);
  }

  const existing = await getOneById(
    context.client,
    "volumeBackups.one",
    "volumeBackupId",
    context.state.volumeBackups[backup.name]?.id,
  );
  const payload = buildVolumeBackupPayload(backup, destination.id, context);

  if (existing) {
    const id = getEntityId(existing, "volumeBackupId");
    if (!id) throw new Error(`Volume backup ${backup.name} exists but no id was returned.`);

    if (context.dryRun) {
      context.log.action("would update", `volume backup ${backup.name}`);
    } else {
      await context.client.post("volumeBackups.update", {
        ...payload,
        volumeBackupId: id,
      });
      context.log.action("updated", `volume backup ${backup.name}`);
    }

    const ref = { id, name: backup.name };
    context.state.volumeBackups[backup.name] = ref;
    return ref;
  }

  if (context.dryRun || isDryRunId(destination.id)) {
    context.log.action("would create", `volume backup ${backup.name}`);
    return { id: `dry-run:volume-backup:${backup.name}`, name: backup.name };
  }

  const created = await context.client.post("volumeBackups.create", payload);
  const id = getEntityId(
    created && typeof created === "object" ? (created as Record<string, unknown>) : undefined,
    "volumeBackupId",
  );
  if (!id) {
    throw new Error(`Created volume backup ${backup.name}, but could not resolve its id.`);
  }

  context.log.action("created", `volume backup ${backup.name}`);
  const ref = { id, name: backup.name };
  context.state.volumeBackups[backup.name] = ref;
  return ref;
}

async function findDestination(name: string, context: ResourceContext) {
  const stateRef = context.state.backupDestinations[name];
  const fromState = await getOneById(
    context.client,
    "destination.one",
    "destinationId",
    stateRef?.id,
  );
  if (fromState) return fromState;

  const all = await context.client.get("destination.all");
  return asArray(all).find((destination) => destination.name === name);
}

function buildDestinationPayload(destination: BackupDestinationConfig): Record<string, unknown> {
  return cleanPayload({
    name: destination.name,
    provider: destination.provider ?? "s3",
    accessKey: destination.accessKey,
    bucket: destination.bucket,
    region: destination.region,
    endpoint: destination.endpoint,
    secretAccessKey: destination.secretAccessKey,
    serverId: destination.serverId,
  });
}

function buildScheduledBackupPayload(
  backup: ScheduledBackupConfig,
  destinationId: string,
  targetIdFields: Record<string, string | null>,
): Record<string, unknown> {
  return cleanPayload({
    schedule: backup.schedule,
    enabled: backup.enabled,
    prefix: backup.prefix,
    destinationId,
    keepLatestCount: backup.keepLatestCount ?? null,
    database: backup.database ?? backup.target,
    databaseType: backup.databaseType,
    backupType: backup.backupType,
    serviceName: backup.serviceName ?? null,
    metadata: backup.metadata ?? null,
    ...targetIdFields,
  });
}

function buildVolumeBackupPayload(
  backup: VolumeBackupConfig,
  destinationId: string,
  context: ResourceContext,
): Record<string, unknown> {
  return cleanPayload({
    name: backup.name,
    volumeName: backup.volumeName,
    prefix: backup.prefix,
    serviceType: backup.serviceType,
    appName: backup.appName ?? backup.target,
    serviceName: backup.serviceName ?? null,
    turnOff: backup.turnOff,
    cronExpression: backup.cronExpression,
    keepLatestCount: backup.keepLatestCount ?? null,
    enabled: backup.enabled,
    destinationId,
    ...resolveVolumeTargetIdFields(backup, context),
  });
}

function resolveTargetIdFields(
  target: string,
  databaseType: ScheduledBackupConfig["databaseType"],
  backupType: ScheduledBackupConfig["backupType"],
  context: ResourceContext,
): Record<string, string | null> {
  if (backupType === "compose") {
    const compose = context.state.compose[target];
    if (!compose) throw new Error(`Backup target compose ${target} was not found in state.`);
    return { composeId: compose.id, serviceName: null };
  }

  if (databaseType === "web-server") {
    return {};
  }

  const database = context.state.databases[target];
  if (!database) throw new Error(`Backup target database ${target} was not found in state.`);

  return {
    postgresId: databaseType === "postgres" ? database.id : null,
    mysqlId: databaseType === "mysql" ? database.id : null,
    mariadbId: databaseType === "mariadb" ? database.id : null,
    mongoId: databaseType === "mongo" ? database.id : null,
  };
}

function resolveVolumeTargetIdFields(
  backup: VolumeBackupConfig,
  context: ResourceContext,
): Record<string, string | null> {
  if (backup.serviceType === "application") {
    const app = context.state.applications[backup.target];
    if (!app) throw new Error(`Volume backup target application ${backup.target} was not found in state.`);
    return { applicationId: app.id };
  }

  if (backup.serviceType === "compose") {
    const compose = context.state.compose[backup.target];
    if (!compose) throw new Error(`Volume backup target compose ${backup.target} was not found in state.`);
    return { composeId: compose.id };
  }

  const database = context.state.databases[backup.target];
  if (!database) throw new Error(`Volume backup target database ${backup.target} was not found in state.`);

  return {
    postgresId: backup.serviceType === "postgres" ? database.id : null,
    mysqlId: backup.serviceType === "mysql" ? database.id : null,
    mariadbId: backup.serviceType === "mariadb" ? database.id : null,
    mongoId: backup.serviceType === "mongo" ? database.id : null,
    redisId: backup.serviceType === "redis" ? database.id : null,
  };
}

export async function destroyVolumeBackup(name: string, context: ResourceContext): Promise<void> {
  const ref = context.state.volumeBackups[name];
  if (!ref) return;

  if (context.dryRun) {
    context.log.action("would delete", `volume backup ${name}`);
  } else {
    await context.client.post("volumeBackups.delete", { volumeBackupId: ref.id });
    context.log.action("deleted", `volume backup ${name}`);
  }

  delete context.state.volumeBackups[name];
}

export async function destroyScheduledBackup(name: string, context: ResourceContext): Promise<void> {
  const ref = context.state.backups[name];
  if (!ref) return;

  if (context.dryRun) {
    context.log.action("would delete", `backup ${name}`);
  } else {
    await context.client.post("backup.remove", { backupId: ref.id });
    context.log.action("deleted", `backup ${name}`);
  }

  delete context.state.backups[name];
}

export async function destroyBackupDestination(name: string, context: ResourceContext): Promise<void> {
  const ref = context.state.backupDestinations[name];
  if (!ref) return;

  if (context.dryRun) {
    context.log.action("would delete", `backup destination ${name}`);
  } else {
    await context.client.post("destination.remove", { destinationId: ref.id });
    context.log.action("deleted", `backup destination ${name}`);
  }

  delete context.state.backupDestinations[name];
}
