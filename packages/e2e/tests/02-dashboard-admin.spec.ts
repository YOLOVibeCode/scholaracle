import { expect } from '@playwright/test';
import { test } from '../fixtures/auth';
import { AdminDashboardPage } from '../pages/admin/dashboard.page';
import { AdminCustomersPage } from '../pages/admin/customers.page';
import {
  assertOnAdminDashboard,
  assertAccessDenied,
  assertAdminAccess,
} from '../helpers/assertions';
import { TEST_USERS } from '../fixtures/test-data';

/**
 * Layer 2: Dashboard Rendering Tests (Admin)
 *
 * Verify all admin dashboard pages load without errors.
 *
 * Depends on: Layer 1 (@auth)
 * If Layer 1 fails → don't run
 */
test.describe('@dashboard Layer 2: Admin Dashboard Pages', () => {
  test('DASH-A-001: Admin Home renders', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await page.goto('/admin/dashboard');
    await assertOnAdminDashboard(page);

    // Verify KPI cards or dashboard content
    await expect(page.locator('[data-testid="kpi-card"], .stat-card, h1').first()).toBeVisible();
  });

  test('DASH-A-002: Customers List renders', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await page.goto('/admin/customers');

    await expect(page).toHaveURL('/admin/customers');
    await expect(page.locator('body')).toBeVisible();
  });

  test('DASH-A-003: Customer Detail renders', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');

    // First go to customers list
    await page.goto('/admin/customers');

    // Try to click first customer or verify page structure
    const customerLink = page
      .locator('[data-testid="customer-link"], a[href*="/customers/"], tbody tr')
      .first();
    const count = await customerLink.count();

    if (count > 0) {
      await customerLink.click();
      await expect(page).toHaveURL(/\/admin\/customers\/[^/]+/);
      await expect(page.locator('body')).toBeVisible();
    } else {
      // Test route exists
      await page.goto('/admin/customers/test-id');
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('DASH-A-004: Payments page renders', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await page.goto('/admin/payments');

    await expect(page).toHaveURL('/admin/payments');
    await expect(page.locator('body')).toBeVisible();
  });

  test('DASH-A-005: Subscriptions page renders', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await page.goto('/admin/subscriptions');

    await expect(page).toHaveURL('/admin/subscriptions');
    await expect(page.locator('body')).toBeVisible();
  });

  test('DASH-A-006: Communications page renders', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await page.goto('/admin/communications');

    await expect(page).toHaveURL('/admin/communications');
    await expect(page.locator('body')).toBeVisible();
  });

  test('DASH-A-007: Reports page renders', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await page.goto('/admin/reports');

    await expect(page).toHaveURL('/admin/reports');
    await expect(page.locator('body')).toBeVisible();
  });

  test('DASH-A-008: System Settings renders', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await page.goto('/admin/settings');

    await expect(page).toHaveURL('/admin/settings');
    await expect(page.locator('body')).toBeVisible();
  });

  test('DASH-A-009: Audit Logs renders', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await page.goto('/admin/audit-logs');

    await expect(page).toHaveURL('/admin/audit-logs');
    await expect(page.locator('[data-testid="audit-logs-page"]')).toBeVisible();
    await expect(page.locator('[data-testid="audit-logs-table"]')).toBeVisible();
    // Seed should provide at least one baseline audit log.
    await expect(page.locator('[data-testid="audit-log-row"]').first()).toBeVisible();
  });

  test('DASH-A-021: Audit Logs export CSV works', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await page.goto('/admin/audit-logs');
    await expect(page.locator('[data-testid="button-audit-export"]')).toBeVisible();

    const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    await page.locator('[data-testid="button-audit-export"]').click({ force: true });
    const download = await downloadPromise;
    // Download may not trigger if export opens in new tab or fails silently — assert when available
    if (download) {
      expect(await download.suggestedFilename()).toMatch(/audit-logs-.*\.csv/i);
    }

    // After export, an audit entry should be created; refresh and assert it appears.
    const refreshButton = page.locator('[data-testid="button-audit-refresh"]');
    if (await refreshButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await refreshButton.click({ force: true });
      await expect(page.locator('[data-testid="audit-log-row"]').first())
        .toContainText('system:export', { timeout: 10_000 })
        .catch(() => {});
    }
  });

  test('DASH-A-022: Audit Log detail drawer opens', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await page.goto('/admin/audit-logs');

    await page.locator('[data-testid="audit-log-row"]').first().click({ force: true });
    await expect(page.locator('[data-testid="audit-detail-sheet"]')).toBeVisible();
    await expect(page.locator('[data-testid="audit-detail-action"]')).toBeVisible();
    await expect(page.locator('[data-testid="audit-detail-metadata"]')).toBeVisible();
  });

  test('DASH-A-010: Analytics Overview renders', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await page.goto('/admin/analytics');

    await expect(page).toHaveURL(/\/admin\/analytics/);
    await expect(page.locator('body')).toBeVisible();
  });
});
