import path from "node:path";
import type { AppConfig } from "../config/schema.js";
import { AuthManager } from "../auth/auth-manager.js";
import { QrLinkService } from "../auth/qr-link-service.js";
import { SessionManager } from "../auth/session-manager.js";
import { EvidenceCollector } from "../evidence/evidence-collector.js";
import { FeishuNotifier } from "../notifier/feishu-notifier.js";
import type { BrowserAutomation } from "../player/browser-automation.js";
import { PlayerController } from "../player/player-controller.js";
import { ArtifactLogger } from "../runtime/logger.js";
import { resolveArtifactPaths } from "../runtime/paths.js";
import { resolveOptionalSecret, resolveSecret } from "../runtime/secrets.js";
import type { AuthMethod, RunSummary, SessionCheckResult } from "../runtime/types.js";
import { CounterService } from "../state/counter-service.js";
import { RunStateStore } from "../state/run-state.js";
import { resolveTargets } from "../targets/resolve-targets.js";

export type BrowserFactory = {
  create(options: { storageStatePath?: string }): Promise<BrowserAutomation>;
};

export type TaskRunnerOptions = {
  config: AppConfig;
  browserFactory: BrowserFactory;
  artifactsDir?: string;
  qrPublicBaseUrl?: string;
  qrSigningSecretEnvName?: string;
};

export class TaskRunner {
  async run(options: TaskRunnerOptions): Promise<RunSummary> {
    const startedAt = new Date();
    const paths = resolveArtifactPaths(options.artifactsDir);
    const logger = new ArtifactLogger(path.join(paths.logsDir, "run.log"));
    await logger.init();

    const runState = new RunStateStore(paths.stateDir);
    const evidence = new EvidenceCollector(paths, logger);
    await evidence.initialize();

    const notifier = new FeishuNotifier({
      webhookUrl: resolveOptionalSecret(options.config.notify.feishu_webhook_secret_ref),
      logger,
      appId: resolveOptionalSecret("FEISHU_APP_ID"),
      appSecret: resolveOptionalSecret("FEISHU_APP_SECRET"),
    });

    const sessionManager = new SessionManager(paths.stateDir);
    const counterService = new CounterService(paths.stateDir, options.config.target_effective_count);
    await counterService.initialize();

    let lastReason = "unknown_failure";
    let authMethod: AuthMethod | undefined;
    let summary: RunSummary | undefined;

    for (let attempt = 1; attempt <= options.config.retry.max_attempts; attempt += 1) {
      let automation: BrowserAutomation | undefined;

      try {
        await runState.recordState("VALIDATING_CONFIG", "Configuration loaded.", attempt);
        const storageStatePath = (await sessionManager.hasPersistedSession()) ? sessionManager.storageStatePath : undefined;

        await runState.recordState("STARTING_RUNNER", "Starting browser automation.", attempt);
        automation = await options.browserFactory.create({ storageStatePath });
        const currentAutomation = automation;

        await runState.recordState("RESTORING_SESSION", "Checking persisted session.", attempt);
        const sessionResult = await sessionManager.restoreSession(async (): Promise<SessionCheckResult> => {
          const valid = await currentAutomation.isLoggedIn();
          return {
            valid,
            reason: valid ? undefined : "session_invalid",
          };
        });

        if (!sessionResult.valid) {
          await runState.recordState("AUTHENTICATING", sessionResult.reason, attempt);

          const qrPublicBaseUrl = options.qrPublicBaseUrl ?? process.env.QR_LINK_PUBLIC_BASE_URL;
          const qrSigningSecret = qrPublicBaseUrl
            ? resolveSecret(options.qrSigningSecretEnvName ?? "QR_LINK_SIGNING_SECRET")
            : undefined;
          const authManager = new AuthManager(
            currentAutomation,
            notifier,
            qrPublicBaseUrl && qrSigningSecret
              ? new QrLinkService({
                  qrDir: paths.qrDir,
                  baseUrl: qrPublicBaseUrl,
                  signingSecret: qrSigningSecret,
                })
              : undefined,
            async () => sessionManager.persistSession(() => currentAutomation.exportStorageState()),
            {
              qrWaitTimeoutMinutes: options.config.auth.qr_wait_timeout_minutes,
              qrRefreshLimit: options.config.auth.qr_refresh_limit,
              fallbackToPasswordLogin: options.config.auth.fallback_to_password_login,
              fallbackToQrAfterPasswordFailure: options.config.auth.fallback_to_qr_after_password_failure,
              username: resolveOptionalSecret(options.config.auth.username_secret_ref),
              password: resolveOptionalSecret(options.config.auth.password_secret_ref),
              logger,
            },
          );
          const authResult = await authManager.authenticate();
          if (!authResult.success) {
            throw new Error(authResult.reason ?? "authentication_failed");
          }
          authMethod = authResult.method;
        } else {
          authMethod = "session";
        }

        const plan = resolveTargets(options.config);
        await runState.recordState("PREPARING_PLAYBACK", `Resolved ${plan.queue.length} playback target(s).`, attempt);

        const player = new PlayerController(currentAutomation);
        await runState.recordState("PLAYING", "Playback started.", attempt);

        await player.playUntilStopped(
          plan,
          async () => counterService.isTargetReached(await counterService.loadCounterState()),
          async (event) => {
            if (event.type === "track_finished") {
              await runState.recordState("COUNTING", `Track finished: ${event.track.name}`, attempt);
              await counterService.incrementCounter(event.track);
            } else if (event.type === "playback_error") {
              throw new Error(event.reason);
            }
          },
        );

        const counterState = await counterService.loadCounterState();
        await runState.recordState("COMPLETED", "Task finished successfully.", attempt);

        summary = {
          taskName: options.config.task_name,
          status: "success",
          startedAt: startedAt.toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          effectiveCount: counterState.effectiveCount,
          targetCount: counterState.targetCount,
          attempt,
          authMethod,
        };
        await evidence.writeRunSummary(summary);
        if (options.config.notify.send_success) {
          await notifier.sendSuccess({
            durationMs: summary.durationMs,
            effectiveCount: summary.effectiveCount,
          });
        }
        await automation.close();
        return summary;
      } catch (error) {
        lastReason = error instanceof Error ? error.message : String(error);
        await runState.recordState("FAILED", lastReason, attempt);
        await evidence.captureFailureEvidence(automation, lastReason, attempt, "FAILED");
        if (options.config.notify.send_failure) {
          await notifier.sendFailure({ attempt, reason: lastReason });
        }
        if (automation) {
          await automation.close();
        }

        if (attempt < options.config.retry.max_attempts) {
          await runState.recordState("RETRYING", `Retry scheduled after ${lastReason}`, attempt);
          await counterService.initialize();
          continue;
        }
      }
    }

    const counterState = await counterService.loadCounterState();
    summary = {
      taskName: options.config.task_name,
      status: "failure",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      effectiveCount: counterState.effectiveCount,
      targetCount: counterState.targetCount,
      attempt: options.config.retry.max_attempts,
      failureReason: lastReason,
      authMethod,
    };
    await evidence.writeRunSummary(summary);
    return summary;
  }
}
