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

## Project Structure

This is a monorepo using PNPM workspaces with strict package isolation:

```
scholaracle/
├── packages/
│   ├── interfaces/    # @scholaracle/interfaces - ISP interfaces
│   ├── contracts/     # @scholaracle/contracts - Data models & enums
│   ├── agents/        # @scholaracle/agents - Notification generators
│   ├── api/           # @scholaracle/api - Express API server (coming soon)
│   ├── workers/       # @scholaracle/workers - Background jobs (coming soon)
│   └── web/           # @scholaracle/web - Next.js frontend (coming soon)
```

## Getting Started

### Prerequisites

- **Node.js**: 20+ LTS ([Download](https://nodejs.org/))
- **PNPM**: 8+ ([Installation Guide](https://pnpm.io/installation))

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

# Run tests with coverage (requires 100%)
pnpm test:coverage

# Lint all packages
pnpm lint

# Format all packages
pnpm format

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

### Methodology

- **TDD (Test-Driven Development)**: All code written test-first
- **ISP (Interface Segregation Principle)**: Small, focused interfaces
- **SOLID Principles**: Clean, maintainable architecture
- **100% Test Coverage**: Required for all packages

### Package Dependencies

```
interfaces (no dependencies)
    ↓
contracts (depends on interfaces)
    ↓
agents (depends on interfaces + contracts)
    ↓
api, workers, web (depend on all above)
```

## Current Status

### ✅ Completed (Week 1-2)

- [x] Monorepo structure setup
- [x] Interfaces package (`@scholaracle/interfaces`)
- [x] Contracts package (`@scholaracle/contracts`) - 100% coverage
- [x] Student Notification Generator (`@scholaracle/agents`) - 100% coverage
- [x] All 6 student notification templates

### 🚧 In Progress

- [ ] Parent Notification Generator
- [ ] Delivery services (Email, Push, SMS)
- [ ] MongoDB queue system
- [ ] API server
- [ ] Frontend dashboard

## Standards

All code must follow:

- **[CODING_STANDARDS.md](./CODING_STANDARDS.md)** - Mandatory coding standards
- **[TECHNOLOGY_BEST_PRACTICES.md](./TECHNOLOGY_BEST_PRACTICES.md)** - Technology-specific best practices
- **[IMPLEMENTATION_PLAN_FINAL.md](./IMPLEMENTATION_PLAN_FINAL.md)** - 8-week TDD implementation plan

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Workflow

1. Create a feature branch: `git checkout -b feature/amazing-feature`
2. Write tests first (TDD)
3. Implement the feature
4. Ensure 100% test coverage
5. Run linting and formatting: `pnpm lint && pnpm format`
6. Commit following [Conventional Commits](https://www.conventionalcommits.org/)
7. Push and create a Pull Request

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

## Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Database Schema](./DATABASE_SCHEMA.md)
- [Notification Agents Specification](./NOTIFICATION_AGENTS_SPECIFICATION.md)
- [Implementation Plan](./IMPLEMENTATION_PLAN_FINAL.md)
- [Coding Standards](./CODING_STANDARDS.md)

## Technology Stack

- **Runtime**: Node.js 20 LTS
- **Language**: TypeScript 5.3+ (strict mode)
- **Package Manager**: PNPM 8+
- **Testing**: Jest 29+ (100% coverage required)
- **Linting**: ESLint + Prettier
- **Database**: MongoDB (on Railway)
- **Hosting**: Railway (MVP)

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/YOLOVibeCode/scholaracle/issues)
- **Discussions**: [GitHub Discussions](https://github.com/YOLOVibeCode/scholaracle/discussions)

## Acknowledgments

Built with ❤️ by [YOLOVibeCode](https://github.com/YOLOVibeCode)
