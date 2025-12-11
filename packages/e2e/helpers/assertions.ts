import { Page, expect } from '@playwright/test';

/**
 * Assertion helpers for E2E tests.
 */

/**
 * Assert user is on parent dashboard.
 */
export async function assertOnDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('h1, [data-testid="dashboard-header"]')).toBeVisible();
}

/**
 * Assert user is on admin dashboard.
 */
export async function assertOnAdminDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator('[data-testid="admin-header"], h1')).toBeVisible();
}

/**
 * Assert no console errors on page.
 */
export async function assertNoConsoleErrors(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  // Wait for page to settle
  await page.waitForLoadState('networkidle');
  
  if (errors.length > 0) {
    throw new Error(`CRITICAL: Console errors detected:\n${errors.join('\n')}`);
  }
}

/**
 * Assert page loads without crash.
 */
export async function assertPageLoadsWithoutCrash(page: Page, url: string): Promise<void> {
  const response = await page.goto(url);
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).toBeVisible();
}

/**
 * Assert element is visible by test ID.
 */
export async function assertElementVisible(page: Page, testId: string): Promise<void> {
  await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
}

/**
 * Assert toast message appears.
 */
export async function assertToastMessage(page: Page, message: string | RegExp): Promise<void> {
  await expect(page.locator('[data-testid="toast"], .toast, [role="alert"]')).toContainText(message);
}

/**
 * Assert error message is displayed.
 */
export async function assertErrorMessage(page: Page, message?: string | RegExp): Promise<void> {
  const errorLocator = page.locator('[data-testid="error-message"], .text-red-500, .text-destructive, [role="alert"]');
  await expect(errorLocator).toBeVisible();
  if (message) {
    await expect(errorLocator).toContainText(message);
  }
}

/**
 * Assert user is redirected to login.
 */
export async function assertRedirectedToLogin(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Assert user has access to admin page (not 403).
 */
export async function assertAdminAccess(page: Page, url: string): Promise<void> {
  const response = await page.goto(url);
  expect(response?.status()).not.toBe(403);
  expect(response?.status()).toBeLessThan(400);
}

/**
 * Assert user is denied access (403 or redirect).
 */
export async function assertAccessDenied(page: Page, url: string): Promise<void> {
  const response = await page.goto(url);
  const status = response?.status();
  if (status === 403) {
    // 403 is expected
    return;
  }
  // Or should redirect away from admin
  if (status === 200 && !page.url().includes('/admin')) {
    return;
  }
  throw new Error(`Expected access denied but got status ${status} at ${url}`);
}
