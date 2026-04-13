import chalk from "chalk";
import { asArray } from "../resources/common.js";
import { createClientRuntime, type ClientRuntimeOptions } from "../runtime.js";

export type ProjectsOptions = ClientRuntimeOptions & {
  summary?: boolean;
  json?: boolean;
};

export async function projectsCommand(options: ProjectsOptions): Promise<void> {
  const runtime = await createClientRuntime(options);
  const projects = await runtime.client.get("project.all");

  if (options.json) {
    console.log(JSON.stringify(projects, null, 2));
    return;
  }

  runtime.log.header("Dokploy Projects", runtime.host);

  const projectList = asArray(projects);
  if (projectList.length === 0) {
    runtime.log.warn("No projects returned by project.all.");
    runtime.log.section("Raw Response");
    runtime.log.json(projects);
    return;
  }

  runtime.log.table(
    projectList.map((project) => ({
      name: stringField(project, "name") ?? "unnamed",
      id: chalk.gray(stringField(project, "projectId") ?? stringField(project, "id") ?? "unknown-id"),
      environments: countNested(project, ["environments", "environment"]),
      applications: countNested(project, ["applications", "application"]),
      compose: countNested(project, ["compose", "composes"]),
      databases: countNested(project, ["databases", "postgres", "mysql", "mariadb", "mongo", "redis"]),
      description: stringField(project, "description") ?? "",
    })),
    [
      { key: "name", label: "Project" },
      { key: "id", label: "ID" },
      { key: "environments", label: "Env" },
      { key: "applications", label: "Apps" },
      { key: "compose", label: "Compose" },
      { key: "databases", label: "DB" },
      { key: "description", label: "Description" },
    ],
  );

  if (!options.summary) {
    runtime.log.section("Full Response");
    runtime.log.json(projects);
  }
}

function stringField(project: Record<string, unknown>, key: string): string | undefined {
  const value = project[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function countNested(project: Record<string, unknown>, keys: string[]): string {
  let total = 0;

  for (const key of keys) {
    const value = project[key];
    if (Array.isArray(value)) {
      total += value.length;
    } else if (value && typeof value === "object") {
      total += 1;
    }
  }

  return total === 0 ? chalk.gray("-") : chalk.yellow(String(total));
}
