import { test, expect } from '@playwright/test';
import { assertNoConsoleErrors, assertPageLoadsWithoutCrash } from '../helpers/assertions';

/**
 * Layer 0: Critical Infrastructure Tests
 *
 * These tests verify the absolute minimum - can users reach the app?
 *
 * Configuration:
 * - Serial execution
 * - Stop on first failure
 * - 30 second timeout
 * - No retries
 *
 * If these fail → STOP ALL TESTS IMMEDIATELY
 */
test.describe('@critical Layer 0: Critical Infrastructure', () => {
  test.describe.configure({ mode: 'serial' });

  test('CRIT-001: App loads without crash', async ({ page }) => {
    // Capture console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to home page
    const response = await page.goto('/');

    // Verify response is successful
    expect(response?.status()).toBeLessThan(500);

    // Verify page loads
    await expect(page.locator('body')).toBeVisible();

    // Wait for page to settle
    await page.waitForLoadState('networkidle');

    // Check for console errors
    if (errors.length > 0) {
      throw new Error(`CRITICAL: Console errors detected:\n${errors.join('\n')}`);
    }
  });

  test('CRIT-002: Login page accessible', async ({ page }) => {
    await assertPageLoadsWithoutCrash(page, '/login');

    // Verify login form elements are present (using stable data-testid selectors)
    await expect(page.locator('[data-testid="input-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="button-login"]')).toBeVisible();
  });

  test('CRIT-003: API health check', async ({ request }) => {
    // Support production URLs via environment variable
    // Local: http://localhost:2801 (FIXED PORT)
    // Production: https://api.scholarmancy.com (or set API_BASE_URL)
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:2801';
    const response = await request.get(`${apiBaseUrl}/api/health`);

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body.status).toBe('ok');
  });
});
