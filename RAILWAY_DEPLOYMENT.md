# Railway Deployment - Scholaracle

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
- **API:** `RAILWAY_DOCKERFILE_PATH`, `PORT`, `CORS_ORIGINS`, `MONGO_URL` (from MongoDB plugin)
- **Web:** `RAILWAY_DOCKERFILE_PATH`, `PORT`, `NEXT_PUBLIC_API_URL`, `MONGO_URL`
- **Workers:** `RAILWAY_DOCKERFILE_PATH`, `MONGO_URL` (from MongoDB plugin)

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
