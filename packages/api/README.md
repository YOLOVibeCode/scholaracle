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

- `GET /health` - Liveness check (process uptime, no auth)
- `GET /api/health` - Health check
- `POST /api/alerts` - Create and process alert

