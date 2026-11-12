import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { TEST_USERS } from '../../fixtures/test-data';
import { backendApiRoutePattern } from '../../fixtures/api-base';

const UNAUTHORIZED = {
  status: 401,
  contentType: 'application/json',
  body: JSON.stringify({ success: false, error: 'Unauthorized' }),
};

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
    await page
      .locator('[data-testid="student-count"], [data-testid="dashboard-header"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {});

    // Simulate an expired session on the reloaded page: every refresh fails, and the first data
    // request the NEW document makes gets a 401. The one-shot is armed only once the reload has
    // committed. Until then the document being unloaded still has requests in flight (the dashboard
    // stats chain is /students → /alerts-api → /agenda): a 401 spent on one of those is either
    // discarded together with that document or acted on by a page the browser is already replacing.
    // Neither is the behaviour under test, and both used the one-shot up.
    let reloadCommitted = false;
    let firstDataRequestDone = false;
    await page.route(backendApiRoutePattern(), async (route) => {
      const url = route.request().url();
      if (url.includes('/auth/refresh')) {
        await route.fulfill(UNAUTHORIZED);
        return;
      }
      if (reloadCommitted && !firstDataRequestDone) {
        firstDataRequestDone = true;
        await route.fulfill(UNAUTHORIZED);
        return;
      }
      await route.continue();
    });

    await page.reload({ waitUntil: 'commit' });
    reloadCommitted = true;

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('[data-testid="message-session-expired"]')).toBeVisible();
  });
});
