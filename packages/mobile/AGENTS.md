# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Shipping

Always `pnpm build:ios` (never `eas build` directly — build:ios runs preflight first)
then `pnpm submit:ios`. Full rules: root `CLAUDE.md`.

# Hard rules

- URL API is banned (RN polyfill is http-only, never throws) — use `src/utils/urlNormalize.ts`.
- Never cache signed asset URLs / materials responses (24h TTL) — fetch per mount.
- Unit tests must never hit the network: `apiClient` defaults to the PROD API when
  `EXPO_PUBLIC_API_URL` is unset — mock `fetch` or the client method.
- Coverage thresholds in `jest.config.js` never go down.
