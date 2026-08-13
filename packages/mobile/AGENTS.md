# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Shipping

Full rules in root `CLAUDE.md`. Quick reference:

- **JS/asset change** (fingerprint unchanged): `pnpm update:preview` → QA → `pnpm update:production`
- **Native/config/SDK change** (fingerprint changed):
  - iOS: `pnpm build:ios` → `pnpm submit:ios` (needs `ASC_API_KEY_PATH` env var)
  - Android: `pnpm build:android` → `pnpm submit:android` (needs `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` env var)
- Never call `eas build` or `eas update` directly — the scripts run preflight first.
- Rollback OTA: `npx eas-cli update:republish --branch production` (never delete)
- Android Play setup is one-time manual (Play Console + service account) — see root `CLAUDE.md`.

# Hard rules

- URL API is banned (RN polyfill is http-only, never throws) — use `src/utils/urlNormalize.ts`.
- Never cache signed asset URLs / materials responses (24h TTL) — fetch per mount.
- Unit tests must never hit the network: `apiClient` defaults to the PROD API when
  `EXPO_PUBLIC_API_URL` is unset — mock `fetch` or the client method.
- Coverage thresholds in `jest.config.js` never go down.
