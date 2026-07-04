import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { CounterService } from "../src/state/counter-service.js";
import { resolveTargets } from "../src/targets/resolve-targets.js";

const baseConfig = {
  task_name: "monthly-listening",
  schedule: "0 2 1 * *",
  runner_mode: "github_actions" as const,
  target_effective_count: 2,
  max_run_hours: 12,
  playback: {
    order: "sequential" as const,
    loop_mode: "list_repeat" as const,
    completion_rule: "full_track_finished" as const,
  },
  retry: {
    max_attempts: 2,
    backoff_seconds: 1,
    policy: "rerun_whole_task" as const,
  },
  auth: {
    prefer_session_reuse: true as const,
    qr_wait_timeout_minutes: 10 as const,
    qr_refresh_limit: 2 as const,
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

describe("resolveTargets", () => {
  it("resolves song mode into a single track queue", () => {
    const plan = resolveTargets({
      ...baseConfig,
      targets: {
        mode: "song",
        song: { name: "a", url: "https://example.com/a" },
      },
    });

    expect(plan.queue).toEqual([{ name: "a", url: "https://example.com/a", source: "song" }]);
  });

  it("resolves songs mode into a sequential queue", () => {
    const plan = resolveTargets({
      ...baseConfig,
      targets: {
        mode: "songs",
        songs: [
          { name: "a", url: "https://example.com/a" },
          { name: "b", url: "https://example.com/b" },
        ],
      },
    });

    expect(plan.queue).toHaveLength(2);
    expect(plan.queue[1]?.source).toBe("songs");
  });

  it("resolves playlist mode into a playlist target", () => {
    const plan = resolveTargets({
      ...baseConfig,
      targets: {
        mode: "playlist",
        playlist: { name: "mix", url: "https://example.com/p" },
      },
    });

    expect(plan.queue).toEqual([{ name: "mix", url: "https://example.com/p", source: "playlist" }]);
  });
});

describe("CounterService", () => {
  it("counts only completed tracks and stops at target count", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "musichelp-counter-"));
    const service = new CounterService(dir, 2);
    const initial = await service.initialize();

    expect(initial.effectiveCount).toBe(0);

    await service.incrementCounter({ name: "song-a", url: "https://example.com/a", source: "songs" });
    const second = await service.incrementCounter({ name: "song-b", url: "https://example.com/b", source: "songs" });

    expect(second.effectiveCount).toBe(2);
    expect(second.completedTracks).toHaveLength(2);
    expect(service.isTargetReached(second)).toBe(true);
  });
});
