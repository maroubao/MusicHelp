import { loadConfig } from "./config/load-config.js";
import { PlaywrightBrowserFactory } from "./runner/playwright-browser-factory.js";
import { TaskRunner } from "./runner/task-runner.js";

export async function main(): Promise<void> {
  const configPath = process.env.MUSICHELP_CONFIG_PATH ?? "config/listening-task.yaml";
  const config = await loadConfig(configPath);
  const runner = new TaskRunner();
  const summary = await runner.run({
    config,
    browserFactory: new PlaywrightBrowserFactory(),
  });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Task execution failed: ${message}`);
  process.exitCode = 1;
});
