import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { AuthManager } from "../src/auth/auth-manager.js";
import { QrLinkService } from "../src/auth/qr-link-service.js";
import { SessionManager } from "../src/auth/session-manager.js";
import { ArtifactLogger } from "../src/runtime/logger.js";

class FakeAuthAutomation {
  qrWaitResults: boolean[];
  passwordResult: boolean;
  loggedIn = false;
  qrRefreshes = 0;

  constructor(options: { qrWaitResults: boolean[]; passwordResult: boolean }) {
    this.qrWaitResults = [...options.qrWaitResults];
    this.passwordResult = options.passwordResult;
  }

  async isLoggedIn(): Promise<boolean> {
    return this.loggedIn;
  }

  async fetchQrCode() {
    return { imageDataUrl: "data:image/png;base64,abc", expiresInMinutes: 10 };
  }

  async refreshQrCode() {
    this.qrRefreshes += 1;
    return { imageDataUrl: `data:image/png;base64,refresh-${this.qrRefreshes}`, expiresInMinutes: 10 };
  }

  async waitForLogin(): Promise<boolean> {
    const result = this.qrWaitResults.shift() ?? false;
    this.loggedIn = result;
    return result;
  }

  async loginWithPassword(): Promise<boolean> {
    this.loggedIn = this.passwordResult;
    return this.passwordResult;
  }

  async exportStorageState(): Promise<unknown> {
    return { cookies: [] };
  }
}

describe("SessionManager", () => {
  it("persists, restores, and clears storage state metadata", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "musichelp-session-"));
    const manager = new SessionManager(dir);

    await manager.persistSession(async () => ({ cookies: [{ name: "a" }] }));
    expect(await manager.hasPersistedSession()).toBe(true);

    const result = await manager.restoreSession(async () => ({ valid: true }));
    expect(result.valid).toBe(true);

    await manager.clearSession();
    expect(await manager.hasPersistedSession()).toBe(false);
  });
});

describe("QrLinkService", () => {
  it("creates a signed temporary link manifest", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "musichelp-qr-"));
    const service = new QrLinkService({
      qrDir: dir,
      baseUrl: "https://example.test/qr",
      signingSecret: "secret",
    });

    const link = await service.createLink({
      imageDataUrl: "data:image/png;base64,abc",
      expiresInMinutes: 10,
    });

    expect(link.url.startsWith("https://example.test/qr/")).toBe(true);
    const manifest = JSON.parse(await readFile(link.manifestPath, "utf8")) as { token: string };
    expect(manifest.token).toBe(link.token);
  });
});

describe("AuthManager", () => {
  it("falls back from QR timeout to password and then to QR once more", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "musichelp-auth-"));
    const logger = new ArtifactLogger(path.join(dir, "run.log"));
    await logger.init();

    const automation = new FakeAuthAutomation({
      qrWaitResults: [false, false, false, true],
      passwordResult: false,
    });

    const notifications: string[] = [];
    let persisted = 0;

    const manager = new AuthManager(
      automation,
      {
        async sendQrLoginLink(payload) {
          notifications.push(payload.link);
        },
      },
      new QrLinkService({
        qrDir: dir,
        baseUrl: "https://example.test/qr",
        signingSecret: "secret",
      }),
      async () => {
        persisted += 1;
      },
      {
        qrWaitTimeoutMinutes: 10,
        qrRefreshLimit: 2,
        fallbackToPasswordLogin: true,
        fallbackToQrAfterPasswordFailure: true,
        username: "user",
        password: "pass",
        logger,
      },
    );

    const result = await manager.authenticate();

    expect(result).toEqual({ success: true, method: "qr" });
    expect(notifications).toHaveLength(4);
    expect(automation.qrRefreshes).toBe(2);
    expect(persisted).toBe(1);
  });
});
