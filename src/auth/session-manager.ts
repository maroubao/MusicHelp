import { copyFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import type { SessionCheckResult } from "../runtime/types.js";
import { ensureDir, writeJson } from "../runtime/fs-utils.js";

type PersistedSessionMetadata = {
  restoredAt?: string;
  persistedAt?: string;
  valid?: boolean;
  reason?: string;
};

export class SessionManager {
  readonly storageStatePath: string;
  private readonly metadataPath: string;

  constructor(private readonly stateDir: string) {
    this.storageStatePath = path.join(stateDir, "session-state.json");
    this.metadataPath = path.join(stateDir, "session-metadata.json");
  }

  async hasPersistedSession(): Promise<boolean> {
    try {
      await readFile(this.storageStatePath, "utf8");
      return true;
    } catch {
      return false;
    }
  }

  async restoreSession(checkLogin: () => Promise<SessionCheckResult>): Promise<SessionCheckResult> {
    if (!(await this.hasPersistedSession())) {
      const result = {
        valid: false,
        reason: "missing_storage_state",
      } satisfies SessionCheckResult;
      await this.writeMetadata({ restoredAt: new Date().toISOString(), ...result });
      return result;
    }

    const result = await checkLogin();
    await this.writeMetadata({ restoredAt: new Date().toISOString(), ...result });
    return result;
  }

  async persistSession(exportState: () => Promise<unknown>): Promise<void> {
    await ensureDir(this.stateDir);
    const state = await exportState();
    await writeJson(this.storageStatePath, state);
    await this.writeMetadata({
      persistedAt: new Date().toISOString(),
      valid: true,
    });
  }

  async clearSession(): Promise<void> {
    await rm(this.storageStatePath, { force: true });
    await rm(this.metadataPath, { force: true });
  }

  async copySessionSnapshot(targetPath: string): Promise<void> {
    await ensureDir(path.dirname(targetPath));
    await copyFile(this.storageStatePath, targetPath);
  }

  private async writeMetadata(metadata: PersistedSessionMetadata): Promise<void> {
    await writeJson(this.metadataPath, metadata);
  }
}
