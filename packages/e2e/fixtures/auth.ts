import { test as base, type Page, expect } from '@playwright/test';
import { TEST_USERS, generateUniqueEmail, E2E_MFA_SECRET, type UserRole } from './test-data';
import speakeasy from 'speakeasy';

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
      await page
        .addStyleTag({
          content: `
            nextjs-portal, nextjs-portal * { pointer-events: none !important; }
            [data-nextjs-dev-overlay="true"], [data-nextjs-dev-overlay="true"] * { pointer-events: none !important; }
          `,
        })
        .catch(() => {});
    };

    const doLogin = async (role: UserRole) => {
      const user = TEST_USERS[role];
      const loginUrl = role === 'parent' || role === 'newUser' ? '/login' : '/admin/login';
      const isAdmin = role !== 'parent' && role !== 'newUser';

      await page.goto(loginUrl);
      await disableNextDevOverlay();

      const emailInput = page.locator(
        isAdmin ? '[data-testid="input-admin-email"]' : '[data-testid="input-email"]'
      );
      const passwordInput = page.locator(
        isAdmin ? '[data-testid="input-admin-password"]' : '[data-testid="input-password"]'
      );
      const loginButton = page.locator('[data-testid="button-login"]');

      await emailInput.fill(user.email);
      await passwordInput.fill(user.password);

      const apiEndpoint = isAdmin ? '/admin/auth/login' : '/auth/login';
      const responsePromise = page.waitForResponse(
        (r) => r.url().includes(apiEndpoint) && r.request().method() === 'POST'
      );

      await loginButton.first().click({ force: true });

      const loginResponse = await responsePromise;

      if (role === 'parent' || role === 'newUser') {
        expect(loginResponse.status()).toBeLessThan(400);
        await page.waitForURL('/dashboard');
      } else {
        if (loginResponse.status() < 400) {
          await page.waitForURL(/\/admin(\/dashboard)?$/);
          return;
        }

        const mfaInput = page.locator('[data-testid="input-mfa-code"]');
        await expect(mfaInput).toBeVisible();

        const totp = speakeasy.totp({ secret: E2E_MFA_SECRET, encoding: 'base32' });

        const mfaResponsePromise = page.waitForResponse(
          (r) => r.url().includes('/admin/auth/mfa/verify') && r.request().method() === 'POST'
        );

        await mfaInput.fill(totp);
        await page.locator('[data-testid="button-verify-mfa"]').click();

        const mfaResponse = await mfaResponsePromise;
        expect(mfaResponse.status()).toBeLessThan(400);

        await page.waitForURL(/\/admin(\/dashboard)?$/);
      }
    };

    await use(doLogin);
  },

  authenticatedPage: async ({ page, testUser }, use) => {
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
    const confirmPassword = page.locator('[data-testid="input-confirm-password"]');
    if ((await confirmPassword.count()) > 0) {
      await confirmPassword.fill(testUser.password);
    }
    const termsCheckbox = page.locator('[data-testid="terms-consent-checkbox"]');
    if ((await termsCheckbox.count()) > 0) {
      await termsCheckbox.check({ force: true });
    }

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/auth/register') && r.request().method() === 'POST'
    );

    await page.locator('[data-testid="button-register"]').first().click({ force: true });

    const response = await responsePromise;
    expect(response.status()).toBeLessThan(400);

    await page.waitForURL('/dashboard');

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

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/auth/login') && r.request().method() === 'POST'
  );

  await page.locator('[data-testid="button-login"]').first().click({ force: true });

  const response = await responsePromise;
  expect(response.status()).toBeLessThan(400);

  await page.waitForURL('/dashboard');
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

  const loginResponsePromise = page.waitForResponse(
    (r) => r.url().includes('/admin/auth/login') && r.request().method() === 'POST'
  );

  await page.locator('[data-testid="button-login"]').first().click({ force: true });

  const loginResponse = await loginResponsePromise;

  if (loginResponse.status() < 400) {
    await page.waitForURL(/\/admin(\/dashboard)?$/);
    return;
  }

  const mfaInput = page.locator('[data-testid="input-mfa-code"]');
  await expect(mfaInput).toBeVisible();

  const totp = speakeasy.totp({ secret: E2E_MFA_SECRET, encoding: 'base32' });

  const mfaResponsePromise = page.waitForResponse(
    (r) => r.url().includes('/admin/auth/mfa/verify') && r.request().method() === 'POST'
  );

  await mfaInput.fill(totp);
  await page.locator('[data-testid="button-verify-mfa"]').click();

  const mfaResponse = await mfaResponsePromise;
  expect(mfaResponse.status()).toBeLessThan(400);

  await page.waitForURL(/\/admin(\/dashboard)?$/);
}

/**
 * Logout helper function.
 */
export async function logout(page: Page): Promise<void> {
  const directLogout = page.locator('[data-testid="button-logout"]');
  if ((await directLogout.count()) > 0) {
    await directLogout.first().click({ force: true });
  } else {
    const menuTrigger = page.locator('[data-testid="user-menu-trigger"]').first();
    if ((await menuTrigger.count()) > 0) {
      await menuTrigger.click({ force: true });
      await page.locator('[data-testid="logout-menu-item"]').first().click({ force: true });
    }
  }
  await page.waitForURL(/\/login/);
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
  const termsCheckbox = page.locator('[data-testid="terms-consent-checkbox"]');
  if ((await termsCheckbox.count()) > 0) {
    await termsCheckbox.check({ force: true });
  }

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes('/auth/register') && r.request().method() === 'POST'
  );

  await page.click('[data-testid="button-register"]');

  const response = await responsePromise;
  expect(response.status()).toBeLessThan(400);

  await page.waitForURL('/dashboard');
}
