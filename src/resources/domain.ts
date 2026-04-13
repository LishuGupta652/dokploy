import type { DomainConfig } from "../config.js";
import type { ResourceContext } from "../types.js";
import {
  asArray,
  cleanPayload,
  getEntityId,
  getOneById,
  isDryRunId,
} from "./common.js";

type DomainOwner =
  | { type: "application"; id: string }
  | { type: "compose"; id: string };

export async function ensureDomains(
  domains: DomainConfig[],
  owner: DomainOwner,
  context: ResourceContext,
): Promise<string[]> {
  const ids: string[] = [];

  for (const domain of domains) {
    const id = await ensureDomain(domain, owner, context);
    ids.push(id);
  }

  return ids;
}

async function ensureDomain(
  domain: DomainConfig,
  owner: DomainOwner,
  context: ResourceContext,
): Promise<string> {
  if (isDryRunId(owner.id)) {
    context.log.action("would create", `domain ${domain.host}`);
    return `dry-run:domain:${domain.host}`;
  }

  const existing = await findExistingDomain(domain, owner, context);
  if (existing) {
    const id = getEntityId(existing, "domainId");
    if (!id) throw new Error(`Domain ${domain.host} exists but no id was returned.`);

    if (context.dryRun) {
      context.log.action("would update", `domain ${domain.host}`);
    } else {
      await context.client.post("domain.update", {
        ...buildDomainPayload(domain, owner),
        domainId: id,
      });
      context.log.action("updated", `domain ${domain.host}`);
    }

    return id;
  }

  if (context.dryRun) {
    context.log.action("would create", `domain ${domain.host}`);
    return `dry-run:domain:${domain.host}`;
  }

  const created = await context.client.post("domain.create", buildDomainPayload(domain, owner));
  const createdId =
    getEntityId(created && typeof created === "object" ? (created as Record<string, unknown>) : undefined, "domainId") ??
    getEntityId(await findExistingDomain(domain, owner, context), "domainId");

  if (!createdId) {
    throw new Error(`Created domain ${domain.host}, but could not resolve its id.`);
  }

  context.log.action("created", `domain ${domain.host}`);
  return createdId;
}

async function findExistingDomain(
  domain: DomainConfig,
  owner: DomainOwner,
  context: ResourceContext,
) {
  const endpoint =
    owner.type === "application" ? "domain.byApplicationId" : "domain.byComposeId";
  const query =
    owner.type === "application"
      ? { applicationId: owner.id }
      : { composeId: owner.id };

  const result = await context.client.get(endpoint, query);
  return asArray(result).find((candidate) => {
    const sameHost = candidate.host === domain.host;
    const sameService =
      owner.type !== "compose" || (candidate.serviceName ?? null) === (domain.serviceName ?? null);
    return sameHost && sameService;
  });
}

function buildDomainPayload(domain: DomainConfig, owner: DomainOwner): Record<string, unknown> {
  return cleanPayload({
    host: domain.host,
    path: domain.path ?? "/",
    port: domain.port ?? null,
    https: domain.https,
    applicationId: owner.type === "application" ? owner.id : null,
    certificateType: domain.certificate,
    customCertResolver: domain.customCertResolver ?? null,
    composeId: owner.type === "compose" ? owner.id : null,
    serviceName: owner.type === "compose" ? domain.serviceName ?? null : null,
    domainType: owner.type,
    previewDeploymentId: null,
    internalPath: domain.internalPath ?? null,
    stripPath: domain.stripPath,
  });
}

export async function destroyDomainIds(
  domainIds: string[] | undefined,
  context: ResourceContext,
): Promise<void> {
  for (const domainId of domainIds ?? []) {
    if (isDryRunId(domainId)) continue;

    const existing = await getOneById(context.client, "domain.one", "domainId", domainId);
    const label =
      existing && typeof existing.host === "string" ? existing.host : domainId;

    if (context.dryRun) {
      context.log.action("would delete", `domain ${label}`);
    } else {
      await context.client.post("domain.delete", { domainId });
      context.log.action("deleted", `domain ${label}`);
    }
  }
}
