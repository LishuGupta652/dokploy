import type { ComposeConfig } from "../config.js";
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
import { destroyDomainIds, ensureDomains } from "./domain.js";

export async function ensureCompose(
  compose: ComposeConfig,
  environment: ResourceRef,
  context: ResourceContext,
): Promise<ResourceRef> {
  const existing = await findCompose(compose.name, environment.id, context);
  const ref = existing
    ? await updateCompose(compose, existing, context)
    : await createCompose(compose, environment, context);

  await configureCompose(compose, ref, context);

  const domainIds = await ensureDomains(compose.domains, { type: "compose", id: ref.id }, context);

  if (compose.deploy) {
    if (context.dryRun || isDryRunId(ref.id)) {
      context.log.action("would deploy", `compose ${compose.name}`);
    } else {
      await context.client.post("compose.deploy", {
        composeId: ref.id,
        title: `Deploy ${compose.name}`,
        description: "Triggered by dokploy",
      });
      context.log.action("deployed", `compose ${compose.name}`);
    }
  }

  const stateRef = {
    ...ref,
    domains: domainIds,
    deployed: compose.deploy,
  };
  context.state.compose[compose.name] = stateRef;
  return stateRef;
}

export async function findCompose(
  name: string,
  environmentId: string | undefined,
  context: ResourceContext,
) {
  const stateRef = context.state.compose[name];
  const fromState = await getOneById(context.client, "compose.one", "composeId", stateRef?.id);
  if (fromState) return fromState;

  if (!environmentId || isDryRunId(environmentId)) return undefined;
  return findByName(context.client, "compose.search", name, {
    environmentId,
  });
}

async function createCompose(
  compose: ComposeConfig,
  environment: ResourceRef,
  context: ResourceContext,
): Promise<ResourceRef> {
  if (context.dryRun || isDryRunId(environment.id)) {
    context.log.action("would create", `compose ${compose.name}`);
    return { id: `dry-run:compose:${compose.name}`, name: compose.name };
  }

  const created = await context.client.post("compose.create", cleanPayload({
    name: compose.name,
    appName: compose.appName ?? slugifyAppName(compose.name),
    description: compose.description ?? null,
    environmentId: environment.id,
    composeType: compose.composeType,
    composeFile: compose.content ?? compose.composeFile ?? "",
    serverId: compose.serverId ?? null,
  }));

  const id =
    getEntityId(created && typeof created === "object" ? (created as Record<string, unknown>) : undefined, "composeId") ??
    getEntityId(await findCompose(compose.name, environment.id, context), "composeId");

  if (!id) throw new Error(`Created compose ${compose.name}, but could not resolve its id.`);

  context.log.action("created", `compose ${compose.name}`);
  return { id, name: compose.name };
}

async function updateCompose(
  compose: ComposeConfig,
  existing: Record<string, unknown>,
  context: ResourceContext,
): Promise<ResourceRef> {
  const id = getEntityId(existing, "composeId");
  if (!id) throw new Error(`Compose ${compose.name} exists but no id was returned.`);

  if (context.dryRun) {
    context.log.action("would update", `compose ${compose.name}`);
  } else {
    await context.client.post("compose.update", buildComposeUpdatePayload(compose, id));
    context.log.action("updated", `compose ${compose.name}`);
  }

  return { id, name: compose.name };
}

async function configureCompose(
  compose: ComposeConfig,
  ref: ResourceRef,
  context: ResourceContext,
): Promise<void> {
  if (context.dryRun || isDryRunId(ref.id)) {
    context.log.action("would configure", `compose ${compose.name}`);
    return;
  }

  await context.client.post("compose.update", buildComposeUpdatePayload(compose, ref.id));
  context.log.action("configured", `compose ${compose.name}`);
}

function buildComposeUpdatePayload(compose: ComposeConfig, composeId: string): Record<string, unknown> {
  const git = compose.git;

  return cleanPayload({
    composeId,
    name: compose.name,
    appName: compose.appName ?? slugifyAppName(compose.name),
    description: compose.description ?? null,
    env: formatEnv(compose.env) ?? "",
    composeFile: compose.content ?? compose.composeFile ?? "",
    sourceType: compose.source,
    composeType: compose.composeType,
    repository: git?.repository ?? null,
    owner: git?.owner ?? null,
    branch: git?.branch ?? null,
    githubId: compose.source === "github" ? git?.id ?? null : null,
    customGitUrl: compose.source === "git" ? git?.url ?? null : null,
    customGitBranch: compose.source === "git" ? git?.branch ?? null : null,
    customGitSSHKeyId: compose.source === "git" ? git?.sshKeyId ?? null : null,
    composePath: compose.source === "raw" ? "./docker-compose.yml" : git?.composePath,
    enableSubmodules: git?.enableSubmodules ?? false,
    watchPaths: git?.watchPaths ?? null,
    triggerType: git?.triggerType ?? null,
  });
}

export async function redeployCompose(ref: ResourceRef, context: ResourceContext): Promise<void> {
  if (context.dryRun) {
    context.log.action("would redeploy", `compose ${ref.name}`);
    return;
  }

  await context.client.post("compose.redeploy", {
    composeId: ref.id,
    title: `Redeploy ${ref.name}`,
    description: "Triggered by dokploy",
  });
  context.log.action("redeployed", `compose ${ref.name}`);
}

export async function destroyCompose(
  name: string,
  context: ResourceContext,
  deleteVolumes: boolean,
): Promise<void> {
  const ref = context.state.compose[name];
  if (!ref) return;

  await destroyDomainIds(ref.domains, context);

  if (context.dryRun) {
    context.log.action("would delete", `compose ${name}`);
  } else {
    await context.client.post("compose.delete", {
      composeId: ref.id,
      deleteVolumes,
    });
    context.log.action("deleted", `compose ${name}`);
  }

  delete context.state.compose[name];
}
