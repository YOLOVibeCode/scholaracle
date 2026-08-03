import { test, expect } from '@playwright/test';

/**
 * CROSS-TENANT IDOR SWEEP — RISK-002, COVERAGE_GAPS §3.
 *
 * Two newly-registered parents (A, B) each own resources. Verifies that
 * Parent B's JWT cannot read or mutate Parent A's:
 *   - GET    /api/students/:id
 *   - PUT    /api/students/:id
 *   - DELETE /api/students/:id
 *   - GET    /api/students/:id/alerts
 *   - GET    /api/alerts/:id
 *   - POST   /api/alerts/:id/acknowledge
 *   - DELETE /api/alerts/:id
 *
 * Golden path = Parent A can read own. Negative = Parent B is denied. Boundary
 * = anonymous (no token) is denied. A11y: lightweight — verify forbidden UI.
 */
test.describe('@security Cross-tenant IDOR sweep', () => {
  const apiBaseUrl = process.env['API_BASE_URL'] ?? 'http://localhost:2801';
  const password = 'SecurePass123!';

  async function registerUser(
    request: import('@playwright/test').APIRequestContext,
    email: string
  ): Promise<string> {
    const res = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email, password, name: email.split('@')[0] },
    });
    expect(res.ok()).toBeTruthy();
    return ((await res.json()) as { token: string }).token;
  }

  test('IDOR-001 golden: owner can read own student', async ({ request }) => {
    const ts = Date.now();
    const tokenA = await registerUser(request, `idor-a-${ts}@example.test`);

    const created = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: 'OwnerOnly', grade: 9 },
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const student = (await created.json()) as { id: string };

    const ownRead = await request.get(`${apiBaseUrl}/api/students/${student.id}`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(ownRead.ok()).toBeTruthy();
  });

  test('IDOR-002 negative: other parent cannot GET /api/students/:id', async ({ request }) => {
    const ts = Date.now();
    const tokenA = await registerUser(request, `idor-a2-${ts}@example.test`);
    const tokenB = await registerUser(request, `idor-b2-${ts}@example.test`);

    const created = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: 'PrivateA', grade: 9 },
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const student = (await created.json()) as { id: string };

    const crossRead = await request.get(`${apiBaseUrl}/api/students/${student.id}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect([403, 404]).toContain(crossRead.status());
  });

  test('IDOR-003 negative: other parent cannot PUT/DELETE another parents student', async ({
    request,
  }) => {
    const ts = Date.now();
    const tokenA = await registerUser(request, `idor-a3-${ts}@example.test`);
    const tokenB = await registerUser(request, `idor-b3-${ts}@example.test`);

    const created = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: 'TamperTarget', grade: 10 },
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const student = (await created.json()) as { id: string };

    const putRes = await request.put(`${apiBaseUrl}/api/students/${student.id}`, {
      data: { name: 'Hacked' },
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect([403, 404]).toContain(putRes.status());

    const delRes = await request.delete(`${apiBaseUrl}/api/students/${student.id}`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect([403, 404]).toContain(delRes.status());

    // Confirm the student is unchanged from owner's perspective.
    const ownRead = await request.get(`${apiBaseUrl}/api/students/${student.id}`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(ownRead.ok()).toBeTruthy();
    const stillThere = (await ownRead.json()) as { name?: string };
    expect(stillThere.name).toBe('TamperTarget');
  });

  test('IDOR-004 negative: alerts-by-id are scoped to owner', async ({ request }) => {
    // Use the seed fixture to get a real alert id for the seeded parent.
    // Then verify a NEW unrelated parent cannot read it.
    const seedRes = await request.post(`${apiBaseUrl}/api/seed?force=true`);
    expect(seedRes.ok()).toBeTruthy();

    // Login seeded parent.
    const parentLogin = await request.post(`${apiBaseUrl}/api/auth/login`, {
      data: { email: 'test.parent@example.com', password: 'TestPass123!' },
    });
    const parentToken = ((await parentLogin.json()) as { token: string }).token;

    const alertsList = await request.get(`${apiBaseUrl}/api/alerts`, {
      headers: { authorization: `Bearer ${parentToken}` },
    });
    expect(alertsList.ok()).toBeTruthy();
    const alerts = (await alertsList.json()) as { alerts?: Array<{ id: string }> };
    const firstAlert = alerts.alerts?.[0];
    if (!firstAlert) {
      // ASSUMPTION: seed always creates ≥1 alert. If not, this is a seed defect, log it.
      test.skip(true, 'Seed produced no alerts; cannot exercise IDOR on /api/alerts/:id');
      return;
    }

    const ts = Date.now();
    const otherToken = await request.post(`${apiBaseUrl}/api/auth/register`, {
      data: { email: `idor-other-${ts}@example.test`, password, name: 'Other' },
    });
    const otherBody = (await otherToken.json()) as { token: string };

    const crossGet = await request.get(`${apiBaseUrl}/api/alerts/${firstAlert.id}`, {
      headers: { authorization: `Bearer ${otherBody.token}` },
    });
    expect([403, 404]).toContain(crossGet.status());

    const crossAck = await request.post(`${apiBaseUrl}/api/alerts/${firstAlert.id}/acknowledge`, {
      headers: { authorization: `Bearer ${otherBody.token}` },
    });
    expect([403, 404]).toContain(crossAck.status());

    const crossDel = await request.delete(`${apiBaseUrl}/api/alerts/${firstAlert.id}`, {
      headers: { authorization: `Bearer ${otherBody.token}` },
    });
    expect([403, 404]).toContain(crossDel.status());
  });

  test('IDOR-005 boundary: anonymous (no Bearer) is rejected with 401', async ({ request }) => {
    const ts = Date.now();
    const tokenA = await registerUser(request, `idor-a5-${ts}@example.test`);
    const created = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: 'AnonTarget', grade: 9 },
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const student = (await created.json()) as { id: string };

    const anon = await request.get(`${apiBaseUrl}/api/students/${student.id}`);
    expect([401, 403]).toContain(anon.status());
  });

  test('IDOR-006 a11y/negative: forbidden UI surfaces an accessible heading', async ({
    page,
    request,
  }) => {
    // Create a student as parent A, then login as a different parent and visit the URL.
    const ts = Date.now();
    const aEmail = `idor-a6-${ts}@example.test`;
    const bEmail = `idor-b6-${ts}@example.test`;
    const tokenA = await registerUser(request, aEmail);
    await registerUser(request, bEmail);

    const created = await request.post(`${apiBaseUrl}/api/students`, {
      data: { name: 'UiTarget', grade: 11 },
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const student = (await created.json()) as { id: string };

    await page.goto('/login');
    await page.getByTestId('input-email').fill(bEmail);
    await page.getByTestId('input-password').fill(password);
    await page.getByTestId('button-login').click();
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/dashboard/students/${student.id}`);
    // Whatever the UI does (404 / forbidden / redirect), there must be a heading for SR users.
    await expect(page.getByRole('heading').first()).toBeVisible();
  });
});
