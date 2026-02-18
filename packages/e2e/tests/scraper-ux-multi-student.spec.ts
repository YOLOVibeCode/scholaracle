/**
 * PlaywrightUX: Full multi-student, multi-connector scraper download experience.
 * Does not require real school credentials; validates the download pipeline and script structure.
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { test, expect } from '../fixtures/auth';

test.describe('Scraper UX: Multi-student and combined script', () => {
  test.setTimeout(120_000);

  let downloadDir: string;
  let canvasScriptPath: string;
  let skywardScriptPath: string;
  let combinedScriptPath: string;

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

    test('Connect Canvas for Ava and download single script', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      downloadDir = path.join(os.tmpdir(), `scraper-ux-${Date.now()}`);
      await fs.promises.mkdir(downloadDir, { recursive: true });

      await page.goto('/dashboard/integrations');
      await page.locator('[data-testid="button-connect-school"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.locator('[data-testid="platform-canvas"]').click();

      await expect(page.getByLabel(/School Portal URL/i)).toBeVisible();
      await page.getByLabel(/School Portal URL/i).fill('https://example.instructure.com');
      await page.getByLabel(/Student Name/i).fill('Ava Lewis');
      await page.getByLabel(/Email \/ Username/i).fill('ava@example.com');
      await page.getByLabel(/^Password/i).fill('placeholder');

      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Ready to Download' })).toBeVisible({ timeout: 5000 });
      const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
      await page.locator('[data-testid="button-download-scraper"]').click();
      const download = await downloadPromise;
      canvasScriptPath = path.join(downloadDir, download.suggestedFilename());
      await download.saveAs(canvasScriptPath);
      await expect(fs.promises.stat(canvasScriptPath)).resolves.toBeDefined();
      const content = await fs.promises.readFile(canvasScriptPath, 'utf8');
      expect(content.length).toBeGreaterThan(100);
      expect(content).toMatch(/Scholaracle|scholaracle|node|playwright/i);

      await page.keyboard.press('Escape');
    });

    test('Connect Skyward for Noah and download single script', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await page.goto('/dashboard/integrations');
      await page.locator('[data-testid="button-connect-school"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.locator('[data-testid="platform-skyward"]').click();

      await expect(page.getByLabel(/School Portal URL/i)).toBeVisible();
      await page.getByLabel(/School Portal URL/i).fill('https://skyward.example.com');
      await page.getByLabel(/Student Name/i).fill('Noah Lewis');
      await page.getByLabel(/Email \/ Username/i).fill('noah.parent');
      await page.getByLabel(/^Password/i).fill('placeholder');

      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Ready to Download' })).toBeVisible({ timeout: 5000 });
      const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
      await page.locator('[data-testid="button-download-scraper"]').click();
      const download = await downloadPromise;
      skywardScriptPath = path.join(downloadDir, download.suggestedFilename());
      await download.saveAs(skywardScriptPath);
      await expect(fs.promises.stat(skywardScriptPath)).resolves.toBeDefined();

      await page.keyboard.press('Escape');
    });

    test('Download combined "all students" script', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await page.goto('/dashboard/integrations');
      await expect(page.locator('[data-testid="button-download-all"]')).toBeVisible({ timeout: 10000 });
      const downloadPromise = page.waitForEvent('download', { timeout: 25000 });
      await page.locator('[data-testid="button-download-all"]').click();
      const download = await downloadPromise;
      combinedScriptPath = path.join(downloadDir, download.suggestedFilename());
      await download.saveAs(combinedScriptPath);
      await expect(fs.promises.stat(combinedScriptPath)).resolves.toBeDefined();
    });

    test('Verify script structure', async () => {
      const combined = await fs.promises.readFile(combinedScriptPath, 'utf8');
      expect(combined).toMatch(/#!/);
      expect(combined).toMatch(/node|Node|npm|playwright|Scholaracle|scholaracle/i);

      const canvas = await fs.promises.readFile(canvasScriptPath, 'utf8');
      expect(canvas).toMatch(/#!/);
      expect(canvas).toMatch(/playwright|axios|run\.js|scraper/i);

      const skyward = await fs.promises.readFile(skywardScriptPath, 'utf8');
      expect(skyward).toMatch(/#!/);
      expect(skyward).toMatch(/playwright|axios|run\.js|scraper/i);
    });
  });
});
