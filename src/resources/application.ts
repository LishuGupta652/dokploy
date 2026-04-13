import type { AppConfig } from "../config.js";
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

export async function ensureApplication(
  app: AppConfig,
  environment: ResourceRef,
  context: ResourceContext,
): Promise<ResourceRef> {
  const existing = await findApplication(app.name, environment.id, context);

  const ref = existing
    ? await updateApplication(app, existing, context)
    : await createApplication(app, environment, context);

  await configureApplication(app, ref, context);

  const domainIds = await ensureDomains(app.domains, { type: "application", id: ref.id }, context);

  if (app.deploy) {
    if (context.dryRun || isDryRunId(ref.id)) {
      context.log.action("would deploy", `application ${app.name}`);
    } else {
      await context.client.post("application.deploy", {
        applicationId: ref.id,
        title: `Deploy ${app.name}`,
        description: "Triggered by dokploy",
      });
      context.log.action("deployed", `application ${app.name}`);
    }
  }

  const stateRef = {
    ...ref,
    domains: domainIds,
    deployed: app.deploy,
  };
  context.state.applications[app.name] = stateRef;
  return stateRef;
}

export async function findApplication(
  name: string,
  environmentId: string | undefined,
  context: ResourceContext,
) {
  const stateRef = context.state.applications[name];
  const fromState = await getOneById(
    context.client,
    "application.one",
    "applicationId",
    stateRef?.id,
  );
  if (fromState) return fromState;

  if (!environmentId || isDryRunId(environmentId)) return undefined;
  return findByName(context.client, "application.search", name, {
    environmentId,
  });
}

async function createApplication(
  app: AppConfig,
  environment: ResourceRef,
  context: ResourceContext,
): Promise<ResourceRef> {
  if (context.dryRun || isDryRunId(environment.id)) {
    context.log.action("would create", `application ${app.name}`);
    return { id: `dry-run:application:${app.name}`, name: app.name };
  }

  const created = await context.client.post("application.create", cleanPayload({
    name: app.name,
    appName: app.appName ?? slugifyAppName(app.name),
    description: app.description ?? null,
    environmentId: environment.id,
    serverId: app.serverId ?? null,
  }));

  const id =
    getEntityId(created && typeof created === "object" ? (created as Record<string, unknown>) : undefined, "applicationId") ??
    getEntityId(await findApplication(app.name, environment.id, context), "applicationId");

  if (!id) throw new Error(`Created application ${app.name}, but could not resolve its id.`);

  context.log.action("created", `application ${app.name}`);
  return { id, name: app.name };
}

async function updateApplication(
  app: AppConfig,
  existing: Record<string, unknown>,
  context: ResourceContext,
): Promise<ResourceRef> {
  const id = getEntityId(existing, "applicationId");
  if (!id) throw new Error(`Application ${app.name} exists but no id was returned.`);

  if (context.dryRun) {
    context.log.action("would update", `application ${app.name}`);
  } else {
    await context.client.post("application.update", cleanPayload({
      applicationId: id,
      name: app.name,
      appName: app.appName ?? slugifyAppName(app.name),
      description: app.description ?? null,
    }));
    context.log.action("updated", `application ${app.name}`);
  }

  return { id, name: app.name };
}

async function configureApplication(
  app: AppConfig,
  ref: ResourceRef,
  context: ResourceContext,
): Promise<void> {
  if (context.dryRun || isDryRunId(ref.id)) {
    context.log.action("would configure", `application ${app.name}`);
    return;
  }

  if (app.source === "github") {
    const github = app.github;
    if (!github) throw new Error(`Application ${app.name} is missing github config.`);

    await context.client.post("application.saveGithubProvider", {
      applicationId: ref.id,
      repository: github.repository,
      branch: github.branch,
      owner: github.owner,
      buildPath: github.buildPath,
      githubId: github.id,
      triggerType: github.triggerType,
      enableSubmodules: github.enableSubmodules,
      watchPaths: github.watchPaths ?? null,
    });
  }

  if (app.source === "git") {
    const git = app.git;
    if (!git) throw new Error(`Application ${app.name} is missing git config.`);

    await context.client.post("application.saveGitProvider", {
      applicationId: ref.id,
      customGitUrl: git.url,
      customGitBranch: git.branch,
      customGitBuildPath: git.buildPath,
      customGitSSHKeyId: git.sshKeyId ?? null,
      enableSubmodules: git.enableSubmodules,
      watchPaths: git.watchPaths ?? null,
    });
  }

  if (app.source === "docker") {
    const docker = app.docker;
    if (!docker) throw new Error(`Application ${app.name} is missing docker config.`);

    await context.client.post("application.saveDockerProvider", {
      applicationId: ref.id,
      dockerImage: docker.image,
      username: docker.username ?? null,
      password: docker.password ?? null,
      registryUrl: docker.registryUrl ?? null,
    });
  } else {
    await context.client.post("application.saveBuildType", {
      applicationId: ref.id,
      buildType: app.build.type,
      dockerfile: app.build.dockerfile ?? null,
      dockerContextPath: app.build.contextPath ?? null,
      dockerBuildStage: app.build.buildStage ?? null,
      herokuVersion: app.build.herokuVersion ?? null,
      railpackVersion: app.build.railpackVersion ?? null,
      publishDirectory: app.build.publishDirectory ?? null,
      isStaticSpa: app.build.isStaticSpa ?? null,
    });
  }

  await context.client.post("application.saveEnvironment", {
    applicationId: ref.id,
    env: formatEnv(app.env) ?? "",
    buildArgs: formatEnv(app.buildArgs) ?? "",
    buildSecrets: formatEnv(app.buildSecrets) ?? "",
    createEnvFile: app.createEnvFile,
  });

  context.log.action("configured", `application ${app.name}`);
}

export async function redeployApplication(ref: ResourceRef, context: ResourceContext): Promise<void> {
  if (context.dryRun) {
    context.log.action("would redeploy", `application ${ref.name}`);
    return;
  }

  await context.client.post("application.redeploy", {
    applicationId: ref.id,
    title: `Redeploy ${ref.name}`,
    description: "Triggered by dokploy",
  });
  context.log.action("redeployed", `application ${ref.name}`);
}

export async function destroyApplication(
  name: string,
  context: ResourceContext,
): Promise<void> {
  const ref = context.state.applications[name];
  if (!ref) return;

  await destroyDomainIds(ref.domains, context);

  if (context.dryRun) {
    context.log.action("would delete", `application ${name}`);
  } else {
    await context.client.post("application.delete", { applicationId: ref.id });
    context.log.action("deleted", `application ${name}`);
  }

  delete context.state.applications[name];
}
