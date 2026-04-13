import { destroyApplication } from "../resources/application.js";
import {
  destroyBackupDestination,
  destroyScheduledBackup,
  destroyVolumeBackup,
} from "../resources/backup.js";
import { destroyCompose } from "../resources/compose.js";
import { destroyDatabase } from "../resources/database.js";
import { destroyEnvironment } from "../resources/environment.js";
import { destroyProject } from "../resources/project.js";
import { createRuntime, type RuntimeOptions } from "../runtime.js";
import { writeState } from "../state.js";

export type DestroyOptions = RuntimeOptions & {
  deleteVolumes?: boolean;
};

export async function destroyCommand(
  target: string | undefined,
  options: DestroyOptions,
): Promise<void> {
  const runtime = await createRuntime(options);
  const deleteVolumes = Boolean(options.deleteVolumes);

  if (target) {
    await destroyOne(target, runtime, deleteVolumes);
  } else {
    await destroyAll(runtime, deleteVolumes);
  }

  if (runtime.dryRun) {
    runtime.log.warn(`Dry run only. State was not written to ${runtime.statePath}.`);
    return;
  }

  await writeState(runtime.statePath, runtime.state);
  runtime.log.success(`State written to ${runtime.statePath}`);
}

async function destroyOne(
  target: string,
  runtime: Awaited<ReturnType<typeof createRuntime>>,
  deleteVolumes: boolean,
): Promise<void> {
  if (runtime.state.volumeBackups[target]) {
    await destroyVolumeBackup(target, runtime);
    return;
  }
  if (runtime.state.backups[target]) {
    await destroyScheduledBackup(target, runtime);
    return;
  }
  if (runtime.state.applications[target]) {
    await destroyApplication(target, runtime);
    return;
  }
  if (runtime.state.compose[target]) {
    await destroyCompose(target, runtime, deleteVolumes);
    return;
  }
  if (runtime.state.databases[target]) {
    await destroyDatabase(target, runtime);
    return;
  }
  if (runtime.state.backupDestinations[target]) {
    await destroyBackupDestination(target, runtime);
    return;
  }

  throw new Error(`No managed resource named ${target} found in ${runtime.statePath}.`);
}

async function destroyAll(
  runtime: Awaited<ReturnType<typeof createRuntime>>,
  deleteVolumes: boolean,
): Promise<void> {
  for (const name of Object.keys(runtime.state.volumeBackups).reverse()) {
    await destroyVolumeBackup(name, runtime);
  }
  for (const name of Object.keys(runtime.state.backups).reverse()) {
    await destroyScheduledBackup(name, runtime);
  }
  for (const name of Object.keys(runtime.state.compose).reverse()) {
    await destroyCompose(name, runtime, deleteVolumes);
  }
  for (const name of Object.keys(runtime.state.applications).reverse()) {
    await destroyApplication(name, runtime);
  }
  for (const name of Object.keys(runtime.state.databases).reverse()) {
    await destroyDatabase(name, runtime);
  }
  for (const name of Object.keys(runtime.state.backupDestinations).reverse()) {
    await destroyBackupDestination(name, runtime);
  }

  await destroyEnvironment(runtime);
  await destroyProject(runtime);
}
