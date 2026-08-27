import { devices } from '@playwright/test';
import { test, expect, login, loginStudent } from '../fixtures/auth';
import { DEMO_USERS } from '../fixtures/test-data';
import { assertOnDashboard, assertOnStudio } from '../helpers/assertions';

/**
 * Phone-width student studio: Emma’s Today → hosted PDF in-page → blob Download → cache hit.
 * Parent and student sessions stay on their own homes.
 *
 * Depends on: Layer 0 (@critical)
 * Requires POST /api/seed/demo (not /reset — that would wipe a shared local DB).
 */
const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:2801';

function isRemoteApi(apiBaseUrl: string): boolean {
  try {
    const host = new URL(apiBaseUrl).hostname.toLowerCase();
    return (
      host === 'api.scholarmancy.com' ||
      host === 'staging-api.scholarmancy.com' ||
      host.endsWith('.railway.app')
    );
  } catch {
    return false;
  }
}

test.describe('@studio Student studio (phone-width)', () => {
  test.beforeAll(async ({ request }) => {
    if (isRemoteApi(API_BASE)) {
      return;
    }
    const res = await request.post(`${API_BASE}/api/seed/demo`);
    expect(res.status(), await res.text()).toBe(200);
  });

  test.beforeEach(() => {
    test.skip(isRemoteApi(API_BASE), 'Demo student household is seeded only on local/UAT');
  });

  test('STUDIO-001: Emma opens the worksheet PDF in-page as a blob; second open is also cached', async ({
    page,
  }) => {
    await loginStudent(page, DEMO_USERS.emma.email, DEMO_USERS.emma.password);
    await assertOnStudio(page);

    await expect(page.locator('[data-testid="studio-today"]')).toBeVisible();
    await expect(page.locator('[data-testid="studio-encouragement"]')).toBeVisible();
    await expect(page.locator('[data-testid="studio-primary-cta"]')).toHaveText('Open worksheet');
    await expect(page.locator('[data-testid="studio-today"]')).not.toContainText(/GPA/i);
    await expect(page.locator('[data-testid="studio-also-today"]')).toContainText('Unit 9 Homework');

    await page.locator('[data-testid="studio-primary-cta"]').click({ force: true });
    await expect(page.locator('[data-testid="studio-pack-page"]')).toBeVisible();
    const packCta = page.locator('[data-testid="studio-pack-primary-cta"]');
    await expect(packCta).toHaveText('Open formulas.pdf');

    await packCta.click({ force: true });
    const viewer = page.locator('[data-testid="studio-asset-viewer"]');
    await expect(viewer).toBeVisible({ timeout: 15000 });
    await expect(viewer).toHaveAttribute('data-viewer-kind', 'pdf');
    // Default offline pre-warms the cache, so the first open may already be from cache.
    // Assert bytes are served as a blob URL regardless.
    await expect(page.locator('[data-testid="studio-asset-download"]')).toHaveAttribute(
      'href',
      /^blob:/
    );

    // Second open is always cached (either warm from auto-save or from first-open fetch).
    await packCta.click({ force: true });
    await expect(viewer).toHaveAttribute('data-from-cache', 'true');
  });

  test('STUDIO-003: default offline — auto-save on load → go offline → PDF opens from cache', async ({
    page,
    context,
  }) => {
    await loginStudent(page, DEMO_USERS.emma.email, DEMO_USERS.emma.password);
    await assertOnStudio(page);

    // Default offline: the pack is auto-saved in the background on every studio load.
    // Wait for the auto-save to complete (data-save-state transitions idle → saving → saved).
    const saveIndicator = page.locator('[data-testid="studio-offline-save-btn"]');
    await expect(saveIndicator).toHaveAttribute('data-save-state', 'saved', { timeout: 30_000 });

    // Saved-at badge should appear
    await expect(page.locator('[data-testid="studio-offline-status"]')).toBeVisible();

    // Navigate to the work pack while still online (SSR still reachable)
    await page.locator('[data-testid="studio-primary-cta"]').click({ force: true });
    await expect(page.locator('[data-testid="studio-pack-page"]')).toBeVisible({ timeout: 15_000 });

    // Now go offline — the page is already rendered in the browser
    await context.setOffline(true);

    // Open the PDF — bytes were pre-fetched into Cache Storage during auto-save; no network needed
    const packCta = page.locator('[data-testid="studio-pack-primary-cta"]');
    await packCta.click({ force: true });
    const viewer = page.locator('[data-testid="studio-asset-viewer"]');
    await expect(viewer).toBeVisible({ timeout: 15_000 });
    await expect(viewer).toHaveAttribute('data-from-cache', 'true');
  });

  test('STUDIO-002: parent and student sessions stay on their own homes', async ({ browser }) => {
    const parentContext = await browser.newContext(devices['iPhone 13']);
    const studentContext = await browser.newContext(devices['iPhone 13']);
    const parentPage = await parentContext.newPage();
    const studentPage = await studentContext.newPage();

    try {
      await login(parentPage, DEMO_USERS.parent.email, DEMO_USERS.parent.password);
      await assertOnDashboard(parentPage);
      await parentPage.goto('/studio');
      await expect(parentPage).toHaveURL(/\/dashboard/);

      await loginStudent(studentPage, DEMO_USERS.emma.email, DEMO_USERS.emma.password);
      await assertOnStudio(studentPage);
      await studentPage.goto('/dashboard');
      await expect(studentPage).toHaveURL(/\/studio/);
      await expect(studentPage.locator('[data-testid="studio-today"]')).toBeVisible();
    } finally {
      await parentContext.close();
      await studentContext.close();
    }
  });
});
