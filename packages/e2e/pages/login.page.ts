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
  readonly forgotPasswordLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('[data-testid="input-email"]');
    this.passwordInput = page.locator('[data-testid="input-password"]');
    this.loginButton = page.locator('[data-testid="button-login"]');
    this.errorMessage = page.locator(
      '[data-testid="message-error"], .text-red-500, .text-destructive, .bg-red-50'
    );
    this.registerLink = page.locator('[data-testid="link-register"], a[href="/register"]');
    this.forgotPasswordLink = page.locator(
      '[data-testid="link-forgot-password"], a[href="/forgot-password"]'
    );
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async login(
    email: string,
    password: string,
    options?: { readonly waitForDashboard?: boolean }
  ): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);

    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/auth/login') && r.request().method() === 'POST'
    );

    await this.loginButton.click();

    const response = await responsePromise;

    if (options?.waitForDashboard ?? true) {
      expect(response.status()).toBeLessThan(400);
      await this.page.waitForURL(/\/dashboard/);
    }
  }

  async expectError(message?: string | RegExp, timeoutMs?: number): Promise<void> {
    await expect(this.errorMessage).toBeVisible({ timeout: timeoutMs });
    if (message !== undefined) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectOnLoginPage(): Promise<void> {
    await expect(this.page).toHaveURL('/login');
    await expect(this.emailInput).toBeVisible();
  }
}
