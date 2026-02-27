import { test, expect } from '../fixtures/auth';

/**
 * E2E: Page-render coverage for audit gaps.
 *
 * Covers: Integrations page, Student grades, Billing, Settings sessions,
 * Student view sources tab. (Agenda on student view covered in 09-action-board.)
 */
test.describe('Pages (audit gap coverage)', () => {
  test.beforeEach(async ({ loginAsRole }) => {
    await loginAsRole('parent');
  });

  test('GAP-INTEGRATIONS: Integrations page renders', async ({ page }) => {
    await page.goto('/dashboard/integrations');
    await expect(page).toHaveURL('/dashboard/integrations');
    await expect(page.locator('[data-testid="integrations-page"]')).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('[data-testid="integrations-list"], [data-testid="button-add-provider"], [data-testid="button-add-provider-empty"]').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('GAP-GRADES: Student grades page renders', async ({ page }) => {
    await page.goto('/dashboard/students');
    const studentLink = page.locator('[data-testid="student-link"]').first();
    if ((await studentLink.count()) === 0) {
      test.skip();
      return;
    }
    const href = await studentLink.getAttribute('href');
    if (!href) {
      test.skip();
      return;
    }
    await page.goto(href + '/grades');
    await expect(page).toHaveURL(/\/dashboard\/students\/[^/]+\/grades/);
    await expect(page.locator('[data-testid="student-grades-page"]')).toBeVisible({ timeout: 10000 });
  });

  test('GAP-BILLING: Billing page renders', async ({ page }) => {
    await page.goto('/dashboard/billing');
    await expect(page).toHaveURL('/dashboard/billing');
    await expect(page.locator('[data-testid="billing-page"]')).toBeVisible({ timeout: 10000 });
  });

  test('GAP-SESSIONS: Settings sessions page renders', async ({ page }) => {
    await page.goto('/dashboard/settings/sessions');
    await expect(page).toHaveURL('/dashboard/settings/sessions');
    await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible({ timeout: 10000 });
  });

  test('GAP-SOURCES: Student detail sources tab renders', async ({ page }) => {
    await page.goto('/dashboard/students');
    const studentLink = page.locator('[data-testid="student-link"]').first();
    if ((await studentLink.count()) === 0) {
      test.skip();
      return;
    }
    await studentLink.click();
    await expect(page).toHaveURL(/\/dashboard\/students\/[^/]+/);
    await page.locator('[data-testid="tab-sources"]').click();
    await expect(page.locator('[data-testid="tab-sources"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('body')).toBeVisible();
  });
});
