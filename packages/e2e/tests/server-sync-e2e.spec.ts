/**
 * Server-side ingest guardrails E2E: asserts that the server correctly rejects
 * portal login credentials and HTML-provider sync triggers.
 *
 * The old server-scraping pipeline (Canvas/Skyward/Aeries via Playwright workers)
 * has been retired. Extraction now runs client-side (iOS app, browser extension, CLI).
 * These tests verify the server enforces that boundary at every entry point.
 *
 * Prerequisites:
 *   - API running (local Docker or Railway dev)
 *   - Standard test fixtures (seeded parent account)
 *
 * Run:
 *   npx playwright test server-sync-e2e --project=server-sync-e2e --no-deps
 */
import { test, expect } from '../fixtures/auth';

const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:2801';

test.describe('Server enforces client-side-only scraping guardrails', () => {
  let authToken: string;
  let studentId: string;
  let canvasSourceId: string;

  test.describe.serial('Guardrail assertions', () => {
    // -------------------------------------------------------------------------
    // Step 1: Login
    // -------------------------------------------------------------------------
    test('1. Login as parent and get auth token', async ({ page, loginAsRole }) => {
      await loginAsRole('parent');
      authToken = await page.evaluate(() => localStorage.getItem('auth_token') ?? '');
      expect(authToken).toBeTruthy();
    });

    // -------------------------------------------------------------------------
    // Step 2: Get a seeded student
    // -------------------------------------------------------------------------
    test('2. Get existing test student', async ({ request }) => {
      const res = await request.get(`${API_BASE}/api/students`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status()).toBeLessThan(400);
      const body = await res.json();
      const students = body.students ?? body;
      expect(Array.isArray(students)).toBe(true);
      expect(students.length).toBeGreaterThan(0);
      studentId = students[0].id ?? students[0]._id;
      expect(studentId).toBeTruthy();
    });

    // -------------------------------------------------------------------------
    // Step 3: Add a Canvas source (no credentials)
    // -------------------------------------------------------------------------
    test('3. Add Canvas data source (no credentials)', async ({ request }) => {
      const res = await request.post(`${API_BASE}/api/students/${studentId}/sources`, {
        headers: { Authorization: `Bearer ${authToken}` },
        data: {
          provider: 'canvas',
          adapterId: 'canvas::default',
          displayName: 'Test Canvas',
          portalBaseUrl: 'https://canvas.test.example.com',
          schedule: 'daily',
          dataTypes: ['grades', 'assignments'],
        },
      });
      expect(res.status()).toBeLessThan(400);
      const body = await res.json();
      canvasSourceId = body.source?.id ?? body.id;
      expect(canvasSourceId).toBeTruthy();
    });

    // -------------------------------------------------------------------------
    // Step 4: Attempting to store portal login credentials MUST be rejected
    // -------------------------------------------------------------------------
    test('4. PUT login credentials for Canvas returns 400', async ({ request }) => {
      const res = await request.put(
        `${API_BASE}/api/students/${studentId}/sources/${canvasSourceId}/credentials`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
          data: {
            authType: 'login',
            username: 'test@example.com',
            password: 'test-password',
          },
        }
      );
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBeFalsy();
    });

    // -------------------------------------------------------------------------
    // Step 5: Attempting to trigger server-side sync for Canvas MUST be rejected
    // -------------------------------------------------------------------------
    test('5. POST sync trigger for Canvas returns 400', async ({ request }) => {
      const studentsRes = await request.get(`${API_BASE}/api/students`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const body = await studentsRes.json();
      const students = body.students ?? body;
      const student = Array.isArray(students) ? students.find((s: { id?: string; _id?: string }) => (s.id ?? s._id) === studentId) : null;
      const dsIndex = student?.dataSources?.findIndex(
        (ds: { provider?: string }) => ds.provider === 'canvas'
      ) ?? 0;

      const syncRes = await request.post(
        `${API_BASE}/api/sync/students/${studentId}/${dsIndex}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      expect(syncRes.status()).toBe(400);
      const syncBody = await syncRes.json();
      expect(syncBody.success).toBeFalsy();
    });

    // -------------------------------------------------------------------------
    // Step 6: Google OAuth endpoints return 410 Gone
    // -------------------------------------------------------------------------
    test('6. GET /api/oauth/google/authorize returns 410', async ({ request }) => {
      const res = await request.get(`${API_BASE}/api/oauth/google/authorize`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      expect(res.status()).toBe(410);
    });
  });
});
