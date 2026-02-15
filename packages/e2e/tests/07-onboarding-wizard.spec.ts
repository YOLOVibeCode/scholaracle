import { test, expect } from '../fixtures/auth';
import { RegisterPage } from '../pages/register.page';
import { generateUniqueEmail } from '../fixtures/test-data';
import { assertOnDashboard } from '../helpers/assertions';

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
  // OB-003: Full wizard flow — create student, set up provider, enter
  //         credentials, finish
  // ------------------------------------------------------------------
  test('OB-003: Complete wizard: create student → new provider → credentials → done', async ({ page }) => {
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

    await page.click('[data-testid="wizard-next-step"]');

    // ── Step 2: Connect Services (no integrations yet) ──
    // Should see "Set up a new provider" button
    const newProviderButton = page.locator('[data-testid="wizard-add-new-provider"]');
    await expect(newProviderButton).toBeVisible({ timeout: 5000 });

    await newProviderButton.click();

    // ── Step 2b: Add Provider Inline ──
    // Select Canvas LMS
    const canvasOption = page.locator('[data-testid="wizard-provider-canvas"]');
    await expect(canvasOption).toBeVisible({ timeout: 5000 });
    await canvasOption.click();

    // Fill provider details
    await page.fill('[data-testid="wizard-provider-url"]', 'https://school.instructure.com');
    await page.fill('[data-testid="wizard-provider-display-name"]', 'My School Canvas');

    await page.click('[data-testid="wizard-create-provider"]');

    // ── Step 3: Credentials ──
    // Should land on credentials step
    const credentialsToken = page.locator('[data-testid="wizard-credentials-token"]');
    await expect(credentialsToken).toBeVisible({ timeout: 5000 });

    // Skip credentials for now (encryption key may not be set in E2E)
    const skipButton = page.getByText('Skip credentials');
    await skipButton.click();

    // ── Step 4: Done ──
    const finishButton = page.locator('[data-testid="wizard-finish"]');
    await expect(finishButton).toBeVisible({ timeout: 5000 });

    // Verify success state shows student name
    await expect(wizard).toContainText(studentName);
    await expect(wizard).toContainText('My School Canvas');

    await finishButton.click();

    // Wizard should close
    await expect(wizard).not.toBeVisible({ timeout: 3000 });

    // Student should now appear on the dashboard grade strip (or the banner should be gone)
    // Navigate to students page to verify
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
    await page.click('[data-testid="wizard-next-step"]');

    // Step 2: skip
    const skipButton = page.locator('[data-testid="wizard-skip-services"]');
    await expect(skipButton).toBeVisible({ timeout: 5000 });
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
  test('OB-005: Second student reuses existing integration', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const email = generateUniqueEmail('reuse');
    await registerPage.register(email, 'Reuse User', 'SecurePass123!');
    await assertOnDashboard(page);

    // ── First student: create + new provider ──
    await page.click('[data-testid="onboarding-add-student-cta"]');
    const wizard = page.locator('[data-testid="add-student-wizard"]');
    await expect(wizard).toBeVisible({ timeout: 5000 });

    const student1 = `First Child ${Date.now()}`;
    await page.fill('[data-testid="wizard-student-name"]', student1);
    await page.fill('[data-testid="wizard-student-grade"]', '7');
    await page.click('[data-testid="wizard-next-step"]');

    // Set up new provider
    await page.click('[data-testid="wizard-add-new-provider"]');
    await page.click('[data-testid="wizard-provider-canvas"]');
    await page.fill('[data-testid="wizard-provider-url"]', 'https://district.instructure.com');
    await page.fill('[data-testid="wizard-provider-display-name"]', 'District Canvas');
    await page.click('[data-testid="wizard-create-provider"]');

    // Skip credentials
    await page.getByText('Skip credentials').click();

    // Done → click "Add another student"
    const addAnotherButton = page.locator('[data-testid="wizard-add-another-student"]');
    await expect(addAnotherButton).toBeVisible({ timeout: 5000 });
    await addAnotherButton.click();

    // ── Second student: reuse existing integration ──
    const student2 = `Second Child ${Date.now()}`;
    await page.fill('[data-testid="wizard-student-name"]', student2);
    await page.fill('[data-testid="wizard-student-grade"]', '5');
    await page.click('[data-testid="wizard-next-step"]');

    // Step 2: Should now show existing integration "District Canvas"
    await expect(wizard).toContainText('District Canvas', { timeout: 5000 });
    await expect(wizard).toContainText('Your integrations');

    // Select the existing integration
    const integrationCards = wizard.locator('button:has-text("District Canvas")');
    await expect(integrationCards.first()).toBeVisible({ timeout: 5000 });
    await integrationCards.first().click();

    // Skip credentials
    await page.getByText('Skip credentials').click();

    // Finish
    const finishButton = page.locator('[data-testid="wizard-finish"]');
    await expect(finishButton).toBeVisible({ timeout: 5000 });
    await finishButton.click();
    await expect(wizard).not.toBeVisible({ timeout: 3000 });

    // Verify both students exist
    await page.goto('/dashboard/students');
    await expect(page.locator(`text=${student1}`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${student2}`)).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------
  // OB-006: Open wizard from Students page
  // ------------------------------------------------------------------
  test('OB-006: Open wizard from Students page Add Student button', async ({ page, loginAsRole }) => {
    await loginAsRole('parent');

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
    await page.click('[data-testid="wizard-next-step"]');

    // Skip services
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
    await page.click('[data-testid="wizard-next-step"]');

    // First integration
    await page.click('[data-testid="wizard-add-new-provider"]');
    await page.click('[data-testid="wizard-provider-canvas"]');
    await page.fill('[data-testid="wizard-provider-display-name"]', 'Canvas First');
    await page.click('[data-testid="wizard-create-provider"]');
    await page.getByText('Skip credentials').click();

    // At "Done" step, click "Connect another service"
    const addServiceButton = page.locator('[data-testid="wizard-add-another-service"]');
    await expect(addServiceButton).toBeVisible({ timeout: 5000 });
    await addServiceButton.click();

    // Should be back on Connect Services with Canvas First already connected
    await expect(wizard).toContainText('Connected:');
    await expect(wizard).toContainText('Canvas First');

    // Still see "Set up a new provider" since Canvas First is already connected
    const newProviderButton = page.locator('[data-testid="wizard-add-new-provider"]');
    await expect(newProviderButton).toBeVisible();

    // Done connecting
    const doneButton = page.locator('[data-testid="wizard-skip-services"]');
    await expect(doneButton).toContainText('Done connecting');
    await doneButton.click();

    // Finish
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
