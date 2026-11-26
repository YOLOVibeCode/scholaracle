# Railway Deployment - Scholaracle

This doc describes the **Railway deployment package** (what’s in the repo and what to configure) and **base CORS rules**, so you can deploy the app correctly.

**Rules:** Project rules in [.cursor/rules/railway-deployment.mdc](.cursor/rules/railway-deployment.mdc) dictate how we deploy. When changing Dockerfiles, the deploy workflow, CORS, or env, follow that rule and keep this doc in sync.

---

## Deployment package (what’s in the repo)

| Item | Purpose |
|------|--------|
| **`Dockerfile.api`** | API service: Node 20, pnpm, `pnpm --filter @scholaracle/api... build`, `node packages/api/dist/server.js`. Exposes 3002 (use `PORT` in Railway). |
| **`Dockerfile.web`** | Web service: Next.js build with `ARG NEXT_PUBLIC_API_URL` (set in Railway as build variable). Exposes 3000. |
| **`Dockerfile.workers`** | Workers service: runs the compiled worker, `node packages/workers/dist/worker.js`. Its only HTTP surface is `GET /api/health`, which exists for Railway's health check. |
| **`.github/workflows/deploy.yml`** | On push to `main` (and `workflow_dispatch`): runs CI, waits until dev serves this commit, then runs E2E against dev. It never deploys. Railway's GitHub integration deploys dev on every push and releases production only when every check on the commit is green ("Wait for CI"). |

There is no `railway.json`. Railway stops reading Config as Code files on 2026-12-01, so the two things that file held now live in each service's own settings (next section).

**Per-service in Railway dashboard:** Each service (api, web, workers) must have **`RAILWAY_DOCKERFILE_PATH`** set so Railway uses the correct Dockerfile:

- **api:** `Dockerfile.api`
- **web:** `Dockerfile.web`
- **workers:** `Dockerfile.workers`

Without this, Railway may use a single default Dockerfile and build the wrong app.

---

## Health check and restart rule (service settings)

These are set on **api**, **web**, and **workers**, in **production** and in **dev**. They are Railway service settings (dashboard: service → Settings → Deploy), not a file in this repo.

| Setting | Value | What it does |
|---------|-------|--------------|
| Healthcheck Path | `/api/health` | Railway sends traffic to a new deployment only after this path answers 200. A release that fails to start never replaces the running one. |
| Healthcheck Timeout | `30` seconds | How long a new deployment has to answer. |
| Restart Policy | On failure, 3 retries | A crashed container is restarted up to three times. |

A new service or a new environment does not inherit these. Set all three by hand when you create one.

Check what Railway has stored (prints the three settings only, no variables):

```bash
for env in production dev; do
  railway environment config -e "$env" --json \
    | jq -c '.services[] | select(.source.repo) | .deploy | {healthcheckPath, healthcheckTimeout, restartPolicyMaxRetries}'
done
```

It prints one line per service, three per environment. Every line must show `/api/health`, `30`, and `3`.

---

## Base CORS rules

The API allows requests only from origins listed in **`CORS_ORIGINS`**.

- **Code:** `packages/api/src/server.ts` uses the `cors` middleware with `origin: allowedOrigins`, `credentials: true`.
- **Config:** `allowedOrigins` = `process.env.CORS_ORIGINS?.split(',')` or default `['http://localhost:2800', 'http://localhost:3000']`.
- **Production:** Set **`CORS_ORIGINS`** on the **API** service in Railway to your public web origins (comma-separated, no trailing spaces). Example:

```bash
# Production (API service in Railway)
CORS_ORIGINS=https://scholarmancy.com,https://www.scholarmancy.com
```

Add any other allowed origins (e.g. staging or preview URLs) as needed. The browser sends the request origin; if it’s not in this list, CORS will block the response.

**Local:** `.env` / `.env.example` use `CORS_ORIGINS=http://localhost:2800,http://localhost:3000` for dev.

---

## Custom Domains

| Service     | Custom Domain                    | Railway Domain                              |
|-------------|----------------------------------|---------------------------------------------|
| **Web**     | https://scholarmancy.com         | https://web-production-f8991.up.railway.app |
| **Web**     | https://www.scholarmancy.com     | (same service)                              |
| **API**     | https://api.scholarmancy.com     | https://api-production-244c.up.railway.app  |
| **Workers** | None                             | https://workers-production-716d.up.railway.app (answers `GET /api/health` only) |
| **MongoDB** | (Private network only)           | No TCP proxy, so the database cannot be reached from outside the project. |

### DNS Records (Porkbun)

| Record              | Type  | Target                            |
|---------------------|-------|-----------------------------------|
| `scholarmancy.com`  | ALIAS | `5h5mfrsw.up.railway.app`        |
| `www`               | CNAME | `xa10rpu9.up.railway.app`        |
| `api`               | CNAME | `y36ig3qs.up.railway.app`        |

## Environment Variables

Variables are set per service and per environment. A variable on the API is not on the workers. When the code does not find one it usually falls back without an error, so a missing variable shows up as a product that does less, not as a crash. Checked against Railway on 26 Nov 2026.

### Required

| Variable | API | Workers | Web | What it is for |
|----------|-----|---------|-----|----------------|
| `RAILWAY_DOCKERFILE_PATH` | `Dockerfile.api` | `Dockerfile.workers` | `Dockerfile.web` | Which image Railway builds. |
| `NODE_ENV` | yes | yes | — | `production` on production. |
| `JWT_SECRET` | yes | — | — | Signs and checks sign-in tokens. The API refuses to start in production without it. |
| `MONGODB_URI`, `MONGODB_DB_NAME` | yes | yes | — | The database. The code also accepts `MONGO_URL`. |
| `CORS_ORIGINS` | yes | — | — | The web origins allowed to call the API (see "Base CORS rules"). |
| `BASE_URL` | yes | **yes** | — | The web origin, for example `https://scholarmancy.com`. Links in emails are built from it: password reset, sharing invites, alerts and invoices on the API; digests and alerts on the workers. Without it on the workers those emails carry no link to the dashboard. |
| `SENDGRID_API_KEY`, `SENDGRID_BASE_URL`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME` | yes | yes | — | Email. It goes through the Noctusoft relay: the key is the product's relay key, not a SendGrid key, and `SENDGRID_BASE_URL` is the relay's address. |
| `RELAY_API_KEY`, `RELAY_WEBHOOK_SECRET`, `RELAY_STORE_ALIAS`, `RELAY_STORE_MODE` | yes | — | — | Billing through the Noctusoft store. `RELAY_STORE_ALIAS=scholarmancy`; `RELAY_STORE_MODE=live` on production. |
| `CONNECTOR_JWT_SECRET` | yes | — | — | Signs device (connector) tokens. It must differ from `JWT_SECRET`, so a parent's session token cannot be used as a device token. |
| `LITELLM_API_KEY`, `LITELLM_BASE_URL` | yes | yes | — | Model calls, through the Noctusoft LLM relay (`LITELLM_BASE_URL` defaults to `https://ai.noctusoft.com`). Without the key, everything that uses a model is skipped. |
| `ASSET_STORE`, `ASSET_STORAGE_PATH` | yes | — | — | Where uploaded files live. `local` keeps them on the volume at `ASSET_STORAGE_PATH`. `relay` needs `NOCTUSOFT_RELAY_API_KEY`. See `packages/api/docs/ASSET_STORAGE.md`. |
| `NEXT_PUBLIC_API_URL` | — | — | yes | For example `https://api.scholarmancy.com/api`. Baked in at build time. |

`PORT` is set by Railway.

### Switches

Each of these is off when unset, except `STALENESS_ENABLED`, which is on when unset.

| Variable | Service | What it does |
|----------|---------|--------------|
| `NOCTUSOFT_API_KEY` | API and workers | Text messages. Without it no text is sent: the opt-in, alerts by text and the daily text digest all do nothing. The key is the product's relay key with the `sms` scope. |
| `RELAY_INBOUND_SECRET` | API | Accepts inbound texts and delivery reports forwarded by the relay. |
| `AGENDA_AI_ENABLED=true` | API | Agenda summaries written by a model, through the relay. |
| `WEEKLY_REVIEW_ENABLED=true` | Workers | The student weekly review, Sundays at 18:00 local time. On in dev only. |
| `APPLE_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID`, `APPLE_SIGN_IN_PRIVATE_KEY` | API | Revokes Sign in with Apple tokens when an account is deleted (App Review 5.1.1(v)). The private key is the contents of the `.p8` of a key with "Sign in with Apple" enabled for `com.scholarmancy.app`, from the vault. Until all three are set, deletion works and logs that no Apple token was revoked. See `packages/api/src/services/apple/appleTokenRevocation.ts`. |
| `DEMO_ACCOUNT_PASSWORD` | API, production only | 12 or more characters, from the vault. A sign-in as the demo parent with exactly this password first restores the demo household (account, students, sample data) and moves every demo login to this password. This is the sign-in given to App Store and Google Play reviewers; it keeps working after a reviewer deletes the account. See `packages/api/src/services/demo-account/demoSignInRepair.ts`. |
| `DEMO_ENABLED=true`, `SEED_TOKEN` | API, dev only | The seeded demo household and the seed routes. Never on production. |
| `STALENESS_ENABLED=false` | Workers | Turns the stale-sync email off. Default is on: one email per stale spell, 48 hours without a sync. |

Never set `NEXT_PUBLIC_SEED_TOKEN` on the production web service. Everything named `NEXT_PUBLIC_` is sent to browsers.

### See which variables a service has (names only)

```bash
railway variables --service workers --environment production --json | jq -r 'keys[]'
```

Keep the `jq` filter. Without it the command prints every value, secrets included.

## GitHub Auto-Deploy

All services are connected to [YOLOVibeCode/scholaracle](https://github.com/YOLOVibeCode/scholaracle). A push to `main` deploys dev at once. Production releases the same commit only after every check on it is green (CI, dev serving that commit, E2E against dev).

## Redeploy

To run the current commit again without a code change, use Redeploy on the service in the Railway dashboard. Do not use `railway up`: it uploads the local folder and skips every check above.

## Health Check

```bash
curl https://api.scholarmancy.com/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

---

## How to deploy

1. **One-time:** In Railway, for each service set `RAILWAY_DOCKERFILE_PATH` to the correct Dockerfile, and set the health check and restart rule from the section above. Set API `CORS_ORIGINS` and Web `NEXT_PUBLIC_API_URL` as above. Turn on "Wait for CI" on every production service.
2. **Deploy:** Merge to `main`. Railway deploys dev at once; the Deploy workflow checks dev and runs E2E; production releases when every check is green.
3. **Verify:** `curl https://api.scholarmancy.com/api/health/version` reports the commit that is live. `curl https://api.scholarmancy.com/api/health` returns 200.

---

## Production readiness checklist

Use this to confirm the app is ready for production and properly deployed.

| Check | How to verify |
|-------|----------------|
| **API up** | `curl https://api.scholarmancy.com/api/health` → 200, `{"status":"ok",...}` |
| **Web up** | Open https://scholarmancy.com (and https://www.scholarmancy.com) → loads, no CORS errors |
| **Railway env (API)** | Dashboard → api service: `RAILWAY_DOCKERFILE_PATH` = `Dockerfile.api`, `CORS_ORIGINS` = `https://scholarmancy.com,https://www.scholarmancy.com` |
| **Railway env (Web)** | Dashboard → web service: `RAILWAY_DOCKERFILE_PATH` = `Dockerfile.web`, `NEXT_PUBLIC_API_URL` = `https://api.scholarmancy.com/api` |
| **Railway env (Workers)** | Dashboard → workers service: `RAILWAY_DOCKERFILE_PATH` = `Dockerfile.workers`, `BASE_URL` = `https://scholarmancy.com` |
| **Health check and restart rule** | The `railway environment config` command above shows `/api/health`, `30`, and `3` for api, web, and workers, in production and in dev |
| **Secrets** | `JWT_SECRET` and `CONNECTOR_JWT_SECRET` set on the API, with different values; MongoDB connected (`MONGODB_URI`) |
| **Variables** | Every "Required" row in the table above is present on each service it names, in production and in dev |
| **Deploy rule** | Changes to Dockerfiles, deploy workflow, or CORS follow [.cursor/rules/railway-deployment.mdc](.cursor/rules/railway-deployment.mdc) and keep this doc updated |
