import { test, expect } from '@playwright/test';
import { RegisterPage } from '../pages/register.page';
import { generateUniqueEmail } from '../fixtures/test-data';
import { assertOnDashboard } from '../helpers/assertions';

/**
 * Full UX E2E: Register → Add Student (UI) → Trigger Alert (API) → [Optional] Verify Email in Mailpit.
 *
 * Every UI interaction waits for the real API response before proceeding — no blind waits.
 */
test.describe('@integration Full UX: Register → Add Student → Alert → Email', () => {
  test('FULL-UX-001: Register, add student via UI, trigger alert, optionally verify Mailpit', async ({
    page,
    request,
  }) => {
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:2801';
    const mailpitUi = process.env.MAILPIT_UI;

    // 1. Register (UI — RegisterPage.register intercepts POST /auth/register)
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    const email = generateUniqueEmail('full-ux');
    const password = 'SecurePass123!';
    await registerPage.register(email, 'Full UX User', password);
    await assertOnDashboard(page);

    // 2. Navigate to Students
    await page.goto('/dashboard/students');
    await expect(
      page.locator('[data-testid="student-list"], [data-testid="empty-state"]').first()
    ).toBeVisible();

    // 3. Open Add Student wizard and fill form
    await page.locator('[data-testid="button-add-student"]').first().click();
    await expect(page.locator('[data-testid="add-student-wizard"]')).toBeVisible();

    const studentName = `Full UX Student ${Date.now()}`;
    await page.locator('[data-testid="wizard-student-name"]').fill(studentName);
    await page.locator('[data-testid="wizard-student-grade"]').fill('9');
    await page.locator('[data-testid="wizard-student-school"]').fill('E2E High School');

    // 4. Click "Next" — intercept POST /students (wizard creates student)
    const createStudentResponse = page.waitForResponse(
      (r) => r.url().includes('/students') && r.request().method() === 'POST'
    );
    await page.locator('[data-testid="wizard-next-step"]').click();
    const studentRes = await createStudentResponse;
    expect(studentRes.status()).toBeLessThan(400);

    // 5. Skip services → Done
    await expect(page.locator('[data-testid="wizard-skip-services"]')).toBeVisible();
    await page.locator('[data-testid="wizard-skip-services"]').click();

    await expect(page.locator('[data-testid="wizard-finish"]')).toBeVisible();
    await page.locator('[data-testid="wizard-finish"]').click();

    await expect(page.locator('[data-testid="add-student-wizard"]')).not.toBeVisible();
    await expect(page.locator(`text=${studentName}`)).toBeVisible();

    // 6. Get auth token and student id via API
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();

    const studentsListRes = await request.get(`${apiBaseUrl}/api/students`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(studentsListRes.ok()).toBe(true);
    const students = (await studentsListRes.json()) as { id: string }[];
    expect(students.length).toBeGreaterThanOrEqual(1);
    const studentId = students[0].id;

    // 7. Trigger alert via API
    const alertRes = await request.post(`${apiBaseUrl}/api/alerts`, {
      data: {
        studentId,
        type: 'grade_drop',
        severity: 'critical',
        userId: email,
        relatedData: {
          courseName: 'Math',
          previousGrade: 92,
          currentGrade: 85,
        },
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(alertRes.status()).toBe(201);

    // 8. Optionally verify Mailpit received the alert email
    if (mailpitUi) {
      const mailpitRes = await request.get(`${mailpitUi}/api/v1/messages`);
      if (mailpitRes.ok()) {
        const body = (await mailpitRes.json()) as { total?: number; messages?: unknown[] };
        const count = body.total ?? (Array.isArray(body.messages) ? body.messages.length : 0);
        expect(count).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
