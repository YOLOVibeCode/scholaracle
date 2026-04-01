import { CanvasClient } from './canvas-client';

jest.mock('../http', () => ({
  getJson: jest.fn(),
  buildUrl: jest.requireActual('../http').buildUrl,
}));

import { getJson } from '../http';

const mockGetJson = getJson as jest.MockedFunction<typeof getJson>;

describe('CanvasClient', () => {
  let client: CanvasClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new CanvasClient({
      baseUrl: 'https://myschool.instructure.com',
      accessToken: 'canvas-token',
    });
  });

  describe('ping', () => {
    it('should call courses endpoint with per_page=1', async () => {
      mockGetJson.mockResolvedValue({
        data: [{ id: 1, name: 'Math', course_code: 'MATH101', workflow_state: 'available' }],
        headers: new Headers(),
      });

      const result = await client.ping();
      expect(result.courseCount).toBe(1);
      expect(mockGetJson).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/courses'),
        'canvas-token'
      );
    });

    it('should return 0 for empty courses', async () => {
      mockGetJson.mockResolvedValue({ data: [], headers: new Headers() });

      const result = await client.ping();
      expect(result.courseCount).toBe(0);
    });
  });

  describe('getCourses', () => {
    it('should return courses from paginated response', async () => {
      const courses = [
        { id: 1, name: 'Math', course_code: 'MATH101', workflow_state: 'available' },
        { id: 2, name: 'English', course_code: 'ENG102', workflow_state: 'available' },
      ];
      mockGetJson.mockResolvedValue({ data: courses, headers: new Headers() });

      const result = await client.getCourses();
      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('Math');
    });

    it('should follow Link header pagination', async () => {
      const page1Headers = new Headers();
      page1Headers.set(
        'link',
        '<https://myschool.instructure.com/api/v1/courses?page=2>; rel="next"'
      );

      mockGetJson
        .mockResolvedValueOnce({
          data: [{ id: 1, name: 'Math', course_code: 'MATH101', workflow_state: 'available' }],
          headers: page1Headers,
        })
        .mockResolvedValueOnce({
          data: [{ id: 2, name: 'English', course_code: 'ENG102', workflow_state: 'available' }],
          headers: new Headers(),
        });

      const result = await client.getCourses();
      expect(result).toHaveLength(2);
      expect(mockGetJson).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAssignments', () => {
    it('should fetch assignments for a course', async () => {
      const assignments = [
        {
          id: 10,
          course_id: 1,
          name: 'Homework 1',
          points_possible: 100,
          submission_types: ['online_text_entry'],
          workflow_state: 'published',
        },
      ];
      mockGetJson.mockResolvedValue({ data: assignments, headers: new Headers() });

      const result = await client.getAssignments(1);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Homework 1');
      expect(mockGetJson).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/courses/1/assignments'),
        'canvas-token'
      );
    });
  });

  describe('getMySubmission', () => {
    it('should fetch self submission', async () => {
      const submission = {
        id: 100,
        assignment_id: 10,
        user_id: 1,
        score: 85,
        workflow_state: 'graded',
      };
      mockGetJson.mockResolvedValue({ data: submission, headers: new Headers() });

      const result = await client.getMySubmission(1, 10);
      expect(result).toBeDefined();
      expect(result!.score).toBe(85);
    });

    it('should return undefined on error', async () => {
      mockGetJson.mockRejectedValue(new Error('Not Found'));

      const result = await client.getMySubmission(1, 999);
      expect(result).toBeUndefined();
    });
  });

  describe('getEnrollments', () => {
    it('should fetch enrollments for a course', async () => {
      const enrollments = [
        {
          id: 200,
          course_id: 1,
          user_id: 1,
          type: 'StudentEnrollment',
          enrollment_state: 'active',
          grades: { current_score: 92.5, current_grade: 'A-' },
        },
      ];
      mockGetJson.mockResolvedValue({ data: enrollments, headers: new Headers() });

      const result = await client.getEnrollments(1);
      expect(result).toHaveLength(1);
      expect(result[0]!.grades?.current_score).toBe(92.5);
    });
  });
});
