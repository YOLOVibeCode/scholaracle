# Railway Deployment - Scholaracle

This doc describes the **Railway deployment package** (what’s in the repo and what to configure) and **base CORS rules**, so you can deploy the app correctly.

**Rules:** Project rules in [.cursor/rules/railway-deployment.mdc](.cursor/rules/railway-deployment.mdc) dictate how we deploy. When changing Dockerfiles, the deploy workflow, CORS, or env, follow that rule and keep this doc in sync.

---

## Deployment package (what’s in the repo)

| Item | Purpose |
|------|--------|
| **`railway.json`** | Root config: `build.builder: "DOCKERFILE"`, `deploy.healthcheckPath: "/api/health"`, restart policy. Applied when no service-specific override exists. |
| **`Dockerfile.api`** | API service: Node 20, pnpm, `pnpm --filter @scholaracle/api... build`, `node packages/api/dist/server.js`. Exposes 3002 (use `PORT` in Railway). |
| **`Dockerfile.web`** | Web service: Next.js build with `ARG NEXT_PUBLIC_API_URL` (set in Railway as build variable). Exposes 3000. |
| **`Dockerfile.workers`** | Workers service: `node packages/workers/dist/worker.js`. No HTTP port. |
| **`.github/workflows/deploy.yml`** | On push to `main` (and `workflow_dispatch`): runs CI, then `railway up --service api`, `railway up --service workers`, `railway up --service web` (with `RAILWAY_TOKEN` secret). |

**Per-service in Railway dashboard:** Each service (api, web, workers) must have **`RAILWAY_DOCKERFILE_PATH`** set so Railway uses the correct Dockerfile:

- **api:** `Dockerfile.api`
- **web:** `Dockerfile.web`
- **workers:** `Dockerfile.workers`

Without this, Railway may use a single default Dockerfile and build the wrong app.

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
- **Web:** `RAILWAY_DOCKERFILE_PATH` = `Dockerfile.web`, `PORT`, **`NEXT_PUBLIC_API_URL`** (e.g. `https://api.scholarmancy.com/api` — baked at build time), `MONGO_URL` if needed.
- **Workers:** `RAILWAY_DOCKERFILE_PATH` = `Dockerfile.workers`, `MONGO_URL` (from MongoDB plugin)

## Redeploy

```bash
cd scholaracle
railway link  # if not already linked
railway up --service api     # deploy API
railway up --service web     # deploy Web
railway up --service workers # deploy Workers
```

## GitHub Auto-Deploy

All services are connected to [YOLOVibeCode/scholaracle](https://github.com/YOLOVibeCode/scholaracle). Pushes to `main` trigger redeploys.

## Health Check

```bash
curl https://api.scholarmancy.com/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

---

## How to deploy

1. **One-time:** In Railway, for each service set `RAILWAY_DOCKERFILE_PATH` to the correct Dockerfile. Set API `CORS_ORIGINS` and Web `NEXT_PUBLIC_API_URL` as above. Add `RAILWAY_TOKEN` to GitHub Actions secrets.
2. **Auto:** Push to `main` → CI runs → Deploy workflow runs → `railway up --service api`, `--service workers`, `--service web`.
3. **Manual:** From repo root: `railway link` then `railway up --service api` (or `web` / `workers`).
4. **Verify:** `curl https://api.scholarmancy.com/api/health` returns 200.

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
| **Secrets** | `JWT_SECRET` set (API/Web); `RAILWAY_TOKEN` in GitHub Actions secrets; MongoDB connected (e.g. `MONGO_URL` / plugin) |
| **Deploy rule** | Changes to Dockerfiles, deploy workflow, or CORS follow [.cursor/rules/railway-deployment.mdc](.cursor/rules/railway-deployment.mdc) and keep this doc updated |
