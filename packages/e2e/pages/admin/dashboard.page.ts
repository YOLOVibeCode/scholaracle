import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the Admin Dashboard page.
 */
export class AdminDashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly customersLink: Locator;
  readonly paymentsLink: Locator;
  readonly subscriptionsLink: Locator;
  readonly communicationsLink: Locator;
  readonly reportsLink: Locator;
  readonly settingsLink: Locator;
  readonly auditLogsLink: Locator;
  readonly logoutButton: Locator;
  readonly kpiCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1:has-text("Dashboard"), [data-testid="admin-header"]');
    this.customersLink = page.locator('a[href="/admin/customers"], [data-testid="customers-link"]');
    this.paymentsLink = page.locator('a[href="/admin/payments"], [data-testid="payments-link"]');
    this.subscriptionsLink = page.locator('a[href="/admin/subscriptions"], [data-testid="subscriptions-link"]');
    this.communicationsLink = page.locator('a[href="/admin/communications"], [data-testid="communications-link"]');
    this.reportsLink = page.locator('a[href="/admin/reports"], [data-testid="reports-link"]');
    this.settingsLink = page.locator('a[href="/admin/settings"], [data-testid="settings-link"]');
    this.auditLogsLink = page.locator('a[href="/admin/audit-logs"], [data-testid="audit-logs-link"]');
    this.logoutButton = page.locator('[data-testid="logout-button"], button:has-text("Logout")');
    this.kpiCards = page.locator('[data-testid="kpi-card"], .stat-card');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/dashboard');
  }

  async expectOnAdminDashboard(): Promise<void> {
    await expect(this.page).toHaveURL(/\/admin/);
    await expect(this.heading).toBeVisible();
  }

  async navigateToCustomers(): Promise<void> {
    await this.customersLink.click();
    await this.page.waitForURL('/admin/customers');
  }

  async navigateToPayments(): Promise<void> {
    await this.paymentsLink.click();
    await this.page.waitForURL('/admin/payments');
  }

  async navigateToSubscriptions(): Promise<void> {
    await this.subscriptionsLink.click();
    await this.page.waitForURL('/admin/subscriptions');
  }

  async navigateToCommunications(): Promise<void> {
    await this.communicationsLink.click();
    await this.page.waitForURL('/admin/communications');
  }

  async navigateToReports(): Promise<void> {
    await this.reportsLink.click();
    await this.page.waitForURL('/admin/reports');
  }

  async navigateToSettings(): Promise<void> {
    await this.settingsLink.click();
    await this.page.waitForURL('/admin/settings');
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
    await this.page.waitForURL(/\/admin\/login/);
  }
}
