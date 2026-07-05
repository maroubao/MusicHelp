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

    await notifier.sendSuccess({
      durationMs: 1000,
      effectiveCount: 2,
      targetCount: 3,
      targetSummary: "song / test-song",
      completionDetection: "simulated_debug",
    });
    await notifier.sendFailure({ attempt: 2, reason: "selector_invalid", targetSummary: "song / test-song", progressText: "1/3" });
    await notifier.sendQrLogin({ link: "https://example.test/qr/token", expiresInMinutes: 10, attempt: 1 });

    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toContain("听歌任务执行成功");
    expect(bodies[0]).toContain("调试占位判定");
    expect(bodies[1]).toContain("selector_invalid");
    expect(bodies[1]).toContain("1/3");
    expect(bodies[2]).toContain("备用链接");
  });

  it("uploads qr image and sends image message when app credentials are available", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "musichelp-notifier-image-"));
    const logger = new ArtifactLogger(path.join(dir, "run.log"));
    await logger.init();

    const requests: Array<{ input: string; body?: string; headers?: HeadersInit }> = [];
    const notifier = new FeishuNotifier({
      webhookUrl: "https://example.test/hook",
      appId: "cli_xxx",
      appSecret: "secret_xxx",
      logger,
      async fetchImpl(input, init) {
        requests.push({ input: String(input), body: init.body as string | undefined, headers: init.headers });
        if (String(input).includes("/tenant_access_token/internal")) {
          return new Response(JSON.stringify({ tenant_access_token: "token-123" }), { status: 200 });
        }
        if (String(input).includes("/im/v1/images")) {
          return new Response(JSON.stringify({ data: { image_key: "img_v3_key" } }), { status: 200 });
        }
        return new Response(null, { status: 200 });
      },
    });

    await notifier.sendQrLogin({
      attempt: 1,
      expiresInMinutes: 10,
      imageDataUrl: "data:image/png;base64,YWJj",
    });

    expect(requests).toHaveLength(4);
    expect(requests[0]?.input).toContain("/tenant_access_token/internal");
    expect(requests[1]?.input).toContain("/im/v1/images");
    expect(requests[2]?.body).toContain("\"msg_type\":\"image\"");
    expect(requests[3]?.body).toContain("\"msg_type\":\"text\"");
  });
});
