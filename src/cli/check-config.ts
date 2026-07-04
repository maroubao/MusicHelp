import { loadConfig } from "../config/load-config.js";

async function run(): Promise<void> {
  const configPath = process.argv[2] ?? "config/listening-task.example.yaml";
  const config = await loadConfig(configPath);
  console.log(
    JSON.stringify(
      {
        task_name: config.task_name,
        runner_mode: config.runner_mode,
        target_mode: config.targets.mode,
        target_effective_count: config.target_effective_count,
      },
      null,
      2,
    ),
  );
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Config validation failed: ${message}`);
  process.exitCode = 1;
});
