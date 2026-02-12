import { CanvasClient } from './canvas-client';

function mockResponse(data: unknown, linkHeader?: string): Partial<Response> {
  const headers = new Headers();
  if (linkHeader) headers.set('link', linkHeader);
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    headers,
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

describe('CanvasClient', () => {
  let client: CanvasClient;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    client = new CanvasClient({
      baseUrl: 'https://canvas.school.edu',
      accessToken: 'test-token-123',
    });
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getCourses', () => {
    it('should call /api/v1/courses with auth header', async () => {
      const courses = [
        {
          id: 1,
          name: 'Math 101',
          course_code: 'MTH101',
          enrollment_term_id: 1,
          time_zone: 'America/New_York',
        },
      ];
      fetchSpy.mockResolvedValueOnce(mockResponse(courses));

      const result = await client.getCourses();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toContain('https://canvas.school.edu/api/v1/courses');
      expect(url).toContain('enrollment_state=active');
      expect(opts.headers.authorization).toBe('Bearer test-token-123');
      expect(result).toEqual(courses);
    });
  });

  describe('getAssignments', () => {
    it('should call /api/v1/courses/:id/assignments', async () => {
      const assignments = [
        {
          id: 10,
          name: 'HW 1',
          course_id: 5,
          due_at: '2025-10-01T23:59:00Z',
          points_possible: 100,
          submission_types: ['online_text_entry'],
          has_submitted_submissions: false,
        },
      ];
      fetchSpy.mockResolvedValueOnce(mockResponse(assignments));

      const result = await client.getAssignments(5);

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/v1/courses/5/assignments');
      expect(result).toEqual(assignments);
    });
  });

  describe('getSubmissions', () => {
    it('should call /api/v1/courses/:id/students/submissions', async () => {
      const submissions = [
        {
          id: 20,
          assignment_id: 10,
          user_id: 1,
          score: 85,
          grade: 'B',
          workflow_state: 'graded',
          submitted_at: '2025-09-30T12:00:00Z',
          late: false,
          missing: false,
        },
      ];
      fetchSpy.mockResolvedValueOnce(mockResponse(submissions));

      const result = await client.getSubmissions(5);

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/v1/courses/5/students/submissions');
      expect(url).toContain('student_ids');
      expect(result).toEqual(submissions);
    });
  });

  describe('getCalendarEvents', () => {
    it('should call /api/v1/calendar_events with date range', async () => {
      const events = [
        {
          id: 30,
          title: 'Midterm',
          start_at: '2025-10-15T09:00:00Z',
          end_at: '2025-10-15T11:00:00Z',
          type: 'event',
          context_code: 'course_5',
        },
      ];
      fetchSpy.mockResolvedValueOnce(mockResponse(events));

      const result = await client.getCalendarEvents('2025-10-01', '2025-10-31');

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/v1/calendar_events');
      expect(url).toContain('start_date=2025-10-01');
      expect(url).toContain('end_date=2025-10-31');
      expect(result).toEqual(events);
    });
  });

  describe('pagination', () => {
    it('should follow Link header with rel="next"', async () => {
      const page1 = [
        { id: 1, name: 'Course A', course_code: 'A', enrollment_term_id: 1, time_zone: 'UTC' },
      ];
      const page2 = [
        { id: 2, name: 'Course B', course_code: 'B', enrollment_term_id: 1, time_zone: 'UTC' },
      ];

      fetchSpy
        .mockResolvedValueOnce(
          mockResponse(page1, '<https://canvas.school.edu/api/v1/courses?page=2>; rel="next"')
        )
        .mockResolvedValueOnce(mockResponse(page2));

      const result = await client.getCourses();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toEqual([...page1, ...page2]);
    });

    it('should stop when no next link', async () => {
      const page = [
        { id: 1, name: 'Only Course', course_code: 'X', enrollment_term_id: 1, time_zone: 'UTC' },
      ];
      fetchSpy.mockResolvedValueOnce(mockResponse(page));

      const result = await client.getCourses();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result).toEqual(page);
    });
  });

  describe('error handling', () => {
    it('should throw on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockErrorResponse(401, 'Unauthorized', 'Invalid access token')
      );

      await expect(client.getCourses()).rejects.toThrow('HTTP 401 Unauthorized');
    });
  });
});
