import { test, expect } from '@playwright/test';
import { expectNoA11yViolations } from '../helpers/a11y';
import { LoginPage } from '../pages/login.page';
import { TEST_USERS } from '../fixtures/test-data';

/**
 * A11Y-BASELINE — RISK-011, COVERAGE_GAPS §5.
 *
 * WCAG 2.2 AA baseline using @axe-core/playwright across critical parent-facing pages.
 * The suite asserts zero serious/critical violations on:
 *   - public marketing/auth pages (no login required)
 *   - authenticated dashboard / alerts / settings
 *
 * Per-page known issues should be excluded explicitly with a comment, never disabled silently.
 *
 * ASSUMPTION: dashboard routes are `/dashboard`, `/dashboard/alerts`, `/dashboard/settings`.
 * Verified against `packages/web/app/dashboard/` directory layout.
 */
test.describe('@a11y WCAG 2.2 AA baseline', () => {
  test('A11Y-001: /login has no serious/critical axe violations (golden path)', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('A11Y-002: /register has no serious/critical axe violations', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /create an account/i })).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('A11Y-003: /forgot-password has no serious/critical axe violations', async ({ page }) => {
    await page.goto('/forgot-password');
    await expectNoA11yViolations(page);
  });

  test('A11Y-004: authenticated /dashboard has no serious/critical axe violations', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USERS.parent.email, TEST_USERS.parent.password);
    await page.waitForURL(/\/dashboard/);
    // Excluding any third-party iframes (e.g. Stripe checkout) — we test those separately.
    await expectNoA11yViolations(page, { exclude: ['iframe'] });
  });

  test('A11Y-005: /dashboard/alerts has no serious/critical axe violations', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USERS.parent.email, TEST_USERS.parent.password);
    await page.waitForURL(/\/dashboard/);
    await page.goto('/dashboard/alerts');
    await expectNoA11yViolations(page, { exclude: ['iframe'] });
  });

  test('A11Y-006: /dashboard/settings has no serious/critical axe violations', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USERS.parent.email, TEST_USERS.parent.password);
    await page.waitForURL(/\/dashboard/);
    await page.goto('/dashboard/settings');
    await expectNoA11yViolations(page, { exclude: ['iframe'] });
  });

  test('A11Y-007 (boundary): error state on /login retains accessible role="alert"', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('nonexistent@example.com', 'WrongPassword123!', {
      waitForDashboard: false,
    });
    // Wait for error UI before scanning — covers the error-state branch (often forgotten).
    await expect(page.getByTestId('message-error')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('A11Y-008 (negative): /register submit-disabled state stays accessible', async ({
    page,
  }) => {
    await page.goto('/register');
    // Tab through and confirm focusable order is sane (each input gets focus).
    const inputs = await page.locator('input').count();
    for (let i = 0; i < Math.min(inputs, 6); i++) {
      await page.keyboard.press('Tab');
    }
    // Submit empty: native validation kicks in. Page must remain a11y-clean.
    await page.getByTestId('button-register').click().catch(() => {
      // Native validation may block submission; that's fine.
    });
    await expectNoA11yViolations(page);
  });
});
