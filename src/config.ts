import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { z, ZodError } from "zod";

const nonEmptyString = z.string().trim().min(1);
const maybeString = z.string().trim().min(1).nullable().optional();

const envValueSchema = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((value) => String(value));
const envRecordSchema = z.record(envValueSchema);
const keyValueSchema = z.union([envRecordSchema, z.string()]);

const domainSchema = z.object({
  host: nonEmptyString,
  path: z.string().min(1).nullable().optional().default("/"),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  https: z.boolean().optional().default(true),
  certificate: z
    .enum(["letsencrypt", "none", "custom"])
    .optional()
    .default("letsencrypt"),
  customCertResolver: maybeString,
  serviceName: maybeString,
  internalPath: maybeString,
  stripPath: z.boolean().optional().default(false),
});

const githubSourceSchema = z.object({
  id: nonEmptyString,
  owner: nonEmptyString,
  repository: nonEmptyString,
  branch: nonEmptyString.optional().default("main"),
  buildPath: nonEmptyString.optional().default("/"),
  triggerType: z.enum(["push", "tag"]).optional().default("push"),
  enableSubmodules: z.boolean().optional().default(false),
  watchPaths: z.array(nonEmptyString).nullable().optional(),
});

const gitSourceSchema = z.object({
  url: nonEmptyString,
  branch: nonEmptyString.optional().default("main"),
  buildPath: nonEmptyString.optional().default("/"),
  sshKeyId: maybeString,
  enableSubmodules: z.boolean().optional().default(false),
  watchPaths: z.array(nonEmptyString).nullable().optional(),
});

const dockerSourceSchema = z.object({
  image: nonEmptyString,
  username: maybeString,
  password: maybeString,
  registryUrl: maybeString,
});

const buildSchema = z
  .object({
    type: z
      .enum([
        "dockerfile",
        "heroku_buildpacks",
        "paketo_buildpacks",
        "nixpacks",
        "static",
        "railpack",
      ])
      .optional()
      .default("dockerfile"),
    dockerfile: z.string().nullable().optional(),
    contextPath: z.string().nullable().optional().default("."),
    buildStage: z.string().nullable().optional(),
    herokuVersion: z.string().nullable().optional(),
    railpackVersion: z.string().nullable().optional(),
    publishDirectory: z.string().nullable().optional(),
    isStaticSpa: z.boolean().nullable().optional(),
  })
  .optional()
  .default({});

const applicationSchema = z
  .object({
    name: nonEmptyString,
    appName: nonEmptyString.optional(),
    description: z.string().nullable().optional(),
    source: z.enum(["github", "git", "docker"]).optional().default("github"),
    github: githubSourceSchema.optional(),
    git: gitSourceSchema.optional(),
    docker: dockerSourceSchema.optional(),
    build: buildSchema,
    env: envRecordSchema.optional().default({}),
    buildArgs: keyValueSchema.nullable().optional(),
    buildSecrets: keyValueSchema.nullable().optional(),
    createEnvFile: z.boolean().optional().default(false),
    domains: z.array(domainSchema).optional().default([]),
    deploy: z.boolean().optional().default(true),
    serverId: maybeString,
  })
  .superRefine((app, ctx) => {
    if (app.source === "github" && !app.github) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["github"],
        message: "github config is required when source is github",
      });
    }
    if (app.source === "git" && !app.git) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["git"],
        message: "git config is required when source is git",
      });
    }
    if (app.source === "docker" && !app.docker) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["docker"],
        message: "docker config is required when source is docker",
      });
    }
  });

const composeGitSchema = z.object({
  url: nonEmptyString.optional(),
  id: nonEmptyString.optional(),
  owner: nonEmptyString.optional(),
  repository: nonEmptyString.optional(),
  branch: nonEmptyString.optional().default("main"),
  composePath: nonEmptyString.optional().default("./docker-compose.yml"),
  sshKeyId: maybeString,
  triggerType: z.enum(["push", "tag"]).nullable().optional(),
  enableSubmodules: z.boolean().optional().default(false),
  watchPaths: z.array(nonEmptyString).nullable().optional(),
});

const composeSchema = z
  .object({
    name: nonEmptyString,
    appName: nonEmptyString.optional(),
    description: z.string().nullable().optional(),
    source: z
      .enum(["raw", "git", "github", "gitlab", "bitbucket", "gitea"])
      .optional()
      .default("raw"),
    content: z.string().optional(),
    composeFile: z.string().optional(),
    composeType: z.enum(["docker-compose", "stack"]).optional().default("docker-compose"),
    git: composeGitSchema.optional(),
    env: envRecordSchema.optional().default({}),
    domains: z.array(domainSchema).optional().default([]),
    deploy: z.boolean().optional().default(true),
    serverId: maybeString,
  })
  .superRefine((compose, ctx) => {
    if (compose.source === "raw" && !compose.content && !compose.composeFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "content or composeFile is required when compose source is raw",
      });
    }
    if (compose.source !== "raw" && !compose.git) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["git"],
        message: "git config is required for git-backed compose sources",
      });
    }
  });

const databaseSchema = z.object({
  name: nonEmptyString,
  appName: nonEmptyString.optional(),
  type: z.enum(["postgres", "mysql", "mariadb", "mongo", "redis"]),
  version: nonEmptyString.optional(),
  image: nonEmptyString.optional(),
  description: z.string().nullable().optional(),
  databaseName: nonEmptyString.optional(),
  databaseUser: nonEmptyString.optional(),
  user: nonEmptyString.optional(),
  databasePassword: nonEmptyString.optional(),
  password: nonEmptyString.optional(),
  databaseRootPassword: nonEmptyString.optional(),
  rootPassword: nonEmptyString.optional(),
  replicaSets: z.boolean().nullable().optional(),
  env: envRecordSchema.optional().default({}),
  deploy: z.boolean().optional().default(true),
  serverId: maybeString,
});

const backupDestinationSchema = z.object({
  name: nonEmptyString,
  provider: z.string().nullable().optional().default("s3"),
  accessKey: nonEmptyString,
  bucket: nonEmptyString,
  region: nonEmptyString,
  endpoint: nonEmptyString,
  secretAccessKey: nonEmptyString,
  serverId: maybeString,
});

const scheduledBackupSchema = z.object({
  name: nonEmptyString,
  destination: nonEmptyString,
  schedule: nonEmptyString,
  enabled: z.boolean().nullable().optional().default(true),
  prefix: nonEmptyString,
  keepLatestCount: z.number().int().positive().nullable().optional(),
  target: nonEmptyString,
  database: nonEmptyString.optional(),
  databaseType: z.enum(["postgres", "mariadb", "mysql", "mongo", "web-server"]),
  backupType: z.enum(["database", "compose"]).optional().default("database"),
  serviceName: z.string().nullable().optional(),
  metadata: z.unknown().nullable().optional(),
});

const volumeBackupSchema = z.object({
  name: nonEmptyString,
  destination: nonEmptyString,
  volumeName: nonEmptyString,
  prefix: nonEmptyString,
  cronExpression: nonEmptyString,
  target: nonEmptyString,
  serviceType: z.enum([
    "application",
    "postgres",
    "mysql",
    "mariadb",
    "mongo",
    "redis",
    "compose",
  ]),
  appName: nonEmptyString.optional(),
  serviceName: z.string().nullable().optional(),
  turnOff: z.boolean().optional().default(false),
  keepLatestCount: z.number().int().positive().nullable().optional(),
  enabled: z.boolean().nullable().optional().default(true),
});

const configSchema = z.object({
  host: z.string().url().optional(),
  stateFile: z.string().optional(),
  project: z.object({
    name: nonEmptyString,
    description: z.string().nullable().optional(),
    env: envRecordSchema.optional().default({}),
  }),
  environment: z
    .object({
      name: nonEmptyString,
      description: z.string().optional().default(""),
      env: envRecordSchema.optional().default({}),
    })
    .optional(),
  applications: z.array(applicationSchema).optional().default([]),
  compose: z.array(composeSchema).optional().default([]),
  databases: z.array(databaseSchema).optional().default([]),
  backupDestinations: z.array(backupDestinationSchema).optional().default([]),
  backups: z.array(scheduledBackupSchema).optional().default([]),
  volumeBackups: z.array(volumeBackupSchema).optional().default([]),
});

export type DokployConfig = z.infer<typeof configSchema>;
export type AppConfig = DokployConfig["applications"][number];
export type ComposeConfig = DokployConfig["compose"][number];
export type DatabaseConfig = DokployConfig["databases"][number];
export type DomainConfig = AppConfig["domains"][number];
export type BackupDestinationConfig = DokployConfig["backupDestinations"][number];
export type ScheduledBackupConfig = DokployConfig["backups"][number];
export type VolumeBackupConfig = DokployConfig["volumeBackups"][number];

export async function loadConfig(configPath?: string): Promise<{
  config: DokployConfig;
  configPath: string;
}> {
  const resolvedPath = await resolveConfigPath(configPath);
  const raw = await readFile(resolvedPath, "utf8");
  const parsed = parse(raw) as unknown;

  try {
    return {
      config: configSchema.parse(parsed),
      configPath: resolvedPath,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(formatZodError(error));
    }
    throw error;
  }
}

async function resolveConfigPath(configPath?: string): Promise<string> {
  const candidates = configPath ? [configPath] : ["dokploy.yaml", "dokploy.yml"];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    try {
      await access(resolved);
      return resolved;
    } catch {
      continue;
    }
  }

  throw new Error(
    configPath
      ? `Config file not found: ${configPath}`
      : "Config file not found. Expected dokploy.yaml or dokploy.yml, or pass -f <path>.",
  );
}

function formatZodError(error: ZodError): string {
  const details = error.issues
    .map((issue) => {
      const location = issue.path.length ? issue.path.join(".") : "config";
      return `- ${location}: ${issue.message}`;
    })
    .join("\n");

  return `Invalid Dokploy config:\n${details}`;
}
