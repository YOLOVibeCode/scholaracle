/**
 * PlaywrightUX: Full multi-student, multi-connector scraper download experience.
 * Does not require real school credentials; validates the bundle pipeline and script structure.
 *
 * The integrations page uses bundle mode — each platform is added to the bundle
 * via ConnectProviderWizard, then downloaded as a single bundle script.
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { test, expect } from '../fixtures/auth';

test.describe('Scraper UX: Multi-student and bundled script', () => {
  test.setTimeout(120_000);

  let downloadDir: string;
  let bundleScriptPath: string;
  let allStudentsScriptPath: string;

  test.describe.serial('Multi-student flow', () => {
    test('Login and add student Ava Lewis', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await page.goto('/dashboard/students');
      await page.locator('[data-testid="button-add-student"]').first().click();
      await expect(page.locator('[data-testid="add-student-wizard"]')).toBeVisible();

      await page.locator('[data-testid="wizard-student-name"]').fill('Ava Lewis');
      await page.locator('[data-testid="wizard-student-grade"]').fill('9');
      await page.locator('[data-testid="wizard-next-step"]').click();

      await expect(page.getByRole('heading', { name: /Connect Services/i })).toBeVisible({ timeout: 10000 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      await expect(page.locator('[data-testid="student-list"]').getByText('Ava Lewis').first()).toBeVisible({ timeout: 10000 });
    });

    test('Add student Noah Lewis', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await page.goto('/dashboard/students');
      await page.locator('[data-testid="button-add-student"]').first().click();
      await expect(page.locator('[data-testid="add-student-wizard"]')).toBeVisible();

      await page.locator('[data-testid="wizard-student-name"]').fill('Noah Lewis');
      await page.locator('[data-testid="wizard-student-grade"]').fill('11');
      await page.locator('[data-testid="wizard-next-step"]').click();

      await expect(page.getByRole('heading', { name: /Connect Services/i })).toBeVisible({ timeout: 10000 });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      await expect(page.locator('[data-testid="student-list"]').getByText('Noah Lewis').first()).toBeVisible({ timeout: 10000 });
    });

    test('Add Canvas + Skyward to bundle and download', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      downloadDir = path.join(os.tmpdir(), `scraper-ux-${Date.now()}`);
      await fs.promises.mkdir(downloadDir, { recursive: true });

      // Mock bundle download endpoint
      await page.route('**/api/integrations/scraper-download', async (route) => {
        const req = route.request();
        const body = req.postDataJSON();
        const isBundle = !!body?.connections;

        const script = isBundle
          ? `#!/bin/bash
# Scholaracle Bundle Script (mock)
echo "Scholaracle Bundle"
for platform in canvas skyward; do
  APP_DIR="$HOME/.scholaracle-scraper/app-$platform"
  mkdir -p "$APP_DIR"
  cat > "$APP_DIR/scraper.ts" << 'SCRAPEREOF'
export default class Scraper { async scrape() { return {}; } }
SCRAPEREOF
  cat > "$APP_DIR/run.js" << 'RUNEOF'
console.log("run.js loaded for $platform");
RUNEOF
done
echo "Done"
`
          : `#!/bin/bash
# Scholaracle All-Students Script (mock)
echo "Scholaracle Sync All"
node run.js --all-students
echo "Done"
`;

        const filename = isBundle ? 'scholaracle-bundle.command' : 'scholaracle-sync.command';
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'application/x-sh',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
          body: script,
        });
      });

      await page.goto('/dashboard/integrations');

      // --- Add Canvas to bundle ---
      await page.locator('[data-testid="button-connect-school"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.locator('[data-testid="platform-canvas"]').click();

      await expect(page.getByLabel(/School portal URL/i)).toBeVisible();
      await page.getByLabel(/School portal URL/i).fill('https://example.instructure.com');
      await page.getByLabel(/Student name/i).fill('Ava Lewis');
      await page.getByLabel(/^Username$/i).fill('ava@example.com');
      await page.getByLabel(/^Password$/i).fill('placeholder');

      // Canvas is a reference platform → "Continue" adds to bundle immediately
      await page.locator('[data-testid="connect-provider-continue"]').click();

      // Wizard closes, Canvas appears in bundle
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

      // --- Add Skyward to bundle ---
      await page.locator('[data-testid="button-connect-school"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.locator('[data-testid="platform-skyward"]').click();

      await expect(page.getByLabel(/School portal URL/i)).toBeVisible();
      await page.getByLabel(/School portal URL/i).fill('https://skyward.example.com');
      await page.getByLabel(/Student name/i).fill('Noah Lewis');
      await page.getByLabel(/^Username$/i).fill('noah.parent');
      await page.getByLabel(/^Password$/i).fill('placeholder');

      await page.locator('[data-testid="connect-provider-continue"]').click();
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

      // Verify both platforms are in the bundle (2 "Ready" badges)
      const readyBadges = page.getByText('Ready');
      await expect(readyBadges.first()).toBeVisible({ timeout: 5000 });
      expect(await readyBadges.count()).toBeGreaterThanOrEqual(2);

      // Download the combined bundle
      const bundleDownloadPromise = page.waitForEvent('download', { timeout: 15000 });
      await page.locator('[data-testid="button-download-bundle"]').click();
      const bundleDownload = await bundleDownloadPromise;
      bundleScriptPath = path.join(downloadDir, bundleDownload.suggestedFilename());
      await bundleDownload.saveAs(bundleScriptPath);
      await expect(fs.promises.stat(bundleScriptPath)).resolves.toBeDefined();
    });

    test('Download "all students" script', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');

      // Mock the download endpoint
      await page.route('**/api/integrations/scraper-download', async (route) => {
        const script = `#!/bin/bash
# Scholaracle All-Students (mock)
echo "Scholaracle sync all students"
node run.js --all
echo "Done"
`;
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'application/x-sh',
            'Content-Disposition': 'attachment; filename="scholaracle-sync.command"',
          },
          body: script,
        });
      });

      await page.goto('/dashboard/integrations');
      await expect(page.locator('[data-testid="button-download-all"]')).toBeVisible({ timeout: 10000 });
      const downloadPromise = page.waitForEvent('download', { timeout: 25000 });
      await page.locator('[data-testid="button-download-all"]').click();
      const download = await downloadPromise;
      allStudentsScriptPath = path.join(downloadDir, download.suggestedFilename());
      await download.saveAs(allStudentsScriptPath);
      await expect(fs.promises.stat(allStudentsScriptPath)).resolves.toBeDefined();
    });

    test('Verify script structure', async () => {
      const bundle = await fs.promises.readFile(bundleScriptPath, 'utf8');
      expect(bundle).toMatch(/#!/);
      expect(bundle).toMatch(/Scholaracle|scholaracle|node|playwright/i);
      expect(bundle).toMatch(/scraper|run\.js/i);

      const allStudents = await fs.promises.readFile(allStudentsScriptPath, 'utf8');
      expect(allStudents).toMatch(/#!/);
      expect(allStudents).toMatch(/Scholaracle|scholaracle|node|sync/i);
    });
  });
});
