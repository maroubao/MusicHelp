import type { BrowserAutomation } from "./browser-automation.js";
import type { PlaybackPlan, TrackTarget } from "../runtime/types.js";

export type PlaybackEvent =
  | { type: "track_started"; track: TrackTarget }
  | { type: "track_finished"; track: TrackTarget }
  | { type: "playback_error"; track: TrackTarget; reason: string };

export class PlayerController {
  constructor(private readonly automation: BrowserAutomation) {}

  async playUntilStopped(
    plan: PlaybackPlan,
    shouldStop: () => Promise<boolean> | boolean,
    onEvent: (event: PlaybackEvent) => Promise<void>,
  ): Promise<void> {
    let index = 0;

    while (!(await shouldStop())) {
      const track = plan.queue[index];
      await this.automation.openTarget(track);
      await this.automation.startPlayback(track);
      await onEvent({ type: "track_started", track });

      const result = await this.automation.waitForTrackFinished(track);
      if (result.status !== "finished") {
        await onEvent({
          type: "playback_error",
          track,
          reason: result.reason,
        });
        throw new Error(result.reason);
      }

      await onEvent({ type: "track_finished", track });
      index = (index + 1) % plan.queue.length;
    }
  }
}
