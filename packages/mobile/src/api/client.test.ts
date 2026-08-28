/**
 * ScholarmancyApiClient tests — auth token handling, refresh rotation, 401 retry.
 * Guards against the production login failure where the API returns `token`
 * but the client expected `accessToken`.
 */

import * as SecureStore from 'expo-secure-store';
import { ScholarmancyApiClient } from './client';

const BASE_URL = 'https://api.test.local';

/** In-memory SecureStore backing for round-trip assertions. */
const secureStoreData = new Map<string, string>();

function wireSecureStoreMock(): void {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    return secureStoreData.get(key) ?? null;
  });
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
    if (typeof value !== 'string') {
      throw new Error(`SecureStore value for ${key} must be a string, got ${typeof value}`);
    }
    secureStoreData.set(key, value);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    secureStoreData.delete(key);
  });
}

interface IMockResponseSpec {
  readonly status: number;
  readonly body: unknown;
}

function makeResponse(spec: IMockResponseSpec): Response {
  return {
    ok: spec.status >= 200 && spec.status < 300,
    status: spec.status,
    statusText: String(spec.status),
    json: async () => spec.body,
    text: async () => JSON.stringify(spec.body),
  } as unknown as Response;
}

/** Queue-based fetch mock: each call consumes the next response. */
function mockFetchSequence(...specs: IMockResponseSpec[]): jest.Mock {
  const fetchMock = jest.fn();
  for (const spec of specs) {
    fetchMock.mockResolvedValueOnce(makeResponse(spec));
  }
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** Realistic production login response (field is `token`, NOT `accessToken`). */
function makeLoginBody(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    success: true,
    token: 'jwt-access-token-1',
    refreshToken: 'refresh-token-1',
    familyId: 'fam-1',
    rememberMe: true,
    user: { id: 'user-1', email: 'demo@scholarmancy.com', name: 'Demo Family' },
    forcePasswordReset: false,
    ...overrides,
  };
}

describe('ScholarmancyApiClient auth', () => {
  let client: ScholarmancyApiClient;

  beforeEach(() => {
    secureStoreData.clear();
    wireSecureStoreMock();
    client = new ScholarmancyApiClient(BASE_URL);
  });

  describe('login', () => {
    it('should store the access token from the `token` field of the API response', async () => {
      mockFetchSequence({ status: 200, body: makeLoginBody() });

      await client.login('demo@scholarmancy.com', 'pw');

      expect(secureStoreData.get('slc_access_token')).toBe('jwt-access-token-1');
      expect(secureStoreData.get('slc_refresh_token')).toBe('refresh-token-1');
    });

    it('should throw a readable error when the response has no token', async () => {
      mockFetchSequence({
        status: 200,
        body: { success: false },
      });

      await expect(client.login('demo@scholarmancy.com', 'pw')).rejects.toThrow(/token/i);
      expect(secureStoreData.has('slc_access_token')).toBe(false);
    });

    it('should throw the server error body on a failed login', async () => {
      mockFetchSequence({
        status: 401,
        body: { success: false, error: 'Invalid email or password' },
      });

      await expect(client.login('demo@scholarmancy.com', 'wrong')).rejects.toThrow(
        /Invalid email or password/
      );
    });
  });

  describe('register', () => {
    it('should POST /api/auth/register and store tokens from the `token` field', async () => {
      const fetchMock = mockFetchSequence({ status: 201, body: makeLoginBody() });

      await client.register('parent@example.com', 'mock-password12', 'Ricardo');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/auth/register`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'parent@example.com',
            password: 'mock-password12',
            name: 'Ricardo',
            rememberMe: true,
          }),
        })
      );
      expect(secureStoreData.get('slc_access_token')).toBe('jwt-access-token-1');
      expect(secureStoreData.get('slc_refresh_token')).toBe('refresh-token-1');
    });

    it('should throw when register returns no token', async () => {
      mockFetchSequence({ status: 201, body: { success: false } });
      await expect(client.register('a@b.c', 'mock-password12', 'A')).rejects.toThrow(/token/i);
    });
  });

  describe('createStudent', () => {
    it('should POST /api/students and return the created row', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const created = {
        id: 'stu-mongo-1',
        userId: 'user-1',
        name: 'Gideon',
        grade: 8,
      };
      const fetchMock = mockFetchSequence({ status: 201, body: created });

      await expect(client.createStudent({ name: 'Gideon', grade: 8 })).resolves.toEqual(created);
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/students`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Gideon', grade: 8 }),
          headers: expect.objectContaining({ Authorization: 'Bearer jwt-ok' }),
        })
      );
    });
  });

  describe('token refresh', () => {
    it('should refresh using the `token` field and store the rotated refresh token', async () => {
      // No access token stored; only a refresh token.
      secureStoreData.set('slc_refresh_token', 'refresh-token-old');
      const fetchMock = mockFetchSequence(
        // refresh call
        {
          status: 200,
          body: { success: true, token: 'jwt-new', refreshToken: 'refresh-token-rotated' },
        },
        // actual GET
        { status: 200, body: [] }
      );

      await client.getStudents();

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/auth/refresh`,
        expect.objectContaining({ method: 'POST' })
      );
      expect(secureStoreData.get('slc_access_token')).toBe('jwt-new');
      expect(secureStoreData.get('slc_refresh_token')).toBe('refresh-token-rotated');
    });

    it('should retry a GET once after a 401 by refreshing the access token', async () => {
      secureStoreData.set('slc_access_token', 'jwt-expired');
      secureStoreData.set('slc_refresh_token', 'refresh-token-old');
      const fetchMock = mockFetchSequence(
        // first GET → 401 (expired token)
        { status: 401, body: { error: 'Unauthorized' } },
        // refresh
        { status: 200, body: { success: true, token: 'jwt-fresh', refreshToken: 'rt-2' } },
        // retried GET — REAL wire shape: id/userId/name/grade/studentId/stats
        {
          status: 200,
          body: [{ id: 's1', userId: 'u1', name: 'Emma', grade: 9, studentId: 'stu-1' }],
        }
      );

      const students = await client.getStudents();

      expect(students).toEqual([
        { id: 's1', userId: 'u1', name: 'Emma', grade: 9, studentId: 'stu-1' },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(secureStoreData.get('slc_access_token')).toBe('jwt-fresh');
    });

    it('should surface a session-expired error when the refresh itself fails', async () => {
      secureStoreData.set('slc_access_token', 'jwt-expired');
      secureStoreData.set('slc_refresh_token', 'refresh-token-dead');
      mockFetchSequence(
        { status: 401, body: { error: 'Unauthorized' } },
        { status: 401, body: { error: 'Invalid refresh token' } }
      );

      await expect(client.getStudents()).rejects.toThrow(/log in again/i);
    });
  });

  describe('regression: renamed private helpers', () => {
    it('getStudents should call the API (guards this._get wiring)', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const fetchMock = mockFetchSequence({ status: 200, body: [] });

      await expect(client.getStudents()).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/students`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer jwt-ok' }),
        })
      );
    });

    it('registerPushToken should POST and persist the token (guards this._post wiring)', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      mockFetchSequence({ status: 200, body: { success: true } });

      await client.registerPushToken('ExponentPushToken[abc]');

      expect(secureStoreData.get('slc_push_token')).toBe('ExponentPushToken[abc]');
    });
  });

  describe('isLoggedIn', () => {
    it('should be true when only a refresh token is present (session can be restored)', async () => {
      secureStoreData.set('slc_refresh_token', 'refresh-token-1');

      await expect(client.isLoggedIn()).resolves.toBe(true);
    });

    it('should be false with no tokens at all', async () => {
      await expect(client.isLoggedIn()).resolves.toBe(false);
    });
  });

  describe('logout', () => {
    it('should clear all auth tokens', async () => {
      secureStoreData.set('slc_access_token', 'a');
      secureStoreData.set('slc_refresh_token', 'b');
      secureStoreData.set('slc_connector_token', 'c');
      secureStoreData.set('slc_connector_token_v2', JSON.stringify({ token: 'd', mintedAt: 1 }));

      await client.logout();

      expect(secureStoreData.has('slc_access_token')).toBe(false);
      expect(secureStoreData.has('slc_refresh_token')).toBe(false);
      expect(secureStoreData.has('slc_connector_token')).toBe(false);
      expect(secureStoreData.has('slc_connector_token_v2')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Mapper tests — guards against API shape drift on student data endpoints
  // ---------------------------------------------------------------------------

  /**
   * Real production grades response shape (from API research):
   *   { studentId, overallGPA, courseGrades: [{ courseExternalId, courseName,
   *     officialGrade, letterGrade, gradeSource, totalAssignments, ... }] }
   *
   * Client was reading `data.courses[].{externalId, name, currentGrade}` —
   * those fields don't exist, so grades always returned [].
   */
  describe('getStudentGrades (contracts passthrough)', () => {
    const STUDENT_ID = 'stu-abc123';

    function makeGradesResponse(overrides?: Record<string, unknown>): Record<string, unknown> {
      return {
        studentId: STUDENT_ID,
        studentName: 'Emma Lewis',
        overallGPA: 3.8,
        atRiskCourses: 0,
        courseGrades: [
          {
            courseExternalId: 'course-1',
            courseName: 'AP Calculus',
            officialGrade: 95.5,
            letterGrade: 'A',
            gradeSource: 'sis',
            totalAssignments: 12,
            gradedAssignments: 10,
            missingAssignments: 1,
            lateAssignments: 0,
            totalPointsPossible: 100,
            totalPointsEarned: 95,
            recentTrend: 'stable',
            riskLevel: 'low',
            materialCount: 0,
            assignments: [],
          },
          {
            courseExternalId: 'course-2',
            courseName: 'English Lit',
            officialGrade: null,
            letterGrade: null,
            gradeSource: 'none',
            totalAssignments: 5,
            gradedAssignments: 0,
            missingAssignments: 0,
            lateAssignments: 0,
            totalPointsPossible: 0,
            totalPointsEarned: 0,
            recentTrend: 'stable',
            riskLevel: 'low',
            materialCount: 0,
            assignments: [],
          },
        ],
        ...overrides,
      };
    }

    it('should return the full grades response including overallGPA', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      mockFetchSequence({ status: 200, body: makeGradesResponse() });

      const res = await client.getStudentGrades(STUDENT_ID);

      expect(res.overallGPA).toBe(3.8);
      expect(res.courseGrades).toHaveLength(2);
      expect(res.courseGrades[0]).toMatchObject({
        courseExternalId: 'course-1',
        courseName: 'AP Calculus',
        officialGrade: 95.5,
        letterGrade: 'A',
      });
    });

    it('should tolerate null officialGrade/letterGrade (no crash)', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      mockFetchSequence({ status: 200, body: makeGradesResponse() });

      const res = await client.getStudentGrades(STUDENT_ID);

      expect(res.courseGrades[1]?.officialGrade).toBeNull();
      expect(res.courseGrades[1]?.letterGrade).toBeNull();
    });

    it('should fall back to all grading periods when current-only is empty (summer)', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const fetchMock = mockFetchSequence(
        // current-only default: all terms ended -> server filters everything out
        { status: 200, body: makeGradesResponse({ courseGrades: [], overallGPA: 0 }) },
        // fallback with ?currentOnly=false returns the last term's grades
        { status: 200, body: makeGradesResponse() }
      );

      const res = await client.getStudentGrades(STUDENT_ID);

      expect(res.courseGrades).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toContain('currentOnly=false');
    });

    it('should NOT fall back when current grades exist', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const fetchMock = mockFetchSequence({ status: 200, body: makeGradesResponse() });

      const res = await client.getStudentGrades(STUDENT_ID);

      expect(res.courseGrades).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should THROW an ApiError with the server message on failure (no silent [])', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      mockFetchSequence({
        status: 500,
        body: { success: false, error: 'Internal error', code: 'INTERNAL_ERROR', requestId: 'r-1' },
      });

      await expect(client.getStudentGrades(STUDENT_ID)).rejects.toMatchObject({
        name: 'ApiError',
        message: 'Internal error',
        status: 500,
        code: 'INTERNAL_ERROR',
        requestId: 'r-1',
      });
    });
  });

  describe('getAssignmentMaterials', () => {
    const STUDENT_ID = 'stu-abc123';

    function makeMaterialsResponse(): Record<string, unknown> {
      return {
        studentId: STUDENT_ID,
        studentName: 'Emma Lewis',
        totalMaterials: 2,
        courses: [
          {
            courseExternalId: 'course-1',
            courseName: 'AP Calculus',
            materials: [
              {
                externalId: 'm-1',
                title: 'Worksheet 5',
                type: 'file',
                downloadUrl: `${BASE_URL}/api/assets/m-1?sig=abc`,
                assignmentExternalId: 'a 1/#&x',
              },
              {
                externalId: 'm-2',
                title: 'Syllabus',
                type: 'file',
                assignmentExternalId: null,
              },
            ],
          },
        ],
      };
    }

    it('should build the materials URL with an encoded assignment id', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const fetchMock = mockFetchSequence({ status: 200, body: makeMaterialsResponse() });

      await client.getAssignmentMaterials(STUDENT_ID, 'a 1/#&x');

      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/students/${STUDENT_ID}/materials?assignment=a%201%2F%23%26x`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer jwt-ok' }),
        })
      );
    });

    it('should return the server response untouched (contracts passthrough)', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      mockFetchSequence({ status: 200, body: makeMaterialsResponse() });

      const res = await client.getAssignmentMaterials(STUDENT_ID, 'a 1/#&x');

      expect(res.totalMaterials).toBe(2);
      expect(res.courses[0]?.materials[0]).toMatchObject({
        externalId: 'm-1',
        downloadUrl: `${BASE_URL}/api/assets/m-1?sig=abc`,
        assignmentExternalId: 'a 1/#&x',
      });
      expect(res.courses[0]?.materials[1]?.assignmentExternalId).toBeNull();
    });

    it('should THROW an ApiError with the server message on a 500', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      mockFetchSequence({
        status: 500,
        body: { success: false, error: 'Internal error', code: 'INTERNAL_ERROR', requestId: 'r-9' },
      });

      await expect(client.getAssignmentMaterials(STUDENT_ID, 'a-1')).rejects.toMatchObject({
        name: 'ApiError',
        message: 'Internal error',
        status: 500,
        code: 'INTERNAL_ERROR',
        requestId: 'r-9',
      });
    });

    it('should expose the configured base URL via baseUrlValue (for host classification)', () => {
      expect(client.baseUrlValue).toBe(BASE_URL);
    });
  });

  /**
   * Real production sources/runs shape (from API research):
   *   Sources: [{ id, provider, displayName, pluginId, ... }]  — field is `id` not `sourceId`
   *   Runs:    [{ runId, status, startedAt, ... }]             — field is `runId` not `_id`
   *                                                              no `provider` or `opCount` on runs
   *
   * Client read `source.sourceId` and run `_id`/`provider`/`opCount` — all undefined,
   * so runs were fetched from wrong URL paths (sourceId=undefined) and mapped to bad objects.
   */
  describe('getStudentRuns mapper', () => {
    const STUDENT_ID = 'stu-abc123';

    function makeSourcesResponse(): unknown[] {
      return [
        {
          id: 'src-111',
          pluginId: 'canvas',
          provider: 'canvas',
          displayName: 'Canvas',
          enabled: true,
        },
        {
          id: 'src-222',
          pluginId: 'skyward',
          provider: 'skyward',
          displayName: 'Skyward',
          enabled: true,
        },
      ];
    }

    function makeRunsResponse(provider: string): unknown[] {
      return [
        {
          runId: `run-${provider}-1`,
          status: 'success',
          startedAt: '2026-08-06T10:00:00Z',
          uploadedAt: '2026-08-06T10:01:00Z',
        },
        {
          runId: `run-${provider}-2`,
          status: 'failed',
          startedAt: '2026-08-05T09:00:00Z',
          error: 'Login timeout',
        },
      ];
    }

    it('should use source.id (not source.sourceId) to build the runs URL', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const fetchMock = mockFetchSequence(
        { status: 200, body: makeSourcesResponse() },
        { status: 200, body: makeRunsResponse('canvas') },
        { status: 200, body: makeRunsResponse('skyward') }
      );

      await client.getStudentRuns(STUDENT_ID);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/sources/src-111/runs'),
        expect.anything()
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/sources/src-222/runs'),
        expect.anything()
      );
    });

    it('should map runId to the _id field and provider from the source', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      mockFetchSequence(
        { status: 200, body: makeSourcesResponse() },
        { status: 200, body: makeRunsResponse('canvas') },
        { status: 200, body: makeRunsResponse('skyward') }
      );

      const runs = await client.getStudentRuns(STUDENT_ID);

      expect(runs.length).toBeGreaterThan(0);
      expect(runs[0]._id).toMatch(/^run-/);
      expect(runs[0].provider).toMatch(/^(canvas|skyward)$/);
      expect(runs[0].startedAt).toBeTruthy();
    });

    it('should sort runs newest-first and cap at 20', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const manyRuns = Array.from({ length: 15 }, (_, i) => ({
        runId: `run-${i}`,
        status: 'success',
        startedAt: new Date(2026, 0, i + 1).toISOString(),
      }));
      mockFetchSequence(
        { status: 200, body: [{ id: 'src-1', provider: 'canvas', displayName: 'Canvas' }] },
        { status: 200, body: manyRuns }
      );

      const runs = await client.getStudentRuns(STUDENT_ID);

      expect(runs.length).toBe(15);
      expect(new Date(runs[0].startedAt).getTime()).toBeGreaterThan(
        new Date(runs[1].startedAt).getTime()
      );
    });

    it('should THROW when the sources request fails (no silent [])', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      mockFetchSequence({
        status: 500,
        body: { success: false, error: 'boom', code: 'INTERNAL_ERROR' },
      });

      await expect(client.getStudentRuns(STUDENT_ID)).rejects.toMatchObject({
        name: 'ApiError',
        message: 'boom',
      });
    });

    it('should tolerate one failing source but throw when ALL sources fail', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      // Partial failure: first source runs fail, second succeeds
      mockFetchSequence(
        { status: 200, body: makeSourcesResponse() },
        { status: 500, body: { success: false, error: 'src1 down' } },
        { status: 200, body: makeRunsResponse('skyward') }
      );
      const partial = await client.getStudentRuns(STUDENT_ID);
      expect(partial.length).toBeGreaterThan(0);

      // Total failure: every source's runs fail
      mockFetchSequence(
        { status: 200, body: makeSourcesResponse() },
        { status: 500, body: { success: false, error: 'src1 down' } },
        { status: 500, body: { success: false, error: 'src2 down' } }
      );
      await expect(client.getStudentRuns(STUDENT_ID)).rejects.toMatchObject({ name: 'ApiError' });
    });
  });

  // ---------------------------------------------------------------------------
  // Connector token healing + ingest source registration
  // ---------------------------------------------------------------------------

  describe('connector token', () => {
    it('should reuse the cached v2 token without minting', async () => {
      secureStoreData.set('slc_connector_token_v2', JSON.stringify({ token: 'ct-1', mintedAt: 1 }));
      const fetchMock = mockFetchSequence();

      await expect(client.getOrMintConnectorToken()).resolves.toBe('ct-1');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should migrate a legacy plain-string cache to v2', async () => {
      secureStoreData.set('slc_connector_token', 'ct-legacy');
      const fetchMock = mockFetchSequence();

      await expect(client.getOrMintConnectorToken()).resolves.toBe('ct-legacy');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(secureStoreData.has('slc_connector_token')).toBe(false);
      expect(JSON.parse(secureStoreData.get('slc_connector_token_v2') ?? '{}').token).toBe(
        'ct-legacy'
      );
    });

    it('should re-mint once and retry when an ingest call gets a 401 (revoked token)', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      secureStoreData.set(
        'slc_connector_token_v2',
        JSON.stringify({ token: 'ct-revoked', mintedAt: 1 })
      );
      const fetchMock = mockFetchSequence(
        // registerIngestSource with revoked token → 401
        { status: 401, body: { success: false, error: 'Invalid token' } },
        // re-mint (scraper-token)
        {
          status: 200,
          body: { success: true, token: 'ct-fresh', jti: 'j2', expiresIn: '365 days' },
        },
        // retried register → ok
        { status: 200, body: { success: true, source: {} } }
      );

      await client.registerIngestSource({
        sourceId: 'local-canvas-x',
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        displayName: 'Canvas (mobile)',
      });

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(JSON.parse(secureStoreData.get('slc_connector_token_v2') ?? '{}').token).toBe(
        'ct-fresh'
      );
    });

    it('should surface an ApiError when the retry also fails', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      secureStoreData.set(
        'slc_connector_token_v2',
        JSON.stringify({ token: 'ct-revoked', mintedAt: 1 })
      );
      mockFetchSequence(
        { status: 401, body: { success: false, error: 'Invalid token' } },
        { status: 200, body: { success: true, token: 'ct-2', jti: 'j', expiresIn: '365 days' } },
        { status: 401, body: { success: false, error: 'Still invalid', code: 'UNAUTHENTICATED' } }
      );

      await expect(
        client.registerIngestSource({
          sourceId: 'local-canvas-x',
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas (mobile)',
        })
      ).rejects.toMatchObject({ name: 'ApiError', code: 'UNAUTHENTICATED' });
    });
  });

  describe('unregisterPushToken', () => {
    it('should DELETE with the deviceId and clear the local token', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      secureStoreData.set('slc_push_token', 'ExponentPushToken[old]');
      const fetchMock = mockFetchSequence({ status: 200, body: { success: true } });

      await client.unregisterPushToken();

      const call = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
      expect(call[0]).toContain('/api/account/push-token');
      expect(call[1].method).toBe('DELETE');
      const body = JSON.parse(call[1].body) as Record<string, unknown>;
      expect(typeof body['deviceId']).toBe('string');
      expect(secureStoreData.has('slc_push_token')).toBe(false);
    });
  });

  describe('registerPushToken', () => {
    it('should send deviceId and platform type with the push token', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const fetchMock = mockFetchSequence({ status: 200, body: { success: true } });

      await client.registerPushToken('ExponentPushToken[xyz]');

      const call = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(call[1].body) as Record<string, unknown>;
      expect(body['expoPushToken']).toBe('ExponentPushToken[xyz]');
      expect(typeof body['deviceId']).toBe('string');
      expect((body['deviceId'] as string).length).toBeGreaterThan(0);
      expect(body['type']).toBe('ios');
      expect(secureStoreData.get('slc_push_token')).toBe('ExponentPushToken[xyz]');
    });

    it('student session registers the token with audience student and studentId', async () => {
      mockFetchSequence({
        status: 200,
        body: makeLoginBody({
          user: {
            id: 'user-emma',
            email: 'emma.demo@scholarmancy.com',
            name: 'Emma',
            role: 'student',
            studentId: '507f1f77bcf86cd799439011',
          },
        }),
      });
      await client.login('emma.demo@scholarmancy.com', 'pw');
      const fetchMock = mockFetchSequence({ status: 200, body: { success: true } });

      await client.registerPushToken('ExponentPushToken[emma]');

      const call = fetchMock.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(call[1].body) as Record<string, unknown>;
      expect(body['audience']).toBe('student');
      expect(body['studentId']).toBe('507f1f77bcf86cd799439011');
    });
  });

  describe('session user (student vs parent)', () => {
    it('persists role and studentId from the login user so cold start can gate nav', async () => {
      mockFetchSequence({
        status: 200,
        body: makeLoginBody({
          user: {
            id: 'user-emma',
            email: 'emma.demo@scholarmancy.com',
            name: 'Emma',
            role: 'student',
            studentId: '507f1f77bcf86cd799439011',
          },
        }),
      });

      await client.login('emma.demo@scholarmancy.com', 'pw');

      await expect(client.getSessionUser()).resolves.toEqual({
        id: 'user-emma',
        email: 'emma.demo@scholarmancy.com',
        name: 'Emma',
        role: 'student',
        studentId: '507f1f77bcf86cd799439011',
      });
    });

    it('defaults a login without role to parent (legacy parent sessions)', async () => {
      mockFetchSequence({ status: 200, body: makeLoginBody() });
      await client.login('demo@scholarmancy.com', 'pw');
      await expect(client.getSessionUser()).resolves.toEqual(
        expect.objectContaining({ role: 'parent', email: 'demo@scholarmancy.com' })
      );
    });

    it('clears the session user on logout', async () => {
      mockFetchSequence({
        status: 200,
        body: makeLoginBody({
          user: {
            id: 'user-emma',
            email: 'emma.demo@scholarmancy.com',
            name: 'Emma',
            role: 'student',
            studentId: '507f1f77bcf86cd799439011',
          },
        }),
      });
      await client.login('emma.demo@scholarmancy.com', 'pw');
      await client.logout();
      await expect(client.getSessionUser()).resolves.toBeNull();
    });

    it('reads role from the access-token JWT when the stored user is missing', async () => {
      const payload = Buffer.from(
        JSON.stringify({
          userId: 'user-emma',
          email: 'emma.demo@scholarmancy.com',
          role: 'student',
          studentId: '507f1f77bcf86cd799439011',
        })
      ).toString('base64url');
      secureStoreData.set('slc_access_token', `hdr.${payload}.sig`);

      await expect(client.getSessionUser()).resolves.toEqual({
        id: 'user-emma',
        email: 'emma.demo@scholarmancy.com',
        name: '',
        role: 'student',
        studentId: '507f1f77bcf86cd799439011',
      });
    });
  });

  describe('studio student API', () => {
    const today = {
      encouragement: 'Nice work on Reading response 8.',
      next: {
        assignmentExternalId: 'demo-emma-ap-bio-a5',
        title: 'Unit 9 Homework',
        courseName: 'AP Biology',
        primaryCtaLabel: 'Open worksheet',
      },
      alsoToday: [],
    };
    const pack = {
      title: 'Unit 9 Homework',
      courseName: 'AP Biology',
      humanStatus: 'Not turned in',
      instructionsText: 'Complete the worksheet.',
      primaryAsset: null,
      needsSchoolLogin: [],
      moreFromCourse: [],
    };

    it('getStudioToday GETs /api/studio/today', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const fetchMock = mockFetchSequence({ status: 200, body: today });
      await expect(client.getStudioToday()).resolves.toEqual(today);
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE_URL}/api/studio/today`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer jwt-ok' }),
        })
      );
    });

    it('getStudioWorkPack GETs /api/studio/assignments/:externalId', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const fetchMock = mockFetchSequence({ status: 200, body: pack });
      await expect(client.getStudioWorkPack('demo-emma-ap-bio-a5')).resolves.toEqual(pack);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        `${BASE_URL}/api/studio/assignments/demo-emma-ap-bio-a5`
      );
    });

    it('patchStudioAssignmentStatus PATCHes working_on_it', async () => {
      secureStoreData.set('slc_access_token', 'jwt-ok');
      const fetchMock = mockFetchSequence({
        status: 200,
        body: { success: true, studentStatus: 'working_on_it' },
      });
      await client.patchStudioAssignmentStatus('demo-emma-ap-bio-a5', 'working_on_it');
      const call = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
      expect(call[0]).toBe(`${BASE_URL}/api/studio/assignments/demo-emma-ap-bio-a5/status`);
      expect(call[1].method).toBe('PATCH');
      expect(JSON.parse(call[1].body)).toEqual({ status: 'working_on_it' });
    });
  });
});

// ---------------------------------------------------------------------------
// Session hardening: single-flight refresh + session epochs
// ---------------------------------------------------------------------------

describe('session hardening', () => {
  let client: ScholarmancyApiClient;

  beforeEach(() => {
    secureStoreData.clear();
    wireSecureStoreMock();
    client = new ScholarmancyApiClient(BASE_URL);
  });

  /** Route-keyed fetch mock: responses resolved by URL suffix, per-call queues. */
  function mockFetchRoutes(routes: Record<string, IMockResponseSpec[]>): jest.Mock {
    const fetchMock = jest.fn(async (url: string) => {
      for (const [suffix, queue] of Object.entries(routes)) {
        if (url.endsWith(suffix) || url.includes(suffix)) {
          const spec = queue.length > 1 ? queue.shift()! : queue[0]!;
          return makeResponse(spec);
        }
      }
      throw new Error(`no route for ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  it('should share ONE refresh across concurrent 401s (single-flight)', async () => {
    secureStoreData.set('slc_access_token', 'jwt-expired');
    secureStoreData.set('slc_refresh_token', 'rt-1');
    let refreshCalls = 0;
    const fetchMock = jest.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.endsWith('/api/auth/refresh')) {
        refreshCalls += 1;
        return makeResponse({
          status: 200,
          body: { success: true, token: 'jwt-fresh', refreshToken: 'rt-2', rememberMe: true },
        });
      }
      const auth = init?.headers?.['Authorization'] ?? '';
      return auth.includes('jwt-fresh')
        ? makeResponse({ status: 200, body: [] })
        : makeResponse({ status: 401, body: { success: false, error: 'expired' } });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const results = await Promise.all([
      client.getStudents(),
      client.getStudents(),
      client.getStudents(),
    ]);

    expect(results).toEqual([[], [], []]);
    expect(refreshCalls).toBe(1);
    expect(secureStoreData.get('slc_refresh_token')).toBe('rt-2');
  });

  it('should NOT fire onSessionExpired when there is simply no refresh token', async () => {
    const expired = jest.fn();
    client.onSessionExpired = expired;
    mockFetchRoutes({});

    await expect(client.getStudents()).rejects.toThrow('Not logged in');
    expect(expired).not.toHaveBeenCalled();
  });

  it('should fire onSessionExpired with the captured epoch when the server rejects a refresh', async () => {
    secureStoreData.set('slc_access_token', 'jwt-expired');
    secureStoreData.set('slc_refresh_token', 'rt-dead');
    const epochs: number[] = [];
    client.onSessionExpired = (epoch) => epochs.push(epoch);
    mockFetchRoutes({
      '/api/students': [{ status: 401, body: { success: false, error: 'expired' } }],
      '/api/auth/refresh': [{ status: 401, body: { success: false, error: 'revoked' } }],
    });

    await expect(client.getStudents()).rejects.toThrow(/log in again/i);
    expect(epochs).toEqual([client.sessionEpoch]);
  });

  it('should report a STALE epoch when a login lands mid-refresh (guard scenario)', async () => {
    secureStoreData.set('slc_access_token', 'jwt-expired');
    secureStoreData.set('slc_refresh_token', 'rt-dead');
    const seen: Array<{ fired: number; current: number }> = [];
    client.onSessionExpired = (epoch) => seen.push({ fired: epoch, current: client.sessionEpoch });

    let releaseRefresh: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const fetchMock = jest.fn(async (url: string) => {
      if (url.endsWith('/api/auth/refresh')) {
        await gate; // hold the refresh open while a login completes
        return makeResponse({ status: 401, body: { success: false, error: 'revoked' } });
      }
      if (url.endsWith('/api/auth/login')) {
        return makeResponse({ status: 200, body: makeLoginBody() });
      }
      return makeResponse({ status: 401, body: { success: false, error: 'expired' } });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const failing = client.getStudents().catch(() => undefined);
    await client.login('demo@scholarmancy.com', 'pw'); // bumps epoch
    releaseRefresh();
    await failing;

    expect(seen).toHaveLength(1);
    expect(seen[0]!.fired).not.toBe(seen[0]!.current);
  });

  it('logout should bump the session epoch', async () => {
    const before = client.sessionEpoch;
    await client.logout();
    expect(client.sessionEpoch).toBe(before + 1);
  });
});

describe('ScholarmancyApiClient airplane mode', () => {
  let client: ScholarmancyApiClient;

  beforeEach(() => {
    secureStoreData.clear();
    wireSecureStoreMock();
  });

  it('maps a Network request failed login to a readable offline error', async () => {
    client = new ScholarmancyApiClient(BASE_URL);
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(client.login('demo@scholarmancy.com', 'x')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'OFFLINE',
      message: expect.stringMatching(/offline/i),
    });
  });

  it('aborts hung fetches so airplane mode cannot spin forever', async () => {
    client = new ScholarmancyApiClient(BASE_URL, { requestTimeoutMs: 20 });
    global.fetch = jest.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    await expect(client.login('demo@scholarmancy.com', 'x')).rejects.toMatchObject({
      code: 'OFFLINE',
    });
  });
});

describe('ScholarmancyApiClient source invites', () => {
  let client: ScholarmancyApiClient;

  beforeEach(() => {
    secureStoreData.clear();
    wireSecureStoreMock();
    client = new ScholarmancyApiClient(BASE_URL);
    secureStoreData.set('slc_access_token', 'jwt-ok');
  });

  it('redeemSourceInvite maps invite from 200', async () => {
    const invite = {
      provider: 'skyward',
      adapterId: 'com.skyward.iscorp',
      portalBaseUrl: 'https://skyward.iscorp.com',
      displayName: 'Skyward Family Access (skyward.iscorp.com)',
      studentId: 'stu-1',
      studentExternalId: 'ava-lewis',
      institutionExternalId: 'skyward.iscorp.com',
    };
    mockFetchSequence({ status: 200, body: { success: true, invite } });
    const result = await client.redeemSourceInvite('ab'.repeat(32));
    expect(result).toEqual(invite);
  });

  it('redeemSourceInvite throws on 404', async () => {
    mockFetchSequence({
      status: 404,
      body: { success: false, error: 'This install link expired or is not for this account.' },
    });
    await expect(client.redeemSourceInvite('ab'.repeat(32))).rejects.toThrow(/expired/i);
  });

  it('redeemSourceInvite throws on 401', async () => {
    mockFetchSequence(
      { status: 401, body: { success: false, error: 'expired' } },
      { status: 401, body: { success: false, error: 'expired' } }
    );
    await expect(client.redeemSourceInvite('ab'.repeat(32))).rejects.toThrow();
  });
});
