import type { AppConfig } from "../config/schema.js";

export type TaskState =
  | "IDLE"
  | "VALIDATING_CONFIG"
  | "STARTING_RUNNER"
  | "RESTORING_SESSION"
  | "AUTHENTICATING"
  | "PREPARING_PLAYBACK"
  | "PLAYING"
  | "COUNTING"
  | "COMPLETED"
  | "FAILED"
  | "RETRYING";

export type TrackTargetSource = "song" | "songs" | "playlist";

export type TrackTarget = {
  name: string;
  url: string;
  source: TrackTargetSource;
};

export type PlaybackPlan = {
  mode: AppConfig["targets"]["mode"];
  queue: TrackTarget[];
  loopMode: AppConfig["playback"]["loop_mode"];
};

export type CounterState = {
  effectiveCount: number;
  targetCount: number;
  completedTracks: Array<{
    name: string;
    source: TrackTargetSource;
    completedAt: string;
  }>;
  updatedAt: string;
};

export type SessionCheckResult = {
  valid: boolean;
  reason?: string;
};

export type AuthMethod = "session" | "qr" | "password";

export type AuthResult = {
  success: boolean;
  method: AuthMethod;
  reason?: string;
};

export type QrCodeArtifact = {
  imageDataUrl: string;
  expiresInMinutes: number;
};

export type GeneratedQrLink = {
  url: string;
  token: string;
  expiresAt: string;
  manifestPath: string;
};

export type QrLoginNotification = {
  expiresInMinutes: number;
  attempt: number;
  imageDataUrl?: string;
  link?: string;
};

export type RunSummary = {
  taskName: string;
  status: "success" | "failure";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  effectiveCount: number;
  targetCount: number;
  attempt: number;
  failureReason?: string;
  authMethod?: AuthMethod;
};

export type AttemptRecord = {
  attempt: number;
  state: TaskState;
  timestamp: string;
  detail?: string;
};
