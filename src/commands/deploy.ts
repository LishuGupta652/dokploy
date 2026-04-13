import { createRuntime, type RuntimeOptions } from "../runtime.js";
import { redeployApplication } from "../resources/application.js";
import { redeployCompose } from "../resources/compose.js";

export async function deployCommand(name: string, options: RuntimeOptions): Promise<void> {
  const runtime = await createRuntime(options);

  const app = runtime.state.applications[name];
  if (app) {
    await redeployApplication(app, runtime);
    return;
  }

  const compose = runtime.state.compose[name];
  if (compose) {
    await redeployCompose(compose, runtime);
    return;
  }

  throw new Error(
    `No application or compose named ${name} found in ${runtime.statePath}. Run apply first.`,
  );
}
