/**
 * PlaywrightUX: PowerSchool added to the integrations bundle via ConnectProviderWizard.
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { test, expect } from '../fixtures/auth';

test.describe('AI-generated scraper wizard', () => {
  test.setTimeout(60_000);

  test('PowerSchool: bundle connect flow and download', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    const downloadDir = path.join(os.tmpdir(), `scraper-ai-e2e-${Date.now()}`);
    await fs.promises.mkdir(downloadDir, { recursive: true });

    await page.route('**/api/integrations/scraper-download', async (route) => {
      const script = `#!/bin/bash
# Scholaracle bundle (mock)
echo "Scholaracle PowerSchool bundle"
APP_DIR="$HOME/.scholaracle-scraper/app-powerschool"
mkdir -p "$APP_DIR"
echo "Done"
`;
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/x-sh',
          'Content-Disposition': 'attachment; filename="scholaracle-bundle.command"',
        },
        body: script,
      });
    });

    await page.goto('/dashboard/integrations');
    await page.locator('[data-testid="button-connect-school"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('[data-testid="platform-powerschool"]').click();
    await expect(page.getByLabel(/School portal URL/i)).toBeVisible();
    await page.getByLabel(/School portal URL/i).fill('https://powerschool.example.com/public');
    await page.locator('[data-testid="connect-provider-student-name-hint"]').fill('Test Student');
    await page.locator('[data-testid="connect-provider-continue"]').click();
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });

    await expect(page.getByText('Ready')).toBeVisible({ timeout: 5000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
    await page.locator('[data-testid="button-download-bundle"]').click();
    const download = await downloadPromise;
    const downloadPath = path.join(downloadDir, download.suggestedFilename());
    await download.saveAs(downloadPath);

    const content = await fs.promises.readFile(downloadPath, 'utf8');
    expect(content).toContain('#!/bin/bash');
    expect(content).toContain('Scholaracle');
  });
});
