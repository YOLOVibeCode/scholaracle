/**
 * PlaywrightUX: Non-reference platform wizard with AI generation.
 *
 * Uses page.route() to mock the API so the test works without ANTHROPIC_API_KEY.
 * Exercises the full ConnectProviderWizard flow in bundle mode:
 *   platform selection -> details -> generation progress -> bundle -> download.
 */
import path from 'path';
import fs from 'fs';
import os from 'os';
import { test, expect } from '../fixtures/auth';

const MOCK_JOB_ID = 'mock-job-e2e-001';
const MOCK_SCRAPER_CODE = `
import { chromium } from 'playwright';
export default class PowerSchoolScraper {
  private config: Record<string, unknown> = {};
  async initialize(config: Record<string, unknown>) { this.config = config; }
  async authenticate() { return { success: true }; }
  async scrape() { return { courses: [{ id: 'c1', title: 'Math' }] }; }
  transform(raw: Record<string, unknown>) {
    return [{ op: 'upsert', entity: 'course', key: { provider: 'ps', adapterId: 'ps-browser', externalId: '1' }, observedAt: new Date().toISOString(), record: { title: 'Math' } }];
  }
  async cleanup() {}
}`;

test.describe('AI-generated scraper wizard', () => {
  test.setTimeout(60_000);

  let downloadDir: string;
  let pollCount: number;

  test.describe.serial('PowerSchool generation flow', () => {
    test('Full wizard: select platform -> fill details -> generate -> bundle download', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      downloadDir = path.join(os.tmpdir(), `scraper-ai-e2e-${Date.now()}`);
      await fs.promises.mkdir(downloadDir, { recursive: true });
      pollCount = 0;

      // Mock generate-scraper API: return a job ID (non-reference triggers async generation)
      await page.route('**/api/integrations/generate-scraper', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            scraperId: null,
            jobId: MOCK_JOB_ID,
            platformName: 'PowerSchool',
            fromCache: false,
            status: 'queued',
          }),
        });
      });

      // Mock generate-status polling: simulate step progression
      await page.route('**/api/integrations/generate-status**', async (route) => {
        pollCount++;
        const steps = [
          { name: 'connect', status: pollCount >= 1 ? 'complete' as const : 'in_progress' as const, details: null },
          { name: 'crawl', status: pollCount >= 2 ? 'complete' as const : 'in_progress' as const, details: null },
          { name: 'authenticate_check', status: pollCount >= 3 ? 'complete' as const : (pollCount >= 2 ? 'in_progress' as const : 'pending' as const), details: null },
          { name: 'generate', status: pollCount >= 4 ? 'complete' as const : (pollCount >= 3 ? 'in_progress' as const : 'pending' as const), details: null },
          { name: 'validate', status: pollCount >= 5 ? 'complete' as const : (pollCount >= 4 ? 'in_progress' as const : 'pending' as const), details: null },
        ];
        const isReady = pollCount >= 5;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            jobId: MOCK_JOB_ID,
            status: isReady ? 'ready' : 'generating',
            platformName: 'PowerSchool',
            loginUrl: 'https://powerschool.example.com/public',
            steps,
            result: isReady ? {
              scraperId: 'mock-scraper-id',
              scraperCode: MOCK_SCRAPER_CODE,
            } : undefined,
          }),
        });
      });

      // Mock bundle download: return a .command file
      await page.route('**/api/integrations/scraper-download', async (route) => {
        const script = `#!/bin/bash
# Scholaracle Scraper for PowerSchool (mock)
echo "Scholaracle PowerSchool Scraper"
APP_DIR="$HOME/.scholaracle-scraper/app-powerschool"
mkdir -p "$APP_DIR"
cat > "$APP_DIR/scraper.ts" << 'EOF'
${MOCK_SCRAPER_CODE}
EOF
cat > "$APP_DIR/run.js" << 'EOF'
console.log("run.js loaded");
EOF
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

      // Navigate to integrations and open the wizard
      await page.goto('/dashboard/integrations');
      await page.locator('[data-testid="button-connect-school"]').click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Select PowerSchool (non-reference, triggers AI generation)
      await page.locator('[data-testid="platform-powerschool"]').click();

      // Fill credentials
      await expect(page.getByLabel(/School portal URL/i)).toBeVisible();
      await page.getByLabel(/School portal URL/i).fill('https://powerschool.example.com/public');
      await page.getByLabel(/Student name/i).fill('Test Student');
      await page.getByLabel(/^Username$/i).fill('parent@example.com');
      await page.getByLabel(/^Password$/i).fill('testpass');

      // Click "Generate Scraper" (non-reference button text)
      await page.getByRole('button', { name: 'Generate Scraper' }).click();

      // Verify generation progress screen appears
      await expect(page.getByRole('heading', { name: 'Creating Your Scraper' })).toBeVisible({ timeout: 5000 });

      // Wait for wizard to close (generation completes → added to bundle → onConnectionReady fires → dialog closes)
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 30000 });

      // Verify platform appears in the bundle with "Ready" badge
      await expect(page.getByText('Ready')).toBeVisible({ timeout: 5000 });

      // Download the bundle script
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
      await page.locator('[data-testid="button-download-bundle"]').click();
      const download = await downloadPromise;

      const filename = download.suggestedFilename();
      expect(filename).toMatch(/bundle|powerschool/i);
      const downloadPath = path.join(downloadDir, filename);
      await download.saveAs(downloadPath);

      const content = await fs.promises.readFile(downloadPath, 'utf8');
      expect(content).toContain('#!/bin/bash');
      expect(content).toContain('Scholaracle');
      expect(content).toContain('scraper.ts');
      expect(content).toContain('run.js');

      // Verify poll count indicates progress was shown
      expect(pollCount).toBeGreaterThanOrEqual(5);
    });
  });
});
