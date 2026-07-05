# GitHub Actions Setup

## Current phase / Current phase

Pre-flight setup and first-run debugging guide for the `monthly-listening` workflow.

## Verified facts / 已验证事实

- Workflow file: `.github/workflows/monthly-listening.yml`
- Default config file: `config/listening-task.yaml`
- Runtime entrypoint: `src/index.ts`
- Artifacts are uploaded on every run

## Required repository secrets / 必需 Secrets

Add the following in `Settings -> Secrets and variables -> Actions -> Secrets`.

| Name | Purpose | Notes |
|---|---|---|
| `QR_LINK_SIGNING_SECRET` | Signs QR temporary-link manifests | Use a random string with at least 32 characters |
| `FEISHU_BOT_WEBHOOK` | Sends success/failure/login notifications | Full Feishu bot webhook URL |
| `NETEASE_SESSION_SECRET` | Reserved for future session import/export strategy | Placeholder is acceptable for now |
| `NETEASE_USERNAME` | Password fallback login username | Required only if password fallback remains enabled |
| `NETEASE_PASSWORD` | Password fallback login password | Required only if password fallback remains enabled |

## Required repository variables / 必需 Variables

Add the following in `Settings -> Secrets and variables -> Actions -> Variables`.

| Name | Purpose | Example |
|---|---|---|
| `QR_LINK_PUBLIC_BASE_URL` | Public prefix used to build QR login links | `https://your-domain.example/musichelp/qr` |

## Debug-first recommendations / 调试优先建议

### Option A: Full setup

Use when you already have:

- Feishu bot webhook
- Reachable QR temporary-link service
- NetEase credentials

### Option B: Session-and-notify-first

Use when you want to reduce moving parts for the first run:

1. Keep `FEISHU_BOT_WEBHOOK`
2. Keep `QR_LINK_SIGNING_SECRET`
3. Set a placeholder `QR_LINK_PUBLIC_BASE_URL`
4. Leave password fallback secrets configured but expect QR path debugging first

## First workflow run / 第一次运行

1. Open `Actions`
2. Select `monthly-listening`
3. Click `Run workflow`
4. Watch these stages:
   - `Validate config`
   - `Run tests`
   - `Run monthly task`
5. If login or playback fails, download the uploaded `monthly-listening-artifacts`

## Evidence to inspect after a failed run / 失败后优先查看的证据

- `artifacts/logs/run.log`
- `artifacts/state/run-state.json`
- `artifacts/state/session-metadata.json`
- `artifacts/reports/run-summary.md`
- `artifacts/screenshots/`
- `artifacts/trace/`

## High-probability first-run issues / 高概率首跑问题

| Area | Symptom | Likely cause |
|---|---|---|
| QR login | Link opens but QR is unusable | `QR_LINK_PUBLIC_BASE_URL` endpoint is missing |
| Password login | Login does not progress | Real page selectors differ from current adapter |
| Session restore | Always re-authenticates | Session cache not yet populated or expired |
| Playback | Immediate failure or no counting | Real player selectors/events need live tuning |

## Suggested next steps / 建议下一步

1. Configure all secrets and variables.
2. Trigger one manual workflow run.
3. Share the failure stage and artifact summary if the first run does not complete.
