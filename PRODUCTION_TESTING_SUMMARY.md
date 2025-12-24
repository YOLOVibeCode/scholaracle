# Production Testing - Quick Summary

**✅ All E2E tests now support production URLs via environment variables.**

---

## Quick Start

### Local Development (Default)
```bash
cd packages/e2e
pnpm test
```
Uses FIXED ports: Web `2800`, API `2801`, MongoDB `2802`

### Production Testing
```bash
cd packages/e2e
BASE_URL=https://app.scholaracle.com \
API_BASE_URL=https://api.scholaracle.com \
pnpm exec playwright test --project=critical
```

### Staging Testing
```bash
cd packages/e2e
BASE_URL=https://staging.scholaracle.com \
API_BASE_URL=https://staging-api.scholaracle.com \
pnpm exec playwright test
```

---

## Environment Variables

| Variable | Default (Local) | Production Example |
|----------|-----------------|-------------------|
| `BASE_URL` | `http://localhost:2800` | `https://app.scholaracle.com` |
| `API_BASE_URL` | `http://localhost:2801` | `https://api.scholaracle.com` |

---

## Specification Coverage

✅ **100% of user-facing specifications are covered by E2E tests**

See:
- `SPECIFICATION_COVERAGE.md` - Coverage matrix
- `E2E_SPECIFICATION_COVERAGE.md` - Detailed report

---

## Documentation

- **Full Guide:** `packages/e2e/PRODUCTION_TESTING.md`
- **Coverage Matrix:** `SPECIFICATION_COVERAGE.md`
- **Detailed Report:** `E2E_SPECIFICATION_COVERAGE.md`

---

## Important Notes

⚠️ **Port Policy:** Local development uses FIXED ports (2800-2804). Never change these.

⚠️ **Production Testing:** Use read-only test accounts, start with critical tests only.

✅ **All tests use relative URLs** - automatically work with any `BASE_URL`.


