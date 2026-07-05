# MusicHelp

GitHub Actions based monthly listening task automation scaffold for NetEase Music, implemented against `docs/project-spec.md` as the single project baseline.

## What Exists

- TypeScript runtime scaffold for M1-M5
- YAML config loading and schema validation
- Session restore and persistence skeleton
- QR login recovery flow with signed temporary link manifests
- Password fallback branch retained behind secrets
- Sequential target resolution for `song` / `songs` / `playlist`
- Full-track-finished counting model
- Whole-task retry orchestration
- Failure evidence capture and run summary artifacts
- Feishu success / failure / QR notifications
- GitHub Actions workflow

## Project Constraints

- GitHub Actions is the only supported automation environment
- `song` / `songs` / `playlist` are mutually exclusive
- Only a full track completion counts as `1`
- Session reuse is preferred; QR recovery is the primary fallback
- QR timeout is `10` minutes with at most `2` refreshes
- Password login fallback is retained
- Any failure retries the whole task instead of resuming in-place

## Quick Start

1. Install dependencies:

```powershell
npm ci
```

2. Validate the config:

```powershell
npm run check-config -- config/listening-task.yaml
```

3. Run tests:

```powershell
npm test
```

4. Run the task locally:

```powershell
$env:MUSICHELP_CONFIG_PATH='config/listening-task.yaml'
npm run task:monthly
```

## GitHub Actions Setup

Set these in `Settings -> Secrets and variables -> Actions`.

### Repository secrets

- `QR_LINK_SIGNING_SECRET`
- `FEISHU_BOT_WEBHOOK`
- `NETEASE_SESSION_SECRET`
- `NETEASE_USERNAME`
- `NETEASE_PASSWORD`

### Repository variables

- `QR_LINK_PUBLIC_BASE_URL`

Detailed setup guidance is in [docs/github-actions-setup.md](/abs/path/D:/Projects/MusicHelp/docs/github-actions-setup.md:1).

## Artifacts

Each run writes artifacts under `artifacts/`:

- `logs/run.log`
- `state/counter-state.json`
- `state/run-state.json`
- `state/session-metadata.json`
- `reports/run-summary.md`
- `reports/run-summary.json`
- `screenshots/`
- `trace/`
- `qr-links/`

## Current Limits

- Real NetEase selectors and page behaviors still need live-site tuning
- `QR_LINK_PUBLIC_BASE_URL` must point to an externally reachable QR presentation endpoint if QR links are expected to open outside GitHub artifacts
- The current Playwright adapter is conservative and should be treated as a starting point for live validation
