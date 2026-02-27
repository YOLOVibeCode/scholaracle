import { test, expect } from '../fixtures/auth';
import { DashboardPage } from '../pages/dashboard.page';
import { navigateToSidebar, navigateBack, toggleMobileMenu } from '../helpers/navigation';

/**
 * Layer 3: Navigation Tests (Parent)
 *
 * Verify sidebar links work, routing is correct.
 *
 * Depends on: Layer 2 (@dashboard)
 * If Layer 2 fails → don't run
 */
test.describe('@navigation Layer 3: Parent Navigation', () => {
  test.beforeEach(async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
  });

  test('NAV-P-001: Dashboard link works', async ({ page }) => {
    await page.goto('/dashboard/students');
    await navigateToSidebar(page, 'Dashboard');
    await expect(page).toHaveURL('/dashboard');
  });

  test('NAV-P-002: Students link works', async ({ page }) => {
    await page.goto('/dashboard');
    await navigateToSidebar(page, 'Students');
    await expect(page).toHaveURL('/dashboard/students');
  });

  test('NAV-P-003: Add Student from empty state', async ({ page }) => {
    await page.goto('/dashboard/students');

    const addButton = page.locator(
      '[data-testid="button-add-student"], button:has-text("Add Student"), a:has-text("Add Student")'
    );
    const count = await addButton.count();

    if (count > 0) {
      await addButton.first().click();
      // Add Student may open a wizard sheet or navigate to /dashboard/students/new
      const wizard = page.locator('[data-testid="add-student-wizard"]');
      const navigated = page
        .waitForURL('/dashboard/students/new', { timeout: 3000 })
        .catch(() => null);
      const wizardVisible = wizard.waitFor({ state: 'visible', timeout: 3000 }).catch(() => null);
      await Promise.race([navigated, wizardVisible]);
      const isWizard = await wizard.isVisible().catch(() => false);
      if (!isWizard) {
        await expect(page).toHaveURL(/\/dashboard\/students/);
      }
    } else {
      // If no add button, verify students page loads
      await expect(page).toHaveURL('/dashboard/students');
    }
  });

  test('NAV-P-004: Alerts link works', async ({ page }) => {
    await page.goto('/dashboard');
    await navigateToSidebar(page, 'Alerts');
    await expect(page).toHaveURL('/dashboard/alerts');
  });

  test('NAV-P-004a: Agenda link works', async ({ page }) => {
    await page.goto('/dashboard');
    await navigateToSidebar(page, 'Agenda');
    await expect(page).toHaveURL('/dashboard/agenda');
    await expect(page.locator('[data-testid="agenda-page"]')).toBeVisible();
  });

  test('NAV-P-004b: Courses link works', async ({ page }) => {
    await page.goto('/dashboard');
    await navigateToSidebar(page, 'Courses');
    await expect(page).toHaveURL('/dashboard/courses');
    await expect(page.locator('h1')).toContainText('Courses');
  });

  test('NAV-P-005: Settings link works', async ({ page }) => {
    await page.goto('/dashboard');
    await navigateToSidebar(page, 'Settings');
    await expect(page).toHaveURL('/dashboard/settings');
  });

  test('NAV-P-006: Logo navigates home', async ({ page }) => {
    await page.goto('/dashboard/students');

    const logo = page
      .locator('[data-testid="logo"], a[href="/dashboard"], img[alt*="logo"]')
      .first();
    const count = await logo.count();

    if (count > 0) {
      await logo.click();
      await expect(page).toHaveURL('/dashboard');
    }
  });

  test('NAV-P-007: Logout button visible', async ({ page }) => {
    await page.goto('/dashboard');

    const logoutButton = page.locator('[data-testid="button-logout"], button:has-text("Logout")');
    await expect(logoutButton).toBeVisible();
  });

  test('NAV-P-008: Back navigation works', async ({ page }) => {
    await page.goto('/dashboard');
    await page.goto('/dashboard/students');

    await navigateBack(page);
    await expect(page).toHaveURL('/dashboard');
  });

  test('NAV-P-009: Student detail back link', async ({ page }) => {
    await page.goto('/dashboard/students');

    const backLink = page.locator(
      '[data-testid="back-link"], a:has-text("Back"), button:has-text("Back")'
    );
    const count = await backLink.count();

    if (count > 0) {
      // Navigate to detail first
      const studentLink = page
        .locator('[data-testid="student-link"], a[href*="/students/"]')
        .first();
      const studentCount = await studentLink.count();

      if (studentCount > 0) {
        await studentLink.click();
        await backLink.first().click();
        await expect(page).toHaveURL('/dashboard/students');
      }
    }
  });

  test('NAV-P-010: Breadcrumb navigation', async ({ page }) => {
    await page.goto('/dashboard/students');

    const breadcrumb = page.locator('[aria-label="breadcrumb"], nav[aria-label*="breadcrumb"]');
    const count = await breadcrumb.count();

    if (count > 0) {
      const homeLink = breadcrumb.locator('a[href="/dashboard"]').first();
      await homeLink.click();
      await expect(page).toHaveURL('/dashboard');
    }
  });

  test('NAV-P-011: Settings tabs navigation', async ({ page }) => {
    await page.goto('/dashboard/settings');

    // Look for tabs
    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count();

    if (tabCount > 0) {
      // Click first tab
      await tabs.first().click();
      await page.waitForTimeout(500);

      // Verify tab content changes
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('NAV-P-012: Alert filter tabs', async ({ page }) => {
    await page.goto('/dashboard/alerts');

    // Wait for alerts page to load
    await page.waitForSelector('[data-testid="alert-filters"], [role="tablist"]', {
      timeout: 5000,
    });

    const filterTabs = page.locator(
      '[data-testid="alert-filters"] [role="tab"], [data-testid="filter-critical"], [data-testid="filter-warning"]'
    );
    const count = await filterTabs.count();

    if (count > 0) {
      // Click a filter tab (skip "All" which is already selected)
      const criticalTab = page.locator('[data-testid="filter-critical"]');
      const criticalCount = await criticalTab.count();
      if (criticalCount > 0) {
        await criticalTab.click();
        await page.waitForTimeout(500);
        await expect(criticalTab).toHaveAttribute('aria-selected', 'true');
      } else {
        // Fallback: click any non-selected tab
        const nonSelectedTab = filterTabs.filter({ hasNotText: 'All' }).first();
        if ((await nonSelectedTab.count()) > 0) {
          await nonSelectedTab.click();
          await page.waitForTimeout(500);
        }
      }
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('NAV-P-013: Mobile menu toggle', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');

    const menuToggle = page.locator(
      '[data-testid="mobile-menu-toggle"], button[aria-label*="menu"]'
    );
    const count = await menuToggle.count();

    if (count > 0) {
      await menuToggle.click();
      await page.waitForTimeout(300);

      // Verify menu is visible
      const menu = page.locator('[data-testid="mobile-menu"], nav[aria-label*="mobile"]');
      await expect(menu).toBeVisible({ timeout: 2000 });
    }
  });

  test('NAV-P-014: Mobile nav links work', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');

    // Open mobile menu
    const menuToggle = page.locator('[data-testid="mobile-menu-toggle"]');
    const toggleCount = await menuToggle.count();

    if (toggleCount > 0) {
      await menuToggle.click();
      await page.waitForTimeout(300);

      // Click students link
      const studentsLink = page.locator(
        '[data-testid="mobile-menu"] a[href="/dashboard/students"], nav a:has-text("Students")'
      );
      await studentsLink.first().click();
      await expect(page).toHaveURL('/dashboard/students');
    }
  });

  test('NAV-P-015: Deep link direct access', async ({ page }) => {
    // Access settings directly via URL
    await page.goto('/dashboard/settings');
    await expect(page).toHaveURL('/dashboard/settings');
    await expect(page.locator('body')).toBeVisible();
  });
});
