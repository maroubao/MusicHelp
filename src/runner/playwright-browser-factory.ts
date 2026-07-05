import { writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
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
    const imageDataUrl = `data:image/png;base64,${Buffer.from("placeholder-qr").toString("base64")}`;
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
    await this.page.goto(this.normalizeSongUrl(target.url), { waitUntil: "domcontentloaded" });
    await this.page.waitForLoadState("networkidle").catch(() => undefined);
  }

  async startPlayback(target: TrackTarget): Promise<void> {
    const directPlaySelector = `a[data-res-action="play"][data-res-id="${this.extractSongId(target.url) ?? ""}"]`;

    if ((await this.page.locator(directPlaySelector).count()) > 0) {
      await this.page.locator(directPlaySelector).first().click();
      return;
    }

    if ((await this.page.locator('a[data-res-action="play"]').count()) > 0) {
      await this.page.locator('a[data-res-action="play"]').first().click();
      return;
    }

    await this.page.keyboard.press("Space");
  }

  async waitForTrackFinished(): Promise<PlaybackResult> {
    try {
      await this.page.waitForFunction(
        `
        () => {
          const audio = document.querySelector("audio");
          if (audio && audio.duration > 0) {
            return !audio.paused || audio.currentTime > 0;
          }
          const nodes = Array.from(document.querySelectorAll(".m-playbar .time em, .m-playbar em"));
          const texts = nodes.map(node => (node.innerText || "").trim()).filter(Boolean);
          return texts.some(text => /^\\d{1,2}:\\d{2}$/.test(text));
        }
        `,
        undefined,
        { timeout: 30_000 },
      );

      await this.page.waitForFunction(
        `
        () => {
          const parseTimeText = (input) => {
            const match = /^(\\d{1,2}):(\\d{2})$/.exec((input || "").trim());
            if (!match) return null;
            return Number(match[1]) * 60 + Number(match[2]);
          };

          const state = window;
          const audio = document.querySelector("audio");
          if (audio && audio.duration > 0) {
            if (!state.__musicHelpStartedAt && (!audio.paused || audio.currentTime > 0)) {
              state.__musicHelpStartedAt = Date.now();
              state.__musicHelpLastTime = audio.currentTime;
            }
            if (state.__musicHelpStartedAt && audio.currentTime > (state.__musicHelpLastTime || 0)) {
              state.__musicHelpLastTime = audio.currentTime;
            }
            return audio.ended || (audio.duration - audio.currentTime <= 1 && audio.currentTime > 1);
          }

          const nodes = Array.from(document.querySelectorAll(".m-playbar .time em, .m-playbar em"));
          const texts = nodes
            .map(node => (node.innerText || "").trim())
            .filter(text => /^\\d{1,2}:\\d{2}$/.test(text));

          if (texts.length < 2) return false;

          const current = parseTimeText(texts[0]);
          const total = parseTimeText(texts[1]);
          if (current === null || total === null || total <= 0) return false;

          if (current > 0) {
            state.__musicHelpStartedProgress = true;
          }
          if ((state.__musicHelpLastProgress || -1) < current) {
            state.__musicHelpLastProgress = current;
          }
          return Boolean(state.__musicHelpStartedProgress) && total - current <= 1;
        }
        `,
        undefined,
        { timeout: 20 * 60_000, polling: 1000 },
      );

      return { status: "finished" };
    } catch (error) {
      return {
        status: "error",
        reason: error instanceof Error ? `real_playback_detection_failed: ${error.message}` : "real_playback_detection_failed",
      };
    }
  }

  getCompletionDetectionMode(): "simulated_debug" | "real" {
    return "real";
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

  private normalizeSongUrl(url: string): string {
    return url.replace("https://music.163.com/#/song?", "https://music.163.com/song?");
  }

  private extractSongId(url: string): string | undefined {
    const normalized = this.normalizeSongUrl(url);
    return new URL(normalized).searchParams.get("id") ?? undefined;
  }
}

export class PlaywrightBrowserFactory implements BrowserFactory {
  async create(options: { storageStatePath?: string }): Promise<BrowserAutomation> {
    return PlaywrightBrowserAutomation.create(options.storageStatePath);
  }
}
