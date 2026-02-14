import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the Reset Password page (with token in URL).
 */
export class ResetPasswordPage {
  readonly page: Page;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly backToLoginLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newPasswordInput = page.locator('[data-testid="input-new-password"]');
    this.confirmPasswordInput = page.locator('[data-testid="input-confirm-password"]');
    this.submitButton = page.locator('[data-testid="button-submit-reset"]');
    this.errorMessage = page.locator('[data-testid="message-error"]');
    this.successMessage = page.locator('[data-testid="message-success"]');
    this.backToLoginLink = page.locator('[data-testid="link-back-to-login"]');
  }

  async goto(token: string): Promise<void> {
    await this.page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
  }

  async submitNewPassword(newPassword: string): Promise<void> {
    await this.newPasswordInput.fill(newPassword);
    await this.confirmPasswordInput.fill(newPassword);
    await this.submitButton.click();
  }

  async expectSuccess(): Promise<void> {
    await expect(this.successMessage).toBeVisible();
  }

  async expectError(message?: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }
}
