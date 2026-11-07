/**
 * Multi-student onboarding + phone-connect integrations (no bundle download).
 */
import { test, expect } from '../fixtures/auth';

async function createStudentViaWizard(
  page: import('@playwright/test').Page,
  name: string,
  grade: string
): Promise<void> {
  await page.goto('/dashboard/students');
  await page.locator('[data-testid="button-add-student"]').first().click();
  await expect(page.locator('[data-testid="add-student-wizard"]')).toBeVisible();

  await page.locator('[data-testid="wizard-student-name"]').fill(name);
  await page.locator('[data-testid="wizard-student-grade"]').fill(grade);

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
    page.locator('[data-testid="student-list"]').getByText(name, { exact: true }).first()
  ).toBeVisible({ timeout: 10_000 });
}

test.describe('Scraper UX: Multi-student and phone connect', () => {
  test.setTimeout(120_000);

  test.describe.serial('Multi-student flow', () => {
    test('Login and add student Avery Sample', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await createStudentViaWizard(page, 'Avery Sample', '9');
    });

    test('Add student Noah Sample', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await createStudentViaWizard(page, 'Noah Sample', '11');
    });

    test('Add Canvas and Skyward to integrations bundle', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await page.goto('/dashboard/integrations');

      const card = page.locator('[data-testid="self-hosted-scraper-card"]');

      for (const [platform, url, student] of [
        ['canvas', 'https://example.instructure.com', 'Avery Sample'],
        ['skyward', 'https://skyward.example.com', 'Noah Sample'],
      ] as const) {
        await page.locator('[data-testid="button-connect-school"]').click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.locator(`[data-testid="platform-${platform}"]`).click();
        await page.getByLabel(/School portal URL/i).fill(url);
        await page.locator('[data-testid="connect-provider-student-name-hint"]').fill(student);
        await page.locator('[data-testid="connect-provider-continue"]').click();
        await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });
      }

      await expect(card.getByText('Canvas', { exact: false })).toBeVisible({ timeout: 10_000 });
      await expect(card.getByText('Skyward', { exact: false })).toBeVisible();
      expect(await card.getByText('Phone', { exact: true }).count()).toBeGreaterThanOrEqual(2);
    });
  });
});
