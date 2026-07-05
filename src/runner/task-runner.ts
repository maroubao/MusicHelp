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
    const plan = resolveTargets(options.config);

    await logger.info(
      [
        `Task started: ${options.config.task_name}`,
        `target_mode=${plan.mode}`,
        `target_effective_count=${options.config.target_effective_count}`,
        `queue_length=${plan.queue.length}`,
        `loop_mode=${plan.loopMode}`,
      ].join("; "),
    );
    await logger.info(`Playback queue: ${plan.queue.map((track) => `${track.name} <${track.url}>`).join(" | ")}`);

    let lastReason = "unknown_failure";
    let authMethod: AuthMethod | undefined;
    let summary: RunSummary | undefined;

    for (let attempt = 1; attempt <= options.config.retry.max_attempts; attempt += 1) {
      let automation: BrowserAutomation | undefined;

      try {
        await logger.info(`Attempt ${attempt}/${options.config.retry.max_attempts}: validating config and preparing runner.`);
        await runState.recordState("VALIDATING_CONFIG", "Configuration loaded.", attempt);
        const storageStatePath = (await sessionManager.hasPersistedSession()) ? sessionManager.storageStatePath : undefined;
        await logger.info(`Attempt ${attempt}: persisted_session=${storageStatePath ? "present" : "missing"}.`);

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
        await logger.info(
          `Attempt ${attempt}: session_restore=${sessionResult.valid ? "valid" : "invalid"}${sessionResult.reason ? `; reason=${sessionResult.reason}` : ""}.`,
        );

        if (!sessionResult.valid) {
          await runState.recordState("AUTHENTICATING", sessionResult.reason, attempt);
          await logger.warn(`Attempt ${attempt}: entering authentication recovery flow.`);

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
          await logger.info(`Attempt ${attempt}: authentication restored via ${authMethod}.`);
        } else {
          authMethod = "session";
          await logger.info(`Attempt ${attempt}: continuing with persisted session.`);
        }

        await runState.recordState("PREPARING_PLAYBACK", `Resolved ${plan.queue.length} playback target(s).`, attempt);
        await logger.info(`Attempt ${attempt}: preparing playback for ${plan.queue.length} target(s).`);

        const player = new PlayerController(currentAutomation);
        await runState.recordState("PLAYING", "Playback started.", attempt);
        await logger.info(`Attempt ${attempt}: playback loop started.`);

        await player.playUntilStopped(
          plan,
          async () => counterService.isTargetReached(await counterService.loadCounterState()),
          async (event) => {
            const currentState = await counterService.loadCounterState();
            if (event.type === "track_finished") {
              await runState.recordState("COUNTING", `Track finished: ${event.track.name}`, attempt);
              const nextState = await counterService.incrementCounter(event.track);
              await logger.info(
                `Attempt ${attempt}: track_finished=${event.track.name}; progress=${nextState.effectiveCount}/${nextState.targetCount}.`,
              );
            } else if (event.type === "track_started") {
              await logger.info(
                `Attempt ${attempt}: track_started=${event.track.name}; progress=${currentState.effectiveCount}/${currentState.targetCount}.`,
              );
            } else if (event.type === "playback_error") {
              await logger.error(`Attempt ${attempt}: playback_error on ${event.track.name}; reason=${event.reason}.`);
              throw new Error(event.reason);
            }
          },
        );

        const counterState = await counterService.loadCounterState();
        await runState.recordState("COMPLETED", "Task finished successfully.", attempt);
        await logger.info(
          `Attempt ${attempt}: task completed; final_progress=${counterState.effectiveCount}/${counterState.targetCount}; auth_method=${authMethod ?? "unknown"}.`,
        );

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
        await logger.error(`Attempt ${attempt}: task failed; reason=${lastReason}.`);
        await evidence.captureFailureEvidence(automation, lastReason, attempt, "FAILED");
        if (options.config.notify.send_failure) {
          await notifier.sendFailure({ attempt, reason: lastReason });
        }
        if (automation) {
          await automation.close();
        }

        if (attempt < options.config.retry.max_attempts) {
          await runState.recordState("RETRYING", `Retry scheduled after ${lastReason}`, attempt);
          await logger.warn(`Attempt ${attempt}: retrying whole task after failure.`);
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
    await logger.error(
      `Task failed after ${options.config.retry.max_attempts} attempt(s); final_progress=${counterState.effectiveCount}/${counterState.targetCount}; reason=${lastReason}.`,
    );
    await evidence.writeRunSummary(summary);
    return summary;
  }
}
