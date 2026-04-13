#!/usr/bin/env node
import { Command } from "commander";
import { DokployApiError } from "./client.js";
import { applyCommand } from "./commands/apply.js";
import { deployCommand } from "./commands/deploy.js";
import { destroyCommand } from "./commands/destroy.js";
import { initCommand } from "./commands/init.js";
import { projectsCommand } from "./commands/projects.js";
import { statusCommand } from "./commands/status.js";
import { readPackageVersion } from "./version.js";

const program = new Command();

program
  .name("dokploy")
  .description("Apply a YAML Dokploy deployment config through the Dokploy API.")
  .version(readPackageVersion());

program
  .command("projects")
  .description("Show all Dokploy projects from project.all.")
  .option("--host <url>", "Dokploy API host, for example https://dokploy.example.com/api")
  .option("-f, --config <path>", "optional config file path to read host from")
  .option("--summary", "print a concise project list instead of full JSON")
  .option("--json", "print raw JSON without UI formatting")
  .action((options) => run(() => projectsCommand(options)));

program
  .command("apply")
  .description("Create or update resources from the config.")
  .option("-f, --config <path>", "config file path")
  .option("--state <path>", "state file path")
  .option("--dry-run", "show intended changes without writing resources")
  .action((options) => run(() => applyCommand(options)));

program
  .command("deploy")
  .description("Redeploy an application or compose stack from state.")
  .argument("<name>", "application or compose name")
  .option("-f, --config <path>", "config file path")
  .option("--state <path>", "state file path")
  .option("--dry-run", "show intended changes without writing resources")
  .action((name, options) => run(() => deployCommand(name, options)));

program
  .command("status")
  .description("Show remote status for resources tracked in state.")
  .option("-f, --config <path>", "config file path")
  .option("--state <path>", "state file path")
  .action((options) => run(() => statusCommand(options)));

program
  .command("destroy")
  .description("Delete resources tracked in state. Pass a name to delete one resource.")
  .argument("[name]", "resource name")
  .option("-f, --config <path>", "config file path")
  .option("--state <path>", "state file path")
  .option("--dry-run", "show intended deletes without deleting resources")
  .option("--delete-volumes", "delete compose volumes when deleting compose stacks")
  .action((name, options) => run(() => destroyCommand(name, options)));

program
  .command("init")
  .description("Generate a starter dokploy.yaml config.")
  .option("-o, --output <path>", "output config path")
  .option("--force", "overwrite an existing file")
  .action((options) => run(() => initCommand(options)));

await program.parseAsync();

async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof DokployApiError) {
      console.error(error.message);
      if (process.env.DEBUG) {
        console.error(error.responseBody);
      }
      process.exitCode = 1;
      return;
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
