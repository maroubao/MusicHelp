import { describe, expect, it } from "vitest";
import { PlayerController } from "../src/player/player-controller.js";
import type { BrowserAutomation } from "../src/player/browser-automation.js";
import type { TrackTarget } from "../src/runtime/types.js";

class FakePlaybackAutomation implements BrowserAutomation {
  calls: string[] = [];
  constructor(private readonly results: Array<"finished" | "error">) {}

  async isLoggedIn(): Promise<boolean> {
    return true;
  }

  async fetchQrCode() {
    return { imageDataUrl: "data:image/png;base64,abc", expiresInMinutes: 10 };
  }

  async refreshQrCode() {
    return this.fetchQrCode();
  }

  async waitForLogin(): Promise<boolean> {
    return true;
  }

  async loginWithPassword(): Promise<boolean> {
    return true;
  }

  async exportStorageState(): Promise<unknown> {
    return { cookies: [] };
  }

  async openTarget(target: TrackTarget): Promise<void> {
    this.calls.push(`open:${target.name}`);
  }

  async startPlayback(target: TrackTarget): Promise<void> {
    this.calls.push(`play:${target.name}`);
  }

  async waitForTrackFinished(target: TrackTarget) {
    const result = this.results.shift() ?? "finished";
    this.calls.push(`wait:${target.name}`);
    if (result === "finished") {
      return { status: "finished" } as const;
    }
    return { status: "error", reason: "track_interrupted" } as const;
  }

  async captureScreenshot(): Promise<void> {}
  async captureDomSnapshot(): Promise<void> {}
  async close(): Promise<void> {}
}

describe("PlayerController", () => {
  it("plays targets sequentially and stops only after completed tracks", async () => {
    const automation = new FakePlaybackAutomation(["finished", "finished"]);
    const controller = new PlayerController(automation);
    const finishedTracks: string[] = [];

    await controller.playUntilStopped(
      {
        mode: "songs",
        loopMode: "list_repeat",
        queue: [
          { name: "song-a", url: "https://example.com/a", source: "songs" },
          { name: "song-b", url: "https://example.com/b", source: "songs" },
        ],
      },
      (() => {
        let count = 0;
        return () => count++ >= 2;
      })(),
      async (event) => {
        if (event.type === "track_finished") {
          finishedTracks.push(event.track.name);
        }
      },
    );

    expect(finishedTracks).toEqual(["song-a", "song-b"]);
    expect(automation.calls).toEqual([
      "open:song-a",
      "play:song-a",
      "wait:song-a",
      "open:song-b",
      "play:song-b",
      "wait:song-b",
    ]);
  });

  it("surfaces playback errors before counting", async () => {
    const automation = new FakePlaybackAutomation(["error"]);
    const controller = new PlayerController(automation);

    await expect(
      controller.playUntilStopped(
        {
          mode: "song",
          loopMode: "single_repeat",
          queue: [{ name: "song-a", url: "https://example.com/a", source: "song" }],
        },
        () => false,
        async () => {},
      ),
    ).rejects.toThrow("track_interrupted");
  });
});
