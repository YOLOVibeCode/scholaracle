import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the Admin Customers page.
 */
export class AdminCustomersPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly customerTable: Locator;
  readonly customerRows: Locator;
  readonly addCustomerButton: Locator;
  readonly exportButton: Locator;
  readonly filterDropdown: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1:has-text("Customers")');
    this.searchInput = page.locator('[data-testid="search-input"]');
    this.customerTable = page.locator('table');
    this.customerRows = page.locator('[data-testid="customer-row"]');
    this.addCustomerButton = page.locator('[data-testid="add-customer-button"]');
    this.exportButton = page.locator('[data-testid="export-button"]');
    this.filterDropdown = page.locator('[data-testid="filter-dropdown"]');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/customers');
  }

  async expectOnCustomersPage(): Promise<void> {
    await expect(this.page).toHaveURL('/admin/customers');
    await expect(this.heading).toBeVisible();
  }

  async searchCustomer(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500); // Wait for search to execute
  }

  async clickCustomerRow(email: string): Promise<void> {
    await this.customerRows.filter({ hasText: email }).first().click();
  }

  async getCustomerCount(): Promise<number> {
    return await this.customerRows.count();
  }
}
