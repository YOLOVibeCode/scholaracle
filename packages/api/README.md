# @scholaracle/api

API server for Scholaracle built with Express.js and TypeScript.

**⚠️ PORT POLICY: This API server uses FIXED port 2801 (external). DO NOT change this port.**

## Features

- RESTful API endpoints
- MongoDB integration
- Notification system integration
- Error handling middleware
- Health check endpoint

## Port Configuration

- **External Port**: 2801 (FIXED - DO NOT CHANGE)
- **Internal Port**: 3002 (container internal)
- **MongoDB**: mongodb://localhost:2802 (FIXED port)

See [PORT_POLICY.md](../../PORT_POLICY.md) for complete port policy.

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build
pnpm build

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

## Endpoints

- `GET /api/health` - Health check
- `GET /api/health/version` - Deployed version check (git commit/branch for CI deploy verification)
  - `status` — `"ok"`
  - `commit` — git SHA from `RAILWAY_GIT_COMMIT_SHA`, or `"unknown"` when unset
  - `branch` — git branch from `RAILWAY_GIT_BRANCH`, or `"unknown"` when unset
  - `builtAt` — ISO timestamp (image build via `/app/BUILT_AT` or `SCHOLARMANCY_BUILT_AT`, else process start)
  - `uptimeSeconds` — integer seconds since process start
  - `nodeVersion` — Node runtime string from `process.version` (e.g. `"v20.11.0"`)
  - `timestamp` — ISO timestamp of the request (not deploy identity)
- `POST /api/alerts` - Create and process alert

