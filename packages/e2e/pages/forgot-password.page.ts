import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the Forgot Password page.
 */
export class ForgotPasswordPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;
  readonly backToLoginLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('[data-testid="input-email"]');
    this.submitButton = page.locator('[data-testid="button-submit-forgot"]');
    this.errorMessage = page.locator('[data-testid="message-error"]');
    this.successMessage = page.locator('[data-testid="message-success"]');
    this.backToLoginLink = page.locator('[data-testid="link-back-to-login"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/forgot-password');
  }

  async submitEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
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
