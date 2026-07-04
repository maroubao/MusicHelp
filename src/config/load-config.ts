import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ZodError } from "zod";
import { appConfigSchema, type AppConfig } from "./schema.js";

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const pathLabel = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${pathLabel}: ${issue.message}`;
    })
    .join("; ");
}

export async function loadConfig(configPath: string): Promise<AppConfig> {
  const resolvedPath = path.resolve(configPath);
  const source = await readFile(resolvedPath, "utf8");
  const parsed = parseYaml(source);
  const result = appConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }

  return result.data;
}
