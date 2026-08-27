# @scholaracle/web

Scholarmancy web app — parent dashboard (`/dashboard`) and student studio (`/studio`). Built with Next.js 16, React 19, and Tailwind CSS.

Parents connect school sources and provision child logins (Settings → Student logins). Students land on `/studio` (Today + one next step). **iPad sign-in** on that settings card shows a QR; the iPad camera opens `/login?magic=…` and signs the student in without typing a password.

## Getting Started

```bash
pnpm dev
```

**Port policy:** Web app uses fixed port **2800**. See [PORT_POLICY.md](../../PORT_POLICY.md).

Open [http://localhost:2800](http://localhost:2800). With API on 2801, seed demo data (`POST /api/seed/demo`) then:

| Actor | Email | Password |
|-------|--------|----------|
| Parent | `demo@scholarmancy.com` | `DemoPass123!` |
| Emma | `emma.demo@scholarmancy.com` | `DemoPass123!` |
| Liam | `liam.demo@scholarmancy.com` | `DemoPass123!` |

## Deploy

Deployed to [Railway](https://railway.app) via CI (see `.github/workflows/deploy.yml`).
