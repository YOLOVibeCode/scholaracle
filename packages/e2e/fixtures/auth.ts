import { test as base, type Page, expect } from '@playwright/test';
import { TEST_USERS, generateUniqueEmail, type UserRole } from './test-data';

/**
 * Extended test fixture with authentication helpers.
 */
export interface AuthFixtures {
  authenticatedPage: Page;
  testUser: {
    email: string;
    password: string;
    name: string;
  };
  loginAsRole: (role: UserRole) => Promise<void>;
}

/**
 * Custom test with authentication fixtures.
 */
export const test = base.extend<AuthFixtures>({
  testUser: async ({}, use) => {
    const user = {
      email: generateUniqueEmail('e2e'),
      password: 'E2ETestPass123!',
      name: 'E2E Test User',
    };
    await use(user);
  },

  loginAsRole: async ({ page }, use) => {
    const login = async (role: UserRole) => {
      const user = TEST_USERS[role];
      const loginUrl = role === 'parent' ? '/login' : '/admin/login';
      
      await page.goto(loginUrl);
      
      // Use flexible selectors that match actual page structure
      const emailInput = page.locator('input#email, input[type="email"], [data-testid="email-input"], input[name="email"]');
      const passwordInput = page.locator('input#password, input[type="password"], [data-testid="password-input"], input[name="password"]');
      const loginButton = page.locator('button[type="submit"], [data-testid="login-button"], button:has-text("Sign in")');
      
      await emailInput.fill(user.email);
      await passwordInput.fill(user.password);
      await loginButton.click();
      
      // Wait for redirect based on role
      if (role === 'parent') {
        await page.waitForURL('/dashboard', { timeout: 10000 });
      } else {
        await page.waitForURL('/admin', { timeout: 10000 });
      }
    };
    
    await use(login);
  },

  authenticatedPage: async ({ page, testUser }, use) => {
    // Register the test user
    await page.goto('/register');
    await page.fill('[data-testid="email-input"], input[name="email"]', testUser.email);
    await page.fill('[data-testid="name-input"], input[name="name"]', testUser.name);
    await page.fill('[data-testid="password-input"], input[name="password"]', testUser.password);
    await page.click('[data-testid="register-button"], button[type="submit"]');
    
    // Wait for dashboard
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * Login helper function for parent users.
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('[data-testid="email-input"], input[name="email"]', email);
  await page.fill('[data-testid="password-input"], input[name="password"]', password);
  await page.click('[data-testid="login-button"], button[type="submit"]');
  await page.waitForURL('/dashboard', { timeout: 10000 });
}

/**
 * Login helper function for admin users.
 */
export async function loginAdmin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/admin/login');
  await page.fill('[data-testid="email-input"], input[name="email"]', email);
  await page.fill('[data-testid="password-input"], input[name="password"]', password);
  await page.click('[data-testid="login-button"], button[type="submit"]');
  await page.waitForURL('/admin', { timeout: 10000 });
}

/**
 * Logout helper function.
 */
export async function logout(page: Page): Promise<void> {
  await page.click('[data-testid="logout-button"], button:has-text("Logout")');
  await page.waitForURL(/\/login/, { timeout: 10000 });
}

/**
 * Register helper function.
 */
export async function register(
  page: Page,
  email: string,
  password: string,
  name: string
): Promise<void> {
  await page.goto('/register');
  await page.fill('[data-testid="email-input"], input[name="email"]', email);
  await page.fill('[data-testid="name-input"], input[name="name"]', name);
  await page.fill('[data-testid="password-input"], input[name="password"]', password);
  await page.click('[data-testid="register-button"], button[type="submit"]');
  await page.waitForURL('/dashboard', { timeout: 10000 });
}


