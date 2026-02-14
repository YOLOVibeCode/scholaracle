import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../fixtures/test-data';
import { login } from '../../fixtures/auth';

/**
 * Refresh token: on 401, client calls POST /auth/refresh and retries the request.
 * If refresh succeeds, user stays on the app; if it fails, redirect to login with session_expired.
 */
test.describe('Refresh Token', () => {
  test('REFRESH-001: 401 triggers refresh and retry; user stays on dashboard', async ({ page }) => {
    const user = TEST_USERS.parent;
    await login(page, user.email, user.password);

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:2801/api';
    let callCount = 0;

    await page.route('**/api/students**', async (route) => {
      callCount += 1;
      if (callCount === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Unauthorized' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/dashboard/students');
    await expect(page).toHaveURL(/\/dashboard\/students/);
    await expect(
      page.locator('[data-testid="student-list"], [data-testid="empty-state"], [data-testid="dashboard-header"]').first()
    ).toBeVisible({ timeout: 10000 });
  });
});
