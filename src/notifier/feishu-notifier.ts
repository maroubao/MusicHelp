import type { ArtifactLogger } from "../runtime/logger.js";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type FeishuNotifierOptions = {
  webhookUrl?: string;
  logger: ArtifactLogger;
  fetchImpl?: FetchLike;
};

export class FeishuNotifier {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: FeishuNotifierOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async sendSuccess(payload: { durationMs: number; effectiveCount: number }): Promise<void> {
    await this.send("success", {
      msg_type: "text",
      content: {
        text: `monthly-listening success; duration_ms=${payload.durationMs}; effective_count=${payload.effectiveCount}`,
      },
    });
  }

  async sendFailure(payload: { attempt: number; reason: string }): Promise<void> {
    await this.send("failure", {
      msg_type: "text",
      content: {
        text: `monthly-listening failure; attempt=${payload.attempt}; reason=${payload.reason}`,
      },
    });
  }

  async sendQrLoginLink(payload: { link: string; expiresInMinutes: number; attempt: number }): Promise<void> {
    await this.send("qr_login", {
      msg_type: "text",
      content: {
        text: `monthly-listening login required; attempt=${payload.attempt}; expires_in_minutes=${payload.expiresInMinutes}; link=${payload.link}`,
      },
    });
  }

  private async send(kind: string, body: Record<string, unknown>): Promise<void> {
    if (!this.options.webhookUrl) {
      await this.options.logger.warn(`Feishu webhook is not configured; skipped ${kind} notification.`);
      return;
    }

    const response = await this.fetchImpl(this.options.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Feishu notification failed with HTTP ${response.status}.`);
    }

    await this.options.logger.info(`Feishu ${kind} notification sent.`);
  }
}
