# Deploy and Verify Notification Pipeline

After deploying, use this checklist to confirm the notification pipeline works end-to-end.
School-portal scraping now runs **client-side only** (iOS app, browser extension, or local CLI).
Workers receive ingest envelopes and send alerts — they do not scrape.

## 1. Deploy to Railway

Deploy the monorepo (`api` and `workers` services) to your Railway project.

- Ensure `api` and `workers` both build and deploy.
- Workers need `@scholaracle/auth` and env for ingest submission.

## 2. Environment variables

Set on **both** `api` and `workers` where applicable:

| Variable | Where | Notes |
|----------|--------|--------|
| `JWT_SECRET` | api, workers | Same secret so workers can create connector tokens for ingest. |
| `API_BASE_URL` | workers | Base URL of the API for submitting envelopes. |
| `SENDGRID_API_KEY` | api, workers | Notification emails. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | workers | SMS alerts. |
| `FIREBASE_PROJECT_ID` | workers | Push notifications. |
| `CREDENTIALS_ENCRYPTION_KEY` | api, workers | For encrypting non-portal secrets (API tokens). |

Note: `GOOGLE_CLASSROOM_CLIENT_ID` / `GOOGLE_CLASSROOM_CLIENT_SECRET` are no longer needed.
Server-side Google Classroom sync has been discontinued. The `/api/oauth/google` endpoints return 410 Gone.

## 3. Submit a test ingest envelope

Use the mobile app, browser extension, or local CLI to run a sync and submit an envelope:

```bash
# CLI example
slc run --source-id <id> --student-id <id>
```

Or submit a synthetic envelope directly:

```bash
curl -X POST "https://<API_BASE>/api/ingest/v1/runs/<runId>/envelope" \
  -H "Authorization: Bearer <connector-token>" \
  -H "Content-Type: application/json" \
  -d '{ "schemaVersion": "slc.ingest.v1", ... }'
```

## 4. Verify

1. **Ingest run**
   Confirm an ingest run was created and envelope committed (check `slc_runs` collection or ingest APIs).

2. **Alerts**
   Confirm alerts were generated from ingested data (missing assignments, grade changes).

3. **Digest**
   Confirm digest email is sent to recipients.

## 5. Verify server rejects portal sync (guardrails)

Confirm the server correctly refuses legacy server-scraping paths:

```bash
# Should return 400 — server no longer scrapes Canvas
curl -X POST "https://<API_BASE>/api/sync/students/<id>/0" \
  -H "Authorization: Bearer <JWT>"

# Should return 400 — server no longer accepts login credentials
curl -X PUT "https://<API_BASE>/api/students/<id>/sources/<sid>/credentials" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "authType": "login", "username": "x", "password": "y" }'

# Should return 410 — Google Classroom server OAuth is discontinued
curl "https://<API_BASE>/api/oauth/google/authorize" \
  -H "Authorization: Bearer <JWT>"
```
