import { test, expect } from '../fixtures/auth';

/**
 * Action Board E2E
 *
 * Covers compact Action Board on dashboard and full Action Board on student view.
 * Fills audit gap: "Action Board (full and compact)" had no E2E.
 */
test.describe('Action Board', () => {
  test.beforeEach(async ({ loginAsRole }) => {
    await loginAsRole('parent');
  });

  test('AB-001: Dashboard shows Action Board (compact) or empty state', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/dashboard');

    await page.waitForSelector('[data-testid="loading-skeleton-dashboard"]', { state: 'hidden', timeout: 10000 }).catch(() => {});

    const actionBoard = page.locator('[data-testid="action-board"]');
    const actionBoardEmpty = page.locator('[data-testid="action-board-empty"]');
    const actionBoardLoading = page.locator('[data-testid="action-board-loading"]');
    const deadlinesEmpty = page.locator('[data-testid="dashboard-deadlines-empty"]');

    await expect(
      actionBoard.or(actionBoardEmpty).or(actionBoardLoading).or(deadlinesEmpty)
    ).toBeVisible({ timeout: 10000 });
  });

  test('AB-002: Student view shows Action Board (full)', async ({ page }) => {
    await page.goto('/dashboard/students');
    await expect(page).toHaveURL('/dashboard/students');

    const viewButton = page.locator('[data-testid="button-view-as-student"]').first();
    const count = await viewButton.count();

    if (count === 0) {
      test.skip();
      return;
    }

    await viewButton.click();
    await expect(page).toHaveURL(/\/dashboard\/students\/[^/]+\/view/);

    const card = page.locator('[data-testid="student-view-action-board"]');
    await expect(card).toBeVisible({ timeout: 10000 });

    const actionBoard = page.locator('[data-testid="student-view-action-board"] [data-testid="action-board"]');
    const actionBoardEmpty = page.locator('[data-testid="student-view-action-board"] [data-testid="action-board-empty"]');
    const actionBoardLoading = page.locator('[data-testid="student-view-action-board"] [data-testid="action-board-loading"]');

    await expect(
      actionBoard.or(actionBoardEmpty).or(actionBoardLoading)
    ).toBeVisible({ timeout: 10000 });
  });
});
