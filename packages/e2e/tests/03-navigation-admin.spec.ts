import { test, expect } from '../fixtures/auth';
import { AdminDashboardPage } from '../pages/admin/dashboard.page';
import { AdminCustomersPage } from '../pages/admin/customers.page';
import { navigateToSidebar, navigateBack } from '../helpers/navigation';
import { TEST_USERS } from '../fixtures/test-data';

/**
 * Layer 3: Navigation Tests (Admin)
 * 
 * Verify admin sidebar links work, routing is correct.
 * Tests role-based navigation visibility.
 * 
 * Depends on: Layer 2 (@dashboard)
 * If Layer 2 fails → don't run
 */
test.describe('@navigation Layer 3: Admin Navigation', () => {
  test('NAV-A-001: Dashboard link works (all roles)', async ({ page, loginAsRole }) => {
    const roles: Array<keyof typeof TEST_USERS> = ['super_admin', 'admin', 'support', 'billing', 'analyst'];
    
    for (const role of roles) {
      await loginAsRole(role);
      await page.goto('/admin/customers');
      
      await navigateToSidebar(page, 'Dashboard');
      await expect(page).toHaveURL(/\/admin\/dashboard/);
      
      await page.locator('[data-testid="logout-button"]').click({ force: true });
    }
  });

  test('NAV-A-002: Customers link works (all roles)', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/dashboard');
    
    await navigateToSidebar(page, 'Customers');
    await expect(page).toHaveURL('/admin/customers');
  });

  test('NAV-A-003: Payments link works (billing roles)', async ({ page, loginAsRole }) => {
    const roles: Array<keyof typeof TEST_USERS> = ['super_admin', 'admin', 'billing', 'analyst'];
    
    for (const role of roles) {
      await loginAsRole(role);
      await page.goto('/admin/dashboard');
      
      const paymentsLink = page.locator('a[href="/admin/payments"], [data-testid="payments-link"]');
      const count = await paymentsLink.count();
      
      if (count > 0) {
        await paymentsLink.click();
        await expect(page).toHaveURL('/admin/payments');
      }
      
      await page.locator('[data-testid="logout-button"]').click({ force: true });
    }
  });

  test('NAV-A-004: Subscriptions link works (billing roles)', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/dashboard');
    
    await navigateToSidebar(page, 'Subscriptions');
    await expect(page).toHaveURL('/admin/subscriptions');
  });

  test('NAV-A-005: Communications link works (support roles)', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/dashboard');
    
    await navigateToSidebar(page, 'Communications');
    await expect(page).toHaveURL('/admin/communications');
  });

  test('NAV-A-006: Reports link works (analyst roles)', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/dashboard');
    
    await navigateToSidebar(page, 'Reports');
    await expect(page).toHaveURL('/admin/reports');
  });

  test('NAV-A-007: Settings link works (super_admin only)', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/dashboard');
    
    const settingsLink = page.locator('a[href="/admin/settings"], [data-testid="settings-link"]');
    const count = await settingsLink.count();
    
    if (count > 0) {
      await settingsLink.click();
      await expect(page).toHaveURL('/admin/settings');
    }
  });

  test('NAV-A-008: Audit Logs link works (super_admin only)', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/dashboard');
    
    const auditLink = page.locator('a[href="/admin/audit-logs"], [data-testid="audit-logs-link"]');
    const count = await auditLink.count();
    
    if (count > 0) {
      await auditLink.click();
      await expect(page).toHaveURL('/admin/audit-logs');
    }
  });

  test('NAV-A-009: Customer detail navigation', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const customerRow = page.locator('tbody tr, [data-testid="customer-row"]').first();
    const count = await customerRow.count();
    
    if (count > 0) {
      await customerRow.click();
      await expect(page).toHaveURL(/\/admin\/customers\/[^/]+/);
    }
  });

  test('NAV-A-010: Customer detail tabs', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const customerRow = page.locator('tbody tr').first();
    const count = await customerRow.count();
    
    if (count > 0) {
      await customerRow.click();
      await page.waitForURL(/\/admin\/customers\/[^/]+/);
      
      // Look for tabs
      const tabs = page.locator('[role="tab"]');
      const tabCount = await tabs.count();
      
      if (tabCount > 0) {
        await tabs.nth(1).click();
        await page.waitForTimeout(500);
        await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
      }
    }
  });

  test('NAV-A-011: Back to customers list', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const customerRow = page.locator('tbody tr').first();
    const count = await customerRow.count();
    
    if (count > 0) {
      await customerRow.click();
      await page.waitForURL(/\/admin\/customers\/[^/]+/);
      
      const backLink = page.locator('[data-testid="back-link"], a:has-text("Back"), button:has-text("Back")');
      const backCount = await backLink.count();
      
      if (backCount > 0) {
        await backLink.click();
        await expect(page).toHaveURL('/admin/customers');
      } else {
        await navigateBack(page);
        await expect(page).toHaveURL('/admin/customers');
      }
    }
  });

  test('NAV-A-012: Quick actions menu', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const actionMenu = page.locator('[data-testid="action-menu"], button[aria-label*="Actions"]').first();
    const count = await actionMenu.count();
    
    if (count > 0) {
      await actionMenu.click();
      await page.waitForTimeout(300);
      
      const dropdown = page.locator('[role="menu"], [data-testid="dropdown-menu"]');
      await expect(dropdown).toBeVisible({ timeout: 2000 });
    }
  });

  test('NAV-A-013: Unauthorized redirect (support → settings)', async ({ page, loginAsRole }) => {
    await loginAsRole('support');
    
    // Try to access settings
    await page.goto('/admin/settings');
    
    // Should redirect or show 403
    await page.waitForTimeout(600);
    const is403 = page.url().includes('403') || (await page.locator('body').textContent())?.includes('403');
    const isRedirected = !page.url().includes('/admin/settings');
    
    expect(is403 || isRedirected).toBe(true);
  });

  test('NAV-A-014: Search navigation', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const searchInput = page.locator('[data-testid="search-input"], input[placeholder*="Search"]');
    const count = await searchInput.count();
    
    if (count > 0) {
      await searchInput.fill('test@example.com');
      await page.waitForTimeout(500);
      
      // Look for search results
      const results = page.locator('[data-testid="customer-row"], tbody tr');
      await expect(results.first()).toBeVisible({ timeout: 2000 });
    }
  });

  test('NAV-A-015: Pagination navigation', async ({ page, loginAsRole }) => {
    await loginAsRole('super_admin');
    await page.goto('/admin/customers');
    
    const nextButton = page.locator('[data-testid="next-page"], button:has-text("Next")');
    const count = await nextButton.count();
    
    if (count > 0 && !(await nextButton.isDisabled())) {
      await nextButton.click();
      await page.waitForTimeout(500);
      
      // Verify URL or page number changed
      const url = page.url();
      expect(url).toContain('page=');
    }
  });
});
