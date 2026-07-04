import { describe, expect, it } from "vitest";
import { appConfigSchema } from "../src/config/schema.js";

const validConfig = {
  task_name: "monthly-listening",
  schedule: "0 2 1 * *",
  runner_mode: "github_actions",
  target_effective_count: 365,
  max_run_hours: 12,
  targets: {
    mode: "songs",
    songs: [
      { name: "song-a", url: "https://music.163.com/#/song?id=123456" },
      { name: "song-b", url: "https://music.163.com/#/song?id=654321" },
    ],
  },
  playback: {
    order: "sequential",
    loop_mode: "list_repeat",
    completion_rule: "full_track_finished",
  },
  retry: {
    max_attempts: 3,
    backoff_seconds: 60,
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
    feishu_webhook_secret_ref: "FEISHU_BOT_WEBHOOK",
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
};

describe("appConfigSchema", () => {
  it("accepts a config aligned with the spec", () => {
    const result = appConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("rejects multiple target payloads", () => {
    const result = appConfigSchema.safeParse({
      ...validConfig,
      targets: {
        mode: "songs",
        songs: validConfig.targets.songs,
        playlist: { name: "mix", url: "https://music.163.com/#/playlist?id=1" },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes("Exactly one"))).toBe(true);
  });

  it("rejects non GitHub Actions runner mode", () => {
    const result = appConfigSchema.safeParse({
      ...validConfig,
      runner_mode: "self_hosted",
    });

    expect(result.success).toBe(false);
  });

  it("rejects missing password secrets when password fallback is enabled", () => {
    const result = appConfigSchema.safeParse({
      ...validConfig,
      auth: {
        ...validConfig.auth,
        username_secret_ref: undefined,
        password_secret_ref: undefined,
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === "auth.username_secret_ref")).toBe(true);
    expect(result.error?.issues.some((issue) => issue.path.join(".") === "auth.password_secret_ref")).toBe(true);
  });

  it("rejects unsupported completion rules", () => {
    const result = appConfigSchema.safeParse({
      ...validConfig,
      playback: {
        ...validConfig.playback,
        completion_rule: "partial_play",
      },
    });

    expect(result.success).toBe(false);
  });
});
