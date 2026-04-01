import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { CanvasAdapter } from './canvas-adapter';
import { CanvasClient } from './canvas-client';

jest.mock('./canvas-client');

const MockCanvasClient = CanvasClient as jest.MockedClass<typeof CanvasClient>;

describe('CanvasAdapter', () => {
  let adapter: CanvasAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new CanvasAdapter();
  });

  describe('meta', () => {
    it('should have correct provider and adapterId', () => {
      expect(adapter.meta.provider).toBe('canvas');
      expect(adapter.meta.adapterId).toBe('com.instructure.canvas');
      expect(adapter.meta.adapterVersion).toBe('0.1.0');
      expect(adapter.meta.displayName).toBe('Canvas LMS');
    });
  });

  describe('authenticate', () => {
    it('should set authenticated state', async () => {
      expect(adapter.isAuthenticated()).toBe(false);

      await adapter.authenticate({
        baseUrl: 'https://myschool.instructure.com',
        accessToken: 'canvas-token',
      });

      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('should throw if accessToken is missing', async () => {
      await expect(
        adapter.authenticate({ baseUrl: 'https://myschool.instructure.com' })
      ).rejects.toThrow('Canvas adapter requires an accessToken');
    });

    it('should throw if baseUrl is missing', async () => {
      await expect(adapter.authenticate({ baseUrl: '', accessToken: 'tok' })).rejects.toThrow(
        'Canvas adapter requires a baseUrl'
      );
    });

    it('should create a CanvasClient with correct config', async () => {
      await adapter.authenticate({
        baseUrl: 'https://myschool.instructure.com',
        accessToken: 'my-token',
      });

      expect(MockCanvasClient).toHaveBeenCalledWith({
        baseUrl: 'https://myschool.instructure.com',
        accessToken: 'my-token',
      });
    });
  });

  describe('testConnection', () => {
    it('should fail if not authenticated', async () => {
      const result = await adapter.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Not authenticated');
    });

    it('should return success with course count', async () => {
      const mockInstance = {
        getCourses: jest.fn().mockResolvedValue([
          { id: 1, name: 'Math', course_code: 'MATH101', workflow_state: 'available' },
          { id: 2, name: 'English', course_code: 'ENG102', workflow_state: 'available' },
        ]),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      await adapter.authenticate({
        baseUrl: 'https://myschool.instructure.com',
        accessToken: 'tok',
      });

      const result = await adapter.testConnection();
      expect(result.success).toBe(true);
      expect(result.message).toContain('2 courses');
      expect(result.details?.courseCount).toBe(2);
    });

    it('should return failure on error', async () => {
      const mockInstance = {
        getCourses: jest.fn().mockRejectedValue(new Error('Unauthorized')),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      await adapter.authenticate({
        baseUrl: 'https://myschool.instructure.com',
        accessToken: 'bad-tok',
      });

      const result = await adapter.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unauthorized');
    });
  });

  describe('fetchEnvelope', () => {
    it('should throw if not authenticated', async () => {
      await expect(
        adapter.fetchEnvelope({ runId: 'r', sourceId: 's', displayName: 'd' })
      ).rejects.toThrow('Not authenticated');
    });

    it('should return a valid envelope with course, assignment, and grade ops', async () => {
      const mockInstance = {
        getCourses: jest
          .fn()
          .mockResolvedValue([
            { id: 1, name: 'English', course_code: 'ENG101', workflow_state: 'available' },
          ]),
        getAssignments: jest.fn().mockResolvedValue([
          {
            id: 10,
            course_id: 1,
            name: 'Essay',
            due_at: '2025-12-01T23:59:00Z',
            points_possible: 100,
            submission_types: ['online_text_entry'],
            workflow_state: 'published',
          },
        ]),
        getMySubmission: jest.fn().mockResolvedValue({
          id: 100,
          assignment_id: 10,
          user_id: 1,
          score: 92,
          workflow_state: 'graded',
        }),
        getEnrollments: jest.fn().mockResolvedValue([
          {
            id: 200,
            course_id: 1,
            user_id: 1,
            type: 'StudentEnrollment',
            enrollment_state: 'active',
            grades: { current_score: 92, current_grade: 'A-' },
          },
        ]),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      await adapter.authenticate({
        baseUrl: 'https://myschool.instructure.com',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'My School',
        portalBaseUrl: 'https://myschool.instructure.com',
      });

      expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
      expect(envelope.run.provider).toBe('canvas');
      expect(envelope.run.adapterId).toBe('com.instructure.canvas');
      expect(envelope.source.sourceId).toBe('src-1');

      // 1 course + 1 assignment + 1 gradeSnapshot = 3 ops
      expect(envelope.ops).toHaveLength(3);
      expect(envelope.ops[0]!.entity).toBe('course');
      expect(envelope.ops[1]!.entity).toBe('assignment');
      expect(envelope.ops[1]!.record?.['title']).toBe('Essay');
      expect(envelope.ops[1]!.record?.['pointsEarned']).toBe(92);
      expect(envelope.ops[2]!.entity).toBe('gradeSnapshot');
    });

    it('should handle empty courses', async () => {
      const mockInstance = {
        getCourses: jest.fn().mockResolvedValue([]),
        getAssignments: jest.fn(),
        getMySubmission: jest.fn(),
        getEnrollments: jest.fn(),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      await adapter.authenticate({
        baseUrl: 'https://myschool.instructure.com',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'r',
        sourceId: 's',
        displayName: 'd',
      });

      expect(envelope.ops).toHaveLength(0);
      expect(mockInstance.getAssignments).not.toHaveBeenCalled();
    });

    it('should skip unpublished assignments', async () => {
      const mockInstance = {
        getCourses: jest
          .fn()
          .mockResolvedValue([
            { id: 1, name: 'Math', course_code: 'MATH101', workflow_state: 'available' },
          ]),
        getAssignments: jest.fn().mockResolvedValue([
          {
            id: 10,
            course_id: 1,
            name: 'Draft HW',
            submission_types: ['online_text_entry'],
            workflow_state: 'unpublished',
          },
        ]),
        getMySubmission: jest.fn(),
        getEnrollments: jest.fn().mockResolvedValue([]),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      await adapter.authenticate({
        baseUrl: 'https://myschool.instructure.com',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'r',
        sourceId: 's',
        displayName: 'd',
      });

      // Only course op, no assignment (unpublished), no grade (no enrollment grades)
      expect(envelope.ops).toHaveLength(1);
      expect(envelope.ops[0]!.entity).toBe('course');
      expect(mockInstance.getMySubmission).not.toHaveBeenCalled();
    });
  });
});
