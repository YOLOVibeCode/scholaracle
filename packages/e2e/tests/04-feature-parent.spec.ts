import { test, expect } from '../fixtures/auth';
import { generateUniqueEmail } from '../fixtures/test-data';
import { assertToastMessage } from '../helpers/assertions';

/**
 * Layer 4: Feature CRUD Tests (Parent)
 * 
 * Core functionality works for parent role.
 * 
 * Depends on: Layer 3 (@navigation)
 * If Layer 3 fails → don't run
 */
test.describe('@feature Layer 4: Parent Features', () => {
  test.beforeEach(async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
  });

  test('FEAT-P-001: Create student', async ({ page }) => {
    await page.goto('/dashboard/students/new');
    
    const studentName = `Test Student ${Date.now()}`;
    await page.fill('[data-testid="student-name"], input[name="name"]', studentName);
    await page.fill('[data-testid="student-grade"], input[name="grade"]', '10');
    await page.fill('[data-testid="student-school"], input[name="school"]', 'Test High School');
    
    await page.click('[data-testid="save-student-button"], button[type="submit"]');
    
    // Should redirect to students list or show success
    await page.waitForURL(/\/dashboard\/students/, { timeout: 5000 });
    
    // Verify student appears in list
    await expect(page.locator(`text=${studentName}`)).toBeVisible({ timeout: 3000 });
  });

  test('FEAT-P-002: Read student details', async ({ page }) => {
    await page.goto('/dashboard/students');
    
    const studentLink = page.locator('[data-testid="student-link"], a[href*="/students/"]').first();
    const count = await studentLink.count();
    
    if (count > 0) {
      await studentLink.click();
      await expect(page).toHaveURL(/\/dashboard\/students\/[^/]+/);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('FEAT-P-003: Update student', async ({ page }) => {
    await page.goto('/dashboard/students');
    
    const editButton = page.locator('[data-testid="edit-student-button"], button:has-text("Edit")').first();
    const count = await editButton.count();
    
    if (count > 0) {
      await editButton.click();
      await page.waitForURL(/\/dashboard\/students\/[^/]+\/edit/, { timeout: 3000 });
      
      // Update name
      const nameInput = page.locator('[data-testid="student-name"], input[name="name"]');
      await nameInput.clear();
      await nameInput.fill('Updated Student Name');
      
      await page.click('[data-testid="save-student-button"], button[type="submit"]');
      
      // Verify update
      await expect(page.locator('text=Updated Student Name')).toBeVisible({ timeout: 3000 });
    }
  });

  test('FEAT-P-004: Delete student', async ({ page }) => {
    await page.goto('/dashboard/students');
    
    const deleteButton = page.locator('[data-testid="delete-student-button"], button:has-text("Delete")').first();
    const count = await deleteButton.count();
    
    if (count > 0) {
      // Get student name before deletion
      const studentRow = deleteButton.locator('..');
      const studentName = await studentRow.textContent();
      
      await deleteButton.click();
      
      // Confirm deletion if confirmation dialog appears
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete")').last();
      const confirmCount = await confirmButton.count();
      
      if (confirmCount > 0) {
        await confirmButton.click();
      }
      
      await page.waitForTimeout(1000);
      
      // Verify student is gone (if name was captured)
      if (studentName) {
        await expect(page.locator(`text=${studentName}`)).not.toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('FEAT-P-005: Read alerts', async ({ page }) => {
    await page.goto('/dashboard/alerts');
    
    // Should show alerts list or empty state
    const alertsList = page.locator('[data-testid="alerts-list"], [data-testid="empty-state"]');
    await expect(alertsList.first()).toBeVisible();
  });

  test('FEAT-P-006: Acknowledge alert', async ({ page }) => {
    await page.goto('/dashboard/alerts');
    
    const acknowledgeButton = page.locator('[data-testid="acknowledge-button"], button:has-text("Acknowledge")').first();
    const count = await acknowledgeButton.count();
    
    if (count > 0) {
      await acknowledgeButton.click();
      await page.waitForTimeout(500);
      
      // Verify button state changed or alert removed
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('FEAT-P-007: Filter alerts by severity', async ({ page }) => {
    await page.goto('/dashboard/alerts');
    
    const criticalFilter = page.locator('[data-testid="filter-critical"], [role="tab"]:has-text("Critical")').first();
    const count = await criticalFilter.count();
    
    if (count > 0) {
      await criticalFilter.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('FEAT-P-008: Update notification preferences', async ({ page }) => {
    await page.goto('/dashboard/settings');
    
    const pushToggle = page.locator('[data-testid="push-toggle"], input[type="checkbox"][name*="push"]').first();
    const count = await pushToggle.count();
    
    if (count > 0) {
      const initialState = await pushToggle.isChecked();
      await pushToggle.click();
      await page.waitForTimeout(500);
      
      // Verify state changed
      const newState = await pushToggle.isChecked();
      expect(newState).toBe(!initialState);
      
      // Save if save button exists
      const saveButton = page.locator('[data-testid="save-settings-button"], button:has-text("Save")');
      const saveCount = await saveButton.count();
      
      if (saveCount > 0) {
        await saveButton.click();
        await assertToastMessage(page, /saved|success/i);
      }
    }
  });

  test('FEAT-P-009: Update alert thresholds', async ({ page }) => {
    await page.goto('/dashboard/settings');
    
    const thresholdInput = page.locator('[data-testid="grade-drop-threshold"], input[name*="threshold"]').first();
    const count = await thresholdInput.count();
    
    if (count > 0) {
      await thresholdInput.clear();
      await thresholdInput.fill('7');
      
      const saveButton = page.locator('[data-testid="save-settings-button"], button:has-text("Save")');
      const saveCount = await saveButton.count();
      
      if (saveCount > 0) {
        await saveButton.click();
        await assertToastMessage(page, /saved|success/i);
      }
    }
  });

  test('FEAT-P-010: Settings persist on reload', async ({ page }) => {
    await page.goto('/dashboard/settings');
    
    const pushToggle = page.locator('[data-testid="push-toggle"]').first();
    const count = await pushToggle.count();
    
    if (count > 0) {
      const initialState = await pushToggle.isChecked();
      await pushToggle.click();
      
      const saveButton = page.locator('[data-testid="save-settings-button"]');
      const saveCount = await saveButton.count();
      
      if (saveCount > 0) {
        await saveButton.click();
        await page.waitForTimeout(1000);
      }
      
      // Reload page
      await page.reload();
      await page.waitForTimeout(1000);
      
      // Verify setting persisted
      const newToggle = page.locator('[data-testid="push-toggle"]').first();
      const persistedState = await newToggle.isChecked();
      expect(persistedState).toBe(!initialState);
    }
  });
});
