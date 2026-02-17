# Live Integration Tests

These tests make **real HTTP requests** to actual education platform APIs.
They are skipped by default and only run when the appropriate environment
variables are set.

## How to run

```bash
# Canvas only
CANVAS_BASE_URL=https://yourschool.instructure.com \
CANVAS_ACCESS_TOKEN=your-token-here \
pnpm --filter @scholaracle/connector test -- __live__

# Google Classroom only
GOOGLE_CLASSROOM_ACCESS_TOKEN=ya29.your-oauth-token \
pnpm --filter @scholaracle/connector test -- __live__

# OneRoster only
ONEROSTER_BASE_URL=https://sis.district.edu/ims/oneroster/v1p2 \
ONEROSTER_ACCESS_TOKEN=your-token \
pnpm --filter @scholaracle/connector test -- __live__

# All available
CANVAS_BASE_URL=... CANVAS_ACCESS_TOKEN=... \
GOOGLE_CLASSROOM_ACCESS_TOKEN=... \
pnpm --filter @scholaracle/connector test -- __live__
```

## Getting credentials

### Canvas LMS
1. Go to https://www.canvaslms.com/try-canvas and sign up for a free teacher account
2. Create a test course with some assignments
3. Go to Account → Settings → scroll to "Approved Integrations"
4. Click "+ New Access Token" → copy the token

### Google Classroom
1. Create a Google Cloud project, enable the Classroom API
2. Configure OAuth consent screen
3. Use the OAuth playground or a quickstart to get an access token
4. Token is short-lived (~1 hour); refresh as needed

### OneRoster
1. Your school district must provide OneRoster API credentials
2. They will give you a base URL, client ID, and client secret
3. Or they may give you a pre-generated access token

## Note
These tests are NOT run in CI. They are for manual verification
against real systems during development and before releases.
