# Railway Deployment - Scholaracle

## Deployed Services

| Service   | URL                                           | Status   |
|-----------|-----------------------------------------------|----------|
| **Web**   | https://web-production-7c7641.up.railway.app  | Running  |
| **API**   | https://api-production-155e.up.railway.app    | Running  |
| **Workers** | (Background - no public URL)                | See note |
| **MongoDB** | (Private network only)                      | Running  |

## Workers Service - One Manual Step Required

The workers service is a background process with no HTTP server. The default health check (`/api/health`) will fail and block deployment.

**To fix:** In the [Railway Dashboard](https://railway.com/project/202aed45-fee6-4398-bc42-fdf259dc6bac):
1. Select the **workers** service
2. Go to **Settings** → **Deploy**
3. Clear the **Health Check Path** field (leave it empty)
4. Save; the workers will redeploy successfully

## Environment Variables (Configured)

- **Shared:** `NODE_ENV`, `JWT_SECRET`, `MONGODB_DB_NAME`
- **API:** `RAILWAY_DOCKERFILE_PATH`, `PORT`, `CORS_ORIGINS`, `MONGO_URL` (from MongoDB)
- **Web:** `RAILWAY_DOCKERFILE_PATH`, `PORT`, `NEXT_PUBLIC_API_URL`, `MONGO_URL`
- **Workers:** `RAILWAY_DOCKERFILE_PATH`, `MONGO_URL` (from MongoDB)

## Redeploy

```bash
cd scholaracle
railway link  # if not already linked
railway up --service api     # deploy API
railway up --service web     # deploy Web
railway up --service workers # deploy Workers (after disabling health check)
```

## GitHub Auto-Deploy

All services are connected to [YOLOVibeCode/scholaracle](https://github.com/YOLOVibeCode/scholaracle). Pushes to `main` trigger redeploys.
