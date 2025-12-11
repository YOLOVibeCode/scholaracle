import { test, expect } from '../../fixtures/auth';
import { DashboardPage } from '../../pages/dashboard.page';
import { LoginPage } from '../../pages/login.page';

test.describe('User Logout', () => {
  test('OUT-001: Should logout successfully', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    await dashboardPage.expectOnDashboard();
    
    await dashboardPage.logout();
    
    const loginPage = new LoginPage(authenticatedPage);
    await loginPage.expectOnLoginPage();
  });

  test('OUT-004: Should not access protected routes after logout', async ({ authenticatedPage }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    await dashboardPage.logout();
    
    // Try to access dashboard
    await authenticatedPage.goto('/dashboard');
    
    // Should redirect to login
    await expect(authenticatedPage).toHaveURL('/login');
  });
});


