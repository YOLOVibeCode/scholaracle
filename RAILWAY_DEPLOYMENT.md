# Railway Deployment - Scholaracle

## Deployed Services

| Service   | URL                                           | Status   |
|-----------|-----------------------------------------------|----------|
| **Web**   | https://web-production-7c7641.up.railway.app  | Running  |
| **API**   | https://api-production-155e.up.railway.app    | Running  |
| **Workers** | (Background - health at internal port)     | Running  |
| **MongoDB** | (Private network only)                      | Running  |

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
