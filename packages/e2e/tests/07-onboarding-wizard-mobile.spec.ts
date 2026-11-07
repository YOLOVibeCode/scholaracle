import { test, expect } from '../fixtures/auth';
import { RegisterPage } from '../pages/register.page';
import { assertOnDashboard } from '../helpers/assertions';
import { generateUniqueEmail } from '../fixtures/test-data';

/**
 * Mobile-width regression for GitHub issue #2: wizard controls must stay reachable.
 */
test.describe('@feature Onboarding Wizard — mobile width', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('OB-MOB-001: Add Student wizard Next button is visible and clickable at 375px', async ({
    page,
  }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const email = generateUniqueEmail('wizard-mobile');
    await registerPage.register(email, 'Mobile Wizard User', 'SecurePass123!');
    await assertOnDashboard(page);

    await page.click('[data-testid="onboarding-add-student-cta"]');

    const wizard = page.locator('[data-testid="add-student-wizard"]');
    await expect(wizard).toBeVisible({ timeout: 5000 });

    const scrollBody = page.locator('[data-testid="wizard-scroll-body"]');
    await expect(scrollBody).toBeVisible();

    const studentName = `Mobile Student ${Date.now()}`;
    await page.fill('[data-testid="wizard-student-name"]', studentName);
    await page.fill('[data-testid="wizard-student-grade"]', '10');
    await page.fill('[data-testid="wizard-student-school"]', 'Lincoln High School — full name for scroll');

    const nextButton = page.locator('[data-testid="wizard-next-step"]');
    await expect(nextButton).toBeVisible();
    await expect(nextButton).toBeEnabled();

    const box = await nextButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(812 + 2);

    const createStudent = page.waitForResponse(
      (r) => r.url().includes('/students') && r.request().method() === 'POST'
    );
    await nextButton.click();
    await createStudent;

    await expect(page.locator('[data-testid="wizard-skip-services"]')).toBeVisible({ timeout: 8000 });
  });

  test('OB-MOB-002: Connect Source sheet provider row is clickable at 375px', async ({
    page,
    loginAsRole,
  }) => {
    await loginAsRole('parent');

    await page.goto('/dashboard/students');
    const firstStudentLink = page.locator('a[href^="/dashboard/students/"]').first();
    await expect(firstStudentLink).toBeVisible({ timeout: 10000 });
    await firstStudentLink.click();

    await page.click('[data-testid="tab-sources"]');
    await page.click('[data-testid="button-connect-source"]');

    const sheet = page.locator('[data-testid="connect-source-wizard"]');
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="connect-source-scroll-body"]')).toBeVisible();

    const canvasBtn = page.locator('[data-testid="provider-canvas"]');
    await expect(canvasBtn).toBeVisible();
    const canvasBox = await canvasBtn.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.y + canvasBox!.height).toBeLessThanOrEqual(812 + 2);

    await canvasBtn.click();
    await expect(page.locator('[data-testid="input-portal-url"]')).toBeVisible({ timeout: 5000 });
  });
});
