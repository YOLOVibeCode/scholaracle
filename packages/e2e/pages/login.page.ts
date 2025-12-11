import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the Login page.
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;
  readonly registerLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input#email, [data-testid="email-input"], input[name="email"], input[type="email"]');
    this.passwordInput = page.locator('input#password, [data-testid="password-input"], input[name="password"], input[type="password"]');
    this.loginButton = page.locator('button[type="submit"], [data-testid="login-button"], button:has-text("Sign in")');
    this.errorMessage = page.locator('[data-testid="error-message"], .text-red-500, .text-destructive, .bg-red-50');
    this.registerLink = page.locator('a[href="/register"], [data-testid="register-link"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async expectError(message?: string): Promise<void> {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectOnLoginPage(): Promise<void> {
    await expect(this.page).toHaveURL('/login');
    await expect(this.emailInput).toBeVisible();
  }
}


