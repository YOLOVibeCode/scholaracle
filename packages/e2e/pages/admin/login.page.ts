import { type Page, type Locator, expect } from '@playwright/test';
import speakeasy from 'speakeasy';
import { E2E_MFA_SECRET } from '../../fixtures/test-data';

/**
 * Page Object for the Admin Login page.
 */
export class AdminLoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly errorMessage: Locator;
  readonly mfaInput: Locator;
  readonly verifyMfaButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator(
      '[data-testid="input-admin-email"], input#email, input[name="email"], input[type="email"]'
    );
    this.passwordInput = page.locator(
      '[data-testid="input-admin-password"], input#password, input[name="password"], input[type="password"]'
    );
    this.loginButton = page.locator(
      'button[type="submit"], [data-testid="button-login"], button:has-text("Sign in")'
    );
    this.errorMessage = page.locator(
      '[data-testid="message-error"], .text-red-500, .text-destructive, .bg-red-50'
    );
    this.mfaInput = page.locator('[data-testid="input-mfa-code"]');
    this.verifyMfaButton = page.locator('[data-testid="button-verify-mfa"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/login');
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);

    const responsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/admin/auth/login') && r.request().method() === 'POST'
    );

    await this.loginButton.click();

    await responsePromise;
  }

  /**
   * Login and complete MFA verification using the known E2E TOTP secret.
   */
  async loginWithMFA(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);

    const loginResponsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/admin/auth/login') && r.request().method() === 'POST'
    );

    await this.loginButton.click();

    const loginResponse = await loginResponsePromise;

    if (loginResponse.status() < 400) {
      await this.page.waitForURL(/\/admin(\/dashboard)?$/);
      return;
    }

    await expect(this.mfaInput).toBeVisible();

    const totp = speakeasy.totp({ secret: E2E_MFA_SECRET, encoding: 'base32' });

    const mfaResponsePromise = this.page.waitForResponse(
      (r) => r.url().includes('/admin/auth/mfa/verify') && r.request().method() === 'POST'
    );

    await this.mfaInput.fill(totp);
    await this.verifyMfaButton.click();

    const mfaResponse = await mfaResponsePromise;
    expect(mfaResponse.status()).toBeLessThan(400);

    await this.page.waitForURL(/\/admin(\/dashboard)?$/);
  }

  async expectError(message?: string | RegExp, timeoutMs?: number): Promise<void> {
    await expect(this.errorMessage).toBeVisible({ timeout: timeoutMs });
    if (message !== undefined) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectOnLoginPage(): Promise<void> {
    await expect(this.page).toHaveURL('/admin/login');
    await expect(this.emailInput).toBeVisible();
  }
}
