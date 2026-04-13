import { createRuntime, type RuntimeOptions } from "../runtime.js";
import { writeState } from "../state.js";
import { ensureBackupDestination, ensureScheduledBackup, ensureVolumeBackup } from "../resources/backup.js";
import { ensureApplication } from "../resources/application.js";
import { ensureCompose } from "../resources/compose.js";
import { ensureDatabase } from "../resources/database.js";
import { ensureEnvironment } from "../resources/environment.js";
import { ensureProject } from "../resources/project.js";

export async function applyCommand(options: RuntimeOptions): Promise<void> {
  const runtime = await createRuntime(options);

  runtime.log.step("Applying Dokploy config");

  const project = await ensureProject(runtime.config.project, runtime);
  const environment = await ensureEnvironment(runtime.config.environment, project, runtime);

  for (const database of runtime.config.databases) {
    await ensureDatabase(database, environment, runtime);
  }

  for (const app of runtime.config.applications) {
    await ensureApplication(app, environment, runtime);
  }

  for (const compose of runtime.config.compose) {
    await ensureCompose(compose, environment, runtime);
  }

  for (const destination of runtime.config.backupDestinations) {
    await ensureBackupDestination(destination, runtime);
  }

  for (const backup of runtime.config.backups) {
    await ensureScheduledBackup(backup, runtime);
  }

  for (const backup of runtime.config.volumeBackups) {
    await ensureVolumeBackup(backup, runtime);
  }

  if (runtime.dryRun) {
    runtime.log.warn(`Dry run only. State was not written to ${runtime.statePath}.`);
    return;
  }

  await writeState(runtime.statePath, runtime.state);
  runtime.log.success(`State written to ${runtime.statePath}`);
}
