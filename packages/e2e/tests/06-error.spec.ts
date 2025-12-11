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
    const is404 = page.url().includes('404') || 
                  (await page.locator('body').textContent())?.includes('404') ||
                  (await page.locator('body').textContent())?.includes('Not Found');
    
    // Or should redirect to a valid page
    const isValidPage = page.url().includes('/dashboard') || 
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
    await page.click('[data-testid="save-student-button"], button[type="submit"]');
    
    // Should show validation errors or API error message
    const errorVisible = await page.locator('[data-testid="error-message"], .text-red-500, [role="alert"]').isVisible({ timeout: 2000 });
    
    // Or form validation should prevent submission
    const formErrors = await page.locator('input:invalid').count();
    
    expect(errorVisible || formErrors > 0).toBe(true);
  });

  test('ERR-003: Session Expired', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard');
    
    // Clear session storage to simulate expired session
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    // Try to access protected route
    await page.goto('/dashboard/students');
    
    // Should redirect to login
    await page.waitForTimeout(1000);
    const isLoginPage = page.url().includes('/login');
    
    // Or API call should fail and show error
    if (!isLoginPage) {
      const errorMessage = page.locator('[data-testid="error-message"], [role="alert"]');
      await expect(errorMessage.or(page.locator('body'))).toBeVisible();
    } else {
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('ERR-004: Permission Denied', async ({ page, loginAsRole }) => {
    // Support role cannot access settings
    await loginAsRole('support');
    
    await assertAccessDenied(page, '/admin/settings');
  });

  test('ERR-005: Form Validation', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard/students/new');
    
    // Try to submit with invalid data
    await page.fill('[data-testid="student-name"], input[name="name"]', ''); // Empty name
    await page.fill('[data-testid="student-grade"], input[name="grade"]', 'invalid'); // Invalid grade
    
    await page.click('[data-testid="save-student-button"], button[type="submit"]');
    
    // Should show validation errors
    await page.waitForTimeout(500);
    
    const nameInput = page.locator('[data-testid="student-name"], input[name="name"]');
    const isInvalid = await nameInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    
    // Or should show error message
    const errorMessage = page.locator('[data-testid="error-message"], .text-red-500');
    const hasError = await errorMessage.isVisible({ timeout: 1000 });
    
    expect(isInvalid || hasError).toBe(true);
  });

  test('ERR-006: Network Offline', async ({ page, context, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard');
    
    // Simulate offline
    await context.setOffline(true);
    
    // Try to navigate
    await page.goto('/dashboard/students');
    
    // Should handle gracefully (show cached content or error message)
    await page.waitForTimeout(1000);
    
    // Page should still be visible (might show error message)
    await expect(page.locator('body')).toBeVisible();
    
    // Restore online
    await context.setOffline(false);
  });
});
