# Maestro flows

## sync-portal

Runs against the fake portal in `packages/e2e/fake-portal` (port **2855**).

1. Build deps and start the fake server (from repo root):

   ```bash
   pnpm --filter @scholaracle/contracts build
   pnpm --filter @scholaracle/logger build
   pnpm --filter @scholaracle/scraper-core build
   pnpm --filter @scholaracle/e2e run fake-portal:build
   FAKE_PORTAL_STRICT_CSP=1 FAKE_PORTAL_PORT=2855 pnpm --filter @scholaracle/e2e run fake-portal:start
   ```

2. Run on a simulator (set `FAKE_PORTAL_BASE_URL` if the device cannot use `127.0.0.1`, e.g. Android emulator `http://10.0.2.2:2855`):

   ```bash
   maestro test packages/mobile/maestro/sync-portal.yaml
   ```
