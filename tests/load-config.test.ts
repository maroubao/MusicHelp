import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/load-config.js";

const baseYaml = `task_name: monthly-listening
schedule: "0 2 1 * *"
runner_mode: github_actions
target_effective_count: 365
max_run_hours: 12
targets:
  mode: song
  song:
    name: default-song
    url: "https://music.163.com/#/song?id=1"
playback:
  order: sequential
  loop_mode: single_repeat
  completion_rule: full_track_finished
retry:
  max_attempts: 3
  backoff_seconds: 60
  policy: rerun_whole_task
auth:
  prefer_session_reuse: true
  qr_wait_timeout_minutes: 10
  qr_refresh_limit: 2
  fallback_to_password_login: true
  fallback_to_qr_after_password_failure: true
  session_secret_ref: NETEASE_SESSION_SECRET
  username_secret_ref: NETEASE_USERNAME
  password_secret_ref: NETEASE_PASSWORD
notify:
  feishu_webhook_secret_ref: FEISHU_BOT_WEBHOOK
  send_success: true
  send_failure: true
  include_duration: true
  include_effective_count: true
artifacts:
  save_logs: true
  save_screenshots: true
  save_trace_on_failure: true
`;

afterEach(() => {
  delete process.env.MUSICHELP_TARGET_EFFECTIVE_COUNT;
  delete process.env.MUSICHELP_TARGET_SONG_URL;
  delete process.env.MUSICHELP_TARGET_SONG_NAME;
});

describe("loadConfig env overrides", () => {
  it("overrides target count and song target from environment", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "musichelp-config-"));
    const filePath = path.join(dir, "config.yaml");
    await writeFile(filePath, baseYaml, "utf8");

    process.env.MUSICHELP_TARGET_EFFECTIVE_COUNT = "5";
    process.env.MUSICHELP_TARGET_SONG_URL = "https://music.163.com/#/song?id=3361270426";
    process.env.MUSICHELP_TARGET_SONG_NAME = "song-3361270426";

    const config = await loadConfig(filePath);

    expect(config.target_effective_count).toBe(5);
    expect(config.targets.mode).toBe("song");
    expect(config.targets.song?.url).toBe("https://music.163.com/#/song?id=3361270426");
    expect(config.targets.song?.name).toBe("song-3361270426");
    expect(config.playback.loop_mode).toBe("single_repeat");
  });
});
