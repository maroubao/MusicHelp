import path from "node:path";
import type { CounterState, TrackTarget } from "../runtime/types.js";
import { ensureDir, writeJson } from "../runtime/fs-utils.js";

export class CounterService {
  private readonly statePath: string;

  constructor(private readonly stateDir: string, private readonly targetCount: number) {
    this.statePath = path.join(stateDir, "counter-state.json");
  }

  async initialize(): Promise<CounterState> {
    await ensureDir(this.stateDir);
    const state: CounterState = {
      effectiveCount: 0,
      targetCount: this.targetCount,
      completedTracks: [],
      updatedAt: new Date().toISOString(),
    };
    await this.save(state);
    return state;
  }

  async incrementCounter(track: TrackTarget): Promise<CounterState> {
    const state = await this.loadCounterState();
    const nextState: CounterState = {
      ...state,
      effectiveCount: state.effectiveCount + 1,
      completedTracks: [
        ...state.completedTracks,
        {
          name: track.name,
          source: track.source,
          completedAt: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    await this.save(nextState);
    return nextState;
  }

  async loadCounterState(): Promise<CounterState> {
    try {
      const { readFile } = await import("node:fs/promises");
      const source = await readFile(this.statePath, "utf8");
      return JSON.parse(source) as CounterState;
    } catch {
      return this.initialize();
    }
  }

  isTargetReached(state: CounterState): boolean {
    return state.effectiveCount >= state.targetCount;
  }

  private async save(state: CounterState): Promise<void> {
    await writeJson(this.statePath, state);
  }
}
