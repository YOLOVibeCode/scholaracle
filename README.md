# Scholaracle (Scholarmancy)

AI-powered parenting assistant for academic success. The consumer product is **Scholarmancy** ([scholarmancy.com](https://scholarmancy.com)).

Parents connect Canvas, Skyward, or Aeries from **their** device and provision a real login for each child. Students use the **studio** (`/studio` on iPad Safari or web — Today + one next step, not a shrunken parent dashboard). Scholarmancy servers do not log into school portals; students never see portal credentials.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

## How data gets in

```
School portal  →  parent’s device (app / extension / CLI)  →  ingest API  →  dashboard + alerts
   (login)              (extract + transform)                 (envelope)         (no portal login)
```

| Client | Driver | Who signs into the school |
|--------|--------|---------------------------|
| iOS / Android (`packages/mobile`) | WebView | The parent’s phone |
| Chrome extension (`packages/browser-extension`) | Content script | The parent’s browser |
| [`scholaracle-scraper` CLI](https://github.com/YOLOVibeCode/scholaracle_scrapers) | Playwright | The parent’s machine |

Shared extract/transform/validate logic: `@scholaracle/scraper-core`.

## Who signs in

| Role | Surface | Who creates the account |
|------|---------|-------------------------|
| Parent | `/dashboard` | Self-serve register, or demo seed |
| Student | `/studio` | Parent only (Settings → Student logins). No student self-signup. |

Default student visibility is **tasks only** (`showGrades` off). The same JWT works on web, iPad Safari, and the mobile app.

**iPad without typing a password:** on a laptop/phone, parent Settings → Student logins → **iPad sign-in**. Scan the QR with the iPad camera. Safari opens `/login?magic=…`, consumes a 15-minute one-time ticket (`POST /api/auth/student-magic`), and lands in `/studio`. Re-issuing a QR invalidates the previous unused code.

## Project structure

PNPM workspace. Ports are **fixed**: 2800 web, 2801 API, 2802 MongoDB. See [PORT_POLICY.md](./PORT_POLICY.md).

```
packages/
  interfaces/          Shared TypeScript interfaces
  contracts/           Data models
  auth/                JWT auth
  database/            MongoDB repositories
  agents/              Alert copy + notification generators
  logger/              Structured logging
  scraper-core/        Recipes, transformers, envelope validation
  scraper-playwright/  Playwright page driver (CLI)
  studio-core/         Student Today + work pack + guidance ladder (no Express/React)
  connector/           Legacy local-connector helpers (not the live scrape path)
  api/                 Express ingest + product API
  workers/             Notifications, digests, sync-staleness mail
  web/                 Next.js parent dashboard + student studio (scholarmancy.com)
  mobile/              Expo app (iOS + Android, com.scholarmancy.app)
  browser-extension/   Chrome/Edge extension
  e2e/                 Playwright E2E
```

## Getting started

```bash
git clone https://github.com/YOLOVibeCode/scholaracle.git
cd scholaracle
pnpm install
pnpm build
pnpm test
```

```bash
pnpm --filter @scholaracle/web dev     # http://localhost:2800
pnpm --filter @scholaracle/api dev     # http://localhost:2801
curl -s -X POST http://localhost:2801/api/seed/demo
```

### Demo logins

Password for all three: `DemoPass123!`

| Actor | Email | After login |
|-------|--------|-------------|
| Parent | `demo@scholarmancy.com` | `/dashboard` |
| Emma | `emma.demo@scholarmancy.com` | `/studio` |
| Liam | `liam.demo@scholarmancy.com` | `/studio` |

Parent Settings → Student logins also has **iPad sign-in** (QR) for Emma and Liam.

## Deployment

- **API, workers, web:** Railway. Push to `main` deploys **dev** immediately; **production** waits on CI. Details: [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) and [CLAUDE.md](./CLAUDE.md).
- **Mobile:** EAS. JS-only → `pnpm update:production`. Native → `pnpm ship:production` (or `:ios` / `:android`). See [CLAUDE.md](./CLAUDE.md).
- **Production:** https://scholarmancy.com · https://api.scholarmancy.com
- **UAT:** https://api-uat.scholarmancy.com (preview / Play internal)

## Documentation

- [CLAUDE.md](./CLAUDE.md) — operating rules and how to ship
- [PORT_POLICY.md](./PORT_POLICY.md) — fixed local ports
- [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) — backend/web deploy
- [docs/CLIENT_PIPELINE_SPEC.md](./docs/CLIENT_PIPELINE_SPEC.md) — client scrape pipeline
- [docs/CLIENT_SCRAPER_SPEC.md](./docs/CLIENT_SCRAPER_SPEC.md) — extraction quality rules

## License

MIT — see [LICENSE](./LICENSE).
