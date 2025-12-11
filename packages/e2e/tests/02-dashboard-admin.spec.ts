import { test as baseTest, expect } from '@playwright/test';
import { test, loginAsRole } from '../fixtures/auth';
import { AdminDashboardPage } from '../pages/admin/dashboard.page';
import { AdminCustomersPage } from '../pages/admin/customers.page';
import { assertOnAdminDashboard, assertAccessDenied, assertAdminAccess } from '../helpers/assertions';
import { TEST_USERS } from '../fixtures/test-data';

/**
 * Layer 2: Dashboard Rendering Tests (Admin)
 * 
 * Verify all admin dashboard pages load without errors.
 * Tests role-based access control.
 * 
 * Depends on: Layer 1 (@auth)
 * If Layer 1 fails → don't run
 */
test.describe('@dashboard Layer 2: Admin Dashboard Pages', () => {
  test('DASH-A-001: Admin Home renders (super_admin)', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/dashboard');
    await assertOnAdminDashboard(page);
    
    // Verify KPI cards or dashboard content
    await expect(page.locator('[data-testid="kpi-card"], .stat-card, h1')).toBeVisible();
  });

  test('DASH-A-002: Customers List renders (all roles)', async ({ page, loginAsRole }) => {
    const roles: Array<keyof typeof TEST_USERS> = ['super_admin', 'admin', 'support', 'billing', 'analyst'];
    
    for (const role of roles) {
      await loginAsRole(role);
      await page.goto('/admin/customers');
      
      await expect(page).toHaveURL('/admin/customers');
      await expect(page.locator('body')).toBeVisible();
      
      // Logout for next iteration
      await page.click('[data-testid="logout-button"]');
    }
  });

  test('DASH-A-003: Customer Detail renders (super_admin)', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    
    // First go to customers list
    await page.goto('/admin/customers');
    
    // Try to click first customer or verify page structure
    const customerLink = page.locator('[data-testid="customer-link"], a[href*="/customers/"], tbody tr').first();
    const count = await customerLink.count();
    
    if (count > 0) {
      await customerLink.click();
      await expect(page).toHaveURL(/\/admin\/customers\/[^/]+/);
      await expect(page.locator('body')).toBeVisible();
    } else {
      // Test route exists
      await page.goto('/admin/customers/test-id');
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('DASH-A-004: Payments page renders (billing roles)', async ({ page }) => {
    const roles: Array<keyof typeof TEST_USERS> = ['super_admin', 'admin', 'billing', 'analyst'];
    
    for (const role of roles) {
      await loginAsRole(role);
      await page.goto('/admin/payments');
      
      await expect(page).toHaveURL('/admin/payments');
      await expect(page.locator('body')).toBeVisible();
      
      await page.click('[data-testid="logout-button"]');
    }
  });

  test('DASH-A-005: Subscriptions page renders (billing roles)', async ({ page }) => {
    const roles: Array<keyof typeof TEST_USERS> = ['super_admin', 'admin', 'billing'];
    
    for (const role of roles) {
      await loginAsRole(role);
      await page.goto('/admin/subscriptions');
      
      await expect(page).toHaveURL('/admin/subscriptions');
      await expect(page.locator('body')).toBeVisible();
      
      await page.click('[data-testid="logout-button"]');
    }
  });

  test('DASH-A-006: Communications page renders (support roles)', async ({ page }) => {
    const roles: Array<keyof typeof TEST_USERS> = ['super_admin', 'admin', 'support'];
    
    for (const role of roles) {
      await loginAsRole(role);
      await page.goto('/admin/communications');
      
      await expect(page).toHaveURL('/admin/communications');
      await expect(page.locator('body')).toBeVisible();
      
      await page.click('[data-testid="logout-button"]');
    }
  });

  test('DASH-A-007: Reports page renders (analyst roles)', async ({ page }) => {
    const roles: Array<keyof typeof TEST_USERS> = ['super_admin', 'admin', 'billing', 'analyst'];
    
    for (const role of roles) {
      await loginAsRole(role);
      await page.goto('/admin/reports');
      
      await expect(page).toHaveURL('/admin/reports');
      await expect(page.locator('body')).toBeVisible();
      
      await page.click('[data-testid="logout-button"]');
    }
  });

  test('DASH-A-008: System Settings renders (super_admin only)', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/settings');
    
    await expect(page).toHaveURL('/admin/settings');
    await expect(page.locator('body')).toBeVisible();
  });

  test('DASH-A-009: Audit Logs renders (super_admin only)', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/audit-logs');
    
    await expect(page).toHaveURL('/admin/audit-logs');
    await expect(page.locator('body')).toBeVisible();
  });

  test('DASH-A-010: Analytics Overview renders (analyst roles)', async ({ page }) => {
    const roles: Array<keyof typeof TEST_USERS> = ['super_admin', 'admin', 'analyst'];
    
    for (const role of roles) {
      await loginAsRole(role);
      await page.goto('/admin/analytics');
      
      await expect(page).toHaveURL(/\/admin\/analytics/);
      await expect(page.locator('body')).toBeVisible();
      
      await page.click('[data-testid="logout-button"]');
    }
  });

  // Role-access matrix tests
  test('DASH-A-011: Support cannot access Settings', async ({ page, loginAsRole }) => {
    await loginAsRole('support');
    await assertAccessDenied(page, '/admin/settings');
  });

  test('DASH-A-012: Support cannot access Payments', async ({ page, loginAsRole }) => {
    await loginAsRole('support');
    await assertAccessDenied(page, '/admin/payments');
  });

  test('DASH-A-013: Billing cannot access Communications', async ({ page, loginAsRole }) => {
    await loginAsRole('billing');
    await assertAccessDenied(page, '/admin/communications');
  });

  test('DASH-A-014: Analyst cannot access Settings', async ({ page, loginAsRole }) => {
    await loginAsRole('analyst');
    await assertAccessDenied(page, '/admin/settings');
  });

  test('DASH-A-015: Admin cannot access Settings', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await assertAccessDenied(page, '/admin/settings');
  });

  test('DASH-A-016: Admin cannot access Audit Logs', async ({ page, loginAsRole }) => {
    await loginAsRole('admin');
    await assertAccessDenied(page, '/admin/audit-logs');
  });

  test('DASH-A-017: Billing cannot access Communications', async ({ page, loginAsRole }) => {
    await loginAsRole('billing');
    await assertAccessDenied(page, '/admin/communications');
  });

  test('DASH-A-018: Analyst can access Payments', async ({ page, loginAsRole }) => {
    await loginAsRole('analyst');
    await assertAdminAccess(page, '/admin/payments');
  });

  test('DASH-A-019: Analyst can access Reports', async ({ page, loginAsRole }) => {
    await loginAsRole('analyst');
    await assertAdminAccess(page, '/admin/reports');
  });

  test('DASH-A-020: Support can access Customers', async ({ page, loginAsRole }) => {
    await loginAsRole('support');
    await assertAdminAccess(page, '/admin/customers');
  });
});
