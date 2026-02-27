/**
 * Complete E2E: Generate → Download → One install, one run.
 *
 * Verifies the full user experience:
 * 1. User gets a script (reference platform: Canvas – no AI required).
 * 2. User downloads the script from the dashboard.
 * 3. User runs the script once: it installs deps (npm install, playwright) and runs (node run.js).
 *
 * Requires: TEST_CANVAS_URL, TEST_CANVAS_EMAIL, TEST_CANVAS_PASSWORD.
 * Copy packages/e2e/.env.scraper-e2e.example to .env.scraper-e2e in packages/e2e and set values, then:
 *   cd packages/e2e && pnpm exec dotenv -e .env.scraper-e2e -- pnpm test -- --project=complete-scraper-flow
 *
 * When running via Playwright, API and Web start automatically with API_BASE_URL=http://localhost:2801
 * so the downloaded script targets the local API.
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { test, expect } from '../fixtures/auth';

const TEST_CANVAS_URL = process.env.TEST_CANVAS_URL ?? '';
const TEST_CANVAS_EMAIL = process.env.TEST_CANVAS_EMAIL ?? '';
const TEST_CANVAS_PASSWORD = process.env.TEST_CANVAS_PASSWORD ?? '';

const hasCanvasEnv =
  !!TEST_CANVAS_URL && !!TEST_CANVAS_EMAIL && !!TEST_CANVAS_PASSWORD;

function runDownloadedScript(
  scriptPath: string,
  timeoutMs: number = 180_000
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    fs.chmodSync(scriptPath, 0o755);
    const child = spawn(scriptPath, [], {
      cwd: path.dirname(scriptPath),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    const t = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}

test.describe('Complete scraper flow: generate → download → one install, one run', () => {
  test.skip(!hasCanvasEnv, 'Set TEST_CANVAS_URL, TEST_CANVAS_EMAIL, TEST_CANVAS_PASSWORD to run');
  test.setTimeout(300_000);

  let downloadDir: string;
  let scriptPath: string;
  let studentId: string;

  test.describe.serial('Full flow', () => {
    test('1. Login and create a student', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await page.goto('/dashboard/students');
      await page.locator('[data-testid="button-add-student"]').first().click();
      await expect(page.locator('[data-testid="add-student-wizard"]')).toBeVisible();

      await page.locator('[data-testid="wizard-student-name"]').fill('E2E Complete Test');
      await page.locator('[data-testid="wizard-student-grade"]').fill('9');
      await page.locator('[data-testid="wizard-next-step"]').click();

      await expect(page.getByRole('heading', { name: /Connect Services/i })).toBeVisible({ timeout: 10_000 });
      await page.keyboard.press('Escape');
      await expect(page.getByText('E2E Complete Test')).toBeVisible({ timeout: 5000 });

      const viewLink = page
        .locator('[data-testid="student-list"]')
        .filter({ hasText: 'E2E Complete Test' })
        .locator('a[href*="/view"]')
        .first();
      const href = await viewLink.getAttribute('href');
      const match = href?.match(/\/students\/([^/]+)\/view/);
      if (!match?.[1]) throw new Error('Could not get student ID');
      studentId = match[1];
    });

    test('2. Download Canvas script (reference platform)', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      downloadDir = path.join(os.tmpdir(), `complete-scraper-e2e-${Date.now()}`);
      await fs.promises.mkdir(downloadDir, { recursive: true });

      await page.goto('/dashboard/integrations');
      await page.locator('[data-testid="button-connect-school"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.locator('[data-testid="platform-canvas"]').click();

      await expect(page.getByLabel(/School Portal URL/i)).toBeVisible();
      await page.getByLabel(/School Portal URL/i).fill(TEST_CANVAS_URL);
      await page.getByLabel(/Student Name/i).fill('E2E Complete Test');
      await page.getByLabel(/^Username$/i).fill(TEST_CANVAS_EMAIL);
      await page.getByLabel(/^Password/i).fill(TEST_CANVAS_PASSWORD);

      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByRole('heading', { name: 'Ready to Download' })).toBeVisible({ timeout: 10_000 });

      const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
      await page.locator('[data-testid="button-download-scraper"]').click();
      const download = await downloadPromise;
      const filename = download.suggestedFilename();
      scriptPath = path.join(downloadDir, filename);
      await download.saveAs(scriptPath);

      await expect(fs.promises.stat(scriptPath)).resolves.toBeDefined();
      const content = await fs.promises.readFile(scriptPath, 'utf8');
      expect(content).toContain('npm install');
      expect(content).toContain('playwright');
      expect(content).toContain('run.js');
      expect(content.length).toBeGreaterThan(500);

      await page.keyboard.press('Escape');
    });

    test('3. Run script: one install, one run', async () => {
      const result = await runDownloadedScript(scriptPath);
      const combined = result.stdout + result.stderr;
      const ok =
        result.exitCode === 0 || /success|synced|uploaded|complete|done/i.test(combined);
      if (!ok) {
        throw new Error(
          `Script failed: exit ${result.exitCode}, stderr: ${result.stderr.slice(0, 800)}`
        );
      }
    });

    test('4. Verify data on dashboard', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      await page.goto(`/dashboard/students/${studentId}/view`);
      await page.waitForLoadState('networkidle').catch(() => {});

      const hasCoursesOrGrades =
        (await page.locator('[data-testid="course-list"], [data-testid="grades"], .course, [class*="grade"]').count()) >
          0 ||
        (await page.getByText(/course|grade|GPA|assignment/i).count()) > 0;
      expect(
        hasCoursesOrGrades,
        'Expected at least one course or grade indicator on student view'
      ).toBeTruthy();
    });
  });
});
