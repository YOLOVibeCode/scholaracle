# Railway Deployment - Scholaracle

This doc describes the **Railway deployment package** (what’s in the repo and what to configure) and **base CORS rules**, so you can deploy the app correctly.

**Rules:** Project rules in [.cursor/rules/railway-deployment.mdc](.cursor/rules/railway-deployment.mdc) dictate how we deploy. When changing Dockerfiles, the deploy workflow, CORS, or env, follow that rule and keep this doc in sync.

---

## Deployment package (what’s in the repo)

| Item | Purpose |
|------|--------|
| **`Dockerfile.api`** | API service: Node 20, pnpm, `pnpm --filter @scholaracle/api... build`, `node packages/api/dist/server.js`. Exposes 3002 (use `PORT` in Railway). |
| **`Dockerfile.web`** | Web service: Next.js build with `ARG NEXT_PUBLIC_API_URL` (set in Railway as build variable). Exposes 3000. |
| **`Dockerfile.workers`** | Workers service. Its only HTTP surface is `GET /api/health`, which exists for Railway's health check. |
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
| **Workers** | (Background - no HTTP port)      | —                                           |
| **MongoDB** | (Private network only)           | —                                           |

### DNS Records (Porkbun)

| Record              | Type  | Target                            |
|---------------------|-------|-----------------------------------|
| `scholarmancy.com`  | ALIAS | `5h5mfrsw.up.railway.app`        |
| `www`               | CNAME | `xa10rpu9.up.railway.app`        |
| `api`               | CNAME | `y36ig3qs.up.railway.app`        |

## Environment Variables (Configured)

- **Shared:** `NODE_ENV`, `JWT_SECRET`, `MONGODB_DB_NAME`
- **API:** `RAILWAY_DOCKERFILE_PATH` = `Dockerfile.api`, `PORT` (Railway sets automatically), **`CORS_ORIGINS`** (e.g. `https://scholarmancy.com,https://www.scholarmancy.com`), `MONGO_URL` (from MongoDB plugin). Optional: `BASE_URL` / `WEB_URL` for password reset links.
- **API, optional, production only:** `DEMO_ACCOUNT_PASSWORD` (12+ characters, from the vault). When set, a sign-in as the demo parent with exactly this password first restores the demo household (account, students, sample data) and moves every demo login to this password. This is the sign-in given to App Store and Google Play reviewers; it keeps working after a reviewer deletes the account. Unset = no effect. See `packages/api/src/services/demo-account/demoSignInRepair.ts`.
- **Web:** `RAILWAY_DOCKERFILE_PATH` = `Dockerfile.web`, `PORT`, **`NEXT_PUBLIC_API_URL`** (e.g. `https://api.scholarmancy.com/api` — baked at build time), `MONGO_URL` if needed.
- **Workers:** `RAILWAY_DOCKERFILE_PATH` = `Dockerfile.workers`, `MONGO_URL` (from MongoDB plugin)
- **API, for Sign in with Apple token revocation at account deletion (App Review 5.1.1(v)):** `APPLE_TEAM_ID`, `APPLE_SIGN_IN_KEY_ID`, `APPLE_SIGN_IN_PRIVATE_KEY` (contents of the `.p8` of a key with "Sign in with Apple" enabled for `com.scholarmancy.app`; from the vault). Until all three are set, deletion works and logs that no Apple token was revoked. See `packages/api/src/services/apple/appleTokenRevocation.ts`.

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
| **Railway env (Workers)** | Dashboard → workers service: `RAILWAY_DOCKERFILE_PATH` = `Dockerfile.workers` |
| **Health check and restart rule** | The `railway environment config` command above shows `/api/health`, `30`, and `3` for api, web, and workers, in production and in dev |
| **Secrets** | `JWT_SECRET` set (API/Web); MongoDB connected (e.g. `MONGO_URL` / plugin) |
| **Deploy rule** | Changes to Dockerfiles, deploy workflow, or CORS follow [.cursor/rules/railway-deployment.mdc](.cursor/rules/railway-deployment.mdc) and keep this doc updated |
