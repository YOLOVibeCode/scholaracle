/**
 * PlaywrightUX: Canvas added on integrations via ConnectProviderWizard (phone flow).
 */
import { test, expect } from '../fixtures/auth';

test.describe('AI-generated scraper wizard', () => {
  test.setTimeout(60_000);

  test('Canvas: connect flow lists platform in bundle', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard/integrations');
    await page.locator('[data-testid="button-connect-school"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('[data-testid="platform-canvas"]').click();
    await expect(page.getByLabel(/School portal URL/i)).toBeVisible();
    await page.getByLabel(/School portal URL/i).fill('https://canvas.example.com');
    await page.locator('[data-testid="connect-provider-continue"]').click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });

    const card = page.locator('[data-testid="self-hosted-scraper-card"]');
    await expect(card.getByText('Canvas', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Phone', { exact: false })).toBeVisible();
  });
});
