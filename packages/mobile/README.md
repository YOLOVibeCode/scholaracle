# Scholarmancy mobile (`@scholaracle/mobile`)

Expo SDK 57 companion app (`com.scholarmancy.app`). Shipping scripts and guardrails live in root [`CLAUDE.md`](../../CLAUDE.md) and [`AGENTS.md`](./AGENTS.md).

## Android Play submit credentials

Android store submit profiles read the service account JSON from an environment variable (never a hardcoded path in git):

```bash
export GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/scholarmancy-play-service-account.json
```

Set this before `pnpm build:android`, `pnpm build:android:preview`, or `pnpm submit:android*`. The same variable name is used in [`eas.json`](./eas.json) as `$GOOGLE_SERVICE_ACCOUNT_KEY_PATH`, matching iOS `$ASC_API_KEY_PATH`.

### One-time Play Console setup

Before the first Android submit:

1. Open [Google Play Console](https://play.google.com/console) and ensure the Scholarmancy app exists (`com.scholarmancy.app`).
2. Create a service account in [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials.
3. In Play Console → Setup → API access, grant that account **Release Manager** access.
4. Download the JSON key, store it outside the repo, and point `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` at that file.

Full steps (tracks, API level, Data Safety): root [`CLAUDE.md`](../../CLAUDE.md) § *Android Play Console setup (one-time, manual)*.

EAS cloud workflows may use credentials uploaded in the Expo dashboard; local and script-driven submit use the env var above.
