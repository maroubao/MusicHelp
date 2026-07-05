import type { ArtifactLogger } from "../runtime/logger.js";
import type { ProgressNotification, QrLoginNotification } from "../runtime/types.js";

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

  async sendSuccess(payload: {
    durationMs: number;
    effectiveCount: number;
    targetCount: number;
    targetSummary: string;
    completionDetection: "simulated_debug" | "real";
    startedAt?: string;
    finishedAt?: string;
  }): Promise<void> {
    await this.send("success", {
      msg_type: "text",
      content: {
        text: [
          "听歌任务执行成功",
          `目标: ${payload.targetSummary}`,
          `完成进度: ${payload.effectiveCount}/${payload.targetCount}`,
          `耗时: ${this.formatDuration(payload.durationMs)}`,
          payload.startedAt ? `开始时间: ${this.formatLocalTime(payload.startedAt)}` : undefined,
          payload.finishedAt ? `结束时间: ${this.formatLocalTime(payload.finishedAt)}` : undefined,
          `完成判定: ${payload.completionDetection === "simulated_debug" ? "调试占位判定" : "真实播放判定"}`,
        ].join("\n"),
      },
    });
  }

  async sendFailure(payload: {
    attempt: number;
    reason: string;
    targetSummary?: string;
    progressText?: string;
    elapsedMs?: number;
  }): Promise<void> {
    await this.send("failure", {
      msg_type: "text",
      content: {
        text: [
          "听歌任务执行失败",
          `失败轮次: 第 ${payload.attempt} 次`,
          payload.targetSummary ? `目标: ${payload.targetSummary}` : undefined,
          payload.progressText ? `进度: ${payload.progressText}` : undefined,
          payload.elapsedMs !== undefined ? `已运行: ${this.formatDuration(payload.elapsedMs)}` : undefined,
          `原因: ${payload.reason}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    });
  }

  async sendProgress(payload: ProgressNotification): Promise<void> {
    await this.send("progress", {
      msg_type: "text",
      content: {
        text: [
          "听歌任务进度提醒",
          `目标: ${payload.targetSummary}`,
          `当前进度: ${payload.effectiveCount}/${payload.targetCount}`,
          `已运行: ${this.formatDuration(payload.elapsedMs)}`,
          payload.authMethod ? `当前登录方式: ${payload.authMethod}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    });
  }

  async sendQrLogin(payload: QrLoginNotification): Promise<void> {
    const imageSent = payload.imageDataUrl ? await this.trySendQrImage(payload.imageDataUrl) : false;
    const parts = [
      "需要重新登录网易云音乐",
      `当前轮次: 第 ${payload.attempt} 次`,
      `二维码有效期: ${payload.expiresInMinutes} 分钟`,
      `二维码图片发送: ${imageSent ? "已发送" : "不可用"}`,
    ];

    if (payload.link) {
      parts.push(`备用链接: ${payload.link}`);
    }

    if (!imageSent && payload.imageDataUrl) {
      parts.push("提示: 需要配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET 才能直接发送二维码图片");
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

  private formatDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}小时`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}分钟`);
    parts.push(`${seconds}秒`);
    return parts.join("");
  }

  private formatLocalTime(isoString: string): string {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  }
}
