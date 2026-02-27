import { test, expect } from '@playwright/test';
import { RegisterPage } from '../../pages/register.page';
import { generateUniqueEmail } from '../../fixtures/test-data';

test.describe('User Registration', () => {
  let registerPage: RegisterPage;

  test.beforeEach(async ({ page }) => {
    registerPage = new RegisterPage(page);
    await registerPage.goto();
  });

  test('REG-001: Should display registration form', async ({ page }) => {
    await expect(registerPage.emailInput).toBeVisible();
    await expect(registerPage.nameInput).toBeVisible();
    await expect(registerPage.passwordInput).toBeVisible();
    await expect(registerPage.registerButton).toBeVisible();
  });

  test('REG-002: Should validate required fields', async ({ page }) => {
    await registerPage.registerButton.click();
    
    // Check for validation - either HTML5 validation or custom error
    const emailValid = await registerPage.emailInput.evaluate(
      (el: HTMLInputElement) => el.validity.valid
    );
    expect(emailValid).toBe(false);
  });

  test('REG-003: Should validate email format', async ({ page }) => {
    await registerPage.emailInput.fill('invalid-email');
    await registerPage.nameInput.fill('Test User');
    await registerPage.passwordInput.fill('TestPass123!');
    await registerPage.registerButton.click();

    // Check for validation error
    const emailValid = await registerPage.emailInput.evaluate(
      (el: HTMLInputElement) => el.validity.valid
    );
    expect(emailValid).toBe(false);
  });

  test('REG-004: Should validate password strength', async ({ page }) => {
    await registerPage.emailInput.fill(generateUniqueEmail('weak'));
    await registerPage.nameInput.fill('Test User');
    await registerPage.passwordInput.fill('weak');
    await registerPage.registerButton.click();

    // Check for validation error (client or server)
    const passwordValid = await registerPage.passwordInput.evaluate(
      (el: HTMLInputElement) => el.validity.valid
    );
    // If HTML5 validation is used, password will be invalid; otherwise form shows error
    const isOnRegister = page.url().includes('/register');
    expect(isOnRegister).toBe(true);
  });

  test('REG-005: Should register new user successfully', async ({ page }) => {
    const email = generateUniqueEmail('reg-test');
    
    await registerPage.register(email, 'Test User', 'SecurePass123!');
    
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('REG-007: Should require terms consent if present', async ({ page }) => {
    const termsCheckbox = page.locator('[data-testid="checkbox-terms"], input[type="checkbox"]').first();
    if ((await termsCheckbox.count()) === 0) {
      test.skip();
      return;
    }
    
    await registerPage.emailInput.fill(generateUniqueEmail('terms'));
    await registerPage.nameInput.fill('Terms User');
    await registerPage.passwordInput.fill('TermsPass123!');
    
    // Try to register without checking terms
    await registerPage.registerButton.click();
    
    // Should stay on register page or show error
    await expect(page).toHaveURL(/\/register/);
  });

  test('REG-006: Should show error for existing email', async ({ page }) => {
    const email = `dup.${Date.now()}@example.com`;

    // Register first time
    await registerPage.register(email, 'First User', 'FirstPass123!');
    await expect(page).toHaveURL('/dashboard');

    // Clear auth state so middleware won't redirect /register → /dashboard
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Navigate to register page (now accessible since we cleared auth)
    await page.goto('/register');
    await expect(page).toHaveURL(/\/register/);
    registerPage = new RegisterPage(page);
    await registerPage.emailInput.fill(email);
    await registerPage.nameInput.fill('Second User');
    await registerPage.passwordInput.fill('SecondPass123!');
    if ((await registerPage.confirmPasswordInput.count()) > 0) {
      await registerPage.confirmPasswordInput.fill('SecondPass123!');
    }
    if ((await registerPage.termsConsentCheckbox.count()) > 0) {
      await registerPage.termsConsentCheckbox.check({ force: true });
    }

    await registerPage.registerButton.click();
    // API returns 400 for duplicate email; form shows error and stays on /register
    await expect(page).toHaveURL(/\/register/, { timeout: 10000 });
    await registerPage.expectError(undefined, 10000);
  });

  test('REG-008: Should navigate to login page', async ({ page }) => {
    await registerPage.loginLink.click();
    await expect(page).toHaveURL('/login');
  });
});


