import type { DokployConfig } from "../config.js";
import type { ResourceContext, ResourceRef } from "../types.js";
import {
  cleanPayload,
  findByName,
  formatEnv,
  getEntityId,
  getOneById,
} from "./common.js";

export async function ensureProject(
  config: DokployConfig["project"],
  context: ResourceContext,
): Promise<ResourceRef> {
  const existing =
    (await getOneById(
      context.client,
      "project.one",
      "projectId",
      context.state.project?.id,
    )) ?? (await findByName(context.client, "project.search", config.name));

  if (existing) {
    const id = getEntityId(existing, "projectId");
    if (!id) throw new Error(`Project ${config.name} exists but no project id was returned.`);

    if (context.dryRun) {
      context.log.action("would update", `project ${config.name}`);
    } else {
      await context.client.post("project.update", cleanPayload({
        projectId: id,
        name: config.name,
        description: config.description ?? null,
        env: formatEnv(config.env) ?? "",
      }));
      context.log.action("updated", `project ${config.name}`);
    }

    context.state.project = { id, name: config.name };
    return context.state.project;
  }

  if (context.dryRun) {
    context.log.action("would create", `project ${config.name}`);
    return { id: `dry-run:project:${config.name}`, name: config.name };
  }

  const created = await context.client.post("project.create", cleanPayload({
    name: config.name,
    description: config.description ?? null,
    env: formatEnv(config.env) ?? "",
  }));
  const createdId =
    getEntityId(created && typeof created === "object" ? (created as Record<string, unknown>) : undefined, "projectId") ??
    getEntityId(await findByName(context.client, "project.search", config.name), "projectId");

  if (!createdId) {
    throw new Error(`Created project ${config.name}, but could not resolve its project id.`);
  }

  context.log.action("created", `project ${config.name}`);
  context.state.project = { id: createdId, name: config.name };
  return context.state.project;
}

export async function destroyProject(context: ResourceContext): Promise<void> {
  const project = context.state.project;
  if (!project) return;

  if (context.dryRun) {
    context.log.action("would delete", `project ${project.name}`);
    return;
  }

  await context.client.post("project.remove", { projectId: project.id });
  context.log.action("deleted", `project ${project.name}`);
  delete context.state.project;
}
