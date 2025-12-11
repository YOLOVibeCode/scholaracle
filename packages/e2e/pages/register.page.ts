import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the Register page.
 */
export class RegisterPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly nameInput: Locator;
  readonly passwordInput: Locator;
  readonly registerButton: Locator;
  readonly errorMessage: Locator;
  readonly loginLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('[data-testid="email-input"], input[name="email"]');
    this.nameInput = page.locator('[data-testid="name-input"], input[name="name"]');
    this.passwordInput = page.locator('[data-testid="password-input"], input[name="password"]');
    this.registerButton = page.locator('[data-testid="register-button"], button[type="submit"]');
    this.errorMessage = page.locator('[data-testid="error-message"], .text-red-500, .text-destructive');
    this.loginLink = page.locator('[data-testid="login-link"], a[href="/login"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/register');
  }

  async register(email: string, name: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.nameInput.fill(name);
    await this.passwordInput.fill(password);
    await this.registerButton.click();
  }

  async expectError(message?: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectOnRegisterPage(): Promise<void> {
    await expect(this.page).toHaveURL('/register');
    await expect(this.emailInput).toBeVisible();
  }
}


