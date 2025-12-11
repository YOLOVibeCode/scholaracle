import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../fixtures/test-data';
import { LoginPage } from '../pages/login.page';
import { AdminLoginPage } from '../pages/admin/login.page';
import { assertOnDashboard, assertOnAdminDashboard, assertRedirectedToLogin } from '../helpers/assertions';

/**
 * Layer 1: Authentication Tests
 * 
 * Verify all user roles can authenticate successfully.
 * 
 * Depends on: Layer 0 (@critical)
 * If Layer 0 fails → don't run
 */
test.describe('@auth Layer 1: Authentication', () => {
  test('AUTH-001: Parent can login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    
    const user = TEST_USERS.parent;
    await loginPage.login(user.email, user.password);
    
    await assertOnDashboard(page);
  });

  test('AUTH-002: Parent can logout', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    
    // Login first
    const user = TEST_USERS.parent;
    await loginPage.login(user.email, user.password);
    await assertOnDashboard(page);
    
    // Logout
    await page.click('[data-testid="logout-button"], button:has-text("Logout")');
    await assertRedirectedToLogin(page);
  });

  test('AUTH-003: Super Admin can login', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();
    
    const user = TEST_USERS.super_admin;
    await adminLoginPage.login(user.email, user.password);
    
    await assertOnAdminDashboard(page);
  });

  test('AUTH-004: Admin can login', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();
    
    const user = TEST_USERS.admin;
    await adminLoginPage.login(user.email, user.password);
    
    await assertOnAdminDashboard(page);
  });

  test('AUTH-005: Support can login', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();
    
    const user = TEST_USERS.support;
    await adminLoginPage.login(user.email, user.password);
    
    await assertOnAdminDashboard(page);
  });

  test('AUTH-006: Billing can login', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();
    
    const user = TEST_USERS.billing;
    await adminLoginPage.login(user.email, user.password);
    
    await assertOnAdminDashboard(page);
  });

  test('AUTH-007: Analyst can login', async ({ page }) => {
    const adminLoginPage = new AdminLoginPage(page);
    await adminLoginPage.goto();
    
    const user = TEST_USERS.analyst;
    await adminLoginPage.login(user.email, user.password);
    
    await assertOnAdminDashboard(page);
  });

  test('AUTH-008: Invalid credentials rejected', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    
    await loginPage.login('invalid@example.com', 'WrongPassword123!');
    
    // Should show error and stay on login page
    await loginPage.expectError();
    await expect(page).toHaveURL(/\/login/);
  });
});
