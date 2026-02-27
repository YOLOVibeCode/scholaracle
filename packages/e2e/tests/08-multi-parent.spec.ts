import { test, expect } from '../fixtures/auth';
import { RegisterPage } from '../pages/register.page';
import { LoginPage } from '../pages/login.page';
import { generateUniqueEmail } from '../fixtures/test-data';
import { assertOnDashboard } from '../helpers/assertions';

/**
 * Multi-Parent E2E Tests
 *
 * Exercises the parent sharing flow:
 *  - Parent A creates student, invites Parent B
 *  - Parent B registers, accepts invite, sees student
 *  - Parent A promotes Parent B to admin
 *  - Admin Parent B can invite Parent C
 *  - Parent A removes Parent C
 */
test.describe('@feature Multi-Parent Sharing', () => {
  // ------------------------------------------------------------------
  // MP-001: Parent A creates student and sees Parents tab
  // ------------------------------------------------------------------
  test('MP-001: Parents tab shows primary owner', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const email = generateUniqueEmail('parentA');
    await registerPage.register(email, 'Parent A', 'SecurePass123!');
    await assertOnDashboard(page);

    // Create a student via the wizard
    await page.click('[data-testid="onboarding-add-student-cta"]');
    const wizard = page.locator('[data-testid="add-student-wizard"]');
    await expect(wizard).toBeVisible({ timeout: 5000 });

    const studentName = `Shared Student ${Date.now()}`;
    await page.fill('[data-testid="wizard-student-name"]', studentName);
    await page.click('[data-testid="wizard-next-step"]');
    await page.locator('[data-testid="wizard-skip-services"]').click();
    await page.locator('[data-testid="wizard-finish"]').click();
    await expect(wizard).not.toBeVisible({ timeout: 3000 });

    // Navigate to student detail
    await page.goto('/dashboard/students');
    await expect(page.locator(`text=${studentName}`)).toBeVisible({ timeout: 10000 });

    // Click edit on the student
    await page.locator('[data-testid="student-link"]').first().click();
    await page.waitForURL(/\/dashboard\/students\/[^/]+/, { timeout: 5000 });

    // Click Parents tab
    await page.click('[data-testid="tab-parents"]');

    // Should see the Manage Parents card
    const card = page.locator('[data-testid="manage-parents-card"]');
    await expect(card).toBeVisible({ timeout: 5000 });

    // Should show the owner
    await expect(card).toContainText('Owner');
  });

  // ------------------------------------------------------------------
  // MP-002: Parent A invites Parent B by email (via API, verified in UI)
  // ------------------------------------------------------------------
  test('MP-002: Invite another parent', async ({ page, request }) => {
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:2801';
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const parentAEmail = generateUniqueEmail('parentA');
    await registerPage.register(parentAEmail, 'Parent A', 'SecurePass123!');
    await assertOnDashboard(page);

    const parentAToken = await page.evaluate(() => localStorage.getItem('auth_token'));

    // Create student via API
    const createRes = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: `Invite Test ${Date.now()}` },
      headers: { authorization: `Bearer ${parentAToken}` },
    });
    const student = (await createRes.json()) as { id: string };

    // Invite via API
    const parentBEmail = generateUniqueEmail('parentB');
    const inviteRes = await request.post(
      `${apiBaseUrl}/api/students/${student.id}/parents/invite`,
      {
        data: { email: parentBEmail, role: 'parent' },
        headers: { authorization: `Bearer ${parentAToken}` },
      }
    );
    expect(inviteRes.ok()).toBeTruthy();

    // Navigate to student → Parents tab to verify in UI
    await page.goto(`/dashboard/students/${student.id}`);
    await page.waitForURL(/\/dashboard\/students\/[^/]+/, { timeout: 5000 });
    await page.click('[data-testid="tab-parents"]');

    const card = page.locator('[data-testid="manage-parents-card"]');
    await expect(card).toBeVisible({ timeout: 5000 });

    // Should show the pending invite in the list (email is lowercased by the API)
    await expect(card).toContainText(parentBEmail.toLowerCase(), { timeout: 10000 });
    await expect(card).toContainText('invite pending');
  });

  // ------------------------------------------------------------------
  // MP-003: Full flow — invite, accept, shared access
  // ------------------------------------------------------------------
  test('MP-003: Invited parent accepts and sees student', async ({ page, request }) => {
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:2801';
    const password = 'SecurePass123!';

    // ---- Parent A: register, create student, invite Parent B ----
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    const parentAEmail = generateUniqueEmail('alphaA');
    await registerPage.register(parentAEmail, 'Alpha Parent', password);
    await assertOnDashboard(page);

    // Get Parent A's auth token
    const parentAToken = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(parentAToken).toBeTruthy();

    // Create student via API (faster than wizard)
    const createRes = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: `Shared Kid ${Date.now()}`, grade: 8 },
      headers: { authorization: `Bearer ${parentAToken}` },
    });
    expect(createRes.ok()).toBeTruthy();
    const student = (await createRes.json()) as { id: string; name: string };

    // Invite Parent B via API
    const parentBEmail = generateUniqueEmail('betaB');
    const inviteRes = await request.post(
      `${apiBaseUrl}/api/students/${student.id}/parents/invite`,
      {
        data: { email: parentBEmail, role: 'parent' },
        headers: { authorization: `Bearer ${parentAToken}` },
      }
    );
    expect(inviteRes.ok()).toBeTruthy();

    // ---- Parent B: register, accept invite ----
    // Logout Parent A
    await page.locator('[data-testid="button-logout"]').click({ force: true });
    await page.waitForURL(/\/login/, { timeout: 10000 });

    // Register Parent B
    const registerPage2 = new RegisterPage(page);
    await registerPage2.goto();
    await registerPage2.register(parentBEmail, 'Beta Parent', password);
    await assertOnDashboard(page);

    // Get Parent B's auth token
    const parentBToken = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(parentBToken).toBeTruthy();

    // Accept the invite via API
    const acceptRes = await request.post(
      `${apiBaseUrl}/api/students/${student.id}/parents/accept`,
      {
        data: { email: parentBEmail },
        headers: { authorization: `Bearer ${parentBToken}` },
      }
    );
    expect(acceptRes.ok()).toBeTruthy();

    // Parent B should now see the student on their dashboard
    await page.goto('/dashboard/students');
    await expect(page.locator(`text=${student.name}`)).toBeVisible({ timeout: 10000 });
  });

  // ------------------------------------------------------------------
  // MP-004: Promote shared parent to admin
  // ------------------------------------------------------------------
  test('MP-004: Promote parent to admin via API', async ({ page, request }) => {
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:2801';
    const password = 'SecurePass123!';

    // Register Parent A via API (to avoid browser state issues)
    const parentAEmail = generateUniqueEmail('promoA');
    const regARes = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email: parentAEmail, password, name: 'Promo Parent A' },
    });
    expect(regARes.ok()).toBeTruthy();
    const parentAToken = ((await regARes.json()) as { token: string }).token;

    // Create student via API
    const createRes = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: `Admin Test ${Date.now()}` },
      headers: { authorization: `Bearer ${parentAToken}` },
    });
    expect(createRes.ok()).toBeTruthy();
    const student = (await createRes.json()) as { id: string };

    // Invite Parent B via API
    const parentBEmail = generateUniqueEmail('promoB');
    const inviteRes = await request.post(
      `${apiBaseUrl}/api/students/${student.id}/parents/invite`,
      {
        data: { email: parentBEmail, role: 'guardian' },
        headers: { authorization: `Bearer ${parentAToken}` },
      }
    );
    expect(inviteRes.ok()).toBeTruthy();

    // Register Parent B via API
    const regBRes = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email: parentBEmail, password, name: 'Promo Parent B' },
    });
    expect(regBRes.ok()).toBeTruthy();
    const parentBToken = ((await regBRes.json()) as { token: string }).token;

    // Accept invite
    const acceptRes = await request.post(
      `${apiBaseUrl}/api/students/${student.id}/parents/accept`,
      {
        data: { email: parentBEmail },
        headers: { authorization: `Bearer ${parentBToken}` },
      }
    );
    expect(acceptRes.ok()).toBeTruthy();

    // Parent A promotes Parent B to admin
    const promoteRes = await request.put(
      `${apiBaseUrl}/api/students/${student.id}/parents/${encodeURIComponent(parentBEmail)}/admin`,
      {
        data: { isAdmin: true },
        headers: { authorization: `Bearer ${parentAToken}` },
      }
    );
    expect(promoteRes.ok()).toBeTruthy();
    const promoteBody = (await promoteRes.json()) as { success: boolean; message: string };
    expect(promoteBody.success).toBe(true);
    expect(promoteBody.message).toContain('promoted to admin');

    // Verify Parent B is now admin — they can invite Parent C
    const parentCEmail = generateUniqueEmail('promoC');
    const inviteByBRes = await request.post(
      `${apiBaseUrl}/api/students/${student.id}/parents/invite`,
      {
        data: { email: parentCEmail, role: 'caregiver' },
        headers: { authorization: `Bearer ${parentBToken}` },
      }
    );
    expect(inviteByBRes.ok()).toBeTruthy();

    // Verify the parents list shows all three
    const listRes = await request.get(`${apiBaseUrl}/api/students/${student.id}/parents`, {
      headers: { authorization: `Bearer ${parentAToken}` },
    });
    expect(listRes.ok()).toBeTruthy();
    const parents = (await listRes.json()) as Array<{
      isOwner: boolean;
      isAdmin: boolean;
      email?: string;
      role: string;
      status: string;
    }>;

    // Owner + Parent B (admin) + Parent C (pending)
    // Debug: log the full list if the count is unexpected
    if (parents.length !== 3) {
      console.log('Parents list:', JSON.stringify(parents, null, 2));
    }
    expect(parents.length).toBe(3);

    const owner = parents.find((p) => p.isOwner);
    expect(owner).toBeTruthy();
    expect(owner!.isAdmin).toBe(true);

    const parentB = parents.find((p) => p.email === parentBEmail.toLowerCase());
    expect(parentB).toBeTruthy();
    expect(parentB!.isAdmin).toBe(true);
    expect(parentB!.role).toBe('guardian');

    const parentC = parents.find((p) => p.email === parentCEmail.toLowerCase());
    expect(parentC).toBeTruthy();
    expect(parentC!.status).toBe('pending');
    expect(parentC!.role).toBe('caregiver');
  });

  // ------------------------------------------------------------------
  // MP-005: Non-admin parent cannot invite
  // ------------------------------------------------------------------
  test('MP-005: Non-admin parent cannot invite others', async ({ page, request }) => {
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:2801';
    const password = 'SecurePass123!';

    // Register Parent A, create student, invite Parent B (not as admin)
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    const parentAEmail = generateUniqueEmail('denyA');
    await registerPage.register(parentAEmail, 'Deny Parent A', password);

    const parentAToken = await page.evaluate(() => localStorage.getItem('auth_token'));

    const createRes = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: `Deny Test ${Date.now()}` },
      headers: { authorization: `Bearer ${parentAToken}` },
    });
    const student = (await createRes.json()) as { id: string };

    const parentBEmail = generateUniqueEmail('denyB');
    await request.post(`${apiBaseUrl}/api/students/${student.id}/parents/invite`, {
      data: { email: parentBEmail },
      headers: { authorization: `Bearer ${parentAToken}` },
    });

    // Register Parent B and accept
    await page.locator('[data-testid="button-logout"]').click({ force: true });
    await page.waitForURL(/\/login/, { timeout: 10000 });

    const registerPage2 = new RegisterPage(page);
    await registerPage2.goto();
    await registerPage2.register(parentBEmail, 'Deny Parent B', password);

    const parentBToken = await page.evaluate(() => localStorage.getItem('auth_token'));

    await request.post(`${apiBaseUrl}/api/students/${student.id}/parents/accept`, {
      data: { email: parentBEmail },
      headers: { authorization: `Bearer ${parentBToken}` },
    });

    // Parent B (NOT admin) tries to invite Parent C — should be denied
    const parentCEmail = generateUniqueEmail('denyC');
    const inviteRes = await request.post(
      `${apiBaseUrl}/api/students/${student.id}/parents/invite`,
      {
        data: { email: parentCEmail },
        headers: { authorization: `Bearer ${parentBToken}` },
      }
    );
    expect(inviteRes.status()).toBe(403);
  });

  // ------------------------------------------------------------------
  // MP-006: Remove a shared parent
  // ------------------------------------------------------------------
  test('MP-006: Owner removes shared parent', async ({ page, request }) => {
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:2801';
    const password = 'SecurePass123!';

    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    const parentAEmail = generateUniqueEmail('rmA');
    await registerPage.register(parentAEmail, 'Remove Parent A', password);

    const parentAToken = await page.evaluate(() => localStorage.getItem('auth_token'));

    const createRes = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: `Remove Test ${Date.now()}` },
      headers: { authorization: `Bearer ${parentAToken}` },
    });
    const student = (await createRes.json()) as { id: string };

    // Invite and accept
    const parentBEmail = generateUniqueEmail('rmB');
    await request.post(`${apiBaseUrl}/api/students/${student.id}/parents/invite`, {
      data: { email: parentBEmail },
      headers: { authorization: `Bearer ${parentAToken}` },
    });

    await page.locator('[data-testid="button-logout"]').click({ force: true });
    await page.waitForURL(/\/login/, { timeout: 10000 });

    const registerPage2 = new RegisterPage(page);
    await registerPage2.goto();
    await registerPage2.register(parentBEmail, 'Remove Parent B', password);

    const parentBToken = await page.evaluate(() => localStorage.getItem('auth_token'));

    await request.post(`${apiBaseUrl}/api/students/${student.id}/parents/accept`, {
      data: { email: parentBEmail },
      headers: { authorization: `Bearer ${parentBToken}` },
    });

    // Verify Parent B can see the student
    const listBefore = await request.get(`${apiBaseUrl}/api/students`, {
      headers: { authorization: `Bearer ${parentBToken}` },
    });
    const studentsBefore = (await listBefore.json()) as Array<{ id: string }>;
    expect(studentsBefore.some((s) => s.id === student.id)).toBe(true);

    // Parent A removes Parent B
    const removeRes = await request.delete(
      `${apiBaseUrl}/api/students/${student.id}/parents/${encodeURIComponent(parentBEmail)}`,
      { headers: { authorization: `Bearer ${parentAToken}` } }
    );
    expect(removeRes.ok()).toBeTruthy();

    // Parent B can no longer see the student
    const listAfter = await request.get(`${apiBaseUrl}/api/students`, {
      headers: { authorization: `Bearer ${parentBToken}` },
    });
    const studentsAfter = (await listAfter.json()) as Array<{ id: string }>;
    expect(studentsAfter.some((s) => s.id === student.id)).toBe(false);
  });
});
