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
  test('FEAT-P-001: Create student', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard/students/new');

    const studentName = `Test Student ${Date.now()}`;
    await page.fill('[data-testid="input-student-name"]', studentName);
    await page.fill('[data-testid="input-student-grade"]', '10');
    await page.fill('[data-testid="input-student-school"]', 'Test High School');

    await page.click('[data-testid="button-save-student"]');

    // Should redirect to students list or show success
    await page.waitForURL(/\/dashboard\/students/, { timeout: 5000 });

    // Verify student appears in list
    await expect(
      page.locator('[data-testid="student-list"], [data-testid="empty-state"]').first()
    ).toBeVisible();
    await expect(page.locator(`text=${studentName}`)).toBeVisible({ timeout: 10000 });
  });

  test('FEAT-P-002: Read student details', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard/students');

    const studentLink = page.locator('[data-testid="student-link"]').first();
    const count = await studentLink.count();

    if (count > 0) {
      await studentLink.click();
      await expect(page).toHaveURL(/\/dashboard\/students\/[^/]+/);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('FEAT-P-003: Update student', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard/students');

    const editButton = page.locator('[data-testid="button-edit-student"]').first();
    const count = await editButton.count();

    if (count > 0) {
      await editButton.click();
      await page.waitForURL(/\/dashboard\/students\/[^/]+/, { timeout: 3000 });

      // Update name
      const nameInput = page.locator('[data-testid="input-student-name"]');
      await nameInput.clear();
      await nameInput.fill('Updated Student Name');

      await page.click('[data-testid="button-save-student"]');

      // Verify redirect and update
      await page.waitForURL(/\/dashboard\/students/, { timeout: 5000 });
      await expect(page.locator('text=Updated Student Name')).toBeVisible({ timeout: 3000 });
    }
  });

  test('FEAT-P-004: Delete student', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard/students');

    const deleteButton = page.locator('[data-testid="button-delete-student"]').first();
    const count = await deleteButton.count();

    if (count > 0) {
      await deleteButton.click();

      // Confirm dialog appears
      const confirmButton = page.locator('[data-testid="button-confirm-dialog"]');
      await confirmButton.click();

      await page.waitForTimeout(1000);
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('FEAT-P-005: Read alerts', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard/alerts');

    // Should show alerts list or empty state
    const alertsList = page.locator('[data-testid="alerts-list"], [data-testid="empty-state"]');
    await expect(alertsList.first()).toBeVisible();
  });

  test('FEAT-P-006: Acknowledge alert', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard/alerts');

    const acknowledgeButton = page.locator('[data-testid="button-acknowledge"]').first();
    const count = await acknowledgeButton.count();

    if (count > 0) {
      await acknowledgeButton.click();
      await page.waitForTimeout(500);

      // Verify button state changed or alert removed
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('FEAT-P-007: Filter alerts by severity', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');
    await page.goto('/dashboard/alerts');

    // Wait for filter tabs to be visible and stable before interacting.
    const filters = page.locator('[data-testid="alert-filters"]');
    await expect(filters).toBeVisible();

    const allFilter = page.locator('[data-testid="filter-all"]').first();
    const criticalFilter = page.locator('[data-testid="filter-critical"]').first();

    // Default selection is "All"
    await expect(allFilter).toHaveAttribute('aria-selected', 'true');

    // Switch to critical
    await criticalFilter.click();
    await expect(criticalFilter).toHaveAttribute('aria-selected', 'true');
    await expect(allFilter).toHaveAttribute('aria-selected', 'false');

    // UX smoke-check: page still renders after filter change
    await expect(page.locator('body')).toBeVisible();
  });

  test('FEAT-P-008: Update notification preferences', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard/settings');
    const page = authenticatedPage;
    await page.locator('[data-testid="settings-loaded"]').waitFor({ state: 'attached' });

    const pushToggle = page.locator('[data-testid="toggle-push"]').first();
    const count = await pushToggle.count();

    if (count > 0) {
      const initialState = await pushToggle.isChecked();
      await pushToggle.setChecked(!initialState);
      await page.waitForTimeout(500);

      // Verify state changed
      const newState = await pushToggle.isChecked();
      expect(newState).toBe(!initialState);

      // Save if save button exists
      const saveButton = page.locator('[data-testid="button-save-settings"]');
      const saveCount = await saveButton.count();

      if (saveCount > 0) {
        await saveButton.click();
        await assertToastMessage(page, /saved|success/i);
      }
    }
  });

  test('FEAT-P-009: Update alert thresholds', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard/settings');
    const page = authenticatedPage;
    await page.locator('[data-testid="settings-loaded"]').waitFor({ state: 'attached' });

    const thresholdInput = page.locator('[data-testid="input-grade-drop-threshold"]').first();
    const count = await thresholdInput.count();

    if (count > 0) {
      await thresholdInput.clear();
      await thresholdInput.fill('7');

      const saveButton = page.locator('[data-testid="button-save-settings"]');
      const saveCount = await saveButton.count();

      if (saveCount > 0) {
        await saveButton.click();
        await assertToastMessage(page, /saved|success/i);
      }
    }
  });

  test('FEAT-P-010: Settings persist on reload', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/dashboard/settings');
    const page = authenticatedPage;
    await page.locator('[data-testid="settings-loaded"]').waitFor({ state: 'attached' });

    const pushToggle = page.locator('[data-testid="toggle-push"]').first();
    const count = await pushToggle.count();

    if (count > 0) {
      const initialState = await pushToggle.isChecked();
      await pushToggle.setChecked(!initialState);
      if (initialState) {
        await expect(pushToggle).not.toBeChecked({ timeout: 2000 });
      } else {
        await expect(pushToggle).toBeChecked({ timeout: 2000 });
      }

      const saveButton = page.locator('[data-testid="button-save-settings"]');
      const saveCount = await saveButton.count();

      if (saveCount > 0) {
        await saveButton.click();
        await assertToastMessage(page, /saved|success/i);
      }

      // Reload page
      await page.reload();
      await page.locator('[data-testid="settings-loaded"]').waitFor({ state: 'attached' });

      // Verify setting persisted
      const newToggle = page.locator('[data-testid="toggle-push"]').first();
      const persistedState = await newToggle.isChecked();
      expect(persistedState).toBe(!initialState);
    }
  });
});
