import type { ArtifactLogger } from "../runtime/logger.js";
import type { QrLoginNotification } from "../runtime/types.js";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type FeishuNotifierOptions = {
  webhookUrl?: string;
  logger: ArtifactLogger;
  fetchImpl?: FetchLike;
  appId?: string;
  appSecret?: string;
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

  async sendQrLogin(payload: QrLoginNotification): Promise<void> {
    const imageSent = payload.imageDataUrl ? await this.trySendQrImage(payload.imageDataUrl) : false;
    const parts = [
      "monthly-listening login required",
      `attempt=${payload.attempt}`,
      `expires_in_minutes=${payload.expiresInMinutes}`,
      `image_delivery=${imageSent ? "sent" : "unavailable"}`,
    ];

    if (payload.link) {
      parts.push(`link=${payload.link}`);
    }

    if (!imageSent && payload.imageDataUrl) {
      parts.push("hint=configure FEISHU_APP_ID and FEISHU_APP_SECRET to upload and send QR image");
    }

    await this.send("qr_login", {
      msg_type: "text",
      content: {
        text: parts.join("; "),
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

  private async trySendQrImage(imageDataUrl: string): Promise<boolean> {
    if (!this.options.webhookUrl || !this.options.appId || !this.options.appSecret) {
      return false;
    }

    try {
      const tenantAccessToken = await this.fetchTenantAccessToken();
      const imageKey = await this.uploadImage(imageDataUrl, tenantAccessToken);
      await this.send("qr_login_image", {
        msg_type: "image",
        content: {
          image_key: imageKey,
        },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.options.logger.warn(`Feishu QR image send failed, fallback to text notification: ${message}`);
      return false;
    }
  }

  private async fetchTenantAccessToken(): Promise<string> {
    const response = await this.fetchImpl("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        app_id: this.options.appId,
        app_secret: this.options.appSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`tenant_access_token request failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as { tenant_access_token?: string; code?: number; msg?: string };
    if (!body.tenant_access_token) {
      throw new Error(`tenant_access_token missing: ${body.code ?? "unknown"} ${body.msg ?? ""}`.trim());
    }

    return body.tenant_access_token;
  }

  private async uploadImage(imageDataUrl: string, tenantAccessToken: string): Promise<string> {
    const blob = this.dataUrlToBlob(imageDataUrl);
    const form = new FormData();
    form.set("image_type", "message");
    form.set("image", blob, "qr-login.png");

    const response = await this.fetchImpl("https://open.feishu.cn/open-apis/im/v1/images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`image upload failed with HTTP ${response.status}`);
    }

    const body = (await response.json()) as { data?: { image_key?: string }; code?: number; msg?: string };
    const imageKey = body.data?.image_key;
    if (!imageKey) {
      throw new Error(`image_key missing: ${body.code ?? "unknown"} ${body.msg ?? ""}`.trim());
    }

    return imageKey;
  }

  private dataUrlToBlob(dataUrl: string): Blob {
    const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      throw new Error("invalid_qr_data_url");
    }

    const [, mimeType, base64Payload] = match;
    const bytes = Buffer.from(base64Payload, "base64");
    return new Blob([bytes], { type: mimeType });
  }
}
