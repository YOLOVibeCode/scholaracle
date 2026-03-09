# Full UX E2E: Account Creation to Alert Email (Mailpit)

This describes how to run the full user path from account creation through to receiving an alert email in Mailpit.

## Prerequisites

- MongoDB running (e.g. `mongodb://localhost:27017` or use docker-compose)
- Node 20+, pnpm

## 1. Start Mailpit

Either use Docker or the Mailpit binary:

```bash
# Docker (SMTP 2803, Web UI 2804)
docker run -d --name mailpit -p 2803:1025 -p 2804:8025 axllent/mailpit:latest
```

Or use docker-compose from the repo root (includes MongoDB + Mailpit + API + Web):

```bash
make up
# Or: docker-compose up -d
```

## 2. Start API and Web (local dev)

If not using docker-compose for API/Web:

```bash
# Terminal 1 – API (must have SMTP_HOST so emails go to Mailpit)
cd packages/api
SMTP_HOST=localhost SMTP_PORT=2803 pnpm dev

# Terminal 2 – Web
cd packages/web
pnpm dev
```

- Web: http://localhost:3000 (or 2800 if using ports from env)
- API: http://localhost:2801 (or your configured PORT)
- Mailpit UI: http://localhost:2804

## 3. Seed demo data (optional)

To get a pre-built user and students with grades:

```bash
curl -X POST http://localhost:2801/api/seed/demo
# Demo user: demo@scholarmancy.com / DemoPass123!
```

## 4. Full path (Playwright recommended)

**Option A – Playwright E2E (recommended, fully automated)**

All testable UX is automated via Playwright. From repo root:

```bash
# Default: register → add student (UI) → trigger alert (API). Mailpit check skipped if not set.
pnpm --filter @scholaracle/e2e test 13-full-ux-alert-email

# With Mailpit: start Mailpit and API with SMTP first, then:
MAILPIT_UI=http://localhost:2804 pnpm --filter @scholaracle/e2e test 13-full-ux-alert-email
```

Requires API and Web running (e.g. `make up` or Playwright’s webServer). When `MAILPIT_UI` is set and the API is started with `SMTP_HOST=localhost` and `SMTP_PORT=2803`, the test also asserts that Mailpit received the alert email.

**Option B – Smoke script (no browser)**

From repo root, with API and Mailpit running:

```bash
./scripts/e2e-smoke.sh
```

Registers via API, adds student via API, POSTs alert, then asserts Mailpit has at least one message. No UI.

**Option C – Manual**

1. **Register:** Open http://localhost:2800/register (or 3000), create an account.
2. **Add student:** Dashboard → Students → Add Student (name, grade).
3. **Trigger alert:** e.g. `curl -X POST http://localhost:2801/api/alerts` with body `{ "studentId": "<id>", "type": "grade_drop", "severity": "critical", "userId": "your@email.com" }` (use the student id from step 2 and your email).
4. **Check Mailpit:** Open http://localhost:2804 and confirm the alert email appears.

## Email transport

- When **SMTP_HOST** is set (e.g. for local/Mailpit), the API uses **SmtpTransport** (nodemailer) and sends to that host/port.
- When **SMTP_HOST** is not set, the API uses **SendGridTransport** (SendGrid API) for production.

So for local E2E you must set `SMTP_HOST=localhost` (and optionally `SMTP_PORT=2803`) when starting the API.
