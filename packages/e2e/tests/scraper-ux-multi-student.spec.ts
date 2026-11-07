/**
 * Onboarding + phone-connect integrations for a freshly registered parent.
 */
import { test, expect } from '../fixtures/auth';
import { RegisterPage } from '../pages/register.page';
import { generateUniqueEmail } from '../fixtures/test-data';
import { assertOnDashboard } from '../helpers/assertions';

test.describe('Scraper UX: Multi-student and phone connect', () => {
  test.setTimeout(120_000);

  test('Register, add Avery Sample, connect Canvas in bundle', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.register(
      generateUniqueEmail('scraperux'),
      'Scraper UX Parent',
      'SecurePass123!'
    );
    await assertOnDashboard(page);

    await page.goto('/dashboard/students');
    await page.locator('[data-testid="button-add-student"]').first().click();
    await expect(page.locator('[data-testid="add-student-wizard"]')).toBeVisible();

    await page.locator('[data-testid="wizard-student-name"]').fill('Avery Sample');
    await page.locator('[data-testid="wizard-student-grade"]').fill('9');

    const createStudentRes = page.waitForResponse(
      (r) => r.url().includes('/students') && r.request().method() === 'POST'
    );
    await page.locator('[data-testid="wizard-next-step"]').click();
    const res = await createStudentRes;
    expect(res.status()).toBeLessThan(400);

    await expect(page.locator('[data-testid="wizard-skip-services"]')).toBeVisible({
      timeout: 10_000,
    });
    await page.locator('[data-testid="wizard-skip-services"]').click();
    await page.locator('[data-testid="wizard-finish"]').click();
    await expect(page.locator('[data-testid="add-student-wizard"]')).not.toBeVisible({
      timeout: 10_000,
    });

    await expect(
      page.locator('[data-testid="student-list"]').getByText('Avery Sample', { exact: true }).first()
    ).toBeVisible({ timeout: 10_000 });

    await page.goto('/dashboard/integrations');
    const card = page.locator('[data-testid="self-hosted-scraper-card"]');
    await page.locator('[data-testid="button-connect-school"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('[data-testid="platform-canvas"]').click();
    await page.getByLabel(/School portal URL/i).fill('https://example.instructure.com');
    await page.locator('[data-testid="connect-provider-student-name-hint"]').fill('Avery Sample');
    await page.locator('[data-testid="connect-provider-continue"]').click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });

    await expect(card.getByText('Canvas', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Phone', { exact: true })).toBeVisible();
  });
});
