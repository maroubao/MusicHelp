import path from "node:path";
import { readFile } from "node:fs/promises";

async function run(): Promise<void> {
  const metadataPath = path.resolve("artifacts/state/session-metadata.json");
  const source = await readFile(metadataPath, "utf8");
  console.log(source);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Session inspection failed: ${message}`);
  process.exitCode = 1;
});
