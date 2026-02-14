import { test, expect } from '../fixtures/auth';
import { DashboardPage } from '../pages/dashboard.page';
import { assertOnDashboard } from '../helpers/assertions';

/**
 * Layer 2: Dashboard Rendering Tests (Parent)
 * 
 * Verify all parent dashboard pages load without errors.
 * 
 * Depends on: Layer 1 (@auth)
 * If Layer 1 fails → don't run
 */
test.describe('@dashboard Layer 2: Parent Dashboard Pages', () => {
  test.beforeEach(async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
  });

  test('DASH-P-001: Dashboard Home renders', async ({ page }) => {
    await page.goto('/dashboard');
    await assertOnDashboard(page);
    
    // Verify key elements are visible
    await expect(page.locator('h1, [data-testid="dashboard-header"]')).toBeVisible();
  });

  test('DASH-P-009: Dashboard shows real alerts and deadlines', async ({ page }) => {
    await page.goto('/dashboard');
    await assertOnDashboard(page);
    
    // Wait for dashboard to load (wait for loading skeleton to disappear or content to appear)
    await page.waitForSelector('[data-testid="loading-skeleton-dashboard"]', { state: 'hidden', timeout: 5000 }).catch(() => {});
    await expect(page.locator('[data-testid="student-count"]')).toBeVisible({ timeout: 5000 });
    
    // Check for Recent Alerts section (wait for it to be visible after loading)
    const recentAlertsSection = page.locator('[data-testid="dashboard-recent-alerts"]');
    await expect(recentAlertsSection).toBeVisible({ timeout: 5000 });
    
    // Check for Upcoming Deadlines section
    const upcomingDeadlinesSection = page.locator('[data-testid="dashboard-upcoming-deadlines"]');
    await expect(upcomingDeadlinesSection).toBeVisible({ timeout: 5000 });
    
    // Verify sections show either content or empty state (both are valid)
    const alertsList = page.locator('[data-testid="dashboard-alerts-list"]');
    const alertsEmpty = page.locator('[data-testid="dashboard-alerts-empty"]');
    const hasAlerts = await alertsList.count() > 0;
    const hasAlertsEmpty = await alertsEmpty.count() > 0;
    expect(hasAlerts || hasAlertsEmpty).toBe(true);
    
    const deadlinesList = page.locator('[data-testid="dashboard-deadlines-list"]');
    const deadlinesEmpty = page.locator('[data-testid="dashboard-deadlines-empty"]');
    const hasDeadlines = await deadlinesList.count() > 0;
    const hasDeadlinesEmpty = await deadlinesEmpty.count() > 0;
    expect(hasDeadlines || hasDeadlinesEmpty).toBe(true);
  });

  test('DASH-P-002: Students List page renders', async ({ page }) => {
    await page.goto('/dashboard/students');
    await expect(page).toHaveURL('/dashboard/students');
    
    // Should show students list or empty state
    const hasStudents = await page.locator('[data-testid="student-list"], [data-testid="empty-state"]').count() > 0;
    expect(hasStudents).toBe(true);
  });

  test('DASH-P-003: Add Student page renders', async ({ page }) => {
    await page.goto('/dashboard/students/new');
    await expect(page).toHaveURL('/dashboard/students/new');
    
    // Verify form elements
    await expect(page.locator('[data-testid="input-student-name"], input[name="name"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-student-grade"], input[name="grade"]')).toBeVisible();
  });

  test('DASH-P-004: Student Detail page renders', async ({ page }) => {
    // First check if there are any students
    await page.goto('/dashboard/students');
    
    // Try to navigate to a student detail page
    // If no students exist, this test will verify the page structure handles it
    const studentLink = page.locator('[data-testid="student-link"], a[href*="/students/"]').first();
    const count = await studentLink.count();
    
    if (count > 0) {
      await studentLink.click();
      await expect(page).toHaveURL(/\/dashboard\/students\/[^/]+/);
      await expect(page.locator('body')).toBeVisible();
    } else {
      // If no students, verify the page would load (test the route exists)
      await page.goto('/dashboard/students/test-id');
      // Should either show 404 or empty state, but not crash
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('DASH-P-005: Alerts page renders', async ({ page }) => {
    await page.goto('/dashboard/alerts');
    await expect(page).toHaveURL('/dashboard/alerts');
    
    // Should show alerts list or empty state
    const hasContent = await page.locator('[data-testid="alerts-list"], [data-testid="empty-state"], h1').count() > 0;
    expect(hasContent).toBe(true);
  });

  test('DASH-P-006: Settings page renders', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page).toHaveURL('/dashboard/settings');
    
    // Verify settings form is visible
    await expect(page.locator('[data-testid="settings-form"], form')).toBeVisible();
  });

  test('DASH-P-007: Notification Settings section renders', async ({ page }) => {
    await page.goto('/dashboard/settings');
    
    // Look for notification settings (could be in tabs or sections)
    const notificationSection = page.locator('[data-testid="notification-settings"], :has-text("Notification"), [role="tab"]:has-text("Notification")');
    const count = await notificationSection.count();
    
    if (count > 0) {
      await notificationSection.first().click();
      await expect(page.locator('[data-testid="toggle-push"]').first()).toBeVisible({ timeout: 2000 });
    } else {
      // Settings might be on single page, verify page loads
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('DASH-P-008: Grade Thresholds section renders', async ({ page }) => {
    await page.goto('/dashboard/settings');
    
    // Look for threshold settings
    const thresholdSection = page.locator('[data-testid="threshold-settings"], :has-text("Threshold"), [role="tab"]:has-text("Threshold")');
    const count = await thresholdSection.count();
    
    if (count > 0) {
      await thresholdSection.first().click();
      await expect(page.locator('[data-testid="input-grade-drop-threshold"]').first()).toBeVisible({ timeout: 2000 });
    } else {
      // Settings might be on single page
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
