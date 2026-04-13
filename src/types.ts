import type { DokployClient } from "./client.js";
import type { AppConfig, ComposeConfig, DatabaseConfig } from "./config.js";
import type { Logger } from "./output.js";
import type { DokployState } from "./state.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type Entity = Record<string, unknown>;

export type ResourceRef = {
  id: string;
  name: string;
  type?: string;
  domains?: string[];
  deployed?: boolean;
};

export type ResourceContext = {
  client: DokployClient;
  state: DokployState;
  statePath: string;
  dryRun: boolean;
  log: Logger;
};

export type AppApplyResult = {
  config: AppConfig;
  ref: ResourceRef;
};

export type ComposeApplyResult = {
  config: ComposeConfig;
  ref: ResourceRef;
};

export type DatabaseApplyResult = {
  config: DatabaseConfig;
  ref: ResourceRef;
};
