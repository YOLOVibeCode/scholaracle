import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { GoogleClassroomAdapter } from './google-classroom-adapter';
import { GoogleClassroomClient } from './google-classroom-client';

jest.mock('./google-classroom-client');
jest.mock('../link-probe', () => ({
  probeLinkAccessibilityBatch: jest.fn().mockResolvedValue(new Map()),
}));

const MockGCClient = GoogleClassroomClient as jest.MockedClass<typeof GoogleClassroomClient>;

describe('GoogleClassroomAdapter', () => {
  let adapter: GoogleClassroomAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new GoogleClassroomAdapter();
  });

  describe('meta', () => {
    it('should have correct provider and adapterId', () => {
      expect(adapter.meta.provider).toBe('google-classroom');
      expect(adapter.meta.adapterId).toBe('com.google.classroom');
      expect(adapter.meta.adapterVersion).toBe('0.1.0');
      expect(adapter.meta.displayName).toBe('Google Classroom');
    });
  });

  describe('authenticate', () => {
    it('should set authenticated state', async () => {
      expect(adapter.isAuthenticated()).toBe(false);

      await adapter.authenticate({
        baseUrl: 'https://classroom.googleapis.com',
        accessToken: 'google-token',
      });

      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('should throw if accessToken is missing', async () => {
      await expect(
        adapter.authenticate({ baseUrl: 'https://classroom.googleapis.com' })
      ).rejects.toThrow('Google Classroom adapter requires an accessToken');
    });

    it('should create a GoogleClassroomClient with correct config', async () => {
      await adapter.authenticate({
        baseUrl: 'https://classroom.googleapis.com',
        accessToken: 'my-gc-token',
      });

      expect(MockGCClient).toHaveBeenCalledWith({ accessToken: 'my-gc-token' });
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
          .mockResolvedValue([{ id: 'c-1', name: 'English', courseState: 'ACTIVE' }]),
        getCourseWork: jest.fn().mockResolvedValue([
          {
            id: 'cw-1',
            courseId: 'c-1',
            title: 'Book Report',
            dueDate: { year: 2025, month: 12, day: 1 },
            maxPoints: 100,
            workType: 'ASSIGNMENT',
            state: 'PUBLISHED',
          },
        ]),
        getStudentSubmissions: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            courseId: 'c-1',
            courseWorkId: 'cw-1',
            userId: 'u-1',
            state: 'RETURNED',
            assignedGrade: 92,
            late: false,
          },
        ]),
        getStudents: jest.fn().mockResolvedValue([]),
        getCourseWorkMaterials: jest.fn().mockResolvedValue([]),
      };
      MockGCClient.mockImplementation(() => mockInstance as unknown as GoogleClassroomClient);

      await adapter.authenticate({
        baseUrl: 'https://classroom.googleapis.com',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'My School',
        portalBaseUrl: 'https://classroom.google.com',
      });

      expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
      expect(envelope.run.provider).toBe('google-classroom');
      expect(envelope.run.adapterId).toBe('com.google.classroom');
      expect(envelope.source.sourceId).toBe('src-1');

      // 1 course + 1 assignment + 1 gradeSnapshot = 3 ops
      expect(envelope.ops).toHaveLength(3);
      expect(envelope.ops[0]!.entity).toBe('course');
      expect(envelope.ops[1]!.entity).toBe('assignment');
      expect(envelope.ops[1]!.record?.['title']).toBe('Book Report');
      expect(envelope.ops[1]!.record?.['pointsEarned']).toBe(92);
      expect(envelope.ops[2]!.entity).toBe('gradeSnapshot');
    });

    it('should handle empty courses', async () => {
      const mockInstance = {
        getCourses: jest.fn().mockResolvedValue([]),
        getCourseWork: jest.fn(),
        getStudentSubmissions: jest.fn(),
        getStudents: jest.fn(),
      };
      MockGCClient.mockImplementation(() => mockInstance as unknown as GoogleClassroomClient);

      await adapter.authenticate({
        baseUrl: 'https://classroom.googleapis.com',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'r',
        sourceId: 's',
        displayName: 'd',
      });

      expect(envelope.ops).toHaveLength(0);
      expect(mockInstance.getCourseWork).not.toHaveBeenCalled();
    });
  });
});
