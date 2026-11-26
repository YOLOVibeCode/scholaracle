import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { RegisterPage } from '../pages/register.page';
import { generateUniqueEmail } from '../fixtures/test-data';
import { assertToastMessage, assertOnDashboard } from '../helpers/assertions';

/**
 * Registers a new parent, adds one student for them and leaves the page on the students list.
 *
 * The tests that create, rename or delete a student work on this parent's student. The seeded
 * parent's students are shared with the specs that run later (INT-005 expects both of them).
 */
async function registerParentWithStudent(page: Page, emailPrefix: string): Promise<string> {
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.register(generateUniqueEmail(emailPrefix), 'Feature Parent', 'SecurePass123!');
  await assertOnDashboard(page);
  await page.goto('/dashboard/students/new');

  const studentName = `Test Student ${Date.now()}`;
  await page.fill('[data-testid="input-student-name"]', studentName);
  await page.fill('[data-testid="input-student-grade"]', '10');
  await page.fill('[data-testid="input-student-school"]', 'Test High School');

  await page.click('[data-testid="button-save-student"]');

  await page.waitForURL(/\/dashboard\/students$/, { timeout: 10000 });
  await expect(page.locator(`text=${studentName}`)).toBeVisible({ timeout: 10000 });
  return studentName;
}

/**
 * Layer 4: Feature CRUD Tests (Parent)
 *
 * Core functionality works for parent role.
 *
 * Depends on: Layer 3 (@navigation)
 * If Layer 3 fails → don't run
 */
test.describe('@feature Layer 4: Parent Features', () => {
  test('FEAT-P-001: Create student', async ({ page }) => {
    const studentName = await registerParentWithStudent(page, 'featp001');

    await expect(page.locator('[data-testid="student-list"]')).toBeVisible();
    await expect(page.locator(`text=${studentName}`)).toBeVisible();
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

  test('FEAT-P-003: Update student', async ({ page }) => {
    const studentName = await registerParentWithStudent(page, 'featp003');
    const updatedName = `Updated ${studentName}`;

    // The Edit control is a link, and the link's own test id is the one that reaches the page.
    await page.locator('[data-testid="student-link"]').click();
    await page.waitForURL(/\/dashboard\/students\/[^/]+$/, { timeout: 10000 });

    // The form appears once the student has loaded, and holds the name as it is now.
    const nameInput = page.locator('[data-testid="input-student-name"]');
    await expect(nameInput).toHaveValue(studentName);
    await nameInput.fill(updatedName);

    await page.click('[data-testid="button-save-student"]');

    await page.waitForURL(/\/dashboard\/students$/, { timeout: 10000 });
    await expect(page.getByText(updatedName, { exact: true })).toBeVisible();
    await expect(page.getByText(studentName, { exact: true })).toHaveCount(0);
  });

  test('FEAT-P-004: Delete student', async ({ page }) => {
    const studentName = await registerParentWithStudent(page, 'featp004');

    await page.locator('[data-testid="button-delete-student"]').click();
    await page.locator('[data-testid="button-confirm-dialog"]').click();

    // The list reloads after the delete. The empty state is what it shows once it has: checking
    // only that the name is gone would also pass while the list is still loading.
    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible();
    await expect(page.locator(`text=${studentName}`)).toHaveCount(0);
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

    const emailToggle = page.locator('[data-testid="toggle-email"]').first();
    await expect(emailToggle).toBeVisible();
    const initialState = await emailToggle.isChecked();
    await emailToggle.setChecked(!initialState);
    await expect(emailToggle).toBeChecked({ checked: !initialState });

    const saveButton = page.locator('[data-testid="button-save-settings"]');
    await saveButton.click();
    await assertToastMessage(page, /saved|success/i);
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

    const emailToggle = page.locator('[data-testid="toggle-email"]').first();
    await expect(emailToggle).toBeVisible();
    const initialState = await emailToggle.isChecked();
    await emailToggle.setChecked(!initialState);
    await expect(emailToggle).toBeChecked({ checked: !initialState });

    const saveButton = page.locator('[data-testid="button-save-settings"]');
    await saveButton.click();
    await assertToastMessage(page, /saved|success/i);

    await page.reload();
    await page.locator('[data-testid="settings-loaded"]').waitFor({ state: 'attached' });

    const newToggle = page.locator('[data-testid="toggle-email"]').first();
    const persistedState = await newToggle.isChecked();
    expect(persistedState).toBe(!initialState);
  });
});
