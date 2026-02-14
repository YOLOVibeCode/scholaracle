# Scholaracle

AI-powered parenting assistant for academic success.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)

## Overview

Scholaracle is an AI-powered parenting assistant that helps parents track their children's academic progress, get proactive alerts about assignments, deadlines, and grade changes, and receive actionable recommendations.

### Key Features

- **Unified Dashboard**: View all student data in one place
- **Proactive Alerts**: Get notified about missing assignments, upcoming deadlines, and grade changes
- **AI-Powered Insights**: Receive recommendations and pattern recognition
- **Multi-Channel Notifications**: Email, push, SMS, and in-app notifications
- **Student & Parent Agents**: Separate notification systems for students and parents
- **Super Admin Dashboard**: Full customer and subscription management

## Project Structure

This is a monorepo using PNPM workspaces with strict package isolation:

```
scholaracle/
├── packages/
│   ├── interfaces/    # @scholaracle/interfaces - ISP interfaces
│   ├── contracts/     # @scholaracle/contracts - Data models & enums
│   ├── agents/        # @scholaracle/agents - Notification generators
│   ├── database/      # @scholaracle/database - MongoDB repositories
│   ├── auth/          # @scholaracle/auth - JWT authentication
│   ├── connector/     # @scholaracle/connector - LMS data connector (CLI)
│   ├── api/           # @scholaracle/api - Express API server
│   ├── workers/       # @scholaracle/workers - Background notification jobs
│   ├── web/           # @scholaracle/web - Next.js frontend
│   └── e2e/           # E2E tests (Playwright)
```

## Getting Started

**PORT POLICY: All local services use FIXED ports in the 28XX series (2800-2804). These ports MUST NOT be changed.**
- **2800**: Web App (FIXED)
- **2801**: API Server (FIXED)
- **2802**: MongoDB (FIXED)
- **2803**: MailHog SMTP (FIXED)
- **2804**: MailHog UI (FIXED)

See [PORT_POLICY.md](./PORT_POLICY.md) for complete port policy documentation.

### Prerequisites

- **Node.js**: 20+ LTS ([Download](https://nodejs.org/))
- **PNPM**: 8+ ([Installation Guide](https://pnpm.io/installation))
- **Docker** (optional, for full infrastructure setup)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/YOLOVibeCode/scholaracle.git
   cd scholaracle
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Verify installation**:
   ```bash
   pnpm build
   pnpm test
   ```

### Development

```bash
# Build all packages
pnpm build

# Run all tests
pnpm test

# Lint all packages
pnpm lint

# Type check all packages
pnpm type-check

# Clean build artifacts
pnpm clean
```

### Working with Individual Packages

```bash
# Build a specific package
pnpm --filter @scholaracle/contracts build

# Test a specific package
pnpm --filter @scholaracle/agents test

# Run linting for a specific package
pnpm --filter @scholaracle/interfaces lint
```

## Architecture

### Package Dependencies

```
interfaces (no dependencies)
    ↓
contracts (depends on interfaces)
    ↓
database, auth, agents (depend on interfaces + contracts)
    ↓
connector (depends on contracts + interfaces)
    ↓
api, workers, web (depend on all above)
```

## Deployment

- **API + Workers**: Railway (Docker) — see [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)
- **Web**: Railway (Docker)
- **MongoDB**: Railway MongoDB plugin
- **Production URL**: https://scholarmancy.com
- **API URL**: https://api.scholarmancy.com

## Documentation

- [App Specification](./APP_SPECIFICATION.md) — Authoritative v1 feature spec
- [Super Admin Dashboard Spec](./SUPER_ADMIN_DASHBOARD_SPECIFICATION.md) — Admin roles & permissions
- [Port Policy](./PORT_POLICY.md) — Fixed ports (2800-2804)
- [Docker Setup](./DOCKER_SETUP.md) — Local Docker infrastructure guide
- [Railway Deployment](./RAILWAY_DEPLOYMENT.md) — Production deployment reference
- [Seed Endpoint](./SEED_ENDPOINT_USAGE.md) — Test data seeding
- [E2E Test Guide](./RUN_ALL_TESTS.md) — Running the E2E test suite
- [Specification Coverage](./SPECIFICATION_COVERAGE.md) — Test coverage matrix
- [Automation Testability](./AUTOMATION_TESTABILITY.md) — data-testid conventions
- [E2E Fail-Fast Pyramid](./E2E_FAIL_FAST_PYRAMID.md) — Layered test architecture

## Technology Stack

- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript 5.3+ (strict mode)
- **Package Manager**: PNPM 8+
- **Testing**: Jest 29+ / Playwright
- **Linting**: ESLint + Prettier
- **Database**: MongoDB (Railway plugin)
- **Frontend**: Next.js 16
- **Hosting**: Railway (API, Workers, Web) + custom domain

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
