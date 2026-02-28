import { GoogleClassroomClient } from './google-classroom-client';

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

describe('GoogleClassroomClient', () => {
  let client: GoogleClassroomClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    client = new GoogleClassroomClient({ accessToken: 'gc-test-token' });
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getCourses', () => {
    it('should call GET /v1/courses with auth header', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({ courses: [{ id: 'c-1', name: 'Math', courseState: 'ACTIVE' }] })
      );

      const result = await client.getCourses();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('https://classroom.googleapis.com/v1/courses');
      expect(url).toContain('courseStates=ACTIVE');
      expect(opts.headers.authorization).toBe('Bearer gc-test-token');
      expect(result).toEqual([{ id: 'c-1', name: 'Math', courseState: 'ACTIVE' }]);
    });

    it('should return empty array when no courses key', async () => {
      fetchSpy.mockResolvedValueOnce(mockResponse({}));

      const result = await client.getCourses();
      expect(result).toEqual([]);
    });

    it('should follow nextPageToken pagination', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({
            courses: [{ id: 'c-1', name: 'Math', courseState: 'ACTIVE' }],
            nextPageToken: 'page2',
          })
        )
        .mockResolvedValueOnce(
          mockResponse({
            courses: [{ id: 'c-2', name: 'Science', courseState: 'ACTIVE' }],
          })
        );

      const result = await client.getCourses();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const secondUrl = fetchSpy.mock.calls[1][0];
      expect(secondUrl).toContain('pageToken=page2');
      expect(result).toHaveLength(2);
    });
  });

  describe('getCourseWork', () => {
    it('should call GET /v1/courses/:id/courseWork', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          courseWork: [
            {
              id: 'cw-1',
              courseId: 'c-1',
              title: 'HW 1',
              maxPoints: 50,
              workType: 'ASSIGNMENT',
              state: 'PUBLISHED',
            },
          ],
        })
      );

      const result = await client.getCourseWork('c-1');

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/v1/courses/c-1/courseWork');
      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe('HW 1');
    });
  });

  describe('getStudentSubmissions', () => {
    it('should call correct endpoint', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          studentSubmissions: [
            {
              id: 'sub-1',
              courseId: 'c-1',
              courseWorkId: 'cw-1',
              userId: 'u-1',
              state: 'TURNED_IN',
            },
          ],
        })
      );

      const result = await client.getStudentSubmissions('c-1', 'cw-1');

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/v1/courses/c-1/courseWork/cw-1/studentSubmissions');
      expect(result).toHaveLength(1);
    });
  });

  describe('getStudents', () => {
    it('should call GET /v1/courses/:id/students', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          students: [{ courseId: 'c-1', userId: 'u-1' }],
        })
      );

      const result = await client.getStudents('c-1');

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/v1/courses/c-1/students');
      expect(result).toHaveLength(1);
    });
  });

  describe('getCourseWorkMaterials', () => {
    it('should call GET /v1/courses/:id/courseWorkMaterials', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse({
          courseWorkMaterial: [
            {
              courseId: 'c-1',
              id: 'm-1',
              title: 'Reading',
              description: 'Chapter 1',
              materials: [{ link: { url: 'https://example.com/read', title: 'Link' } }],
            },
          ],
        })
      );

      const result = await client.getCourseWorkMaterials('c-1');

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/v1/courses/c-1/courseWorkMaterials');
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('m-1');
      expect(result[0]!.title).toBe('Reading');
      expect(result[0]!.materials).toHaveLength(1);
    });

    it('should paginate courseWorkMaterial via nextPageToken', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockResponse({
            courseWorkMaterial: [{ courseId: 'c-1', id: 'm-1', title: 'Page 1', materials: [] }],
            nextPageToken: 'token2',
          })
        )
        .mockResolvedValueOnce(
          mockResponse({
            courseWorkMaterial: [{ courseId: 'c-1', id: 'm-2', title: 'Page 2', materials: [] }],
          })
        );

      const result = await client.getCourseWorkMaterials('c-1');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('m-1');
      expect(result[1]!.id).toBe('m-2');
    });
  });

  describe('error handling', () => {
    it('should throw on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(mockErrorResponse(401, 'Unauthorized', 'Invalid token'));

      await expect(client.getCourses()).rejects.toThrow('HTTP 401 Unauthorized');
    });
  });
});
