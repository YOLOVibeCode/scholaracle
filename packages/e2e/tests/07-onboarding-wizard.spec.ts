import { test, expect } from '../fixtures/auth';
import { RegisterPage } from '../pages/register.page';
import { generateUniqueEmail } from '../fixtures/test-data';
import { assertOnDashboard } from '../helpers/assertions';
import { completeConnectProviderWizard } from '../helpers/connect-provider-wizard';

/**
 * Layer 4+: Add Student Wizard E2E Tests
 *
 * Exercises the full onboarding flow:
 *  - Fresh user sees welcome banner on dashboard
 *  - Opens AddStudentWizard → creates student
 *  - Sets up a new integration provider inline
 *  - Enters student credentials
 *  - Adds a second student reusing the same integration
 *
 * Depends on: auth layer (login/register fixtures)
 */
test.describe('@feature Onboarding Wizard', () => {
  // ------------------------------------------------------------------
  // OB-001: Fresh user sees onboarding banner and can open wizard
  // ------------------------------------------------------------------
  test('OB-001: Dashboard shows onboarding banner for new user', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const email = generateUniqueEmail('onboard');
    await registerPage.register(email, 'Onboard User', 'SecurePass123!');
    await assertOnDashboard(page);

    // Onboarding banner should be visible
    const banner = page.locator('[data-testid="onboarding-banner"]');
    await expect(banner).toBeVisible({ timeout: 10000 });

    // CTA button should exist
    const cta = page.locator('[data-testid="onboarding-add-student-cta"]');
    await expect(cta).toBeVisible();
  });

  // ------------------------------------------------------------------
  // OB-002: Dismiss onboarding banner
  // ------------------------------------------------------------------
  test('OB-002: Dismiss onboarding banner', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const email = generateUniqueEmail('dismiss');
    await registerPage.register(email, 'Dismiss User', 'SecurePass123!');
    await assertOnDashboard(page);

    const banner = page.locator('[data-testid="onboarding-banner"]');
    await expect(banner).toBeVisible({ timeout: 10000 });

    await page.click('[data-testid="button-onboarding-dismiss"]');
    await expect(banner).not.toBeVisible();
  });

  // ------------------------------------------------------------------
  // OB-003: Full wizard flow — create student, set up provider (download
  //         flow via ConnectProviderWizard), then finish
  // ------------------------------------------------------------------
  test('OB-003: Complete wizard: create student → new provider (setup wizard) → done', async ({
    page,
  }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const email = generateUniqueEmail('wizard');
    await registerPage.register(email, 'Wizard User', 'SecurePass123!');
    await assertOnDashboard(page);

    // Open wizard from onboarding banner
    await page.click('[data-testid="onboarding-add-student-cta"]');

    const wizard = page.locator('[data-testid="add-student-wizard"]');
    await expect(wizard).toBeVisible({ timeout: 5000 });

    // ── Step 1: Student Info ──
    const studentName = `Wizard Student ${Date.now()}`;
    await page.fill('[data-testid="wizard-student-name"]', studentName);
    await page.fill('[data-testid="wizard-student-grade"]', '9');
    await page.fill('[data-testid="wizard-student-school"]', 'Wizard Academy');

    const createStudentRes1 = page.waitForResponse(
      (r) => r.url().includes('/students') && r.request().method() === 'POST'
    );
    await page.click('[data-testid="wizard-next-step"]');
    const res1 = await createStudentRes1;
    expect(res1.status()).toBeLessThan(400);

    // ── Step 2: Connect Services (no integrations yet) ──
    const newProviderButton = page.locator('[data-testid="wizard-add-new-provider"]');
    await expect(newProviderButton).toBeVisible();
    await newProviderButton.click();

    // ── Step 2b: Add Provider — open ConnectProviderWizard dialog ──
    const openWizardButton = page.locator('[data-testid="wizard-open-connect-provider"]');
    await expect(openWizardButton).toBeVisible({ timeout: 5000 });
    await openWizardButton.click();

    // ConnectProviderWizard dialog: pick Canvas, fill credentials, continue to download, then Done
    const connectWizard = page.locator('[data-testid="connect-provider-wizard"]');
    await expect(connectWizard).toBeVisible({ timeout: 10000 });

    await completeConnectProviderWizard(connectWizard, {
      loginUrl: 'https://school.instructure.com',
      studentNameHint: studentName,
    });

    // Back at connect-services step — bundle should list the connection
    await expect(wizard).toContainText('Canvas', { timeout: 5000 });

    // Done connecting → finish
    const doneConnectingButton = page.locator('[data-testid="wizard-skip-services"]');
    await expect(doneConnectingButton).toBeVisible();
    await doneConnectingButton.click();

    const finishButton = page.locator('[data-testid="wizard-finish"]');
    await expect(finishButton).toBeVisible({ timeout: 5000 });
    await expect(wizard).toContainText(studentName);
    await finishButton.click();

    await expect(wizard).not.toBeVisible({ timeout: 3000 });

    await page.goto('/dashboard/students');
    await expect(page.locator(`text=${studentName}`)).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------
  // OB-004: Skip services — create student without connecting any
  // ------------------------------------------------------------------
  test('OB-004: Create student and skip services', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const email = generateUniqueEmail('skip');
    await registerPage.register(email, 'Skip User', 'SecurePass123!');
    await assertOnDashboard(page);

    await page.click('[data-testid="onboarding-add-student-cta"]');

    const wizard = page.locator('[data-testid="add-student-wizard"]');
    await expect(wizard).toBeVisible({ timeout: 5000 });

    // Step 1
    const studentName = `Skip Student ${Date.now()}`;
    await page.fill('[data-testid="wizard-student-name"]', studentName);

    const createStudentRes2 = page.waitForResponse(
      (r) => r.url().includes('/students') && r.request().method() === 'POST'
    );
    await page.click('[data-testid="wizard-next-step"]');
    await createStudentRes2;

    // Step 2: skip
    const skipButton = page.locator('[data-testid="wizard-skip-services"]');
    await expect(skipButton).toBeVisible();
    await skipButton.click();

    // Step 4: Done
    const finishButton = page.locator('[data-testid="wizard-finish"]');
    await expect(finishButton).toBeVisible({ timeout: 5000 });
    await expect(wizard).toContainText('No services connected yet');

    await finishButton.click();
    await expect(wizard).not.toBeVisible({ timeout: 3000 });

    // Verify student was created
    await page.goto('/dashboard/students');
    await expect(page.locator(`text=${studentName}`)).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------
  // OB-005: Add second student and reuse existing integration
  // ------------------------------------------------------------------
  test('OB-005: Free plan caps at one student (second create blocked)', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const email = generateUniqueEmail('reuse');
    await registerPage.register(email, 'Reuse User', 'SecurePass123!');
    await assertOnDashboard(page);

    // ── First student: create + new provider via ConnectProviderWizard ──
    await page.click('[data-testid="onboarding-add-student-cta"]');
    const wizard = page.locator('[data-testid="add-student-wizard"]');
    await expect(wizard).toBeVisible({ timeout: 5000 });

    const student1 = `First Child ${Date.now()}`;
    await page.fill('[data-testid="wizard-student-name"]', student1);
    await page.fill('[data-testid="wizard-student-grade"]', '7');

    const createStudent5a = page.waitForResponse(
      (r) => r.url().includes('/students') && r.request().method() === 'POST'
    );
    await page.click('[data-testid="wizard-next-step"]');
    await createStudent5a;

    await expect(page.locator('[data-testid="wizard-add-new-provider"]')).toBeVisible();
    await page.click('[data-testid="wizard-add-new-provider"]');
    await expect(page.locator('[data-testid="wizard-open-connect-provider"]')).toBeVisible();
    await page.click('[data-testid="wizard-open-connect-provider"]');

    const connectWizard = page.locator('[data-testid="connect-provider-wizard"]');
    await expect(connectWizard).toBeVisible({ timeout: 10000 });
    await completeConnectProviderWizard(connectWizard, {
      loginUrl: 'https://district.instructure.com',
      studentNameHint: student1,
    });

    await expect(wizard).toContainText('Canvas', { timeout: 5000 });
    const skipServices1 = page.locator('[data-testid="wizard-skip-services"]');
    await expect(skipServices1).toBeVisible({ timeout: 15_000 });
    await skipServices1.click();
    await page.locator('[data-testid="wizard-finish"]').click();
    await expect(wizard).not.toBeVisible({ timeout: 5000 });

    // ── Second student: free plan allows only one
    await page.goto('/dashboard/students');
    await page.click('[data-testid="button-add-student"]');
    await expect(wizard).toBeVisible({ timeout: 5000 });

    const student2 = `Second Child ${Date.now()}`;
    await page.fill('[data-testid="wizard-student-name"]', student2);
    const createStudent5b = page.waitForResponse(
      (r) => r.url().includes('/students') && r.request().method() === 'POST'
    );
    await page.click('[data-testid="wizard-next-step"]');
    const createRes = await createStudent5b;
    expect(createRes.status()).toBe(403);

    await page.goto('/dashboard/students');
    await expect(page.locator(`text=${student1}`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${student2}`)).not.toBeVisible();
  });

  // ------------------------------------------------------------------
  // OB-006: Open wizard from Students page
  // ------------------------------------------------------------------
  test('OB-006: Open wizard from Students page Add Student button', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    const email = generateUniqueEmail('students-page');
    await registerPage.register(email, 'Students Page User', 'SecurePass123!');
    await assertOnDashboard(page);

    await page.goto('/dashboard/students');
    await expect(page).toHaveURL('/dashboard/students');

    // Click the Add Student button (now opens wizard instead of navigating)
    await page.click('[data-testid="button-add-student"]');

    const wizard = page.locator('[data-testid="add-student-wizard"]');
    await expect(wizard).toBeVisible({ timeout: 5000 });

    // Verify we're on step 1
    await expect(page.locator('[data-testid="wizard-student-name"]')).toBeVisible();

    // Create a student
    const studentName = `Students Page ${Date.now()}`;
    await page.fill('[data-testid="wizard-student-name"]', studentName);

    const createStudent6 = page.waitForResponse(
      (r) => r.url().includes('/students') && r.request().method() === 'POST'
    );
    await page.click('[data-testid="wizard-next-step"]');
    await createStudent6;

    await expect(page.locator('[data-testid="wizard-add-new-provider"]')).toBeVisible({
      timeout: 15_000,
    });

    // Skip services
    await expect(page.locator('[data-testid="wizard-skip-services"]')).toBeVisible({
      timeout: 15_000,
    });
    await page.locator('[data-testid="wizard-skip-services"]').click();

    // Finish
    await page.locator('[data-testid="wizard-finish"]').click();
    await expect(wizard).not.toBeVisible({ timeout: 3000 });

    // Student should appear in the list
    await expect(page.locator(`text=${studentName}`)).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------
  // OB-007: Connect multiple services to one student
  // ------------------------------------------------------------------
  test('OB-007: Connect another service to same student', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const email = generateUniqueEmail('multi');
    await registerPage.register(email, 'Multi User', 'SecurePass123!');
    await assertOnDashboard(page);

    await page.click('[data-testid="onboarding-add-student-cta"]');

    const wizard = page.locator('[data-testid="add-student-wizard"]');
    await expect(wizard).toBeVisible({ timeout: 5000 });

    const studentName = `Multi Service ${Date.now()}`;
    await page.fill('[data-testid="wizard-student-name"]', studentName);

    const createStudent7 = page.waitForResponse(
      (r) => r.url().includes('/students') && r.request().method() === 'POST'
    );
    await page.click('[data-testid="wizard-next-step"]');
    await createStudent7;

    // First integration via ConnectProviderWizard
    await expect(page.locator('[data-testid="wizard-add-new-provider"]')).toBeVisible();
    await page.click('[data-testid="wizard-add-new-provider"]');
    await expect(page.locator('[data-testid="wizard-open-connect-provider"]')).toBeVisible();
    await page.click('[data-testid="wizard-open-connect-provider"]');
    const connectWizard = page.locator('[data-testid="connect-provider-wizard"]');
    await expect(connectWizard).toBeVisible({ timeout: 10000 });
    await completeConnectProviderWizard(connectWizard, {
      loginUrl: 'https://school.instructure.com',
      studentNameHint: studentName,
    });

    await expect(wizard).toContainText('Canvas', { timeout: 5000 });
    await page.locator('[data-testid="wizard-skip-services"]').click();
    const addServiceButton = page.locator('[data-testid="wizard-add-another-service"]');
    await expect(addServiceButton).toBeVisible();
    await addServiceButton.click();

    await expect(wizard).toContainText('Canvas');

    const newProviderButton = page.locator('[data-testid="wizard-add-new-provider"]');
    await expect(newProviderButton).toBeVisible();

    const doneButton = page.locator('[data-testid="wizard-skip-services"]');
    await expect(doneButton).toContainText('Done connecting');
    await doneButton.click();

    await page.locator('[data-testid="wizard-finish"]').click();
    await expect(wizard).not.toBeVisible({ timeout: 3000 });
  });

  // ------------------------------------------------------------------
  // OB-008: Wizard validation — name is required
  // ------------------------------------------------------------------
  test('OB-008: Wizard requires student name', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const email = generateUniqueEmail('validate');
    await registerPage.register(email, 'Validate User', 'SecurePass123!');
    await assertOnDashboard(page);

    await page.click('[data-testid="onboarding-add-student-cta"]');

    const wizard = page.locator('[data-testid="add-student-wizard"]');
    await expect(wizard).toBeVisible({ timeout: 5000 });

    // Try to proceed without entering a name — button should be disabled
    const nextButton = page.locator('[data-testid="wizard-next-step"]');
    await expect(nextButton).toBeDisabled();
  });
});
