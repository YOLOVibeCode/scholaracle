import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { RegisterPage } from '../../pages/register.page';
import { generateUniqueEmail } from '../../fixtures/test-data';

test.describe('User Login', () => {
  let loginPage: LoginPage;
  const testEmail = generateUniqueEmail('login-test');
  const testPassword = 'LoginTestPass123!';

  test.beforeAll(async ({ browser }) => {
    // Register a test user for login tests
    const page = await browser.newPage();
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.register(testEmail, 'Login Test User', testPassword);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('LOG-001: Should display login form', async ({ page }) => {
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('LOG-002: Should validate required fields', async ({ page }) => {
    await loginPage.loginButton.click();
    
    const emailValid = await loginPage.emailInput.evaluate(
      (el: HTMLInputElement) => el.validity.valid
    );
    expect(emailValid).toBe(false);
  });

  test('LOG-003: Should show error for invalid credentials', async ({ page }) => {
    await loginPage.login(testEmail, 'WrongPassword123!');
    
    await loginPage.expectError();
  });

  test('LOG-004: Should show error for non-existent user', async ({ page }) => {
    await loginPage.login('nonexistent@example.com', 'SomePass123!');
    
    await loginPage.expectError();
  });

  test('LOG-005: Should login successfully', async ({ page }) => {
    await loginPage.login(testEmail, testPassword);
    
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('LOG-007: Should persist session', async ({ page }) => {
    await loginPage.login(testEmail, testPassword);
    await expect(page).toHaveURL('/dashboard');
    
    // Reload and verify still logged in
    await page.reload();
    await expect(page).toHaveURL('/dashboard');
  });

  test('LOG-008: Should navigate to register page', async ({ page }) => {
    await loginPage.registerLink.click();
    await expect(page).toHaveURL('/register');
  });
});


