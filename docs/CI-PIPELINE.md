# CI/CD Pipeline

## Overview

```
 PR opened             Merge to main             After E2E green
   │                      │                         │
   ▼                      ▼                         ▼
┌────────┐           ┌──────────┐              ┌──────────┐
│  CI    │           │   CI     │              │  Deploy  │
│  +     │──merge──▶ │ + Deploy │──E2E green──▶│   prod   │
│  E2E   │           │   dev    │              │          │
└────────┘           └──────────┘              └──────────┘
   on PR            on push to main           automatic
```

Three gates, each one meaningful. Prod **never ships** without dev E2E green.

## Environments

| Env | MongoDB | Secrets | Purpose | URL |
|-----|---------|---------|---------|-----|
| dev | `scholaracle_dev` DB (shared MongoDB service, logically isolated) | Separate JWT, encryption, webhook secrets; prod SendGrid/Twilio keys | Automated target for `main` pushes; E2E runs here | [web-dev-8552.up.railway.app](https://web-dev-8552.up.railway.app) |
| production | `scholaracle` DB | Production secrets | Live user traffic | [scholarmancy.com](https://scholarmancy.com) |

**Important:** dev and prod share a physical MongoDB instance but use different database names for logical isolation. Seed data in dev uses `@example.com` emails only — if you put real emails in dev data, they will receive real email via the production SendGrid key.

## Workflows

| File | Trigger | What it does |
|------|---------|--------------|
| [ci.yml](.github/workflows/ci.yml) | PR to main/develop, workflow_call | Lint (strict), build, unit tests (8 matrix), docker build |
| [e2e.yml](.github/workflows/e2e.yml) | PR, workflow_call, manual | Playwright E2E. Localhost mode on PR; deployed mode when called from deploy.yml |
| [deploy.yml](.github/workflows/deploy.yml) | Push to main, manual | CI → deploy dev → wait healthy → E2E vs dev → deploy prod |
| [auto-merge.yml](.github/workflows/auto-merge.yml) | PR opened/synced by owner | Enables GitHub auto-merge (squash) so PR lands when checks pass |

## Test / lint philosophy

**Hook-level (pre-commit):** loose. Only hard errors block. Auto-fixes what it can (prettier, eslint --fix). Warnings don't block.

**CI-level:** strict. `pnpm lint:strict` runs `--max-warnings=0`. Warnings are fixed before merge, not after.

This means:
- Commit freely during iteration; don't fight the hook.
- CI catches everything the hook let through.
- Never `--no-verify`. If the hook fails, there's a real error.

### Rules we don't enforce
- `complexity` — cyclomatic complexity is a weak proxy; creates pressure to artificially split functions.
- `max-lines-per-function` — same reason. Big functions are sometimes right.
- `max-depth` — warn-level only (contextual; data-walking code legitimately nests).

### Rules we always enforce
- `no-explicit-any` — type safety.
- `prefer-const`, `no-var` — immutability default.
- `quotes` (single), `prefer-template` — consistency.
- Prettier formatting.
- `no-unused-vars` (with `_` prefix escape).
- Naming conventions (interfaces prefix-I, classes PascalCase, variables camelCase/UPPER_CASE/PascalCase).

## Branch protection

`main` requires:
- All 10 required status checks (Quality Gate, Build, Test matrix ×8).
- Linear history (no merge commits; squash-merge only).
- Up-to-date branch before merge (`strict: true`).

**No review requirement** — by design. Auto-merge handles merging when checks pass.

## Auto-merge behaviour

Any PR opened by the repo owner has auto-merge (squash) enabled automatically. When all required checks pass, GitHub merges the PR. On merge:
1. Main deploy pipeline fires (deploy.yml).
2. Dev gets the change.
3. E2E runs against dev.
4. Prod deploys if E2E green.

## Break-glass procedures

### Skip E2E gate for emergency prod deploy
```bash
gh workflow run deploy.yml -f skip_e2e=true
```
Only use if E2E is broken for reasons unrelated to the change being shipped.

### Deploy manually via Railway CLI
```bash
railway up --service api --environment production --detach
railway up --service workers --environment production --detach
railway up --service web --environment production --detach
```
Use when the full pipeline is down.

### Bypass pre-commit hook
```bash
HUSKY=0 git commit ...
```
Don't make it a habit. The hook is there to save you from yourself.

## Local development

```bash
# Install + build once
pnpm install
pnpm build

# Run the stack locally (Mailpit for emails, Mongo, API, workers, Web)
docker-compose up -d

# Run unit tests for a single package
pnpm --filter @scholaracle/agents test

# Run lint (loose)
pnpm lint

# Run lint the way CI runs it
pnpm lint:strict

# Run E2E locally (spins up its own services)
pnpm --filter @scholaracle/e2e test:e2e
```

## Common failures and fixes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| CI lint red on PR | Pre-commit hook missed a warning | Run `pnpm lint:strict` locally; fix warnings |
| E2E vs dev times out | Dev deploy still starting | Check `wait-for-dev` logs; may need to increase health-poll retries |
| Prod deploy skipped | E2E failed on dev | Check e2e-dev job logs; fix the bug; repush |
| `railway up` fails with "Unauthorized" | `RAILWAY_TOKEN` expired or missing in secrets | Regenerate in Railway UI, update GitHub repo secret |
| Connector tests OOM locally | Not a CI issue; parallel jest resource bloat | Run `pnpm --filter @scholaracle/connector test` in isolation, or `NODE_OPTIONS='--max-old-space-size=4096'` |
