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

Full steps (tracks, API level, Data Safety): root [`CLAUDE.md`](../../CLAUDE.md) § _Android Play Console setup (one-time, manual)_.

EAS cloud workflows may use credentials uploaded in the Expo dashboard; local and script-driven submit use the env var above.

## Google Play store listing

The listing is pushed from this repo, not typed into Play Console:

| What                                                         | File                                             |
| ------------------------------------------------------------ | ------------------------------------------------ |
| Title, short and full description, contact email and website | `store-metadata/en-US.json` (`googlePlay`)       |
| Icon, 512 x 512                                              | `store-metadata/google-play/icon.png`            |
| Feature graphic, 1024 x 500                                  | `store-metadata/google-play/feature-graphic.png` |
| Phone screenshots                                            | `store-metadata/screenshots/google-play-phone/`  |

```bash
node scripts/sync-google-play-listing.mjs --check   # validates the files, sends nothing, needs no key
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/key.json node scripts/sync-google-play-listing.mjs
```

The script replaces the listing text and images in one Play edit and commits it. It does not touch releases, testers, or countries. If Play refuses any step, the edit is deleted and nothing changes.

The service account needs **Manage store presence** for the app (Play Console → Users and permissions → the service account → App permissions). Release Manager alone can publish builds but not change the listing; Play then answers `403 The caller does not have permission` at the validate step.

Google has no API for the Play Console forms. These are filled in by hand: app access (the review sign-in), ads, content rating, target audience, data safety, and the privacy policy link.
