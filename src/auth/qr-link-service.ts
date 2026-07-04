import { createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import type { GeneratedQrLink, QrCodeArtifact } from "../runtime/types.js";
import { ensureDir, writeJson } from "../runtime/fs-utils.js";

type QrLinkServiceOptions = {
  qrDir: string;
  baseUrl?: string;
  signingSecret: string;
};

export class QrLinkService {
  constructor(private readonly options: QrLinkServiceOptions) {}

  async createLink(artifact: QrCodeArtifact): Promise<GeneratedQrLink> {
    await ensureDir(this.options.qrDir);
    const nonce = randomBytes(8).toString("hex");
    const expiresAt = new Date(Date.now() + artifact.expiresInMinutes * 60_000).toISOString();
    const payload = `${nonce}.${expiresAt}`;
    const signature = createHmac("sha256", this.options.signingSecret).update(payload).digest("hex");
    const token = `${payload}.${signature}`;
    const manifestPath = path.join(this.options.qrDir, `${nonce}.json`);

    await writeJson(manifestPath, {
      token,
      expiresAt,
      imageDataUrl: artifact.imageDataUrl,
    });

    const baseUrl = this.options.baseUrl ?? "https://example.invalid/musichelp/qr";
    return {
      url: `${baseUrl.replace(/\/$/, "")}/${token}`,
      token,
      expiresAt,
      manifestPath,
    };
  }
}
