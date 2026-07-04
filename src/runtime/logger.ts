import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./fs-utils.js";

export class ArtifactLogger {
  constructor(private readonly logFilePath: string) {}

  async init(): Promise<void> {
    await ensureDir(path.dirname(this.logFilePath));
    await writeFile(this.logFilePath, "", "utf8");
  }

  async info(message: string): Promise<void> {
    await this.write("INFO", message);
  }

  async warn(message: string): Promise<void> {
    await this.write("WARN", message);
  }

  async error(message: string): Promise<void> {
    await this.write("ERROR", message);
  }

  private async write(level: string, message: string): Promise<void> {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    await appendFile(this.logFilePath, `${line}\n`, "utf8");
    console.log(line);
  }
}
