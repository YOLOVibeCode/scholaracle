import { test, expect } from '../fixtures/auth';
import { assertErrorMessage, assertAccessDenied } from '../helpers/assertions';

/**
 * Layer 6: Error Handling Tests
 *
 * App handles edge cases gracefully.
 *
 * Depends on: Layer 5 (@integration)
 * If Layer 5 fails → don't run
 */
test.describe('@error Layer 6: Error Handling', () => {
  test('ERR-001: 404 Page displays', async ({ page }) => {
    await page.goto('/nonexistent-page');

    // Should show 404 page or redirect
    const is404 =
      page.url().includes('404') ||
      (await page.locator('body').textContent())?.includes('404') ||
      (await page.locator('body').textContent())?.includes('Not Found');

    // Or should redirect to a valid page
    const isValidPage =
      page.url().includes('/dashboard') ||
      page.url().includes('/login') ||
      page.url().includes('/admin');

    expect(is404 || isValidPage).toBe(true);
    await expect(page.locator('body')).toBeVisible();
  });

  test('ERR-002: API Error Display', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');

    // Try to trigger an API error (e.g., invalid form submission)
    await page.goto('/dashboard/students/new');

    // Submit empty form
    await page.click('[data-testid="button-save-student"], button[type="submit"]');

    // Should show validation errors or API error message
    const errorVisible = await page
      .locator('[data-testid="message-error"], .text-red-500, [role="alert"]')
      .isVisible({ timeout: 2000 });

    // Or form validation should prevent submission
    const formErrors = await page.locator('input:invalid').count();

    expect(errorVisible || formErrors > 0).toBe(true);
  });

  test('ERR-003: Session Expired', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard');

    // Clear session storage + auth cookie to simulate expired session
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie = 'auth_token=; path=/; max-age=0';
    });

    // Try to access protected route
    await page.goto('/dashboard/students');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('ERR-004: Permission Denied (non-admin)', async ({ page }) => {
    // Non-admin users cannot access admin routes
    await page.goto('/admin/settings');

    // Should redirect to login or show 403
    await page.waitForTimeout(600);
    const is403 =
      page.url().includes('403') || (await page.locator('body').textContent())?.includes('403');
    const isRedirected = !page.url().includes('/admin/settings');

    expect(is403 || isRedirected).toBe(true);
  });

  test('ERR-005: Form Validation', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard/students/new');

    // Try to submit with invalid data
    await page.fill('[data-testid="input-student-name"], input[name="name"]', ''); // Empty name
    await page.fill('[data-testid="input-student-grade"], input[name="grade"]', '99'); // Out of range

    await page.click('[data-testid="button-save-student"], button[type="submit"]');

    // Should show validation errors
    await page.waitForTimeout(500);

    // Native form validation should mark invalid fields
    const invalidCount = await page.locator('input:invalid').count();
    expect(invalidCount).toBeGreaterThan(0);
  });

  test('ERR-006: Network Offline', async ({ page, context, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard');

    // Simulate offline
    await context.setOffline(true);

    try {
      // Navigation should fail while offline
      await page.goto('/dashboard/students');
      throw new Error('Expected navigation to fail while offline');
    } catch (error) {
      expect(String(error)).toContain('ERR_INTERNET_DISCONNECTED');
      await expect(page.locator('body')).toBeVisible();
    } finally {
      // Restore online
      await context.setOffline(false);
    }
  });
});
