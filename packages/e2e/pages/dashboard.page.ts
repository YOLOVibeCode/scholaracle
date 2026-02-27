import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object for the Dashboard page.
 */
export class DashboardPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly studentCountCard: Locator;
  readonly coursesCard: Locator;
  readonly alertsCard: Locator;
  readonly gpaCard: Locator;
  readonly recentAlerts: Locator;
  readonly upcomingDeadlines: Locator;
  readonly studentsLink: Locator;
  readonly alertsLink: Locator;
  readonly settingsLink: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.locator('h1:has-text("Dashboard")');
    this.studentCountCard = page.locator('[data-testid="student-count"]');
    this.coursesCard = page.locator(':has-text("Active Courses") >> ..');
    this.alertsCard = page.locator(':has-text("Alerts") >> ..');
    this.gpaCard = page.locator(':has-text("Average GPA") >> ..');
    this.recentAlerts = page.locator('[data-testid="dashboard-recent-alerts"]');
    this.upcomingDeadlines = page.locator('[data-testid="dashboard-upcoming-deadlines"]');
    this.studentsLink = page.locator('a[href="/dashboard/students"]');
    this.alertsLink = page.locator('a[href="/dashboard/alerts"]');
    this.settingsLink = page.locator('a[href="/dashboard/settings"]');
    this.logoutButton = page.locator('[data-testid="button-logout"], button:has-text("Logout")');
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard');
  }

  async expectOnDashboard(): Promise<void> {
    await expect(this.page).toHaveURL('/dashboard');
    await expect(this.heading).toBeVisible();
  }

  async getStudentCount(): Promise<string> {
    const card = this.page.locator(':has-text("Students")').first();
    const countElement = card.locator('.text-2xl');
    return (await countElement.textContent()) ?? '0';
  }

  async getAlertsCount(): Promise<string> {
    const card = this.page.locator(':has-text("Alerts")').first();
    const countElement = card.locator('.text-2xl');
    return (await countElement.textContent()) ?? '0';
  }

  async navigateToStudents(): Promise<void> {
    await this.studentsLink.click();
    await this.page.waitForURL('/dashboard/students');
  }

  async navigateToAlerts(): Promise<void> {
    await this.alertsLink.click();
    await this.page.waitForURL('/dashboard/alerts');
  }

  async navigateToSettings(): Promise<void> {
    await this.settingsLink.click();
    await this.page.waitForURL('/dashboard/settings');
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
    await this.page.waitForURL('/login');
  }
}
