import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../fixtures/test-data';
import { LoginPage } from '../pages/login.page';
import { AdminLoginPage } from '../pages/admin/login.page';
import {
  assertOnDashboard,
  assertOnAdminDashboard,
  assertRedirectedToLogin,
} from '../helpers/assertions';

/**
 * Layer 1: Authentication Tests
 *
 * Verify all user roles can authenticate successfully.
 *
 * Depends on: Layer 0 (@critical)
 * If Layer 0 fails → don't run
 */
test.describe('@auth Layer 1: Authentication', () => {
  test('AUTH-001: Parent can login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    const user = TEST_USERS.parent;
    await loginPage.login(user.email, user.password);

    await assertOnDashboard(page);
  });

  test('AUTH-002: Parent can logout', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Login first
    const user = TEST_USERS.parent;
    await loginPage.login(user.email, user.password);
    await assertOnDashboard(page);

    // Logout
    const logoutButton = page
      .locator('[data-testid="button-logout"], button:has-text("Logout")')
      .first();
    await expect(logoutButton).toBeVisible();
    await logoutButton.click({ force: true });

    // Deterministic validation:
    // - token should be removed from storage and cookie
    // - navigating to /login should stay on /login (middleware won't bounce back)
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem('auth_token')), { timeout: 15000 })
      .toBeNull();

    await expect
      .poll(async () => page.evaluate(() => document.cookie), { timeout: 15000 })
      .not.toContain('auth_token=');

    await page.goto('/login');
    await assertRedirectedToLogin(page);
  });

  test('AUTH-003: Admin can login', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();

    const user = TEST_USERS.admin;
    await adminLoginPage.loginWithMFA(user.email, user.password);

    await assertOnAdminDashboard(page);
  });

  test('AUTH-004: Admin invalid credentials rejected', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();

    await adminLoginPage.emailInput.fill('admin@example.com');
    await adminLoginPage.passwordInput.fill('WrongPassword123!');
    await adminLoginPage.loginButton.click();

    // Should stay on login or show error
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('AUTH-005: Support can login', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();

    const user = TEST_USERS.support;
    await adminLoginPage.loginWithMFA(user.email, user.password);

    await assertOnAdminDashboard(page);
  });

  test('AUTH-006: Billing can login', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();

    const user = TEST_USERS.billing;
    await adminLoginPage.loginWithMFA(user.email, user.password);

    await assertOnAdminDashboard(page);
  });

  test('AUTH-007: Analyst can login', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();

    const user = TEST_USERS.analyst;
    await adminLoginPage.loginWithMFA(user.email, user.password);

    await assertOnAdminDashboard(page);
  });

  test('AUTH-008: Invalid credentials rejected', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    const loginResponse = page.waitForResponse(
      (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
      { timeout: 15000 }
    );
    await loginPage.login('invalid@example.com', 'WrongPassword123!', { waitForDashboard: false });
    await loginResponse;

    await expect(page).toHaveURL(/\/login/);
    await loginPage.expectError(undefined, 15000);
  });
});
