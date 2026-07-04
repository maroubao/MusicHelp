import path from "node:path";
import type { AttemptRecord, TaskState } from "../runtime/types.js";
import { writeJson } from "../runtime/fs-utils.js";

export class RunStateStore {
  private readonly statePath: string;

  constructor(stateDir: string) {
    this.statePath = path.join(stateDir, "run-state.json");
  }

  async recordState(state: TaskState, detail?: string, attempt = 1): Promise<void> {
    const current = await this.readRecords();
    current.push({
      attempt,
      state,
      detail,
      timestamp: new Date().toISOString(),
    });
    await writeJson(this.statePath, current);
  }

  async readRecords(): Promise<AttemptRecord[]> {
    try {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile(this.statePath, "utf8");
      return JSON.parse(source) as AttemptRecord[];
    } catch {
      return [];
    }
  }
}
