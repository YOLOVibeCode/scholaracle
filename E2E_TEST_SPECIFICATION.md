# Scholaracle E2E Test Specification

## Overview

This document specifies the End-to-End (E2E) testing strategy for Scholaracle, ensuring all user journeys work correctly from registration through daily usage. Tests are designed using **Playwright** for browser automation.

---

## Test Framework Setup

### Technology Stack
- **Playwright** - Browser automation and testing
- **TypeScript** - Type-safe test code
- **MongoDB Memory Server** - Isolated test database

### Directory Structure
```
packages/
└── e2e/
    ├── package.json
    ├── playwright.config.ts
    ├── tsconfig.json
    ├── fixtures/
    │   ├── auth.ts           # Authentication fixtures
    │   ├── database.ts       # Database seeders
    │   └── test-data.ts      # Test data constants
    ├── pages/
    │   ├── login.page.ts     # Page Object: Login
    │   ├── register.page.ts  # Page Object: Register
    │   ├── dashboard.page.ts # Page Object: Dashboard
    │   ├── students.page.ts  # Page Object: Students
    │   ├── alerts.page.ts    # Page Object: Alerts
    │   └── settings.page.ts  # Page Object: Settings
    └── tests/
        ├── auth/
        │   ├── registration.spec.ts
        │   ├── login.spec.ts
        │   └── logout.spec.ts
        ├── dashboard/
        │   └── dashboard.spec.ts
        ├── students/
        │   ├── create-student.spec.ts
        │   ├── view-students.spec.ts
        │   └── edit-student.spec.ts
        ├── alerts/
        │   ├── view-alerts.spec.ts
        │   └── acknowledge-alerts.spec.ts
        ├── settings/
        │   ├── notification-preferences.spec.ts
        │   └── alert-thresholds.spec.ts
        └── e2e/
            └── complete-user-journey.spec.ts
```

---

## User Journey Test Cases

### 1. Authentication Flow

#### 1.1 Registration Journey
**File:** `tests/auth/registration.spec.ts`

| Test ID | Test Name | Description | Priority |
|---------|-----------|-------------|----------|
| REG-001 | Should display registration form | Verify form elements are visible | High |
| REG-002 | Should validate required fields | Submit empty form, verify errors | High |
| REG-003 | Should validate email format | Enter invalid email, verify error | High |
| REG-004 | Should validate password requirements | Test weak passwords | Medium |
| REG-005 | Should register new user successfully | Complete valid registration | Critical |
| REG-006 | Should show error for existing email | Register with duplicate email | High |
| REG-007 | Should redirect to dashboard after registration | Verify navigation | High |
| REG-008 | Should store auth token | Verify localStorage/cookies | High |

**Test Implementation:**
```typescript
test.describe('User Registration', () => {
  test('REG-005: Should register new user successfully', async ({ page }) => {
    await page.goto('/register');
    
    await page.fill('[data-testid="email-input"]', 'newuser@example.com');
    await page.fill('[data-testid="name-input"]', 'John Doe');
    await page.fill('[data-testid="password-input"]', 'SecurePass123!');
    await page.click('[data-testid="register-button"]');
    
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });
});
```

#### 1.2 Login Journey
**File:** `tests/auth/login.spec.ts`

| Test ID | Test Name | Description | Priority |
|---------|-----------|-------------|----------|
| LOG-001 | Should display login form | Verify form elements | High |
| LOG-002 | Should validate required fields | Submit empty form | High |
| LOG-003 | Should show error for invalid credentials | Wrong password | High |
| LOG-004 | Should show error for non-existent user | Unknown email | High |
| LOG-005 | Should login successfully | Valid credentials | Critical |
| LOG-006 | Should redirect to dashboard | Verify navigation | High |
| LOG-007 | Should persist session | Reload page, stay logged in | High |
| LOG-008 | Should navigate to register page | Click register link | Medium |

#### 1.3 Logout Journey
**File:** `tests/auth/logout.spec.ts`

| Test ID | Test Name | Description | Priority |
|---------|-----------|-------------|----------|
| OUT-001 | Should logout successfully | Click logout button | Critical |
| OUT-002 | Should clear session | Verify token removed | High |
| OUT-003 | Should redirect to login | Verify navigation | High |
| OUT-004 | Should not access protected routes | Verify auth guard | Critical |

---

### 2. Dashboard Flow

#### 2.1 Dashboard Overview
**File:** `tests/dashboard/dashboard.spec.ts`

| Test ID | Test Name | Description | Priority |
|---------|-----------|-------------|----------|
| DASH-001 | Should display dashboard header | Verify welcome message | High |
| DASH-002 | Should show student count | Verify stats card | High |
| DASH-003 | Should show active courses count | Verify stats card | High |
| DASH-004 | Should show alerts count | Verify stats card | High |
| DASH-005 | Should show average GPA | Verify calculation | Medium |
| DASH-006 | Should display recent alerts | Verify alert list | High |
| DASH-007 | Should display upcoming deadlines | Verify deadline list | High |
| DASH-008 | Should update data on refresh | Verify data reload | Medium |
| DASH-009 | Should navigate to students page | Click students link | High |
| DASH-010 | Should navigate to alerts page | Click alerts link | High |

---

### 3. Student Management Flow

#### 3.1 Create Student
**File:** `tests/students/create-student.spec.ts`

| Test ID | Test Name | Description | Priority |
|---------|-----------|-------------|----------|
| STU-001 | Should navigate to create form | Click add student | High |
| STU-002 | Should display create form | Verify form fields | High |
| STU-003 | Should validate required fields | Submit empty form | High |
| STU-004 | Should create student successfully | Submit valid data | Critical |
| STU-005 | Should show success message | Verify toast/notification | Medium |
| STU-006 | Should redirect to students list | Verify navigation | High |
| STU-007 | Should show new student in list | Verify data persistence | Critical |

**Test Implementation:**
```typescript
test.describe('Student Creation', () => {
  test('STU-004: Should create student successfully', async ({ page, authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard/students/new');
    
    await page.fill('[data-testid="student-name"]', 'Emma Watson');
    await page.fill('[data-testid="student-grade"]', '10');
    await page.fill('[data-testid="student-school"]', 'Hogwarts High');
    await page.click('[data-testid="save-student-button"]');
    
    await expect(page).toHaveURL('/dashboard/students');
    await expect(page.locator('text=Emma Watson')).toBeVisible();
  });
});
```

#### 3.2 View Students
**File:** `tests/students/view-students.spec.ts`

| Test ID | Test Name | Description | Priority |
|---------|-----------|-------------|----------|
| STU-010 | Should display students list | Verify table/grid | High |
| STU-011 | Should show student details | Verify columns | High |
| STU-012 | Should show empty state | No students message | Medium |
| STU-013 | Should navigate to student detail | Click student row | High |
| STU-014 | Should show student count | Verify header | Medium |

#### 3.3 Edit Student
**File:** `tests/students/edit-student.spec.ts`

| Test ID | Test Name | Description | Priority |
|---------|-----------|-------------|----------|
| STU-020 | Should navigate to edit form | Click edit button | High |
| STU-021 | Should pre-fill form with data | Verify existing values | High |
| STU-022 | Should update student successfully | Submit changes | Critical |
| STU-023 | Should show updated data | Verify persistence | High |
| STU-024 | Should cancel edit | Click cancel, no changes | Medium |

---

### 4. Alerts Flow

#### 4.1 View Alerts
**File:** `tests/alerts/view-alerts.spec.ts`

| Test ID | Test Name | Description | Priority |
|---------|-----------|-------------|----------|
| ALT-001 | Should display alerts list | Verify page loads | High |
| ALT-002 | Should show alert details | Type, severity, message | High |
| ALT-003 | Should show empty state | No alerts message | Medium |
| ALT-004 | Should filter by severity | Click severity filter | Medium |
| ALT-005 | Should show alert timestamp | Verify date display | Low |
| ALT-006 | Should highlight critical alerts | Verify visual styling | Medium |

#### 4.2 Acknowledge Alerts
**File:** `tests/alerts/acknowledge-alerts.spec.ts`

| Test ID | Test Name | Description | Priority |
|---------|-----------|-------------|----------|
| ALT-010 | Should acknowledge single alert | Click acknowledge | Critical |
| ALT-011 | Should show acknowledged state | Verify visual change | High |
| ALT-012 | Should update alert count | Dashboard reflects change | High |
| ALT-013 | Should persist acknowledgement | Refresh page, verify | High |

---

### 5. Settings Flow

#### 5.1 Notification Preferences
**File:** `tests/settings/notification-preferences.spec.ts`

| Test ID | Test Name | Description | Priority |
|---------|-----------|-------------|----------|
| SET-001 | Should display notification settings | Verify checkboxes | High |
| SET-002 | Should toggle push notifications | Click toggle | High |
| SET-003 | Should toggle email notifications | Click toggle | High |
| SET-004 | Should toggle SMS notifications | Click toggle | High |
| SET-005 | Should save notification settings | Click save | Critical |
| SET-006 | Should persist settings | Refresh, verify | High |

#### 5.2 Alert Thresholds
**File:** `tests/settings/alert-thresholds.spec.ts`

| Test ID | Test Name | Description | Priority |
|---------|-----------|-------------|----------|
| SET-010 | Should display threshold settings | Verify inputs | High |
| SET-011 | Should update grade drop threshold | Enter value | High |
| SET-012 | Should update days before deadline | Enter value | High |
| SET-013 | Should validate threshold ranges | Invalid values | High |
| SET-014 | Should save threshold settings | Click save | Critical |
| SET-015 | Should show validation errors | Out-of-range values | High |

---

### 6. Complete User Journey

**File:** `tests/e2e/complete-user-journey.spec.ts`

This test simulates a complete user journey from registration to daily use.

```typescript
test.describe('Complete User Journey', () => {
  test('New parent onboarding flow', async ({ page }) => {
    // 1. Register new account
    await page.goto('/register');
    await page.fill('[data-testid="email"]', 'parent@example.com');
    await page.fill('[data-testid="name"]', 'John Parent');
    await page.fill('[data-testid="password"]', 'SecurePass123!');
    await page.click('[data-testid="register-btn"]');
    
    await expect(page).toHaveURL('/dashboard');
    
    // 2. Add first student
    await page.click('[data-testid="add-student-btn"]');
    await expect(page).toHaveURL('/dashboard/students/new');
    
    await page.fill('[data-testid="student-name"]', 'Jane Student');
    await page.fill('[data-testid="student-grade"]', '9');
    await page.fill('[data-testid="student-school"]', 'Lincoln High');
    await page.click('[data-testid="save-btn"]');
    
    // 3. Verify student appears on dashboard
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="student-count"]')).toContainText('1');
    
    // 4. Configure notification settings
    await page.click('[data-testid="settings-link"]');
    await page.uncheck('[data-testid="sms-toggle"]');
    await page.fill('[data-testid="grade-threshold"]', '80');
    await page.click('[data-testid="save-settings-btn"]');
    
    await expect(page.locator('[data-testid="save-success"]')).toBeVisible();
    
    // 5. View alerts (initially empty)
    await page.click('[data-testid="alerts-link"]');
    await expect(page.locator('[data-testid="no-alerts"]')).toBeVisible();
    
    // 6. Logout
    await page.click('[data-testid="logout-btn"]');
    await expect(page).toHaveURL('/login');
    
    // 7. Login again
    await page.fill('[data-testid="email"]', 'parent@example.com');
    await page.fill('[data-testid="password"]', 'SecurePass123!');
    await page.click('[data-testid="login-btn"]');
    
    // 8. Verify data persisted
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="student-count"]')).toContainText('1');
  });
});
```

---

## Test Data Requirements

### Seed Data
```typescript
// fixtures/test-data.ts
export const TEST_USERS = {
  parent: {
    email: 'test.parent@example.com',
    password: 'TestPass123!',
    name: 'Test Parent',
  },
  admin: {
    email: 'admin@scholaracle.com',
    password: 'AdminPass123!',
    name: 'Super Admin',
    role: 'super_admin',
  },
};

export const TEST_STUDENTS = [
  {
    name: 'Student One',
    grade: '9',
    school: 'Test High School',
    gpa: 3.5,
  },
  {
    name: 'Student Two',
    grade: '11',
    school: 'Test High School',
    gpa: 3.8,
  },
];

export const TEST_ALERTS = [
  {
    type: 'MISSING_ASSIGNMENT',
    severity: 'warning',
    message: 'Math homework due tomorrow',
  },
  {
    type: 'GRADE_DROP',
    severity: 'critical',
    message: 'Science grade dropped 10%',
  },
];
```

---

## Page Objects

### Login Page Object
```typescript
// pages/login.page.ts
import { Page, Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;
  readonly registerLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('[data-testid="email-input"]');
    this.passwordInput = page.locator('[data-testid="password-input"]');
    this.loginButton = page.locator('[data-testid="login-button"]');
    this.errorMessage = page.locator('[data-testid="error-message"]');
    this.registerLink = page.locator('[data-testid="register-link"]');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async expectError(message: string) {
    await expect(this.errorMessage).toContainText(message);
  }
}
```

---

## CI/CD Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    
    services:
      mongodb:
        image: mongo:6
        ports:
          - 27017:27017
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build packages
        run: pnpm build
      
      - name: Install Playwright browsers
        run: pnpm --filter @scholaracle/e2e exec playwright install --with-deps
      
      - name: Run E2E tests
        run: pnpm --filter @scholaracle/e2e test
        env:
          MONGODB_URI: mongodb://localhost:27017
          JWT_SECRET: test-secret
      
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: packages/e2e/playwright-report/
          retention-days: 7
```

---

## Test Execution Commands

```bash
# Run all E2E tests
pnpm --filter @scholaracle/e2e test

# Run specific test file
pnpm --filter @scholaracle/e2e test tests/auth/login.spec.ts

# Run tests with UI mode
pnpm --filter @scholaracle/e2e test:ui

# Run tests in headed mode (see browser)
pnpm --filter @scholaracle/e2e test:headed

# Generate test report
pnpm --filter @scholaracle/e2e test:report

# Run tests for specific browser
pnpm --filter @scholaracle/e2e test
```

---

## Test Coverage Targets

| Category | Test Count | Priority |
|----------|------------|----------|
| Authentication | 16 tests | Critical |
| Dashboard | 10 tests | High |
| Student Management | 14 tests | Critical |
| Alerts | 9 tests | High |
| Settings | 10 tests | High |
| E2E Journeys | 5 tests | Critical |
| **Total** | **64 tests** | |

---

## Success Criteria

1. **All critical tests pass** - No regression in core functionality
2. **90%+ test pass rate** - High reliability
3. **< 5 minute test suite** - Fast feedback
4. **Chromium-only** - Project policy (keep suite deterministic)

**Out of scope for v1:**
- Cross-browser compatibility (Firefox/WebKit)
- Mobile viewport automation
- Visual regression testing

---

## Implementation Timeline

| Phase | Tasks | Duration |
|-------|-------|----------|
| 1 | Setup E2E package, Playwright config | 1 day |
| 2 | Page Objects, fixtures | 1 day |
| 3 | Auth tests | 1 day |
| 4 | Dashboard & Students tests | 1 day |
| 5 | Alerts & Settings tests | 1 day |
| 6 | Complete journey tests | 0.5 day |
| 7 | CI/CD integration | 0.5 day |

**Total: ~6 days**


