import type { TrackTarget } from "../runtime/types.js";
import type { AuthAutomation } from "../auth/auth-manager.js";

export type PlaybackResult =
  | { status: "finished" }
  | { status: "interrupted"; reason: string }
  | { status: "error"; reason: string };

export type BrowserAutomation = AuthAutomation & {
  openTarget(target: TrackTarget): Promise<void>;
  startPlayback(target: TrackTarget): Promise<void>;
  waitForTrackFinished(target: TrackTarget): Promise<PlaybackResult>;
  captureScreenshot(filePath: string): Promise<void>;
  captureDomSnapshot(filePath: string): Promise<void>;
  close(): Promise<void>;
};
