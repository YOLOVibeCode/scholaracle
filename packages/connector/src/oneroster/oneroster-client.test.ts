import { OneRosterClient } from './oneroster-client';

function mockResponse(data: unknown): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    headers: new Headers(),
  };
}

function mockErrorResponse(status: number, statusText: string, body: string): Partial<Response> {
  return {
    ok: false,
    status,
    statusText,
    text: () => Promise.resolve(body),
  };
}

describe('OneRosterClient', () => {
  let client: OneRosterClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    client = new OneRosterClient({
      baseUrl: 'https://sis.district.edu/ims/oneroster/v1p2',
      accessToken: 'or-test-token',
    });
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getCourses', () => {
    it('should call GET /courses with auth header', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          courses: [{ sourcedId: 'c-1', title: 'Math' }],
        })
      );

      const result = await client.getCourses();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('/ims/oneroster/v1p2/courses');
      expect(opts.headers.authorization).toBe('Bearer or-test-token');
      expect(result).toEqual([{ sourcedId: 'c-1', title: 'Math' }]);
    });

    it('should return empty array when no items key', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({}));
      const result = await client.getCourses();
      expect(result).toEqual([]);
    });
  });

  describe('getLineItems', () => {
    it('should call GET /lineItems', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          lineItems: [{ sourcedId: 'li-1', title: 'HW 1' }],
        })
      );

      const result = await client.getLineItems();

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/lineItems');
      expect(result).toHaveLength(1);
    });
  });

  describe('getResults', () => {
    it('should call GET /results', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          results: [
            {
              sourcedId: 'r-1',
              lineItem: { sourcedId: 'li-1' },
              student: { sourcedId: 'stu-1' },
              score: 85,
              scoreStatus: 'fully graded',
            },
          ],
        })
      );

      const result = await client.getResults();

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/results');
      expect(result).toHaveLength(1);
      expect(result[0]!.score).toBe(85);
    });
  });

  describe('getOrgs', () => {
    it('should call GET /orgs', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ orgs: [{ sourcedId: 'org-1', name: 'Lincoln HS', type: 'school' }] })
      );

      const result = await client.getOrgs();

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/orgs');
      expect(result).toHaveLength(1);
    });
  });

  describe('getAcademicSessions', () => {
    it('should call GET /academicSessions', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          academicSessions: [
            {
              sourcedId: 's-1',
              title: 'Fall',
              startDate: '2025-08-20',
              endDate: '2025-12-19',
              type: 'semester',
              schoolYear: '2025',
            },
          ],
        })
      );

      const result = await client.getAcademicSessions();
      expect(result).toHaveLength(1);
    });
  });

  describe('pagination', () => {
    it('should paginate using offset until fewer than limit returned', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        sourcedId: `c-${i}`,
        title: `Course ${i}`,
      }));
      const page2 = [{ sourcedId: 'c-100', title: 'Course 100' }];

      fetchSpy
        .mockResolvedValueOnce(mockResponse({ courses: page1 }))
        .mockResolvedValueOnce(mockResponse({ courses: page2 }));

      const result = await client.getCourses();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const secondUrl = fetchSpy.mock.calls[1][0] as string;
      expect(secondUrl).toContain('offset=100');
      expect(result).toHaveLength(101);
    });

    it('should stop when empty array returned', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({ courses: [] }));

      const result = await client.getCourses();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should throw on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(mockErrorResponse(403, 'Forbidden', 'Access denied'));

      await expect(client.getCourses()).rejects.toThrow('HTTP 403 Forbidden');
    });
  });
});
