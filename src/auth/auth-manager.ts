import type { ArtifactLogger } from "../runtime/logger.js";
import type { AuthResult, GeneratedQrLink, QrCodeArtifact, QrLoginNotification } from "../runtime/types.js";

export type AuthAutomation = {
  isLoggedIn(): Promise<boolean>;
  fetchQrCode(): Promise<QrCodeArtifact>;
  refreshQrCode(): Promise<QrCodeArtifact>;
  waitForLogin(timeoutMs: number): Promise<boolean>;
  loginWithPassword(username: string, password: string): Promise<boolean>;
  exportStorageState(): Promise<unknown>;
};

export type AuthNotifier = {
  sendQrLogin(payload: QrLoginNotification): Promise<void>;
};

export type AuthLinkGenerator = {
  createLink(artifact: QrCodeArtifact): Promise<GeneratedQrLink>;
};

export type AuthManagerOptions = {
  qrWaitTimeoutMinutes: number;
  qrRefreshLimit: number;
  fallbackToPasswordLogin: boolean;
  fallbackToQrAfterPasswordFailure: boolean;
  username?: string;
  password?: string;
  logger: ArtifactLogger;
};

export class AuthManager {
  constructor(
    private readonly automation: AuthAutomation,
    private readonly notifier: AuthNotifier,
    private readonly linkGenerator: AuthLinkGenerator | undefined,
    private readonly persistSession: () => Promise<void>,
    private readonly options: AuthManagerOptions,
  ) {}

  async authenticate(): Promise<AuthResult> {
    const qrResult = await this.tryQrFlow(1);
    if (qrResult.success) {
      return qrResult;
    }

    if (!this.options.fallbackToPasswordLogin) {
      return qrResult;
    }

    const passwordResult = await this.tryPasswordFlow();
    if (passwordResult.success) {
      return passwordResult;
    }

    if (!this.options.fallbackToQrAfterPasswordFailure) {
      return passwordResult;
    }

    return this.tryQrFlow(this.options.qrRefreshLimit + 2);
  }

  private async tryQrFlow(attemptBase: number): Promise<AuthResult> {
    const timeoutMs = this.options.qrWaitTimeoutMinutes * 60_000;
    let artifact = await this.automation.fetchQrCode();

    for (let refreshIndex = 0; refreshIndex <= this.options.qrRefreshLimit; refreshIndex += 1) {
      const attempt = attemptBase + refreshIndex;
      const link = this.linkGenerator ? await this.linkGenerator.createLink(artifact) : undefined;
      await this.notifier.sendQrLogin({
        expiresInMinutes: artifact.expiresInMinutes,
        attempt,
        imageDataUrl: artifact.imageDataUrl,
        link: link?.url,
      });
      await this.options.logger.info(`QR login link issued for attempt ${attempt}.`);

      const loggedIn = await this.automation.waitForLogin(timeoutMs);
      if (loggedIn && (await this.automation.isLoggedIn())) {
        await this.persistSession();
        return { success: true, method: "qr" };
      }

      if (refreshIndex < this.options.qrRefreshLimit) {
        artifact = await this.automation.refreshQrCode();
      }
    }

    return {
      success: false,
      method: "qr",
      reason: "qr_login_timeout",
    };
  }

  private async tryPasswordFlow(): Promise<AuthResult> {
    if (!this.options.username || !this.options.password) {
      return {
        success: false,
        method: "password",
        reason: "password_login_not_configured",
      };
    }

    const ok = await this.automation.loginWithPassword(this.options.username, this.options.password);
    if (!ok || !(await this.automation.isLoggedIn())) {
      return {
        success: false,
        method: "password",
        reason: "password_login_failed",
      };
    }

    await this.persistSession();
    return {
      success: true,
      method: "password",
    };
  }
}
