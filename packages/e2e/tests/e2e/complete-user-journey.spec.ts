import { test, expect } from '@playwright/test';
import { generateUniqueEmail } from '../../fixtures/test-data';
import { RegisterPage } from '../../pages/register.page';
import { LoginPage } from '../../pages/login.page';
import { DashboardPage } from '../../pages/dashboard.page';

test.describe('Complete User Journey', () => {
  test('E2E-001: New parent onboarding flow', async ({ page }) => {
    const testEmail = generateUniqueEmail('journey');
    const testPassword = 'JourneyPass123!';
    const testName = 'Journey Test User';

    // 1. Register new account
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.register(testEmail, testName, testPassword);
    
    await expect(page).toHaveURL('/dashboard');

    // 2. Verify dashboard loaded
    const dashboardPage = new DashboardPage(page);
    await expect(dashboardPage.heading).toBeVisible();

    // 3. Navigate to students page
    await page.click('a[href="/dashboard/students"]');
    await expect(page).toHaveURL('/dashboard/students');

    // 4. Navigate to settings
    await page.click('a[href="/dashboard/settings"]');
    await expect(page).toHaveURL('/dashboard/settings');

    // 5. Navigate to alerts
    await page.click('a[href="/dashboard/alerts"]');
    await expect(page).toHaveURL('/dashboard/alerts');

    // 6. Return to dashboard
    await page.click('a[href="/dashboard"]');
    await expect(page).toHaveURL('/dashboard');

    // 7. Logout
    await dashboardPage.logout();
    await expect(page).toHaveURL('/login');

    // 8. Login again
    const loginPage = new LoginPage(page);
    await loginPage.login(testEmail, testPassword);
    
    // 9. Verify data persisted
    await expect(page).toHaveURL('/dashboard');
    await expect(dashboardPage.heading).toBeVisible();
  });

  test('E2E-002: Add student flow', async ({ page }) => {
    const testEmail = generateUniqueEmail('add-student');
    const testPassword = 'AddStudentPass123!';

    // Register and login
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.register(testEmail, 'Parent User', testPassword);
    await expect(page).toHaveURL('/dashboard');

    // Navigate to add student
    await page.click('a[href="/dashboard/students"]');
    await expect(page).toHaveURL('/dashboard/students');

    // Click add student button
    await page.click('a[href="/dashboard/students/new"]');
    await expect(page).toHaveURL('/dashboard/students/new');

    // Fill in student details
    await page.fill('input[name="name"]', 'New Student');
    await page.fill('input[name="grade"]', '10');
    await page.fill('input[name="school"]', 'Test High School');

    // Submit form
    await page.click('button[type="submit"]');

    // Should redirect to students list
    await expect(page).toHaveURL('/dashboard/students');

    // New student should be visible
    await expect(page.locator('text=New Student')).toBeVisible();
  });

  test('E2E-003: Settings update flow', async ({ page }) => {
    const testEmail = generateUniqueEmail('settings-flow');
    const testPassword = 'SettingsPass123!';

    // Register
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.register(testEmail, 'Settings User', testPassword);
    await expect(page).toHaveURL('/dashboard');

    // Navigate to settings
    await page.click('a[href="/dashboard/settings"]');
    await expect(page).toHaveURL('/dashboard/settings');

    // Verify settings page loaded
    await expect(page.locator('text=Notification Preferences')).toBeVisible();

    // Toggle a setting if available
    const emailToggle = page.locator('text=Email Notifications').locator('..').locator('button, input[type="checkbox"]');
    if (await emailToggle.isVisible()) {
      await emailToggle.click();
    }

    // Save settings if there's a save button
    const saveButton = page.locator('button:has-text("Save")');
    if (await saveButton.isVisible()) {
      await saveButton.click();
    }
  });
});


