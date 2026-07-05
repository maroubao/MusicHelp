import path from "node:path";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { BrowserAutomation } from "../src/player/browser-automation.js";
import type { TrackTarget } from "../src/runtime/types.js";
import { TaskRunner } from "../src/runner/task-runner.js";

class FakeBrowserAutomation implements BrowserAutomation {
  private readonly playbackSequence: Array<"finished" | "error">;
  private readonly loginStateSequence: boolean[];
  private readonly waitForLoginSequence: boolean[];
  private readonly passwordLoginResult: boolean;

  constructor(options: {
    playbackSequence: Array<"finished" | "error">;
    loginStateSequence: boolean[];
    waitForLoginSequence?: boolean[];
    passwordLoginResult?: boolean;
  }) {
    this.playbackSequence = [...options.playbackSequence];
    this.loginStateSequence = [...options.loginStateSequence];
    this.waitForLoginSequence = [...(options.waitForLoginSequence ?? [])];
    this.passwordLoginResult = options.passwordLoginResult ?? false;
  }

  async isLoggedIn(): Promise<boolean> {
    return this.loginStateSequence.shift() ?? true;
  }

  async fetchQrCode() {
    return { imageDataUrl: "data:image/png;base64,abc", expiresInMinutes: 10 };
  }

  async refreshQrCode() {
    return this.fetchQrCode();
  }

  async waitForLogin(): Promise<boolean> {
    return this.waitForLoginSequence.shift() ?? false;
  }

  async loginWithPassword(): Promise<boolean> {
    return this.passwordLoginResult;
  }

  async exportStorageState(): Promise<unknown> {
    return { cookies: [] };
  }

  async openTarget(_target: TrackTarget): Promise<void> {}

  async startPlayback(_target: TrackTarget): Promise<void> {}

  async waitForTrackFinished() {
    const result = this.playbackSequence.shift() ?? "finished";
    if (result === "finished") {
      return { status: "finished" } as const;
    }

    return { status: "error", reason: "simulated_playback_failure" } as const;
  }

  async captureScreenshot(filePath: string): Promise<void> {
    await import("node:fs/promises").then(({ writeFile }) => writeFile(filePath, "image", "utf8"));
  }

  async captureDomSnapshot(filePath: string): Promise<void> {
    await import("node:fs/promises").then(({ writeFile }) => writeFile(filePath, "<html></html>", "utf8"));
  }

  async close(): Promise<void> {}
}

describe("TaskRunner", () => {
  it("retries the whole task after failure and writes evidence artifacts", async () => {
    const artifactsDir = await mkdtemp(path.join(tmpdir(), "musichelp-runner-"));
    process.env.QR_LINK_SIGNING_SECRET = "signing-secret";
    process.env.NETEASE_USERNAME = "user";
    process.env.NETEASE_PASSWORD = "pass";
    delete process.env.FEISHU_BOT_WEBHOOK;
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;
    expect(process.env.FEISHU_BOT_WEBHOOK).toBeUndefined();
    await mkdir(path.join(artifactsDir, "state"), { recursive: true });
    await writeFile(path.join(artifactsDir, "state", "session-state.json"), "{\"cookies\":[]}", "utf8");

    const browserInstances = [
      new FakeBrowserAutomation({
        playbackSequence: ["error"],
        loginStateSequence: [true],
      }),
      new FakeBrowserAutomation({
        playbackSequence: ["finished", "finished"],
        loginStateSequence: [true],
      }),
    ];

    const runner = new TaskRunner();
    const summary = await runner.run({
      artifactsDir,
      config: {
        task_name: "monthly-listening",
        schedule: "0 2 1 * *",
        runner_mode: "github_actions",
        target_effective_count: 2,
        max_run_hours: 12,
        targets: {
          mode: "songs",
          songs: [
            { name: "song-a", url: "https://example.com/a" },
            { name: "song-b", url: "https://example.com/b" },
          ],
        },
        playback: {
          order: "sequential",
          loop_mode: "list_repeat",
          completion_rule: "full_track_finished",
        },
        retry: {
          max_attempts: 2,
          backoff_seconds: 0,
          policy: "rerun_whole_task",
        },
        auth: {
          prefer_session_reuse: true,
          qr_wait_timeout_minutes: 10,
          qr_refresh_limit: 2,
          fallback_to_password_login: true,
          fallback_to_qr_after_password_failure: true,
          session_secret_ref: "NETEASE_SESSION_SECRET",
          username_secret_ref: "NETEASE_USERNAME",
          password_secret_ref: "NETEASE_PASSWORD",
        },
        notify: {
          feishu_webhook_secret_ref: "TEST_FEISHU_BOT_WEBHOOK",
          send_success: true,
          send_failure: true,
          include_duration: true,
          include_effective_count: true,
        },
        artifacts: {
          save_logs: true,
          save_screenshots: true,
          save_trace_on_failure: true,
        },
      },
      browserFactory: {
        async create() {
          const browser = browserInstances.shift();
          if (!browser) {
            throw new Error("missing_browser_instance");
          }
          return browser;
        },
      },
    });

    expect(summary.status).toBe("success");
    expect(summary.attempt).toBe(2);
    expect(summary.effectiveCount).toBe(2);

    const runSummary = await readFile(path.join(artifactsDir, "reports", "run-summary.json"), "utf8");
    expect(runSummary).toContain("\"status\": \"success\"");

    const counterState = await readFile(path.join(artifactsDir, "state", "counter-state.json"), "utf8");
    expect(counterState).toContain("\"effectiveCount\": 2");

    const failureEvidence = await readFile(path.join(artifactsDir, "trace", "attempt-1.json"), "utf8");
    expect(failureEvidence).toContain("simulated_playback_failure");

    const runState = await readFile(path.join(artifactsDir, "state", "run-state.json"), "utf8");
    expect(runState).toContain("\"RETRYING\"");
    expect(runState).not.toContain("\"AUTHENTICATING\"");
  });
});
