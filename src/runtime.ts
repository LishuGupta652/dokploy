import { DokployClient } from "./client.js";
import { loadConfig } from "./config.js";
import { Logger } from "./output.js";
import { readState, resolveStatePath } from "./state.js";
import type { ResourceContext } from "./types.js";

export type RuntimeOptions = {
  config?: string;
  state?: string;
  dryRun?: boolean;
};

export type ClientRuntimeOptions = {
  config?: string;
  host?: string;
};

export async function createRuntime(options: RuntimeOptions): Promise<
  ResourceContext & Awaited<ReturnType<typeof loadConfig>>
> {
  const loaded = await loadConfig(options.config);
  const host = process.env.DOKPLOY_HOST ?? loaded.config.host;
  const apiKey = process.env.DOKPLOY_API_KEY;

  if (!host) {
    throw new Error("Dokploy host is required. Set host in config or DOKPLOY_HOST.");
  }

  if (!apiKey) {
    throw new Error("DOKPLOY_API_KEY is required and is never read from config.");
  }

  const statePath = resolveStatePath(
    loaded.configPath,
    options.state,
    loaded.config.stateFile,
  );

  return {
    ...loaded,
    client: new DokployClient({ host, apiKey }),
    state: await readState(statePath),
    statePath,
    dryRun: Boolean(options.dryRun),
    log: new Logger(Boolean(options.dryRun)),
  };
}

export async function createClientRuntime(options: ClientRuntimeOptions): Promise<{
  client: DokployClient;
  log: Logger;
  host: string;
}> {
  const configHost = options.config ? (await loadConfig(options.config)).config.host : undefined;
  const host = options.host ?? process.env.DOKPLOY_HOST ?? configHost;
  const apiKey = process.env.DOKPLOY_API_KEY;

  if (!host) {
    throw new Error("Dokploy host is required. Pass --host, set DOKPLOY_HOST, or provide a config with host.");
  }

  if (!apiKey) {
    throw new Error("DOKPLOY_API_KEY is required.");
  }

  return {
    client: new DokployClient({ host, apiKey }),
    log: new Logger(false),
    host,
  };
}
