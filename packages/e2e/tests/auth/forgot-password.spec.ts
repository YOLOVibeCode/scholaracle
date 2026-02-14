import { test, expect } from '@playwright/test';
import { ForgotPasswordPage } from '../../pages/forgot-password.page';
import { LoginPage } from '../../pages/login.page';

test.describe('Forgot Password', () => {
  let forgotPasswordPage: ForgotPasswordPage;

  test.beforeEach(async ({ page }) => {
    forgotPasswordPage = new ForgotPasswordPage(page);
    await forgotPasswordPage.goto();
  });

  test('FORGOT-001: Should display forgot password form', async ({ page }) => {
    await expect(forgotPasswordPage.emailInput).toBeVisible();
    await expect(forgotPasswordPage.submitButton).toBeVisible();
    await expect(forgotPasswordPage.backToLoginLink).toBeVisible();
  });

  test('FORGOT-002: Should show success message after submitting email', async ({ page }) => {
    await forgotPasswordPage.submitEmail('user@example.com');
    await forgotPasswordPage.expectSuccess();
  });

  test('FORGOT-003: Should navigate to login from back link', async ({ page }) => {
    await forgotPasswordPage.backToLoginLink.click();
    await expect(page).toHaveURL('/login');
  });

  test('FORGOT-004: Should navigate to forgot-password from login page', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.forgotPasswordLink.click();
    await expect(page).toHaveURL('/forgot-password');
  });
});
