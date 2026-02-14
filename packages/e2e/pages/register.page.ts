import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the Register page.
 */
export class RegisterPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly nameInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly termsConsentCheckbox: Locator;
  readonly smsConsentCheckbox: Locator;
  readonly registerButton: Locator;
  readonly errorMessage: Locator;
  readonly loginLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('[data-testid="input-email"], input[name="email"]');
    this.nameInput = page.locator('[data-testid="input-name"], input[name="name"]');
    this.passwordInput = page.locator('[data-testid="input-password"], input[name="password"]');
    this.confirmPasswordInput = page.locator(
      '[data-testid="input-confirm-password"], input[name="confirmPassword"], input#confirmPassword'
    );
    this.termsConsentCheckbox = page.locator('[data-testid="terms-consent-checkbox"]');
    this.smsConsentCheckbox = page.locator('[data-testid="sms-consent-checkbox"]');
    this.registerButton = page.locator('[data-testid="button-register"], button[type="submit"]');
    this.errorMessage = page.locator('[data-testid="message-error"], .text-red-500, .text-destructive');
    this.loginLink = page.locator('[data-testid="link-login"], a[href="/login"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/register');
  }

  async register(email: string, name: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.nameInput.fill(name);
    await this.passwordInput.fill(password);
    if ((await this.confirmPasswordInput.count()) > 0) {
      await this.confirmPasswordInput.fill(password);
    }
    // Check terms consent (required by the form)
    if ((await this.termsConsentCheckbox.count()) > 0) {
      await this.termsConsentCheckbox.check({ force: true });
    }
    await this.registerButton.click();
    await this.page.waitForURL(/\/dashboard/, { timeout: 10000 });
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


