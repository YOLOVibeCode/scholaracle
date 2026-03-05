# Production Readiness — What’s Left

**Last updated:** 2026-03-02  
**Purpose:** Single checklist of what remains before production. Use with [FULL_STATE_AUDIT.md](./FULL_STATE_AUDIT.md) and [grade-history-trends-production-checklist.md](./grade-history-trends-production-checklist.md).

---

## Build & tests (current status)

| Project | Build | Tests | Notes |
|--------|--------|--------|--------|
| **scholaracle** (monorepo) | ✅ Passes | Run `pnpm test` | Fixed: admin customer `passwordConfirm` prop, forgot-password Suspense, AuditAction types |
| **scholaracle_scrapers** | ✅ Passes | ✅ 190 tests pass | — |

---

## Code TODOs / gaps

### Scholaracle (API & app)

| Item | Location | Priority | Notes |
|------|----------|----------|--------|
| **Push notifications** | `packages/agents` (PushDelivery) | Out of scope | Push is not implemented. `PushDelivery` is a no-op stub; UI disables the push toggle (settings) and does not offer push in admin channel filter. Use Email/SMS. Implement FCM/APNs when needed. |
| **Flaky integration test** | `packages/agents/.../NotificationFlow.integration.test.ts` ~L336 | Low | Comment: worker completes but `mockEmailTransport.send` not called; fix delivery path or timing if running in CI. |
| **CORS in production** | `packages/api/src/server.ts` ~L241 | Config | Set `CORS_ORIGINS` in production to allowed front-end origins (no wildcard). |
| **JWT in production** | `packages/api/src/server.ts`, `packages/auth` | Config | `JWT_SECRET` required in production; server throws if missing. Auth fallback default must not be used in prod. |

### Scholaracle Scrapers

| Item | Location | Priority | Notes |
|------|----------|----------|--------|
| **OS-level scheduling** | `src/cli/schedule.ts` ~L107 | Medium | Schedules saved to config; launchd/cron/schtasks not installed by CLI. Users can use external cron. |
| **Template placeholders** | `src/scrapers/_template/template-scraper.ts` | N/A | TODOs are intentional for new scraper authors. |

---

## Security & config (production)

- [ ] **JWT_SECRET** set in production (no default).
- [ ] **CORS_ORIGINS** set to real front-end origin(s).
- [ ] **Seeding** disabled in production (already gated in `packages/api/src/routes/seed/seed.ts`).
- [ ] **Square** environment: use `production` when going live (not `sandbox`).
- [ ] **Asset store**: production S3 (or intended backend) configured; see `packages/api/docs/ASSET_STORAGE.md`.
- [ ] **Email**: SendGrid (or SMTP) configured for production; see `docs/full-ux-e2e-with-mailpit.md`.

---

## Feature completeness

- **Invite flow:** Parent invite API sends invite email via `sendInviteEmail` when configured (POST `/:id/parents/invite` and POST `/:id/contacts`). Ensure SendGrid (or configured transport) and `BASE_URL` are set in production.
- **Scraper flow:** API generate/download/validate and scrapers library are production-ready per [scraper-flow-readiness.md](./scraper-flow-readiness.md). Manual checklist there for single/bundle/all-students paths.
- **Grade history / Trends:** Use [grade-history-trends-production-checklist.md](./grade-history-trends-production-checklist.md) before enabling in production.
- **E2E:** FULL_STATE_AUDIT §5–§6 and scraper-flow-readiness describe coverage and optional gaps (e.g. full user-path E2E for scraper wizard).

---

## Deploy

- **Railway:** CI deploys on push to `main` (API, Workers, Web). See grade-history checklist for verify steps.
- **Health:** `curl https://api.scholarmancy.com/api/health` (or your API URL) after deploy.
- **Rollback:** Railway dashboard → previous deployment → Redeploy; or revert and push.

---

## Quick “ready to ship” checklist

1. [ ] Scholaracle: `pnpm build` and `pnpm test` pass.
2. [ ] Scrapers: `npm run build` and `npm test` pass.
3. [ ] Production env: `JWT_SECRET`, `CORS_ORIGINS`, Square env, email transport, asset store.
4. [ ] Invite email: ensure SendGrid (or configured transport) and `BASE_URL` are set so parent invite emails are sent.
5. [ ] Optional: run scraper-flow-readiness manual checklist (single/bundle/all-students).
6. [ ] Optional: run grade-history-trends-production-checklist if shipping Trends.
