import { writeFile } from "node:fs/promises";
import type { BrowserAutomation, PlaybackResult } from "../player/browser-automation.js";
import type { TrackTarget } from "../runtime/types.js";
import type { BrowserFactory } from "./task-runner.js";

type PlaywrightModule = typeof import("@playwright/test");

class PlaywrightBrowserAutomation implements BrowserAutomation {
  private constructor(
    private readonly browser: import("@playwright/test").Browser,
    private readonly context: import("@playwright/test").BrowserContext,
    private readonly page: import("@playwright/test").Page,
  ) {}

  static async create(storageStatePath?: string): Promise<PlaywrightBrowserAutomation> {
    const playwright = (await import("@playwright/test")) as unknown as PlaywrightModule;
    const browser = await playwright.chromium.launch({
      headless: true,
    });
    const context = await browser.newContext({
      storageState: storageStatePath,
    });
    const page = await context.newPage();
    return new PlaywrightBrowserAutomation(browser, context, page);
  }

  async isLoggedIn(): Promise<boolean> {
    await this.page.goto("https://music.163.com/", { waitUntil: "domcontentloaded" });
    return !this.page.url().includes("login");
  }

  async fetchQrCode() {
    const imageDataUrl = "data:image/png;base64,placeholder";
    return {
      imageDataUrl,
      expiresInMinutes: 10,
    };
  }

  async refreshQrCode() {
    return this.fetchQrCode();
  }

  async waitForLogin(timeoutMs: number): Promise<boolean> {
    try {
      await this.page.waitForFunction(() => !window.location.href.includes("login"), undefined, { timeout: timeoutMs });
      return true;
    } catch {
      return false;
    }
  }

  async loginWithPassword(username: string, password: string): Promise<boolean> {
    await this.page.goto("https://music.163.com/#/login", { waitUntil: "domcontentloaded" });
    await this.page.evaluate(
      ([user, pass]) => {
        const userInput = document.querySelector<HTMLInputElement>("input[type='text'], input[name='username']");
        const passInput = document.querySelector<HTMLInputElement>("input[type='password']");
        userInput?.focus();
        if (userInput) userInput.value = user;
        passInput?.focus();
        if (passInput) passInput.value = pass;
      },
      [username, password],
    );
    return this.isLoggedIn();
  }

  async exportStorageState(): Promise<unknown> {
    return this.context.storageState();
  }

  async openTarget(target: TrackTarget): Promise<void> {
    await this.page.goto(target.url, { waitUntil: "domcontentloaded" });
  }

  async startPlayback(): Promise<void> {
    await this.page.keyboard.press("Space");
  }

  async waitForTrackFinished(): Promise<PlaybackResult> {
    try {
      await this.page.waitForTimeout(1_000);
      return { status: "finished" };
    } catch (error) {
      return {
        status: "error",
        reason: error instanceof Error ? error.message : "playback_wait_failed",
      };
    }
  }

  async captureScreenshot(filePath: string): Promise<void> {
    await this.page.screenshot({ path: filePath, fullPage: true });
  }

  async captureDomSnapshot(filePath: string): Promise<void> {
    await writeFile(filePath, await this.page.content(), "utf8");
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }
}

export class PlaywrightBrowserFactory implements BrowserFactory {
  async create(options: { storageStatePath?: string }): Promise<BrowserAutomation> {
    return PlaywrightBrowserAutomation.create(options.storageStatePath);
  }
}
