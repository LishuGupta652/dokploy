import type { DokployConfig } from "../config.js";
import type { ResourceContext, ResourceRef } from "../types.js";
import {
  asArray,
  cleanPayload,
  findByName,
  formatEnv,
  getEntityId,
  getOneById,
  isDryRunId,
} from "./common.js";

export async function ensureEnvironment(
  config: DokployConfig["environment"],
  project: ResourceRef,
  context: ResourceContext,
): Promise<ResourceRef> {
  if (!config) {
    return ensureDefaultEnvironment(project, context);
  }

  const existing =
    (await getOneById(
      context.client,
      "environment.one",
      "environmentId",
      context.state.environment?.id,
    )) ??
    (await findByName(context.client, "environment.search", config.name, {
      projectId: project.id,
    }));

  if (existing) {
    const id = getEntityId(existing, "environmentId");
    if (!id) throw new Error(`Environment ${config.name} exists but no id was returned.`);

    if (context.dryRun) {
      context.log.action("would update", `environment ${config.name}`);
    } else {
      await context.client.post("environment.update", cleanPayload({
        environmentId: id,
        name: config.name,
        description: config.description ?? "",
        projectId: project.id,
        env: formatEnv(config.env) ?? "",
      }));
      context.log.action("updated", `environment ${config.name}`);
    }

    context.state.environment = { id, name: config.name };
    return context.state.environment;
  }

  if (context.dryRun) {
    context.log.action("would create", `environment ${config.name}`);
    return { id: `dry-run:environment:${config.name}`, name: config.name };
  }

  const created = await context.client.post("environment.create", cleanPayload({
    name: config.name,
    description: config.description ?? "",
    projectId: project.id,
  }));
  const createdId =
    getEntityId(created && typeof created === "object" ? (created as Record<string, unknown>) : undefined, "environmentId") ??
    getEntityId(
      await findByName(context.client, "environment.search", config.name, {
        projectId: project.id,
      }),
      "environmentId",
    );

  if (!createdId) {
    throw new Error(`Created environment ${config.name}, but could not resolve its id.`);
  }

  context.log.action("created", `environment ${config.name}`);
  context.state.environment = { id: createdId, name: config.name };
  return context.state.environment;
}

async function ensureDefaultEnvironment(
  project: ResourceRef,
  context: ResourceContext,
): Promise<ResourceRef> {
  if (isDryRunId(project.id)) {
    context.log.action("would use", "the project's default environment");
    return { id: `dry-run:environment:default`, name: "default" };
  }

  const existing = await context.client.get("environment.byProjectId", {
    projectId: project.id,
  });
  const environments = asArray(existing);
  const defaultEnvironment = environments[0];

  if (defaultEnvironment) {
    const id = getEntityId(defaultEnvironment, "environmentId");
    if (!id) throw new Error(`Default environment for project ${project.name} has no id.`);

    const name =
      typeof defaultEnvironment.name === "string" ? defaultEnvironment.name : "default";
    context.log.action("using", `environment ${name}`);
    context.state.environment = { id, name };
    return context.state.environment;
  }

  const fallback = {
    name: "production",
    description: "production environment",
    env: {},
  };

  context.log.warn(
    `Project ${project.name} did not return a default environment; creating production.`,
  );
  return ensureEnvironment(fallback, project, context);
}

export async function destroyEnvironment(context: ResourceContext): Promise<void> {
  const environment = context.state.environment;
  if (!environment) return;

  if (context.dryRun) {
    context.log.action("would delete", `environment ${environment.name}`);
    return;
  }

  await context.client.post("environment.remove", { environmentId: environment.id });
  context.log.action("deleted", `environment ${environment.name}`);
  delete context.state.environment;
}
