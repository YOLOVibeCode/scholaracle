import { test, expect } from '@playwright/test';
import { AdminLoginPage } from '../../pages/admin/login.page';
import { TEST_USERS } from '../../fixtures/test-data';

/**
 * Admin authentication E2E tests:
 * - Invalid credentials rejection
 * - Account lockout after repeated failures
 */
test.describe('Admin Auth', () => {
  test('ADMIN-AUTH-001: Invalid credentials are rejected', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();

    await adminLoginPage.login(TEST_USERS.admin.email, 'WrongPassword999!');

    // Should show error and stay on admin login page
    await adminLoginPage.expectError();
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('ADMIN-AUTH-002: Non-existent admin email is rejected', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();

    await adminLoginPage.login('nonexistent@scholarmancy.com', 'SomePass123!');

    await adminLoginPage.expectError();
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('ADMIN-AUTH-003: Account lockout after repeated failed attempts', async ({ page }) => {
    // Use the analyst admin for lockout testing (least impactful on other tests).
    // The lockout threshold is 5 consecutive failures, and lockout lasts 15 min.
    // NOTE: This test will lock the analyst account. Re-seeding resets lockout.
    const adminLoginPage = new AdminLoginPage(page);
    const lockoutEmail = TEST_USERS.analyst.email;
    const wrongPassword = 'WrongPass123!';

    // Attempt login 6 times with wrong password (lockout threshold is 5)
    for (let i = 0; i < 6; i++) {
      await adminLoginPage.goto();
      await adminLoginPage.login(lockoutEmail, wrongPassword);
      // Wait for the error to appear before retrying
      await page
        .locator('[data-testid="message-error"], .text-red-500, .text-destructive, .bg-red-50')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });
    }

    // The 6th attempt (or a 7th attempt) should show a lockout message
    await adminLoginPage.expectError(/locked|too many failed/i);
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
