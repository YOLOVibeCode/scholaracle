# E2E Fail-Fast Test Pyramid — Complete Plan & Checklist

**Version:** 1.0  
**Last Updated:** December 2024

---

## Table of Contents

1. [Philosophy & Goals](#philosophy--goals)
2. [Fail-Fast Pyramid Architecture](#fail-fast-pyramid-architecture)
3. [Layer Specifications](#layer-specifications)
4. [Test Implementation Checklist](#test-implementation-checklist)
5. [Playwright Configuration](#playwright-configuration)
6. [Test Helpers & Utilities](#test-helpers--utilities)
7. [CI/CD Integration](#cicd-integration)
8. [Execution Strategy](#execution-strategy)

---

## Philosophy & Goals

### Core Principles

1. **Fail Fast** — If critical infrastructure is broken, don't waste time running 100+ tests
2. **Layer Dependencies** — Each layer assumes previous layers work
3. **Clear Feedback** — Developers know exactly what's broken and at which level
4. **Efficient Resource Usage** — Skip downstream tests when upstream fails
5. **Role Coverage** — All user roles are tested at appropriate layers

### Success Metrics

| Metric | Target |
|--------|--------|
| Layer 0 (Critical) execution time | < 30 seconds |
| Full suite execution time | < 10 minutes |
| Flakiness rate | < 1% |
| First failure feedback | < 60 seconds |

---

## Fail-Fast Pyramid Architecture

```
                    ┌─────────────────────┐
                    │   Layer 6: @error   │  6 tests
                    │  Error Handling     │
                    └──────────┬──────────┘
                               │ depends on
                    ┌──────────▼──────────┐
                    │ Layer 5: @integration│  5 tests
                    │  Cross-Role Workflows│
                    └──────────┬──────────┘
                               │ depends on
              ┌────────────────▼────────────────┐
              │      Layer 4: @feature          │  ~30 tests
              │   CRUD Operations per Role      │
              └────────────────┬────────────────┘
                               │ depends on
         ┌─────────────────────▼─────────────────────┐
         │           Layer 3: @navigation            │  ~40 tests
         │        Sidebar & Routing Works            │
         └─────────────────────┬─────────────────────┘
                               │ depends on
    ┌──────────────────────────▼──────────────────────────┐
    │              Layer 2: @dashboard                    │  ~37 tests
    │          All Pages Render Without Errors            │
    └──────────────────────────┬──────────────────────────┘
                               │ depends on
┌──────────────────────────────▼──────────────────────────────┐
│                     Layer 1: @auth                          │  8 tests
│                All Roles Can Authenticate                   │
└──────────────────────────────┬──────────────────────────────┘
                               │ depends on
┌──────────────────────────────▼──────────────────────────────┐
│                   Layer 0: @critical                        │  3 tests
│              App Loads, Login Page Works                    │
│                 ⚠️ SERIAL MODE — STOP ON FIRST FAILURE      │
└─────────────────────────────────────────────────────────────┘
```

### Layer Summary Table

| Layer | Tag | Tests | Timeout | Mode | Purpose |
|-------|-----|-------|---------|------|---------|
| 0 | `@critical` | 3 | 30s | Serial, failfast | App loads, login accessible |
| 1 | `@auth` | 8 | 60s | Parallel | All roles authenticate |
| 2 | `@dashboard` | 37 | 60s | Parallel | All pages render |
| 3 | `@navigation` | ~40 | 60s | Parallel | Sidebar navigation works |
| 4 | `@feature` | ~30 | 90s | Parallel | CRUD per role |
| 5 | `@integration` | 5 | 120s | Serial | Cross-role workflows |
| 6 | `@error` | 6 | 60s | Parallel | Error handling |

---

## Layer Specifications

### Layer 0: Critical Infrastructure (@critical)

**Purpose:** Verify the absolute minimum — can users reach the app?

**File:** `tests/00-critical.spec.ts`

| Test ID | Test Name | Description | Expected Result |
|---------|-----------|-------------|-----------------|
| CRIT-001 | App loads without crash | Navigate to `/` | Page loads, no console errors |
| CRIT-002 | Login page accessible | Navigate to `/login` | Login form visible |
| CRIT-003 | API health check | Call `/api/health` | Returns 200 OK |

**Configuration:**
- ⚡ Serial execution
- 🛑 Stop on first failure (`--stop-on-first-failure`)
- ⏱️ 30 second timeout
- 🔴 Prefix all errors with `CRITICAL:`

**Implementation Notes:**
```typescript
test.describe.configure({ mode: 'serial' });

test.beforeEach(({ page }) => {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      throw new Error(`CRITICAL: Console error detected: ${msg.text()}`);
    }
  });
});
```

---

### Layer 1: Authentication (@auth)

**Purpose:** Verify all user roles can log in/out

**File:** `tests/01-auth.spec.ts`

**Depends on:** Layer 0 passing

| Test ID | Test Name | Role | Description |
|---------|-----------|------|-------------|
| AUTH-001 | Parent can login | parent | Valid parent credentials → dashboard |
| AUTH-002 | Parent can logout | parent | Logout → redirected to login |
| AUTH-003 | Super Admin can login | super_admin | Valid admin credentials → /admin |
| AUTH-004 | Admin can login | admin | Valid admin credentials → /admin |
| AUTH-005 | Support can login | support | Valid support credentials → /admin |
| AUTH-006 | Billing can login | billing | Valid billing credentials → /admin |
| AUTH-007 | Analyst can login | analyst | Valid analyst credentials → /admin |
| AUTH-008 | Invalid credentials rejected | - | Wrong password → error message |

**Test Data Required:**
```typescript
const TEST_USERS = {
  parent: { email: 'test.parent@example.com', password: 'ParentPass123!' },
  super_admin: { email: 'super@scholarmancy.com', password: 'SuperAdmin123!' },
  admin: { email: 'admin@scholarmancy.com', password: 'Admin123!' },
  support: { email: 'support@scholarmancy.com', password: 'Support123!' },
  billing: { email: 'billing@scholarmancy.com', password: 'Billing123!' },
  analyst: { email: 'analyst@scholarmancy.com', password: 'Analyst123!' },
};
```

---

### Layer 2: Dashboard Rendering (@dashboard)

**Purpose:** Every page loads without crashing

**Files:** 
- `tests/02-dashboard-parent.spec.ts`
- `tests/02-dashboard-admin.spec.ts`

**Depends on:** Layer 1 passing

#### Parent Dashboard Pages (17 tests)

| Test ID | Page | Route | Expected Elements |
|---------|------|-------|-------------------|
| DASH-P-001 | Dashboard Home | `/dashboard` | Welcome message, stats cards |
| DASH-P-002 | Students List | `/dashboard/students` | Student list/empty state |
| DASH-P-003 | Add Student | `/dashboard/students/new` | Student form |
| DASH-P-004 | Student Detail | `/dashboard/students/[id]` | Student info |
| DASH-P-005 | Alerts | `/dashboard/alerts` | Alert list/empty state |
| DASH-P-006 | Settings | `/dashboard/settings` | Settings form |
| DASH-P-007 | Notification Settings | `/dashboard/settings#notifications` | Toggles visible |
| DASH-P-008 | Grade Thresholds | `/dashboard/settings#thresholds` | Threshold inputs |

#### Admin Dashboard Pages (20 tests)

| Test ID | Page | Route | Required Roles | Expected Elements |
|---------|------|-------|----------------|-------------------|
| DASH-A-001 | Admin Home | `/admin/dashboard` | all | KPI cards, activity feed |
| DASH-A-002 | Customers List | `/admin/customers` | all | Customer table |
| DASH-A-003 | Customer Detail | `/admin/customers/[id]` | super_admin, admin | Customer info |
| DASH-A-004 | Payments | `/admin/payments` | super_admin, admin, billing, analyst | Payment table |
| DASH-A-005 | Subscriptions | `/admin/subscriptions` | super_admin, admin, billing | Subscription list |
| DASH-A-006 | Communications | `/admin/communications` | super_admin, admin, support | Comm log |
| DASH-A-007 | Reports | `/admin/reports` | super_admin, admin, billing, analyst | Report UI |
| DASH-A-008 | System Settings | `/admin/settings` | super_admin only | Admin user list |
| DASH-A-009 | Audit Logs | `/admin/audit-logs` | super_admin only | Log entries |
| DASH-A-010 | Analytics Overview | `/admin/analytics` | super_admin, admin, analyst | Charts |

**Role-Access Matrix Test:**
```typescript
// Each admin page tested with each role
// Ensure proper 403 for unauthorized roles
```

---

### Layer 3: Navigation (@navigation)

**Purpose:** Sidebar links work, routing correct

**Files:**
- `tests/03-navigation-parent.spec.ts`
- `tests/03-navigation-admin.spec.ts`

**Depends on:** Layer 2 passing

#### Parent Navigation (15 tests)

| Test ID | Test Name | Action | Expected Result |
|---------|-----------|--------|-----------------|
| NAV-P-001 | Dashboard link works | Click "Dashboard" in sidebar | → `/dashboard` |
| NAV-P-002 | Students link works | Click "Students" | → `/dashboard/students` |
| NAV-P-003 | Add Student from empty | Click "Add Student" | → `/dashboard/students/new` |
| NAV-P-004 | Alerts link works | Click "Alerts" | → `/dashboard/alerts` |
| NAV-P-005 | Settings link works | Click "Settings" | → `/dashboard/settings` |
| NAV-P-006 | Logo navigates home | Click logo | → `/dashboard` |
| NAV-P-007 | Logout button visible | Check header | Button exists |
| NAV-P-008 | Back navigation | Browser back | Previous page |
| NAV-P-009 | Student detail back | "← Back" link | → students list |
| NAV-P-010 | Breadcrumb navigation | Click breadcrumb | Correct route |
| NAV-P-011 | Settings tabs | Click each tab | Content changes |
| NAV-P-012 | Alert filter tabs | Click severity filters | List filters |
| NAV-P-013 | Mobile menu toggle | Click hamburger | Menu opens |
| NAV-P-014 | Mobile nav links | Click mobile nav | Routes work |
| NAV-P-015 | Deep link direct access | Direct URL | Correct page |

#### Admin Navigation (25 tests)

| Test ID | Test Name | Role | Action | Expected |
|---------|-----------|------|--------|----------|
| NAV-A-001 | Dashboard link | all | Click Dashboard | `/admin/dashboard` |
| NAV-A-002 | Customers link | all | Click Customers | `/admin/customers` |
| NAV-A-003 | Payments link | billing+ | Click Payments | `/admin/payments` |
| NAV-A-004 | Subscriptions link | billing+ | Click Subscriptions | `/admin/subscriptions` |
| NAV-A-005 | Communications link | support+ | Click Comms | `/admin/communications` |
| NAV-A-006 | Reports link | analyst+ | Click Reports | `/admin/reports` |
| NAV-A-007 | Settings link | super_admin | Click Settings | `/admin/settings` |
| NAV-A-008 | Audit Logs link | super_admin | Click Audit | `/admin/audit-logs` |
| NAV-A-009 | Customer detail nav | admin+ | Click customer row | `/admin/customers/[id]` |
| NAV-A-010 | Customer tabs | admin+ | Click tabs | Tab content shows |
| NAV-A-011 | Back to list | all | Click back | `/admin/customers` |
| NAV-A-012 | Quick actions | varies | Click action buttons | Modal/dropdown |
| NAV-A-013 | Unauthorized redirect | support | Visit /admin/settings | 403 or redirect |
| NAV-A-014 | Search navigation | all | Search → select | Customer detail |
| NAV-A-015 | Pagination | all | Click page 2 | Updates list |
| NAV-A-016-025 | More navigation... | | | |

---

### Layer 4: Feature CRUD (@feature)

**Purpose:** Core functionality works for each role

**Files:**
- `tests/04-feature-parent.spec.ts`
- `tests/04-feature-admin.spec.ts`

**Depends on:** Layer 3 passing

#### Parent Features (10 tests)

| Test ID | Feature | Operation | Steps |
|---------|---------|-----------|-------|
| FEAT-P-001 | Student | CREATE | Fill form → Submit → Verify in list |
| FEAT-P-002 | Student | READ | View student details |
| FEAT-P-003 | Student | UPDATE | Edit student → Save → Verify changes |
| FEAT-P-004 | Student | DELETE | Remove student → Confirm → Verify gone |
| FEAT-P-005 | Alert | READ | View alerts list |
| FEAT-P-006 | Alert | ACKNOWLEDGE | Click acknowledge → Verify state |
| FEAT-P-007 | Alert | FILTER | Filter by severity → Verify list |
| FEAT-P-008 | Settings | UPDATE | Change notification prefs → Save |
| FEAT-P-009 | Settings | UPDATE | Change thresholds → Save → Verify |
| FEAT-P-010 | Settings | PERSIST | Reload → Verify settings saved |
| (future) | Profile / Password / Data Sources | — | Out of scope for v1 (see APP_SPECIFICATION.md) |

#### Admin Features (15 tests)

| Test ID | Feature | Operation | Role | Steps |
|---------|---------|-----------|------|-------|
| FEAT-A-001 | Customer | READ | all | View customer list |
| FEAT-A-002 | Customer | SEARCH | all | Search by email |
| FEAT-A-003 | Customer | FILTER | all | Filter by plan |
| FEAT-A-004 | Customer | VIEW | admin+ | View customer detail |
| FEAT-A-005 | Customer | SUSPEND | super_admin | Suspend → Verify status |
| FEAT-A-006 | Customer | UNSUSPEND | super_admin | Unsuspend → Verify |
| FEAT-A-007 | Subscription | UPDATE | admin+ | Change plan |
| FEAT-A-008 | Subscription | CANCEL | super_admin | Cancel → Verify |
| FEAT-A-009 | Payment | REFUND | billing+ | Issue refund |
| FEAT-A-010 | Note | CREATE | admin+ | Add customer note |
| FEAT-A-011 | Note | UPDATE | admin+ | Edit note |
| FEAT-A-012 | Note | DELETE | super_admin | Delete note |
| FEAT-A-013 | Communication | SEND | support+ | Send email to customer |
| FEAT-A-014 | Admin User | CREATE | super_admin | Create new admin |
| FEAT-A-015 | Admin User | UPDATE | super_admin | Update admin role |

---

### Layer 5: Integration Workflows (@integration)

**Purpose:** Complex multi-step, cross-role workflows

**File:** `tests/05-integration.spec.ts`

**Depends on:** Layer 4 passing

| Test ID | Workflow | Steps |
|---------|----------|-------|
| INT-001 | Complete Parent Onboarding | Register → Add student → Configure settings → View dashboard |
| INT-002 | Parent-Admin Interaction | Parent creates account → Admin views customer → Admin adds note → Admin sends email |
| INT-003 | Subscription Lifecycle | Parent registers (free) → Admin upgrades → Payment recorded → Admin cancels → Status updated |
| INT-004 | Alert Flow | Seeded alert → Parent views → Parent acknowledges → Dashboard updated → Admin sees in comm log |
| INT-005 | Multi-Student Family | Parent adds 3 students → View aggregated alerts → Admin sees family in customer detail |

---

### Layer 6: Error Handling (@error)

**Purpose:** App handles edge cases gracefully

**File:** `tests/06-error.spec.ts`

**Depends on:** Layer 5 passing

| Test ID | Scenario | Expected Behavior |
|---------|----------|-------------------|
| ERR-001 | 404 Page | Navigate to `/nonexistent` → Custom 404 page |
| ERR-002 | API Error Display | Trigger API error → Error toast/message shown |
| ERR-003 | Session Expired | Expire token → Redirect to login |
| ERR-004 | Permission Denied | Support visits /admin/settings → 403 or graceful redirect |
| ERR-005 | Form Validation | Submit invalid form → Inline errors |
| ERR-006 | Network Offline | Simulate offline → Graceful degradation |

---

## Test Implementation Checklist

### Phase 1: Infrastructure Setup
- [ ] Create directory structure
- [ ] Configure Playwright with layers
- [ ] Set up test data seeding
- [ ] Create authentication fixtures
- [ ] Create page objects

### Phase 2: Layer 0 (@critical) — 3 tests
- [ ] CRIT-001: App loads without crash
- [ ] CRIT-002: Login page accessible
- [ ] CRIT-003: API health check
- [ ] Configure serial mode, failfast

### Phase 3: Layer 1 (@auth) — 8 tests
- [ ] AUTH-001: Parent login
- [ ] AUTH-002: Parent logout
- [ ] AUTH-003: Super Admin login
- [ ] AUTH-004: Admin login
- [ ] AUTH-005: Support login
- [ ] AUTH-006: Billing login
- [ ] AUTH-007: Analyst login
- [ ] AUTH-008: Invalid credentials

### Phase 4: Layer 2 (@dashboard) — 37 tests
- [ ] Parent dashboard pages (8 tests)
  - [ ] DASH-P-001 through DASH-P-008
- [ ] Admin dashboard pages (20 tests)
  - [ ] DASH-A-001 through DASH-A-010
  - [ ] Role-access matrix tests (10)
- [ ] Cross-browser rendering checks

### Phase 5: Layer 3 (@navigation) — ~40 tests
- [ ] Parent navigation (15 tests)
  - [ ] NAV-P-001 through NAV-P-015
- [ ] Admin navigation (25 tests)
  - [ ] NAV-A-001 through NAV-A-025
- [ ] Mobile responsive navigation

### Phase 6: Layer 4 (@feature) — ~30 tests
- [ ] Parent features (15 tests)
  - [ ] FEAT-P-001 through FEAT-P-015
- [ ] Admin features (15 tests)
  - [ ] FEAT-A-001 through FEAT-A-015

### Phase 7: Layer 5 (@integration) — 5 tests
- [ ] INT-001: Complete Parent Onboarding
- [ ] INT-002: Parent-Admin Interaction
- [ ] INT-003: Subscription Lifecycle
- [ ] INT-004: Alert Flow
- [ ] INT-005: Multi-Student Family

### Phase 8: Layer 6 (@error) — 6 tests
- [ ] ERR-001: 404 Page
- [ ] ERR-002: API Error Display
- [ ] ERR-003: Session Expired
- [ ] ERR-004: Permission Denied
- [ ] ERR-005: Form Validation
- [ ] ERR-006: Network Offline

### Phase 9: Polish & CI
- [ ] GitHub Actions workflow
- [ ] Layer dependency enforcement
- [ ] Test reporting
- [ ] Screenshot on failure
- [ ] Parallel execution optimization

---

## Playwright Configuration

### Directory Structure

```
packages/e2e/
├── playwright.config.ts
├── package.json
├── tsconfig.json
├── fixtures/
│   ├── auth.fixture.ts          # Role-based auth
│   ├── database.fixture.ts      # DB seeding/cleanup
│   └── test-data.ts             # Constants
├── pages/
│   ├── base.page.ts             # Base page object
│   ├── login.page.ts
│   ├── register.page.ts
│   ├── dashboard/
│   │   ├── home.page.ts
│   │   ├── students.page.ts
│   │   ├── alerts.page.ts
│   │   └── settings.page.ts
│   └── admin/
│       ├── dashboard.page.ts
│       ├── customers.page.ts
│       ├── payments.page.ts
│       └── settings.page.ts
├── helpers/
│   ├── assertions.ts            # assertOnDashboard(), etc.
│   ├── navigation.ts            # navigateTo(), etc.
│   └── wait.ts                  # waitForLoad(), etc.
└── tests/
    ├── 00-critical.spec.ts
    ├── 01-auth.spec.ts
    ├── 02-dashboard-parent.spec.ts
    ├── 02-dashboard-admin.spec.ts
    ├── 03-navigation-parent.spec.ts
    ├── 03-navigation-admin.spec.ts
    ├── 04-feature-parent.spec.ts
    ├── 04-feature-admin.spec.ts
    ├── 05-integration.spec.ts
    └── 06-error.spec.ts
```

### playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  
  // Global timeout
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  
  // Fail fast for CI
  maxFailures: process.env.CI ? 5 : undefined,
  
  // Parallel execution
  fullyParallel: true,
  workers: process.env.CI ? 4 : undefined,
  
  // Retries for flaky tests
  retries: process.env.CI ? 2 : 0,
  
  // Reporters
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'results/junit.xml' }],
    ['json', { outputFile: 'results/results.json' }],
  ],
  
  // Shared settings
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:2800', // FIXED PORT - DO NOT CHANGE
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  
  // Projects for layer control
  projects: [
    // Layer 0: Critical (runs first, serial)
    {
      name: 'critical',
      testMatch: /00-critical\.spec\.ts/,
      use: { 
        ...devices['Desktop Chrome'],
      },
      retries: 0, // No retries for critical
    },
    
    // Layer 1: Auth (depends on critical)
    {
      name: 'auth',
      testMatch: /01-auth\.spec\.ts/,
      dependencies: ['critical'],
      use: { ...devices['Desktop Chrome'] },
    },
    
    // Layer 2: Dashboard (depends on auth)
    {
      name: 'dashboard',
      testMatch: /02-dashboard.*\.spec\.ts/,
      dependencies: ['auth'],
      use: { ...devices['Desktop Chrome'] },
    },
    
    // Layer 3: Navigation (depends on dashboard)
    {
      name: 'navigation',
      testMatch: /03-navigation.*\.spec\.ts/,
      dependencies: ['dashboard'],
      use: { ...devices['Desktop Chrome'] },
    },
    
    // Layer 4: Feature (depends on navigation)
    {
      name: 'feature',
      testMatch: /04-feature.*\.spec\.ts/,
      dependencies: ['navigation'],
      use: { ...devices['Desktop Chrome'] },
    },
    
    // Layer 5: Integration (depends on feature)
    {
      name: 'integration',
      testMatch: /05-integration\.spec\.ts/,
      dependencies: ['feature'],
      use: { ...devices['Desktop Chrome'] },
    },
    
    // Layer 6: Error (depends on integration)
    {
      name: 'error',
      testMatch: /06-error\.spec\.ts/,
      dependencies: ['integration'],
      use: { ...devices['Desktop Chrome'] },
    },
    
    // Note: We intentionally run Chromium-only to keep the suite deterministic.
    // Cross-browser and mobile viewport projects are out-of-scope for v1.
  ],
  
  // Dev server
  webServer: {
    command: 'pnpm --filter @scholaracle/web dev',
    url: 'http://localhost:2800', // FIXED PORT - DO NOT CHANGE
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
```

---

## Test Helpers & Utilities

### Authentication Helper

```typescript
// fixtures/auth.fixture.ts
import { test as base, Page } from '@playwright/test';
import { TEST_USERS, UserRole } from './test-data';

type AuthFixtures = {
  loginAsRole: (role: UserRole) => Promise<void>;
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  loginAsRole: async ({ page }, use) => {
    const login = async (role: UserRole) => {
      const user = TEST_USERS[role];
      const loginUrl = role === 'parent' ? '/login' : '/admin/login';
      
      await page.goto(loginUrl);
      await page.fill('[data-testid="email-input"]', user.email);
      await page.fill('[data-testid="password-input"]', user.password);
      await page.click('[data-testid="login-button"]');
      
      // Wait for redirect
      const expectedUrl = role === 'parent' ? '/dashboard' : '/admin/dashboard';
      await page.waitForURL(`**${expectedUrl}`);
    };
    
    await use(login);
  },
  
  authenticatedPage: async ({ page, loginAsRole }, use) => {
    await loginAsRole('parent');
    await use(page);
  },
});

export { expect } from '@playwright/test';
```

### Assertion Helpers

```typescript
// helpers/assertions.ts
import { Page, expect } from '@playwright/test';

export async function assertOnDashboard(page: Page) {
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('h1')).toContainText(/dashboard|welcome/i);
}

export async function assertOnAdminDashboard(page: Page) {
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator('[data-testid="admin-header"]')).toBeVisible();
}

export async function assertNoConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  // Wait for page to settle
  await page.waitForLoadState('networkidle');
  
  if (errors.length > 0) {
    throw new Error(`Console errors detected:\n${errors.join('\n')}`);
  }
}

export async function assertPageLoadsWithoutCrash(page: Page, url: string) {
  const response = await page.goto(url);
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).toBeVisible();
}

export async function assertElementVisible(page: Page, testId: string) {
  await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
}

export async function assertToastMessage(page: Page, message: string | RegExp) {
  await expect(page.locator('[data-testid="toast"]')).toContainText(message);
}
```

### Navigation Helpers

```typescript
// helpers/navigation.ts
import { Page } from '@playwright/test';

export async function navigateToSidebar(page: Page, linkText: string) {
  await page.click(`nav >> text="${linkText}"`);
  await page.waitForLoadState('networkidle');
}

export async function navigateToTab(page: Page, tabName: string) {
  await page.click(`[role="tab"]:has-text("${tabName}")`);
}

export async function clickBreadcrumb(page: Page, text: string) {
  await page.click(`nav[aria-label="breadcrumb"] >> text="${text}"`);
}
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/e2e-fail-fast.yml
name: E2E Fail-Fast Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  e2e-critical:
    name: "Layer 0: Critical"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 8 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Install Playwright
        run: pnpm --filter @scholaracle/e2e exec playwright install --with-deps chromium
      
      - name: Start services
        run: |
          docker-compose up -d mongodb
          pnpm --filter @scholaracle/api dev &
          pnpm --filter @scholaracle/web dev &
          sleep 30
      
      - name: Run Critical Tests
        run: |
          pnpm --filter @scholaracle/e2e test --project=critical
        env:
          BASE_URL: http://localhost:2800  # FIXED PORT - DO NOT CHANGE
      
      - name: Upload failure artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: critical-failure
          path: packages/e2e/test-results/

  e2e-full:
    name: "Layers 1-6: Full Suite"
    needs: e2e-critical
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 8 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Install Playwright
        run: pnpm --filter @scholaracle/e2e exec playwright install --with-deps
      
      - name: Seed test database
        run: pnpm --filter @scholaracle/database seed:test
      
      - name: Run Full E2E Suite
        run: pnpm --filter @scholaracle/e2e test
        env:
          BASE_URL: http://localhost:2800  # FIXED PORT - DO NOT CHANGE
          CI: true
      
      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-report
          path: |
            packages/e2e/playwright-report/
            packages/e2e/results/
```

---

## Execution Strategy

### Local Development

```bash
# Run only critical (fast feedback)
pnpm --filter @scholaracle/e2e test --project=critical

# Run up to auth layer
pnpm --filter @scholaracle/e2e test --project=critical --project=auth

# Run all layers sequentially
pnpm --filter @scholaracle/e2e test

# Run specific layer
pnpm --filter @scholaracle/e2e test --project=feature

# Debug mode with UI
pnpm --filter @scholaracle/e2e test --project=critical --ui

# Headed mode (see browser)
pnpm --filter @scholaracle/e2e test --headed
```

### CI/CD Execution Order

1. **PR Created:**
   - Run Layer 0 only (30 sec feedback)
   - If passes → Run Layers 1-4 (quick validation)

2. **PR Approved / Main Branch:**
   - Run full suite (Layers 0-6)
   - Cross-browser tests

3. **Nightly:**
   - Full suite + performance tests
   - All browser/device combinations

### Failure Response

```
Layer 0 fails → STOP ALL, notify immediately
Layer 1 fails → STOP, "Authentication broken"
Layer 2 fails → Skip 3-6, "Pages not rendering"
Layer 3 fails → Skip 4-6, "Navigation broken"
Layer 4 fails → Skip 5-6, "Features broken"
Layer 5 fails → Skip 6, "Integration workflows failing"
Layer 6 fails → Report, non-blocking
```

---

## Appendix: Test Tagging Reference

### Adding Tags to Tests

```typescript
// Use test.describe for grouping
test.describe('@critical', () => {
  test('CRIT-001: App loads', async ({ page }) => {
    // ...
  });
});

// Or use test annotations
test('AUTH-001: Parent login @auth', async ({ page }) => {
  // ...
});
```

### Running by Tag

```bash
# Run all @critical tests
pnpm test --grep "@critical"

# Run all @auth and @dashboard tests
pnpm test --grep "@auth|@dashboard"

# Exclude @slow tests
pnpm test --grep-invert "@slow"
```

---

## Summary

| Layer | Tests | Time | Mode | Dependency |
|-------|-------|------|------|------------|
| 0: Critical | 3 | 30s | Serial | None |
| 1: Auth | 8 | 60s | Parallel | Layer 0 |
| 2: Dashboard | 37 | 2m | Parallel | Layer 1 |
| 3: Navigation | 40 | 2m | Parallel | Layer 2 |
| 4: Feature | 30 | 3m | Parallel | Layer 3 |
| 5: Integration | 5 | 2m | Serial | Layer 4 |
| 6: Error | 6 | 1m | Parallel | Layer 5 |
| **TOTAL** | **~129** | **~10m** | | |

---

**Scholaracle E2E Testing: Fail fast, fix fast, ship fast.**
