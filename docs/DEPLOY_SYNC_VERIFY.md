# Deploy and Verify Sync Pipeline

After implementing the Fix Sync Pipeline plan, use this checklist to deploy and verify end-to-end.

## 1. Deploy to Railway

Deploy the monorepo (or `api` and `workers` services) to your Railway project.

- Ensure `api` and `workers` both build and deploy (connector, agents, workers, api).
- Workers need `@scholaracle/auth` and env for ingest submission.

## 2. Environment variables

Set on **both** `api` and `workers` where applicable:

| Variable | Where | Notes |
|----------|--------|--------|
| `CREDENTIALS_ENCRYPTION_KEY` | api, workers | **Must be identical** so workers can decrypt credentials. |
| `JWT_SECRET` | api, workers | Same secret so workers can create connector tokens for ingest. |
| `API_BASE_URL` | workers | Base URL of the API (e.g. `https://your-api.railway.app`) for creating ingest runs and submitting envelopes. |
| `GOOGLE_CLASSROOM_CLIENT_ID` | api | For OAuth authorize/callback. |
| `GOOGLE_CLASSROOM_CLIENT_SECRET` | api | For OAuth token exchange. |
| `GOOGLE_CLASSROOM_CLIENT_ID` / `GOOGLE_CLASSROOM_CLIENT_SECRET` | workers | For Google token refresh before sync. |

## 3. Trigger Skyward sync for Ava

- Student ID: `69a4f1b53671c632ca591c7f`
- Skyward source ID: `7da26591-242d-401b-95c6-54eb2a1f7d1a`
- Credentials (Jessica.Lewis / 123456789, Lake Dallas Skyward URL) should already be set.

Trigger sync via dashboard (student → source → Sync) or:

```bash
# If you have API access (replace BASE_URL and auth token)
curl -X POST "https://<BASE_URL>/api/sync/students/69a4f1b53671c632ca591c7f/<dsIndex>" \
  -H "Authorization: Bearer <JWT>"
```

Use the data source index for Ava’s Skyward source (e.g. 0 if it’s the first source).

## 4. Verify

1. **Sync run**  
   Check `sync_runs` (or dashboard) for a completed run for Ava’s Skyward source.

2. **Ingest**  
   Confirm an ingest run was created and envelope submitted (e.g. `slc_runs` or ingest APIs).

3. **Alerts**  
   Confirm alerts were generated from ingested data (e.g. missing assignments, grades).

4. **Digest**  
   Confirm `email_digest_pending` (or equivalent) is populated and digest is sent to 3 recipients.

## 5. Optional: Google Classroom

To test Google Classroom:

1. Set `GOOGLE_CLASSROOM_CLIENT_ID` and `GOOGLE_CLASSROOM_CLIENT_SECRET` on the API (and workers for refresh).
2. In Connect Source Wizard, choose Google Classroom and click “Authorize with Google”.
3. Complete OAuth and run a sync; verify envelope and digest as above.
