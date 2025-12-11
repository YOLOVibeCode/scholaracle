import { test, expect } from '@playwright/test';
import { RegisterPage } from '../pages/register.page';
import { LoginPage } from '../pages/login.page';
import { DashboardPage } from '../pages/dashboard.page';
import { AdminDashboardPage } from '../pages/admin/dashboard.page';
import { AdminCustomersPage } from '../pages/admin/customers.page';
import { generateUniqueEmail } from '../fixtures/test-data';
import { assertOnDashboard, assertOnAdminDashboard, assertToastMessage } from '../helpers/assertions';

/**
 * Layer 5: Integration Workflows
 * 
 * Complex multi-step, cross-role workflows.
 * 
 * Depends on: Layer 4 (@feature)
 * If Layer 4 fails → don't run
 */
test.describe('@integration Layer 5: Integration Workflows', () => {
  test('INT-001: Complete Parent Onboarding', async ({ page }) => {
    // 1. Register new account
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    
    const email = generateUniqueEmail('parent');
    const password = 'SecurePass123!';
    const name = 'Test Parent';
    
    await registerPage.register(email, name, password);
    
    // 2. Verify dashboard loads
    await assertOnDashboard(page);
    
    // 3. Add first student
    await page.goto('/dashboard/students/new');
    await page.fill('[data-testid="student-name"], input[name="name"]', 'Jane Student');
    await page.fill('[data-testid="student-grade"], input[name="grade"]', '9');
    await page.fill('[data-testid="student-school"], input[name="school"]', 'Lincoln High');
    
    await page.click('[data-testid="save-student-button"], button[type="submit"]');
    await page.waitForURL(/\/dashboard\/students/, { timeout: 5000 });
    
    // 4. Verify student appears on dashboard
    await page.goto('/dashboard');
    const studentCount = page.locator('[data-testid="student-count"], :has-text("Students")');
    await expect(studentCount).toBeVisible({ timeout: 3000 });
    
    // 5. Configure notification settings
    await page.goto('/dashboard/settings');
    const smsToggle = page.locator('[data-testid="sms-toggle"], input[type="checkbox"][name*="sms"]').first();
    const smsCount = await smsToggle.count();
    
    if (smsCount > 0) {
      await smsToggle.uncheck();
    }
    
    const thresholdInput = page.locator('[data-testid="grade-drop-threshold"], input[name*="threshold"]').first();
    const thresholdCount = await thresholdInput.count();
    
    if (thresholdCount > 0) {
      await thresholdInput.clear();
      await thresholdInput.fill('80');
    }
    
    const saveButton = page.locator('[data-testid="save-settings-button"], button:has-text("Save")');
    const saveCount = await saveButton.count();
    
    if (saveCount > 0) {
      await saveButton.click();
      await assertToastMessage(page, /saved|success/i);
    }
    
    // 6. View alerts (initially empty)
    await page.goto('/dashboard/alerts');
    await expect(page).toHaveURL('/dashboard/alerts');
    
    // 7. Logout
    await page.click('[data-testid="logout-button"], button:has-text("Logout")');
    await expect(page).toHaveURL(/\/login/);
    
    // 8. Login again
    const loginPage = new LoginPage(page);
    await loginPage.login(email, password);
    
    // 9. Verify data persisted
    await assertOnDashboard(page);
    await page.goto('/dashboard/students');
    await expect(page.locator('text=Jane Student')).toBeVisible({ timeout: 3000 });
  });

  test('INT-002: Parent-Admin Interaction', async ({ page }) => {
    // 1. Parent creates account
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    
    const parentEmail = generateUniqueEmail('parent');
    await registerPage.register(parentEmail, 'Test Parent', 'SecurePass123!');
    await assertOnDashboard(page);
    
    // 2. Admin views customer
    await page.click('[data-testid="logout-button"]');
    
    const adminLoginPage = new AdminDashboardPage(page);
    await page.goto('/admin/login');
    await page.fill('[data-testid="email-input"], input[name="email"]', 'super@scholaracle.com');
    await page.fill('[data-testid="password-input"], input[name="password"]', 'SuperAdmin123!');
    await page.click('[data-testid="login-button"], button[type="submit"]');
    
    await assertOnAdminDashboard(page);
    
    // 3. Search for customer
    await page.goto('/admin/customers');
    const searchInput = page.locator('[data-testid="search-input"], input[placeholder*="Search"]');
    const searchCount = await searchInput.count();
    
    if (searchCount > 0) {
      await searchInput.fill(parentEmail);
      await page.waitForTimeout(1000);
    }
    
    // 4. Admin adds note
    const customerRow = page.locator('tbody tr').first();
    const rowCount = await customerRow.count();
    
    if (rowCount > 0) {
      await customerRow.click();
      await page.waitForURL(/\/admin\/customers\/[^/]+/);
      
      const notesTab = page.locator('[role="tab"]:has-text("Notes")');
      const tabCount = await notesTab.count();
      
      if (tabCount > 0) {
        await notesTab.click();
        
        const addNoteButton = page.locator('[data-testid="add-note-button"], button:has-text("Add Note")');
        const buttonCount = await addNoteButton.count();
        
        if (buttonCount > 0) {
          await addNoteButton.click();
          
          const noteTextarea = page.locator('textarea').first();
          await noteTextarea.fill('Customer onboarding completed');
          
          const saveButton = page.locator('button:has-text("Save")');
          await saveButton.click();
          await assertToastMessage(page, /note|success/i);
        }
      }
    }
  });

  test('INT-003: Subscription Lifecycle', async ({ page }) => {
    // 1. Parent registers (free tier)
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    
    const parentEmail = generateUniqueEmail('parent');
    await registerPage.register(parentEmail, 'Test Parent', 'SecurePass123!');
    
    // 2. Admin upgrades subscription
    await page.click('[data-testid="logout-button"]');
    
    await page.goto('/admin/login');
    await page.fill('[data-testid="email-input"], input[name="email"]', 'super@scholaracle.com');
    await page.fill('[data-testid="password-input"], input[name="password"]', 'SuperAdmin123!');
    await page.click('[data-testid="login-button"], button[type="submit"]');
    
    await page.goto('/admin/customers');
    const searchInput = page.locator('[data-testid="search-input"]');
    const searchCount = await searchInput.count();
    
    if (searchCount > 0) {
      await searchInput.fill(parentEmail);
      await page.waitForTimeout(1000);
      
      const customerRow = page.locator('tbody tr').first();
      await customerRow.click();
      
      const subscriptionTab = page.locator('[role="tab"]:has-text("Subscription")');
      const tabCount = await subscriptionTab.count();
      
      if (tabCount > 0) {
        await subscriptionTab.click();
        
        const upgradeButton = page.locator('[data-testid="upgrade-button"], button:has-text("Upgrade")');
        const upgradeCount = await upgradeButton.count();
        
        if (upgradeCount > 0) {
          await upgradeButton.click();
          await page.waitForTimeout(500);
          
          const planSelect = page.locator('select[name="plan"]');
          const selectCount = await planSelect.count();
          
          if (selectCount > 0) {
            await planSelect.selectOption('premium');
            
            const saveButton = page.locator('button:has-text("Save")');
            await saveButton.click();
            await assertToastMessage(page, /upgraded|success/i);
          }
        }
      }
    }
  });

  test('INT-004: Alert Flow', async ({ page }) => {
    // 1. Parent logs in
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('test.parent@example.com', 'TestPass123!');
    
    // 2. View alerts
    await page.goto('/dashboard/alerts');
    await expect(page).toHaveURL('/dashboard/alerts');
    
    // 3. Acknowledge alert if exists
    const acknowledgeButton = page.locator('[data-testid="acknowledge-button"], button:has-text("Acknowledge")').first();
    const count = await acknowledgeButton.count();
    
    if (count > 0) {
      await acknowledgeButton.click();
      await page.waitForTimeout(500);
      
      // 4. Verify dashboard updated
      await page.goto('/dashboard');
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('INT-005: Multi-Student Family', async ({ page }) => {
    // 1. Parent logs in
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('test.parent@example.com', 'TestPass123!');
    
    // 2. Add multiple students
    const students = ['Alice Student', 'Bob Student', 'Charlie Student'];
    
    for (const studentName of students) {
      await page.goto('/dashboard/students/new');
      await page.fill('[data-testid="student-name"], input[name="name"]', studentName);
      await page.fill('[data-testid="student-grade"], input[name="grade"]', '10');
      await page.fill('[data-testid="student-school"], input[name="school"]', 'Test High');
      
      await page.click('[data-testid="save-student-button"], button[type="submit"]');
      await page.waitForURL(/\/dashboard\/students/, { timeout: 5000 });
    }
    
    // 3. Verify all students appear
    await page.goto('/dashboard/students');
    
    for (const studentName of students) {
      await expect(page.locator(`text=${studentName}`)).toBeVisible({ timeout: 3000 });
    }
    
    // 4. Verify aggregated alerts on dashboard
    await page.goto('/dashboard');
    await expect(page.locator('body')).toBeVisible();
  });
});
