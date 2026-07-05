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

function applyEnvOverrides(config: AppConfig): AppConfig {
  const targetEffectiveCount = process.env.MUSICHELP_TARGET_EFFECTIVE_COUNT;
  const targetSongUrl = process.env.MUSICHELP_TARGET_SONG_URL;
  const targetSongName = process.env.MUSICHELP_TARGET_SONG_NAME?.trim();

  const nextConfig: AppConfig = {
    ...config,
    target_effective_count: targetEffectiveCount ? Number.parseInt(targetEffectiveCount, 10) : config.target_effective_count,
  };

  if (targetSongUrl) {
    nextConfig.targets = {
      mode: "song",
      song: {
        name: targetSongName || "workflow-song",
        url: targetSongUrl,
      },
    };
    nextConfig.playback = {
      ...nextConfig.playback,
      loop_mode: "single_repeat",
    };
  }

  return nextConfig;
}

export async function loadConfig(configPath: string): Promise<AppConfig> {
  const resolvedPath = path.resolve(configPath);
  const source = await readFile(resolvedPath, "utf8");
  const parsed = parseYaml(source);
  const configWithOverrides = applyEnvOverrides(parsed as AppConfig);
  const result = appConfigSchema.safeParse(configWithOverrides);

  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }

  return result.data;
}
