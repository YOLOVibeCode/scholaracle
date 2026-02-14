import { test, expect } from '@playwright/test';
import { ResetPasswordPage } from '../../pages/reset-password.page';

test.describe('Reset Password', () => {
  test('RESET-001: Should show error when token is missing', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.locator('[data-testid="message-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-error"]')).toContainText(/invalid|missing/i);
  });

  test('RESET-002: Should show error when token is invalid', async ({ page }) => {
    const resetPage = new ResetPasswordPage(page);
    await resetPage.goto('invalid-token-12345');
    await expect(page.locator('[data-testid="input-new-password"]')).toBeVisible();
    await resetPage.submitNewPassword('NewPass123!');
    await resetPage.expectError();
  });

  test('RESET-003: Should have back to login link', async ({ page }) => {
    await page.goto('/reset-password?token=any');
    await page.locator('[data-testid="link-back-to-login"]').click();
    await expect(page).toHaveURL('/login');
  });
});
