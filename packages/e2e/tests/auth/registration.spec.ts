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

  test('REG-005: Should register new user successfully', async ({ page }) => {
    const email = generateUniqueEmail('reg-test');
    
    await registerPage.register(email, 'Test User', 'SecurePass123!');
    
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('REG-006: Should show error for existing email', async ({ page }) => {
    const email = generateUniqueEmail('duplicate');
    
    // Register first time
    await registerPage.register(email, 'First User', 'FirstPass123!');
    await expect(page).toHaveURL('/dashboard');
    
    // Navigate back to register and attempt duplicate registration
    await page.goto('/register');
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
    
    // Should show error and stay on register page (not redirect to dashboard)
    await registerPage.expectError();
  });

  test('REG-008: Should navigate to login page', async ({ page }) => {
    await registerPage.loginLink.click();
    await expect(page).toHaveURL('/login');
  });
});


