import type { DatabaseConfig } from "../config.js";
import type { ResourceContext, ResourceRef } from "../types.js";
import {
  cleanPayload,
  findByName,
  formatEnv,
  getEntityId,
  getOneById,
  isDryRunId,
  slugifyAppName,
} from "./common.js";

const idFields: Record<DatabaseConfig["type"], string> = {
  postgres: "postgresId",
  mysql: "mysqlId",
  mariadb: "mariadbId",
  mongo: "mongoId",
  redis: "redisId",
};

export async function ensureDatabase(
  database: DatabaseConfig,
  environment: ResourceRef,
  context: ResourceContext,
): Promise<ResourceRef> {
  const existing = await findDatabase(database.name, database.type, environment.id, context);
  const ref = existing
    ? await updateDatabase(database, existing, context)
    : await createDatabase(database, environment, context);

  await configureDatabase(database, ref, context);

  if (database.deploy) {
    if (context.dryRun || isDryRunId(ref.id)) {
      context.log.action("would deploy", `${database.type} database ${database.name}`);
    } else {
      await context.client.post(`${database.type}.deploy`, {
        [idFields[database.type]]: ref.id,
      });
      context.log.action("deployed", `${database.type} database ${database.name}`);
    }
  }

  const stateRef = {
    ...ref,
    type: database.type,
    deployed: database.deploy,
  };
  context.state.databases[database.name] = stateRef;
  return stateRef;
}

export async function findDatabase(
  name: string,
  type: DatabaseConfig["type"],
  environmentId: string | undefined,
  context: ResourceContext,
) {
  const stateRef = context.state.databases[name];
  const fromState = await getOneById(
    context.client,
    `${type}.one`,
    idFields[type],
    stateRef?.id,
  );
  if (fromState) return fromState;

  if (!environmentId || isDryRunId(environmentId)) return undefined;
  return findByName(context.client, `${type}.search`, name, {
    environmentId,
  });
}

async function createDatabase(
  database: DatabaseConfig,
  environment: ResourceRef,
  context: ResourceContext,
): Promise<ResourceRef> {
  if (context.dryRun || isDryRunId(environment.id)) {
    context.log.action("would create", `${database.type} database ${database.name}`);
    return { id: `dry-run:${database.type}:${database.name}`, name: database.name, type: database.type };
  }

  const created = await context.client.post(
    `${database.type}.create`,
    buildDatabaseCreatePayload(database, environment.id),
  );

  const id =
    getEntityId(created && typeof created === "object" ? (created as Record<string, unknown>) : undefined, idFields[database.type]) ??
    getEntityId(
      await findDatabase(database.name, database.type, environment.id, context),
      idFields[database.type],
    );

  if (!id) {
    throw new Error(
      `Created ${database.type} database ${database.name}, but could not resolve its id.`,
    );
  }

  context.log.action("created", `${database.type} database ${database.name}`);
  return { id, name: database.name, type: database.type };
}

async function updateDatabase(
  database: DatabaseConfig,
  existing: Record<string, unknown>,
  context: ResourceContext,
): Promise<ResourceRef> {
  const id = getEntityId(existing, idFields[database.type]);
  if (!id) {
    throw new Error(`${database.type} database ${database.name} exists but no id was returned.`);
  }

  if (context.dryRun) {
    context.log.action("would update", `${database.type} database ${database.name}`);
  } else {
    await context.client.post(
      `${database.type}.update`,
      buildDatabaseUpdatePayload(database, id),
    );
    context.log.action("updated", `${database.type} database ${database.name}`);
  }

  return { id, name: database.name, type: database.type };
}

async function configureDatabase(
  database: DatabaseConfig,
  ref: ResourceRef,
  context: ResourceContext,
): Promise<void> {
  const env = formatEnv(database.env);
  if (!env) return;

  if (context.dryRun || isDryRunId(ref.id)) {
    context.log.action("would configure", `${database.type} database ${database.name} env`);
    return;
  }

  await context.client.post(`${database.type}.saveEnvironment`, {
    [idFields[database.type]]: ref.id,
    env,
  });
  context.log.action("configured", `${database.type} database ${database.name} env`);
}

function buildDatabaseCreatePayload(
  database: DatabaseConfig,
  environmentId: string,
): Record<string, unknown> {
  const password = database.databasePassword ?? database.password;
  if (!password) {
    throw new Error(
      `Database ${database.name} requires password or databasePassword because the Dokploy API requires it on create.`,
    );
  }

  const common = cleanPayload({
    name: database.name,
    appName: database.appName ?? slugifyAppName(database.name),
    description: database.description ?? null,
    dockerImage: database.image ?? imageFromVersion(database),
    environmentId,
    serverId: database.serverId ?? null,
  });

  if (database.type === "redis") {
    return cleanPayload({
      ...common,
      databasePassword: password,
    });
  }

  if (database.type === "mongo") {
    return cleanPayload({
      ...common,
      databaseUser: database.databaseUser ?? database.user ?? slugifyAppName(database.name),
      databasePassword: password,
      replicaSets: database.replicaSets ?? null,
    });
  }

  return cleanPayload({
    ...common,
    databaseName: database.databaseName ?? slugifyAppName(database.name).replaceAll("-", "_"),
    databaseUser: database.databaseUser ?? database.user ?? slugifyAppName(database.name),
    databasePassword: password,
    databaseRootPassword: database.databaseRootPassword ?? database.rootPassword,
  });
}

function buildDatabaseUpdatePayload(
  database: DatabaseConfig,
  id: string,
): Record<string, unknown> {
  return cleanPayload({
    [idFields[database.type]]: id,
    name: database.name,
    appName: database.appName ?? slugifyAppName(database.name),
    description: database.description ?? null,
    dockerImage: database.image ?? imageFromVersion(database),
    databaseName: database.type === "redis" || database.type === "mongo"
      ? undefined
      : database.databaseName ?? slugifyAppName(database.name).replaceAll("-", "_"),
    databaseUser: database.type === "redis"
      ? undefined
      : database.databaseUser ?? database.user,
    databasePassword: database.databasePassword ?? database.password,
    databaseRootPassword: database.databaseRootPassword ?? database.rootPassword,
    replicaSets: database.type === "mongo" ? database.replicaSets ?? null : undefined,
  });
}

function imageFromVersion(database: DatabaseConfig): string | undefined {
  if (!database.version) return undefined;
  return `${database.type}:${database.version}`;
}

export async function destroyDatabase(name: string, context: ResourceContext): Promise<void> {
  const ref = context.state.databases[name];
  if (!ref?.type) return;

  const type = ref.type as DatabaseConfig["type"];
  const idField = idFields[type];
  if (!idField) throw new Error(`Unsupported database type in state for ${name}: ${ref.type}`);

  if (context.dryRun) {
    context.log.action("would delete", `${type} database ${name}`);
  } else {
    await context.client.post(`${type}.remove`, { [idField]: ref.id });
    context.log.action("deleted", `${type} database ${name}`);
  }

  delete context.state.databases[name];
}
