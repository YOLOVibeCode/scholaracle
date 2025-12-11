import { Page } from '@playwright/test';

/**
 * Navigation helpers for E2E tests.
 */

/**
 * Navigate to sidebar link by text.
 */
export async function navigateToSidebar(page: Page, linkText: string): Promise<void> {
  await page.click(`nav >> text="${linkText}"`);
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to tab by name.
 */
export async function navigateToTab(page: Page, tabName: string): Promise<void> {
  await page.click(`[role="tab"]:has-text("${tabName}")`);
  await page.waitForTimeout(500); // Wait for tab content to load
}

/**
 * Click breadcrumb link.
 */
export async function clickBreadcrumb(page: Page, text: string): Promise<void> {
  await page.click(`nav[aria-label="breadcrumb"] >> text="${text}"`);
}

/**
 * Navigate back using browser back button.
 */
export async function navigateBack(page: Page): Promise<void> {
  await page.goBack();
  await page.waitForLoadState('networkidle');
}

/**
 * Click mobile menu toggle (hamburger).
 */
export async function toggleMobileMenu(page: Page): Promise<void> {
  await page.click('[data-testid="mobile-menu-toggle"], button[aria-label="Toggle menu"]');
}
