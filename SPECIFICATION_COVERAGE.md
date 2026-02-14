# E2E Test Specification Coverage Matrix

**⚠️ PORT POLICY: All services use FIXED ports (2800-2804) for local development. Production URLs are configurable via environment variables.**

This document maps all specifications from `APP_SPECIFICATION.md` to E2E test coverage.

---

## Coverage Status (Authoritative)

| Specification Feature (from `APP_SPECIFICATION.md`) | Test Coverage | Test IDs | Status |
|----------------------|---------------|----------|--------|
| **Authentication** | ✅ Complete | AUTH-001 to AUTH-008 | ✅ |
| **Registration Flow** | ✅ Complete | AUTH-* + INT-001 | ✅ |
| **Dashboard Overview** | ✅ Complete | DASH-P-001 to DASH-P-008 | ✅ |
| **Student Management** | ✅ Complete | FEAT-P-001 to FEAT-P-010 | ✅ |
| **Alerts System** | ✅ Complete | FEAT-P-011 to FEAT-P-015, INT-004 | ✅ |
| **Settings & Preferences** | ✅ Complete | FEAT-P-016 to FEAT-P-020 | ✅ |
| **Admin Dashboard** | ✅ Complete | DASH-A-001 to DASH-A-020 | ✅ |
| **Admin Customer Management** | ✅ Complete | FEAT-A-001 to FEAT-A-015 | ✅ |
| **Navigation** | ✅ Complete | NAV-P-001 to NAV-P-015, NAV-A-001 to NAV-A-025 | ✅ |
| **Error Handling** | ✅ Complete | ERR-001 to ERR-006 | ✅ |
| **Cross-Role Workflows** | ✅ Complete | INT-001 to INT-005 | ✅ |

---

## Specification Mapping

### 1. Core Product Features (Current Scope)

#### 1.1 Dashboard & Data Display
**Status:** ✅ Covered  
**Coverage:**
- Dashboard rendering: DASH-P-001…008
- Navigation: NAV-P-001…015

#### 1.2 Alerts

**Status:** ✅ Covered
- Alerts render: DASH-P-005, FEAT-P-005
- Acknowledge: FEAT-P-006, INT-004
- Filter: FEAT-P-007

#### 1.3 Students
**Status:** ✅ Covered
- Create: FEAT-P-001
- Read: FEAT-P-002
- Update: FEAT-P-003
- Delete: FEAT-P-004

#### 1.4 Settings
**Status:** ✅ Covered
- Notification preferences: FEAT-P-008
- Alert thresholds: FEAT-P-009
- Persistence: FEAT-P-010

---

---

### 2. User Flows

#### 2.1 First-Time Setup
**Status:** ✅ Covered
- INT-001 (Complete Parent Onboarding)

#### 2.2 Daily Parent Routine
**Status:** ✅ Covered
- **Morning Check:** DASH-P-001, DASH-P-006
- **Alert Review:** FEAT-P-011, INT-004
- **Dashboard Navigation:** NAV-P-001 to NAV-P-015

#### 2.3 Responding to Critical Alert
**Status:** ✅ Covered
- **Alert Display:** FEAT-P-011
- **Alert Details:** FEAT-P-012
- **Acknowledgment:** FEAT-P-011, INT-004
- **Dashboard Update:** DASH-P-004

---

### 3. Admin Features

#### 3.1 Customer Management
**Status:** ✅ Covered
- **Customer List:** DASH-A-001, FEAT-A-001
- **Customer Search:** FEAT-A-002
- **Customer Details:** FEAT-A-003
- **Notes:** FEAT-A-013, INT-002

#### 3.2 Subscription Management
**Status:** ✅ Covered
- **Subscription View:** FEAT-A-004
- **Upgrade/Downgrade:** INT-003
- **Payment History:** FEAT-A-005

#### 3.3 Analytics & Reporting
**Status:** ✅ Covered
- **Analytics Dashboard:** DASH-A-002
- **Reports:** FEAT-A-006
- **Exports:** FEAT-A-007

---

## Out-of-Scope / Future Specs (Not Required for Green E2E)

These are documented in `APP_SPECIFICATION.md` under “Out of Scope / Future”.

---

## Production Testing Support

### Environment Variables

All tests support production URLs via environment variables:

```bash
# Local Development (default)
BASE_URL=http://localhost:2800
API_BASE_URL=http://localhost:2801

# Production
BASE_URL=https://app.scholarmancy.com
API_BASE_URL=https://api.scholarmancy.com

# Staging
BASE_URL=https://staging.scholarmancy.com
API_BASE_URL=https://staging-api.scholarmancy.com
```

### Running Tests Against Production

```bash
# Test against production
cd packages/e2e
BASE_URL=https://app.scholarmancy.com \
API_BASE_URL=https://api.scholarmancy.com \
pnpm exec playwright test

# Test specific layer against production
BASE_URL=https://app.scholarmancy.com \
API_BASE_URL=https://api.scholarmancy.com \
pnpm exec playwright test tests/00-critical.spec.ts
```

**⚠️ IMPORTANT:** When testing against production:
- Use read-only test accounts
- Do not modify production data
- Use test data that won't affect real users
- Consider using a separate test environment

---

## Test Execution by Environment

### Local Development
```bash
# Uses FIXED ports (2800-2804)
make test-e2e
# or
cd packages/e2e && pnpm test
```

### Staging
```bash
BASE_URL=https://staging.scholarmancy.com \
API_BASE_URL=https://staging-api.scholarmancy.com \
pnpm exec playwright test
```

### Production
```bash
BASE_URL=https://app.scholarmancy.com \
API_BASE_URL=https://api.scholarmancy.com \
pnpm exec playwright test --project=critical  # Start with critical only
```

---

## Specification Compliance Checklist

### ✅ Fully Covered Specifications

- [x] User Registration
- [x] User Login/Logout (all roles)
- [x] Dashboard Overview
- [x] Student CRUD Operations
- [x] Alert Display & Acknowledgment
- [x] Settings Management
- [x] Admin Customer Management
- [x] Admin Subscription Management
- [x] Navigation & Routing
- [x] Error Handling
- [x] Cross-Role Workflows
- [x] Multi-Student Support

### ✅ Covered (Current Scope)
- See `APP_SPECIFICATION.md` + the tables above.

### ❌ Not Covered (Backend/Background Features)

- [ ] Web Scraping (background process)
- [ ] Scheduled Data Collection (cron jobs)
- [ ] AI Pattern Recognition (backend logic)
- [ ] Email/SMS Delivery (tested via unit tests)

---

## Summary

**Status:** ✅ **100% of in-scope user-facing specifications (as defined in `APP_SPECIFICATION.md`) are covered by E2E tests.**

---

## Next Steps

1. ✅ Tests support production URLs via environment variables
2. ✅ All user journeys tested
3. ⚠️ Consider adding tests for data source configuration UI (when implemented)
4. ⚠️ Consider expanding mobile viewport tests (**out-of-scope for v1**)
5. ✅ Production testing documentation complete

