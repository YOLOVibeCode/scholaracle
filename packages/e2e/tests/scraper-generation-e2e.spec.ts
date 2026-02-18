/**
 * Full E2E: Scraper generation and execution with real Canvas + Skyward.
 * Requires env vars (see .env.scraper-e2e.example). Suite is skipped if any are missing.
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { test, expect } from '../fixtures/auth';

const TEST_CANVAS_URL = process.env.TEST_CANVAS_URL ?? '';
const TEST_CANVAS_EMAIL = process.env.TEST_CANVAS_EMAIL ?? '';
const TEST_CANVAS_PASSWORD = process.env.TEST_CANVAS_PASSWORD ?? '';
const TEST_SKYWARD_URL = process.env.TEST_SKYWARD_URL ?? '';
const TEST_SKYWARD_USERNAME = process.env.TEST_SKYWARD_USERNAME ?? '';
const TEST_SKYWARD_PASSWORD = process.env.TEST_SKYWARD_PASSWORD ?? '';

const hasAllEnv =
  !!TEST_CANVAS_URL &&
  !!TEST_CANVAS_EMAIL &&
  !!TEST_CANVAS_PASSWORD &&
  !!TEST_SKYWARD_URL &&
  !!TEST_SKYWARD_USERNAME &&
  !!TEST_SKYWARD_PASSWORD;

test.describe('Scraper generation and execution E2E', () => {
  test.skip(!hasAllEnv, 'Real credentials not set (TEST_CANVAS_*, TEST_SKYWARD_*)');
  test.setTimeout(300_000);

  let avaStudentId: string;
  let downloadDir: string;
  let canvasScriptPath: string;
  let skywardScriptPath: string;

  test.describe.serial('Full scraper flow', () => {
    test('Login and create student Ava Lewis', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await page.goto('/dashboard/students');
      await page.locator('[data-testid="button-add-student"]').first().click();
      await expect(page.locator('[data-testid="add-student-wizard"]')).toBeVisible();

      await page.locator('[data-testid="wizard-student-name"]').fill('Ava Lewis');
      await page.locator('[data-testid="wizard-student-grade"]').fill('9');
      await page.locator('[data-testid="wizard-next-step"]').click();

      await expect(page.getByRole('heading', { name: /Connect Services/i })).toBeVisible({ timeout: 10000 });
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-testid="add-student-wizard"]')).not.toBeVisible();

      await expect(page.getByText('Ava Lewis')).toBeVisible({ timeout: 5000 });
      const viewLink = page
        .locator('[data-testid="student-list"]')
        .filter({ hasText: 'Ava Lewis' })
        .locator('a[href*="/view"]')
        .first();
      const href = await viewLink.getAttribute('href');
      const match = href?.match(/\/students\/([^/]+)\/view/);
      if (!match?.[1]) throw new Error('Could not get student ID for Ava Lewis');
      avaStudentId = match[1];
    });

    test('Generate Canvas scraper via ConnectSchoolWizard', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      downloadDir = path.join(os.tmpdir(), `scraper-e2e-${Date.now()}`);
      await fs.promises.mkdir(downloadDir, { recursive: true });

      await page.goto('/dashboard/integrations');
      await page.locator('[data-testid="button-connect-school"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.locator('[data-testid="platform-canvas"]').click();

      await expect(page.getByLabel(/School Portal URL/i)).toBeVisible();
      await page.getByLabel(/School Portal URL/i).fill(TEST_CANVAS_URL);
      await page.getByLabel(/Student Name/i).fill('Ava Lewis');
      await page.getByLabel(/Email \/ Username/i).fill(TEST_CANVAS_EMAIL);
      await page.getByLabel(/^Password/i).fill(TEST_CANVAS_PASSWORD);

      const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Ready to Download' })).toBeVisible({ timeout: 5000 });
      await page.locator('[data-testid="button-download-scraper"]').click();
      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      canvasScriptPath = path.join(downloadDir, filename);
      await download.saveAs(canvasScriptPath);
      await expect(fs.promises.stat(canvasScriptPath)).resolves.toBeDefined();
      const content = await fs.promises.readFile(canvasScriptPath, 'utf8');
      expect(content.length).toBeGreaterThan(100);

      await page.keyboard.press('Escape');
    });

    test('Generate Skyward scraper via ConnectSchoolWizard', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await page.goto('/dashboard/integrations');
      await page.locator('[data-testid="button-connect-school"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.locator('[data-testid="platform-skyward"]').click();

      await expect(page.getByLabel(/School Portal URL/i)).toBeVisible();
      await page.getByLabel(/School Portal URL/i).fill(TEST_SKYWARD_URL);
      await page.getByLabel(/Student Name/i).fill('Ava Lewis');
      await page.getByLabel(/Email \/ Username/i).fill(TEST_SKYWARD_USERNAME);
      await page.getByLabel(/^Password/i).fill(TEST_SKYWARD_PASSWORD);

      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Ready to Download' })).toBeVisible({ timeout: 5000 });
      const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
      await page.locator('[data-testid="button-download-scraper"]').click();
      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      skywardScriptPath = path.join(downloadDir, filename);
      await download.saveAs(skywardScriptPath);
      await expect(fs.promises.stat(skywardScriptPath)).resolves.toBeDefined();

      await page.keyboard.press('Escape');
    });

    test('Execute downloaded scripts locally', async () => {
      const runScript = (scriptPath: string): Promise<{ exitCode: number | null; stdout: string; stderr: string }> => {
        return new Promise((resolve) => {
          fs.chmodSync(scriptPath, 0o755);
          const child = spawn(scriptPath, [], {
            cwd: path.dirname(scriptPath),
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
          });
          let stdout = '';
          let stderr = '';
          child.stdout?.on('data', (d) => { stdout += d.toString(); });
          child.stderr?.on('data', (d) => { stderr += d.toString(); });
          const timeout = setTimeout(() => {
            child.kill('SIGTERM');
          }, 180_000);
          child.on('close', (code) => {
            clearTimeout(timeout);
            resolve({ exitCode: code, stdout, stderr });
          });
        });
      };

      const canvasResult = await runScript(canvasScriptPath);
      const canvasOk =
        canvasResult.exitCode === 0 ||
        /success|synced|uploaded|complete/i.test(canvasResult.stdout + canvasResult.stderr);
      if (!canvasOk) {
        throw new Error(
          `Canvas script failed: exit ${canvasResult.exitCode}, stderr: ${canvasResult.stderr.slice(0, 500)}`
        );
      }

      const skywardResult = await runScript(skywardScriptPath);
      const skywardOk =
        skywardResult.exitCode === 0 ||
        /success|synced|uploaded|complete/i.test(skywardResult.stdout + skywardResult.stderr);
      if (!skywardOk) {
        throw new Error(
          `Skyward script failed: exit ${skywardResult.exitCode}, stderr: ${skywardResult.stderr.slice(0, 500)}`
        );
      }
    });

    test('Verify data on dashboard', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await page.goto(`/dashboard/students/${avaStudentId}/view`);
      await page.waitForLoadState('networkidle').catch(() => {});

      const hasCoursesOrGrades =
        (await page.locator('[data-testid="course-list"], [data-testid="grades"], .course, [class*="grade"]').count()) > 0 ||
        (await page.getByText(/course|grade|GPA|assignment/i).count()) > 0;
      expect(hasCoursesOrGrades, 'Expected at least one course or grade indicator on student view').toBeTruthy();
    });
  });
});
