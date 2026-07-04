import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserAutomation } from "../player/browser-automation.js";
import type { ArtifactLogger } from "../runtime/logger.js";
import type { ArtifactPaths } from "../runtime/paths.js";
import type { RunSummary } from "../runtime/types.js";
import { ensureDir, writeJson } from "../runtime/fs-utils.js";

export class EvidenceCollector {
  constructor(
    private readonly paths: ArtifactPaths,
    private readonly logger: ArtifactLogger,
  ) {}

  async initialize(): Promise<void> {
    await Promise.all([
      ensureDir(this.paths.logsDir),
      ensureDir(this.paths.reportsDir),
      ensureDir(this.paths.screenshotsDir),
      ensureDir(this.paths.traceDir),
      ensureDir(this.paths.stateDir),
      ensureDir(this.paths.qrDir),
    ]);
  }

  async captureFailureEvidence(
    automation: BrowserAutomation | undefined,
    reason: string,
    attempt: number,
    state: string,
  ): Promise<void> {
    const safeAttempt = `attempt-${attempt}`;
    const screenshotPath = path.join(this.paths.screenshotsDir, `${safeAttempt}.png`);
    const snapshotPath = path.join(this.paths.traceDir, `${safeAttempt}.html`);
    const recordPath = path.join(this.paths.traceDir, `${safeAttempt}.json`);

    if (automation) {
      await automation.captureScreenshot(screenshotPath);
      await automation.captureDomSnapshot(snapshotPath);
    }

    await writeJson(recordPath, {
      attempt,
      state,
      reason,
      capturedAt: new Date().toISOString(),
      screenshotPath,
      snapshotPath,
    });

    await this.logger.error(`Failure evidence captured for attempt ${attempt}: ${reason}`);
  }

  async writeRunSummary(summary: RunSummary): Promise<void> {
    const markdownPath = path.join(this.paths.reportsDir, "run-summary.md");
    const jsonPath = path.join(this.paths.reportsDir, "run-summary.json");
    const markdown = [
      "# Run Summary",
      "",
      `- Task: ${summary.taskName}`,
      `- Status: ${summary.status}`,
      `- Attempt: ${summary.attempt}`,
      `- Started at: ${summary.startedAt}`,
      `- Finished at: ${summary.finishedAt}`,
      `- Duration ms: ${summary.durationMs}`,
      `- Effective count: ${summary.effectiveCount}/${summary.targetCount}`,
      `- Auth method: ${summary.authMethod ?? "n/a"}`,
      `- Failure reason: ${summary.failureReason ?? "n/a"}`,
      "",
    ].join("\n");

    await writeFile(markdownPath, markdown, "utf8");
    await writeJson(jsonPath, summary);
  }
}
