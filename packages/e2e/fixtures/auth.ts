import { test as base, type Page, expect } from '@playwright/test';
import { TEST_USERS, generateUniqueEmail, type UserRole } from './test-data';

/**
 * Extended test fixture with authentication helpers.
 */
export interface AuthFixtures {
  authenticatedPage: Page;
  testUser: {
    email: string;
    password: string;
    name: string;
  };
  loginAsRole: (role: UserRole) => Promise<void>;
}

/**
 * Custom test with authentication fixtures.
 */
export const test = base.extend<AuthFixtures>({
  testUser: async ({}, use) => {
    const user = {
      email: generateUniqueEmail('e2e'),
      password: 'E2ETestPass123!',
      name: 'E2E Test User',
    };
    await use(user);
  },

  loginAsRole: async ({ page }, use) => {
    const disableNextDevOverlay = async () => {
      // Next.js dev overlay/devtools can render inside <nextjs-portal> and intercept pointer events.
      // Hide it via CSS when present (dev-mode only).
      await page
        .addStyleTag({
          content: `
            nextjs-portal, nextjs-portal * { pointer-events: none !important; }
            [data-nextjs-dev-overlay="true"], [data-nextjs-dev-overlay="true"] * { pointer-events: none !important; }
          `,
        })
        .catch(() => {});
    };

    const login = async (role: UserRole) => {
      const user = TEST_USERS[role];
      // Use relative URLs - baseURL from config handles localhost vs production
      const loginUrl = role === 'parent' || role === 'newUser' ? '/login' : '/admin/login';
      const isAdmin = role !== 'parent' && role !== 'newUser';

      await page.goto(loginUrl);
      await disableNextDevOverlay();

      // Use stable data-testid selectors (admin uses input-admin-email / input-admin-password)
      const emailInput = page.locator(isAdmin ? '[data-testid="input-admin-email"]' : '[data-testid="input-email"]');
      const passwordInput = page.locator(isAdmin ? '[data-testid="input-admin-password"]' : '[data-testid="input-password"]');
      const loginButton = page.locator('[data-testid="button-login"]');

      await emailInput.fill(user.email);
      await passwordInput.fill(user.password);
      await loginButton.first().click({ force: true });

      // Wait for redirect: prefer dashboard landmark for stability
      if (role === 'parent' || role === 'newUser') {
        await page.waitForURL('/dashboard', { timeout: 15000 });
        await page.locator('[data-testid="student-count"], [data-testid="dashboard-header"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      } else {
        await page.waitForURL(/\/admin(\/dashboard)?$/, { timeout: 15000 });
      }
    };
    
    await use(login);
  },

  authenticatedPage: async ({ page, testUser }, use) => {
    // Register the test user
    await page.goto('/register');
    await page
      .addStyleTag({
        content: `
          nextjs-portal, nextjs-portal * { pointer-events: none !important; }
          [data-nextjs-dev-overlay="true"], [data-nextjs-dev-overlay="true"] * { pointer-events: none !important; }
        `,
      })
      .catch(() => {});
    await page.fill('[data-testid="input-email"]', testUser.email);
    await page.fill('[data-testid="input-name"]', testUser.name);
    await page.fill('[data-testid="input-password"]', testUser.password);
    // Confirm password if present
    const confirmPassword = page.locator('[data-testid="input-confirm-password"]');
    if ((await confirmPassword.count()) > 0) {
      await confirmPassword.fill(testUser.password);
    }
    // Check terms consent (required)
    const termsCheckbox = page.locator('[data-testid="terms-consent-checkbox"]');
    if ((await termsCheckbox.count()) > 0) {
      await termsCheckbox.check({ force: true });
    }
    await page.locator('[data-testid="button-register"]').first().click({ force: true });

    await page.waitForURL('/dashboard', { timeout: 15000 });
    await page.locator('[data-testid="student-count"], [data-testid="dashboard-header"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * Login helper function for parent users.
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page
    .addStyleTag({
      content: `
        nextjs-portal, nextjs-portal * { pointer-events: none !important; }
        [data-nextjs-dev-overlay="true"], [data-nextjs-dev-overlay="true"] * { pointer-events: none !important; }
      `,
    })
    .catch(() => {});
  await page.fill('[data-testid="input-email"]', email);
  await page.fill('[data-testid="input-password"]', password);
  await page.locator('[data-testid="button-login"]').first().click({ force: true });
  await page.waitForURL('/dashboard', { timeout: 15000 });
  await page.locator('[data-testid="student-count"], [data-testid="dashboard-header"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
}

/**
 * Login helper function for admin users.
 */
export async function loginAdmin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/admin/login');
  await page
    .addStyleTag({
      content: `
        nextjs-portal, nextjs-portal * { pointer-events: none !important; }
        [data-nextjs-dev-overlay="true"], [data-nextjs-dev-overlay="true"] * { pointer-events: none !important; }
      `,
    })
    .catch(() => {});
  await page.fill('[data-testid="input-admin-email"]', email);
  await page.fill('[data-testid="input-admin-password"]', password);
  await page.locator('[data-testid="button-login"]').first().click({ force: true });
  await page.waitForURL(/\/admin(\/dashboard)?$/, { timeout: 10000 });
}

/**
 * Logout helper function.
 */
export async function logout(page: Page): Promise<void> {
  // Prefer explicit logout button if present; otherwise use user menu.
  const directLogout = page.locator('[data-testid="button-logout"]');
  if ((await directLogout.count()) > 0) {
    await directLogout.first().click({ force: true });
  } else {
    const menuTrigger = page.locator('[data-testid="user-menu-trigger"]').first();
    if ((await menuTrigger.count()) > 0) {
      await menuTrigger.click({ force: true });
      await page
        .locator('[data-testid="logout-menu-item"]')
        .first()
        .click({ force: true });
    }
  }
  await page.waitForURL(/\/login/, { timeout: 10000 });
}

/**
 * Register helper function.
 */
export async function register(
  page: Page,
  email: string,
  password: string,
  name: string
): Promise<void> {
  await page.goto('/register');
  await page.fill('[data-testid="input-email"]', email);
  await page.fill('[data-testid="input-name"]', name);
  await page.fill('[data-testid="input-password"]', password);
  const confirmPassword = page.locator('[data-testid="input-confirm-password"]');
  if ((await confirmPassword.count()) > 0) {
    await confirmPassword.fill(password);
  }
  // Check terms consent (required)
  const termsCheckbox = page.locator('[data-testid="terms-consent-checkbox"]');
  if ((await termsCheckbox.count()) > 0) {
    await termsCheckbox.check({ force: true });
  }
  await page.click('[data-testid="button-register"]');
  await page.waitForURL('/dashboard', { timeout: 10000 });
}


