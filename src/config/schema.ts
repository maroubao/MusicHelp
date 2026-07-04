import { z } from "zod";

const urlSchema = z.url();

const secretRefSchema = z
  .string()
  .trim()
  .min(1, "Secret reference must not be empty.");

const trackSchema = z.object({
  name: z.string().trim().min(1, "Track name must not be empty."),
  url: urlSchema,
});

const targetsSchema = z
  .object({
    mode: z.enum(["song", "songs", "playlist"]),
    song: trackSchema.optional(),
    songs: z.array(trackSchema).min(1, "targets.songs must not be empty.").optional(),
    playlist: trackSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const providedKeys = ["song", "songs", "playlist"].filter((key) => value[key as keyof typeof value] !== undefined);

    if (providedKeys.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one of targets.song, targets.songs, or targets.playlist must be provided.",
        path: [],
      });
      return;
    }

    if (value.mode === "song" && value.song === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targets.mode=song requires targets.song.",
        path: ["song"],
      });
    }

    if (value.mode === "songs" && value.songs === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targets.mode=songs requires targets.songs.",
        path: ["songs"],
      });
    }

    if (value.mode === "playlist" && value.playlist === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targets.mode=playlist requires targets.playlist.",
        path: ["playlist"],
      });
    }

    const mismatchedKey =
      (value.mode !== "song" && value.song !== undefined) ||
      (value.mode !== "songs" && value.songs !== undefined) ||
      (value.mode !== "playlist" && value.playlist !== undefined);

    if (mismatchedKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Only the target payload matching targets.mode may be provided.",
        path: [],
      });
    }
  });

const playbackSchema = z.object({
  order: z.literal("sequential"),
  loop_mode: z.enum(["single_repeat", "list_repeat", "playlist_repeat"]),
  completion_rule: z.literal("full_track_finished"),
});

const retrySchema = z.object({
  max_attempts: z.number().int().min(1, "retry.max_attempts must be at least 1."),
  backoff_seconds: z.number().int().min(0, "retry.backoff_seconds must be >= 0."),
  policy: z.literal("rerun_whole_task"),
});

const authSchema = z
  .object({
    prefer_session_reuse: z.literal(true),
    qr_wait_timeout_minutes: z.literal(10),
    qr_refresh_limit: z.literal(2),
    fallback_to_password_login: z.boolean(),
    fallback_to_qr_after_password_failure: z.boolean(),
    session_secret_ref: secretRefSchema,
    username_secret_ref: secretRefSchema.optional(),
    password_secret_ref: secretRefSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fallback_to_password_login) {
      if (!value.username_secret_ref) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "username_secret_ref is required when fallback_to_password_login=true.",
          path: ["username_secret_ref"],
        });
      }

      if (!value.password_secret_ref) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "password_secret_ref is required when fallback_to_password_login=true.",
          path: ["password_secret_ref"],
        });
      }
    }
  });

const notifySchema = z.object({
  feishu_webhook_secret_ref: secretRefSchema,
  send_success: z.boolean(),
  send_failure: z.boolean(),
  include_duration: z.boolean(),
  include_effective_count: z.boolean(),
});

const artifactsSchema = z.object({
  save_logs: z.boolean(),
  save_screenshots: z.boolean(),
  save_trace_on_failure: z.boolean(),
});

export const appConfigSchema = z.object({
  task_name: z.string().trim().min(1, "task_name must not be empty."),
  schedule: z.string().trim().min(1, "schedule must not be empty."),
  runner_mode: z.literal("github_actions"),
  target_effective_count: z.number().int().positive("target_effective_count must be > 0."),
  max_run_hours: z.number().int().positive("max_run_hours must be > 0."),
  targets: targetsSchema,
  playback: playbackSchema,
  retry: retrySchema,
  auth: authSchema,
  notify: notifySchema,
  artifacts: artifactsSchema,
});

export type AppConfig = z.infer<typeof appConfigSchema>;
