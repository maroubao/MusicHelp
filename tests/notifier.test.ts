import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { FeishuNotifier } from "../src/notifier/feishu-notifier.js";
import { ArtifactLogger } from "../src/runtime/logger.js";

describe("FeishuNotifier", () => {
  it("sends success, failure, and qr notifications through the webhook transport", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "musichelp-notifier-"));
    const logger = new ArtifactLogger(path.join(dir, "run.log"));
    await logger.init();

    const bodies: string[] = [];
    const notifier = new FeishuNotifier({
      webhookUrl: "https://example.test/hook",
      logger,
      async fetchImpl(_input, init) {
        bodies.push(String(init.body));
        return new Response(null, { status: 200 });
      },
    });

    await notifier.sendSuccess({ durationMs: 1000, effectiveCount: 2 });
    await notifier.sendFailure({ attempt: 2, reason: "selector_invalid" });
    await notifier.sendQrLoginLink({ link: "https://example.test/qr/token", expiresInMinutes: 10, attempt: 1 });

    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toContain("effective_count=2");
    expect(bodies[1]).toContain("selector_invalid");
    expect(bodies[2]).toContain("https://example.test/qr/token");
  });
});
