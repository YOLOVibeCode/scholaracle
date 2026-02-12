# Production E2E Testing Guide

**⚠️ PORT POLICY: Local development uses FIXED ports (2800-2804). Production URLs are configurable via environment variables.**

This guide explains how to run E2E tests against production, staging, or any environment.

---

## Environment Configuration

### Environment Variables

| Variable | Description | Default (Local) | Example (Production) |
|----------|-------------|-----------------|---------------------|
| `BASE_URL` | Web application URL | `http://localhost:2800` | `https://app.scholaracle.com` |
| `API_BASE_URL` | API server URL | `http://localhost:2801` | `https://api.scholaracle.com` |

---

## Running Tests Against Different Environments

### Local Development (Default)

Uses FIXED ports (2800-2804):

```bash
cd packages/e2e
pnpm test
```

**Services Required:**
- Web App: `http://localhost:2800` (FIXED)
- API: `http://localhost:2801` (FIXED)
- MongoDB: `mongodb://localhost:2802` (FIXED)

**Start Services:**
```bash
make test-up  # Starts MongoDB, MailHog, API
# Web app auto-starts via Playwright webServer config
```

---

### Staging Environment

```bash
cd packages/e2e
BASE_URL=https://staging.scholaracle.com \
API_BASE_URL=https://staging-api.scholaracle.com \
pnpm exec playwright test
```

**Note:** Web server will NOT auto-start (Playwright detects non-localhost URL)

---

### Production Environment

**⚠️ WARNING: Use extreme caution when testing against production!**

```bash
cd packages/e2e
BASE_URL=https://app.scholaracle.com \
API_BASE_URL=https://api.scholaracle.com \
pnpm exec playwright test --project=critical  # Start with critical only
```

**Best Practices:**
1. ✅ Start with Layer 0 (critical) only
2. ✅ Use read-only test accounts
3. ✅ Do not modify production data
4. ✅ Run during low-traffic periods
5. ✅ Monitor production logs
6. ✅ Use separate test environment if possible

**Recommended Production Test Flow:**
```bash
# 1. Test critical infrastructure only
BASE_URL=https://app.scholaracle.com \
API_BASE_URL=https://api.scholaracle.com \
pnpm exec playwright test tests/00-critical.spec.ts

# 2. If critical passes, test authentication
BASE_URL=https://app.scholaracle.com \
API_BASE_URL=https://api.scholaracle.com \
pnpm exec playwright test tests/01-auth.spec.ts

# 3. Continue layer by layer if needed
```

---

## Test Account Requirements

### For Production Testing

**Required Test Accounts:**
- Parent user (read-only access recommended)
- Admin user (if testing admin features)

**Setup:**
1. Create dedicated test accounts in production
2. Use accounts with minimal/no real data
3. Document credentials securely
4. Use environment variables for credentials (never commit)

**Example:**
```bash
# Use test accounts via environment variables
PARENT_TEST_EMAIL=test-parent@scholaracle.com \
PARENT_TEST_PASSWORD=TestPass123! \
BASE_URL=https://app.scholaracle.com \
pnpm exec playwright test
```

---

## Configuration Examples

### Local Development
```bash
# Default - uses FIXED ports
cd packages/e2e
pnpm test
```

### Staging
```bash
cd packages/e2e
BASE_URL=https://staging.scholaracle.com \
API_BASE_URL=https://staging-api.scholaracle.com \
pnpm exec playwright test
```

### Production (Critical Only)
```bash
cd packages/e2e
BASE_URL=https://app.scholaracle.com \
API_BASE_URL=https://api.scholaracle.com \
pnpm exec playwright test --project=critical
```

### Custom Environment
```bash
cd packages/e2e
BASE_URL=https://custom.example.com \
API_BASE_URL=https://custom-api.example.com \
pnpm exec playwright test
```

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to test'
        required: true
        default: 'staging'
        type: choice
        options:
          - staging
          - production

jobs:
  e2e-staging:
    runs-on: ubuntu-latest
    if: github.event.inputs.environment == 'staging' || github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Install Playwright
        run: pnpm --filter @scholaracle/e2e exec playwright install --with-deps
      
      - name: Run E2E tests against staging
        run: |
          cd packages/e2e
          BASE_URL=https://staging.scholaracle.com \
          API_BASE_URL=https://staging-api.scholaracle.com \
          pnpm exec playwright test
        env:
          PARENT_TEST_EMAIL: ${{ secrets.STAGING_PARENT_EMAIL }}
          PARENT_TEST_PASSWORD: ${{ secrets.STAGING_PARENT_PASSWORD }}

  e2e-production:
    runs-on: ubuntu-latest
    if: github.event.inputs.environment == 'production'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Install Playwright
        run: pnpm --filter @scholaracle/e2e exec playwright install --with-deps
      
      - name: Run Critical tests against production
        run: |
          cd packages/e2e
          BASE_URL=https://app.scholaracle.com \
          API_BASE_URL=https://api.scholaracle.com \
          pnpm exec playwright test --project=critical
        env:
          PARENT_TEST_EMAIL: ${{ secrets.PROD_TEST_PARENT_EMAIL }}
          PARENT_TEST_PASSWORD: ${{ secrets.PROD_TEST_PARENT_PASSWORD }}
```

---

## Test Execution Strategies

### 1. Smoke Tests (Production)

Run only critical tests to verify production is up:

```bash
BASE_URL=https://app.scholaracle.com \
API_BASE_URL=https://api.scholaracle.com \
pnpm exec playwright test --project=critical
```

**Duration:** ~30 seconds  
**Purpose:** Verify production infrastructure is healthy

### 2. Full Suite (Staging)

Run all tests against staging before production deployment:

```bash
BASE_URL=https://staging.scholaracle.com \
API_BASE_URL=https://staging-api.scholaracle.com \
pnpm exec playwright test
```

**Duration:** ~10 minutes  
**Purpose:** Full regression testing before production

### 3. Layer-by-Layer (Production)

Run tests incrementally, stopping if a layer fails:

```bash
# Layer 0: Critical
BASE_URL=https://app.scholaracle.com \
API_BASE_URL=https://api.scholaracle.com \
pnpm exec playwright test --project=critical

# Layer 1: Auth (only if Layer 0 passes)
BASE_URL=https://app.scholaracle.com \
API_BASE_URL=https://api.scholaracle.com \
pnpm exec playwright test --project=auth

# Continue with remaining layers...
```

---

## Troubleshooting

### Issue: Tests fail against production

**Possible Causes:**
1. Production URL incorrect
2. API URL incorrect
3. CORS issues
4. Authentication failures
5. Test data not available

**Solutions:**
```bash
# Verify URLs are accessible
curl https://app.scholaracle.com
curl https://api.scholaracle.com/api/health

# Check environment variables
echo $BASE_URL
echo $API_BASE_URL

# Run with debug output
DEBUG=pw:api BASE_URL=https://app.scholaracle.com pnpm test
```

### Issue: Web server auto-starts when it shouldn't

**Cause:** `BASE_URL` includes `localhost`  
**Solution:** Use full production URL:
```bash
BASE_URL=https://app.scholaracle.com  # Not localhost
```

### Issue: Tests timeout against production

**Cause:** Production slower than localhost  
**Solution:** Increase timeout:
```bash
BASE_URL=https://app.scholaracle.com \
pnpm exec playwright test --timeout=120000  # 2 minutes
```

---

## Security Considerations

### ⚠️ Never Commit Production Credentials

```bash
# ❌ BAD - Hardcoded in code
const email = 'admin@scholaracle.com';
const password = 'Secret123!';

# ✅ GOOD - Environment variables
const email = process.env.PARENT_TEST_EMAIL;
const password = process.env.PARENT_TEST_PASSWORD;
```

### ⚠️ Use Read-Only Test Accounts

- Create dedicated test accounts
- Use accounts with minimal permissions
- Never use real user accounts
- Document test account purpose

### ⚠️ Protect Test Credentials

- Store in GitHub Secrets (CI/CD)
- Use `.env.local` (local development, gitignored)
- Never commit credentials to repository
- Rotate credentials regularly

---

## Best Practices

### ✅ DO:
- Test against staging before production
- Start with critical tests only
- Use dedicated test accounts
- Monitor production logs during tests
- Run during low-traffic periods
- Document test results

### ❌ DON'T:
- Modify production data
- Use real user accounts
- Run full suite against production without need
- Commit production credentials
- Run destructive tests against production
- Ignore test failures

---

## Quick Reference

```bash
# Local (FIXED ports 2800-2804)
make test-e2e

# Staging
BASE_URL=https://staging.scholaracle.com API_BASE_URL=https://staging-api.scholaracle.com pnpm test

# Production (critical only)
BASE_URL=https://app.scholaracle.com API_BASE_URL=https://api.scholaracle.com pnpm test --project=critical

# Custom environment
BASE_URL=<your-url> API_BASE_URL=<your-api-url> pnpm test
```

---

**Remember:** Local development uses FIXED ports (2800-2804). Production URLs are fully configurable via environment variables.




