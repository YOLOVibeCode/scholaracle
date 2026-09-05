# AGENTS.md

Onboarding for agents working in this repository unattended (Cursor cloud
agents fired from Slack `#scholarmancy-fixbot`, `npm run pipeline`, etc.).
Read this before touching code. `CLAUDE.md` holds the human-facing operating
rules and ship procedures; this file is the subset an agent can act on in a
fresh clone with no human watching.

## What this project is

Scholaracle is the codebase behind **Scholarmancy** (scholarmancy.com), an
academic-success assistant for parents and students. Parents connect Canvas,
Skyward, or Aeries **from their own device** (mobile app, Chrome extension, or
the `scholaracle-scraper` CLI); the client extracts and transforms portal data
into an envelope and posts it to the ingest API. Students use the `/studio`
surface. "Working" means: ingest accepts a valid envelope, the parent dashboard
and student studio render the resulting courses/assignments/grades, and alerts
go out on schedule.

Product boundary that is not negotiable: **Scholarmancy servers never log into
school portals and never store portal credentials.** Do not add server-side
portal login, password storage, or a server-side scraper path.

## Layout

PNPM workspace, TypeScript strict everywhere. Node 20+, `pnpm@9.15.0` via
`packageManager` in the root `package.json` (never pin pnpm anywhere else).

```
packages/
  interfaces/          Shared TypeScript interfaces
  contracts/           Data models + envelope schema (build this first)
  auth/                JWT auth
  database/            MongoDB repositories
  agents/              Alert copy + notification generators
  logger/              Structured logging (use this, never console.log)
  scraper-core/        Recipes, transformers, envelope validation
  scraper-playwright/  Playwright page driver (CLI side)
  studio-core/         Student Today + work pack + guidance ladder (pure TS)
  connector/           Legacy local-connector helpers (not the live scrape path)
  api/                 Express 4 ingest + product API (port 2801)
  workers/             Notifications, digests, sync-staleness mail
  web/                 Next.js 16 parent dashboard + student studio (port 2800)
  mobile/              Expo SDK 57 / RN 0.86 app (com.scholarmancy.app)
  browser-extension/   Chrome/Edge extension
  e2e/                 Playwright E2E (needs a running stack; see below)
docs/                  Design notes and runbooks. APP_SPECIFICATION.md is the spec.
scripts/               Repo maintenance scripts, incl. scripts/block-secrets.sh
```

Ports are fixed and never change: 2800 web, 2801 API, 2802 MongoDB, 2803/2804
MailHog. See `PORT_POLICY.md`.

A sibling repo, `YOLOVibeCode/scholaracle_scrapers`, is cloned by CI for the
Build and Docker jobs only. It is **not** required to install, type-check, or
run unit tests here. Do not clone it into this working tree and do not edit it
from this repo.

## Commands

Everything below works in a fresh clone on a stock Ubuntu VM with network
access. Run from the repo root unless stated otherwise.

| Purpose | Command | Notes |
| --- | --- | --- |
| Install | `corepack enable && pnpm install --frozen-lockfile` | Never `pnpm install` without `--frozen-lockfile`; never hand-edit `pnpm-lock.yaml`. |
| Build contracts | `pnpm --filter @scholaracle/contracts build` | Required before type-checking or testing most packages; they import built types. |
| Build all | `pnpm build` | Needed before `pnpm type-check` (CI runs type-check after build). Includes a Next.js build; several minutes. |
| Typecheck | `pnpm type-check` | Runs `tsc --noEmit` in every package. Must pass. |
| Lint | `pnpm lint:strict` | Warnings fail CI. `pnpm lint:fix` auto-fixes. |
| Format | `pnpm format:check` | `pnpm format` to fix. Prettier is the source of truth. |
| Test one package | `pnpm --filter @scholaracle/<pkg> test` | Preferred. `<pkg>` is the directory name under `packages/`. |
| Test with coverage | `pnpm --filter @scholaracle/<pkg> test:coverage` | What CI runs. Coverage thresholds in `jest.config.*` must not go down. |
| Test everything | `pnpm test` | Runs every package including mobile. Slow; use only when a change spans packages. |

Notes for a fresh environment:

- `api`, `database`, `workers`, `agents`, `auth` tests use `mongodb-memory-server`,
  which downloads a MongoDB binary on first run (network, ~30 s). No local
  MongoDB is needed.
- `mobile` test and type-check run `ensure-dev-seed` automatically to generate
  `companionDevSeed.generated.ts`. Never commit that file.
- `e2e` (`packages/e2e`) needs the web, API, and MongoDB running on the fixed
  ports plus Mailpit. It cannot run in a fresh clone; do not attempt it. Its
  `pnpm test` is a no-op echo on purpose. E2E runs in CI after merge.
- `scraper-playwright` has no unit tests; Playwright browsers are not needed
  for anything else. Do not install them.
- No `.env` file is required for unit tests or type-check. Do not create one.

## Conventions

These are enforced by ESLint, tests, and reviewers. The full list is in
`.cursorrules`; these are the ones that block a PR.

- TypeScript strict. No `any`; use `unknown` or generics. No `@ts-ignore`.
- Errors are thrown, never returned as `null`. Express handlers that are
  `async` use `asyncHandler` from `packages/api/src/middleware/asyncHandler.ts`.
- No `console.log` in `packages/*/src`. Use `@scholaracle/logger`.
- New data shapes go in `@scholaracle/contracts` first, then consumers.
- New API endpoints live in `packages/api/src/routes/` and are registered
  where the neighbouring routes are.
- Every bug fix or feature starts with a failing test (TDD). Tests live next to
  or mirror the code they cover, following the existing pattern in that package.
- UI must be Playwright-friendly: stable `data-testid` on interactive elements,
  no flows that only work with a mouse.
- Functions under 50 lines, cyclomatic complexity under 10, nesting depth under
  3. If a change needs more, split into helpers.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`),
  imperative mood, one concern per commit. Husky runs `scripts/block-secrets.sh`
  and `lint-staged` on commit; never bypass them.

## Hard invariants

Each of these broke production or CI when violated. Treat them as tests that
already exist.

- **Mobile: the URL API is banned.** React Native's polyfill is http(s)-only and
  never throws. Use `packages/mobile/src/utils/urlNormalize.ts` string helpers.
- **Never cache signed asset URLs or materials responses** (24 h TTL). Fetch per
  mount.
- **API: sign asset URLs via `resolveApiBaseUrl()`** (`attachmentSigning.ts`),
  never `config.baseUrl` (that is the *web* origin).
- **Mobile unit tests must never hit the network.** The `apiClient` singleton
  defaults to the production API when `EXPO_PUBLIC_API_URL` is unset; mock
  `fetch` or the client method.
- **Coverage thresholds in `packages/mobile/jest.config.js` never go down.**
- **New workspace packages** must be added to the `COPY packages/<name>/package.json`
  lists in `Dockerfile.api` **and** `Dockerfile.workers`, or Railway builds fail.
  (Adding a package is a human-reviewed change; see Never.)
- `companionDevSeed.generated.ts` is generated. Never commit it, never import it
  without the ensure-script path.
- Grades course ids are merged 12-char hashes; action-board ids are raw.
  **Never join grades↔action-board on `courseExternalId`**; only
  `assignmentExternalId` is raw in both.

## Never

Enforced by `.cursor/hooks/guard-shell.mjs` where a shell command is involved;
the rest is on you.

- Never push to `main` (or `master`/`develop`). Push a feature branch and open a PR.
- Never `git push --force`, `git reset --hard`, or `--no-verify`.
- Never edit `.github/workflows/`, `Dockerfile.*`, `railway.json`,
  `railway.toml`, or anything under `.eas/` / `eas.json` unless the brief
  explicitly asks for that file by name.
- Never run `eas build|submit|update`, `pnpm ship:*`, `pnpm build:ios|android*`,
  `pnpm submit:*`, `pnpm update:preview|production`, `railway ...`, or
  `gh workflow run`. Those are human-only and cost real money or deploy to real
  users.
- Never lower a coverage threshold, delete a test, or mark a test `skip` to get
  green. Fix the code or report why it cannot be fixed.
- Never add a runtime dependency without stating why in the PR description.
- Never commit `.env*` (except `.env.example`), credentials, `.p8`/`.p12`/`.pem`
  files, or generated artifacts.
- Never change `packageManager`, the fixed ports, or the package names.
- Never add server-side portal login or credential storage (see product boundary).

## How changes land

`main` is protected by required checks (Quality Gate, Build, and per-package
Test jobs) but **not** by required reviews. `.github/workflows/auto-merge.yml`
enables squash auto-merge on non-fork PRs that touch only application code,
tests, and docs. In practice:

```
feature branch → PR → CI green → auto-merge to main → dev auto-deploys
  → deploy.yml verifies dev + runs E2E → production deploys (Railway check-suite gate)
  → OTA update to the TestFlight preview channel (free; no EAS build)
```

**A green PR is a production deploy.** Write every PR as if it ships within the
hour, because it does. Keep diffs minimal and keep the PR description honest
about what was and was not verified.

Two mechanics worth knowing: Cloud Agents open PRs as **drafts**, and the gate
ignores drafts; the Slack bot marks the PR ready for review only after its
verifier reports done, so a failed verify never becomes merge-eligible. And
auto-merge is armed with the `AUTOMERGE_TOKEN` repo secret (a user token), not
the workflow's `GITHUB_TOKEN` — a merge by github-actions[bot] would start no
workflows on `main`, and production would deploy without the dev + E2E run.
If that secret is missing, the gate refuses to arm and comments on the PR.

**The gate.** EAS *builds* burn build credits and are human-only. So a PR does
**not** auto-merge — it gets the `needs-human` label and waits for a person —
when its title starts with `[needs-human]` or it touches any of:

- `.github/workflows/**`
- `packages/mobile/.eas/**`, `packages/mobile/eas.json`, `packages/mobile/app.json`,
  `packages/mobile/app.config.*`, `packages/mobile/plugins/**`,
  `packages/mobile/ios/**`, `packages/mobile/android/**` (native fingerprint →
  forces a new TestFlight binary)
- `packages/mobile/package.json`, root `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml` (dependency changes)
- `Dockerfile.*`, `railway.json`, `railway.toml`
- `AGENTS.md`, `.cursor/**` (the guardrails themselves)

If your change genuinely needs one of those files, make it, say why in the PR
body, and expect a human to merge. Do not work around the gate by moving the
change elsewhere. If you are not confident a change is safe to ship, prefix
the title with `[needs-human]`.

## Definition of done for any change

1. `pnpm --filter @scholaracle/contracts build` then `pnpm type-check` passes.
2. `pnpm lint:strict` and `pnpm format:check` pass.
3. `pnpm --filter @scholaracle/<pkg> test` passes for every package you touched,
   and a new or changed test demonstrates the behaviour.
4. `git status` is clean; every commit has a Conventional Commit message.
5. The PR description lists what changed, what was verified (with the commands
   and their results), and what was deliberately left out.
