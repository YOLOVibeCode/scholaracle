import { test, expect } from '../../fixtures/auth';
import { DashboardPage } from '../../pages/dashboard.page';

test.describe('Dashboard', () => {
  test('DASH-001: Should display dashboard header', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    await dashboardPage.expectOnDashboard();
    
    await expect(dashboardPage.heading).toBeVisible();
  });

  test('DASH-002: Should show student count card', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    
    // Check that student count card exists
    await expect(authenticatedPage.locator('text=Students')).toBeVisible();
  });

  test('DASH-003: Should show active courses card', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    
    await expect(authenticatedPage.locator('text=Active Courses')).toBeVisible();
  });

  test('DASH-004: Should show alerts card', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    
    await expect(authenticatedPage.locator('text=Alerts')).toBeVisible();
  });

  test('DASH-005: Should show average GPA card', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    
    await expect(authenticatedPage.locator('text=Average GPA')).toBeVisible();
  });

  test('DASH-006: Should display recent alerts section', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    
    await expect(authenticatedPage.locator('text=Recent Alerts')).toBeVisible();
  });

  test('DASH-007: Should display upcoming deadlines section', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    
    await expect(authenticatedPage.locator('text=Upcoming Deadlines')).toBeVisible();
  });

  test('DASH-009: Should navigate to students page', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    
    // Click on students in sidebar or navigation
    await authenticatedPage.click('a[href="/dashboard/students"]');
    await expect(authenticatedPage).toHaveURL('/dashboard/students');
  });
});


