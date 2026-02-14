import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { TEST_USERS } from '../../fixtures/test-data';

/**
 * Session expired: when API returns 401, client clears token and redirects to login with reason.
 */
test.describe('Session Expired', () => {
  test('SESSION-001: 401 redirects to login with session-expired message', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    const user = TEST_USERS.parent;
    await loginPage.login(user.email, user.password);

    await page.waitForURL('/dashboard', { timeout: 15000 });
    await page.locator('[data-testid="student-count"], [data-testid="dashboard-header"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

    // Simulate expired session: first data request and every refresh return 401 so client redirects to login
    let firstDataRequestDone = false;
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
      const isRefresh = url.includes('/auth/refresh');
      if (isRefresh) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Unauthorized' }),
        });
        return;
      }
      if (!firstDataRequestDone) {
        firstDataRequestDone = true;
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Unauthorized' }),
        });
        return;
      }
      await route.continue();
    });

    await page.reload();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('[data-testid="message-session-expired"]')).toBeVisible();
  });
});
