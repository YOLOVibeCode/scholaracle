import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { CanvasAdapter } from './canvas-adapter';
import { CanvasClient } from './canvas-client';

// Mock CanvasClient
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
        baseUrl: 'https://canvas.school.edu',
        accessToken: 'test-token',
      });

      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('should throw if accessToken is missing', async () => {
      await expect(adapter.authenticate({ baseUrl: 'https://canvas.school.edu' })).rejects.toThrow(
        'Canvas adapter requires an accessToken'
      );
    });

    it('should create a CanvasClient with correct config', async () => {
      await adapter.authenticate({
        baseUrl: 'https://canvas.school.edu',
        accessToken: 'my-token',
      });

      expect(MockCanvasClient).toHaveBeenCalledWith({
        baseUrl: 'https://canvas.school.edu',
        accessToken: 'my-token',
      });
    });
  });

  describe('fetchEnvelope', () => {
    it('should throw if not authenticated', async () => {
      await expect(
        adapter.fetchEnvelope({
          runId: 'run-1',
          sourceId: 'src-1',
          displayName: 'Test',
        })
      ).rejects.toThrow('Not authenticated');
    });

    it('should return a valid envelope with ops from courses', async () => {
      const mockInstance = {
        getCourses: jest
          .fn()
          .mockResolvedValue([
            { id: 1, name: 'Math', course_code: 'M101', enrollment_term_id: 1, time_zone: 'UTC' },
          ]),
        getAssignments: jest.fn().mockResolvedValue([
          {
            id: 10,
            name: 'HW1',
            course_id: 1,
            due_at: '2025-10-01T23:59:00Z',
            points_possible: 50,
            submission_types: ['online'],
            has_submitted_submissions: true,
          },
        ]),
        getSubmissions: jest.fn().mockResolvedValue([
          {
            id: 20,
            assignment_id: 10,
            user_id: 1,
            score: 45,
            grade: 'A',
            workflow_state: 'graded',
            submitted_at: '2025-09-30T12:00:00Z',
            late: false,
            missing: false,
          },
        ]),
        getCalendarEvents: jest.fn().mockResolvedValue([
          {
            id: 30,
            title: 'Exam',
            start_at: '2025-10-15T09:00:00Z',
            end_at: '2025-10-15T11:00:00Z',
            type: 'event',
            context_code: 'course_1',
          },
        ]),
        getFiles: jest.fn().mockResolvedValue([]),
        getPages: jest.fn().mockResolvedValue([]),
        getAssignmentGroups: jest.fn().mockResolvedValue([]),
        getRubrics: jest.fn().mockResolvedValue([]),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      await adapter.authenticate({
        baseUrl: 'https://canvas.school.edu',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'My School',
        portalBaseUrl: 'https://canvas.school.edu',
      });

      expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
      expect(envelope.run.runId).toBe('run-1');
      expect(envelope.run.provider).toBe('canvas');
      expect(envelope.run.adapterId).toBe('com.instructure.canvas');
      expect(envelope.run.mode).toBe('delta');
      expect(envelope.source.sourceId).toBe('src-1');
      expect(envelope.source.displayName).toBe('My School');
      expect(envelope.source.portalBaseUrl).toBe('https://canvas.school.edu');

      // 1 assignment + 1 calendar event = 2 ops (no files/pages in this mock)
      expect(envelope.ops).toHaveLength(2);
      const op0 = envelope.ops[0]!;
      const op1 = envelope.ops[1]!;
      expect(op0.entity).toBe('assignment');
      expect(op0.record?.['title']).toBe('HW1');
      expect(op1.entity).toBe('eventSeries');
      expect(op1.record?.['title']).toBe('Exam');
    });

    it('should include courseMaterial ops for files and pages', async () => {
      const mockInstance = {
        getCourses: jest
          .fn()
          .mockResolvedValue([
            { id: 7, name: 'Art', course_code: 'A101', enrollment_term_id: 1, time_zone: 'UTC' },
          ]),
        getAssignments: jest.fn().mockResolvedValue([]),
        getSubmissions: jest.fn().mockResolvedValue([]),
        getCalendarEvents: jest.fn().mockResolvedValue([]),
        getFiles: jest.fn().mockResolvedValue([
          {
            id: 200,
            display_name: 'Handout',
            filename: 'handout.pdf',
            url: 'https://canvas.example.com/files/200',
            size: 500,
            content_type: 'application/pdf',
            created_at: '2025-09-01T00:00:00Z',
            updated_at: '2025-09-01T00:00:00Z',
            folder_id: 1,
          },
        ]),
        getPages: jest.fn().mockResolvedValue([
          {
            page_id: 3,
            url: 'overview',
            title: 'Overview',
            body: '<p>Welcome</p>',
            published: true,
            created_at: '2025-09-01T00:00:00Z',
            updated_at: '2025-09-01T00:00:00Z',
            html_url: 'https://canvas.example.com/courses/7/pages/overview',
          },
        ]),
        getAssignmentGroups: jest.fn().mockResolvedValue([]),
        getRubrics: jest.fn().mockResolvedValue([]),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      await adapter.authenticate({
        baseUrl: 'https://canvas.school.edu',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'School',
        portalBaseUrl: 'https://canvas.school.edu',
      });

      const materialOps = envelope.ops.filter((o) => o.entity === 'courseMaterial');
      expect(materialOps).toHaveLength(2);
      const fileOp = materialOps.find((o) => o.key.externalId === 'canvas-file-200');
      const pageOp = materialOps.find((o) => o.key.externalId === 'canvas-page-3');
      expect(fileOp?.record?.['title']).toBe('Handout');
      expect(fileOp?.record?.['type']).toBe('document');
      expect(pageOp?.record?.['title']).toBe('Overview');
      expect(pageOp?.record?.['extractedText']).toBe('<p>Welcome</p>');
    });

    it('should rewrite file URL to serverUrl when assetDownloader is provided', async () => {
      const mockInstance = {
        getCourses: jest
          .fn()
          .mockResolvedValue([
            { id: 8, name: 'Math', course_code: 'M101', enrollment_term_id: 1, time_zone: 'UTC' },
          ]),
        getAssignments: jest.fn().mockResolvedValue([]),
        getSubmissions: jest.fn().mockResolvedValue([]),
        getCalendarEvents: jest.fn().mockResolvedValue([]),
        getFiles: jest.fn().mockResolvedValue([
          {
            id: 300,
            display_name: 'Notes',
            filename: 'notes.pdf',
            url: 'https://canvas.school.edu/files/300/download',
            size: 100,
            content_type: 'application/pdf',
            created_at: '2025-09-01T00:00:00Z',
            updated_at: '2025-09-01T00:00:00Z',
            folder_id: 1,
          },
        ]),
        getPages: jest.fn().mockResolvedValue([]),
        getAssignmentGroups: jest.fn().mockResolvedValue([]),
        getRubrics: jest.fn().mockResolvedValue([]),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      const serverUrl = 'https://api.scholarmancy.com/api/assets/asset-uuid-1';
      const mockDownloader = {
        checkOnly: jest.fn().mockResolvedValue({ exists: false }),
        downloadAndUpload: jest.fn().mockResolvedValue({
          assetId: 'asset-uuid-1',
          serverUrl,
          contentHash: 'abc',
        }),
      };

      await adapter.authenticate({
        baseUrl: 'https://canvas.school.edu',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'School',
        portalBaseUrl: 'https://canvas.school.edu',
        assetDownloader: mockDownloader as unknown as import('../adapter').IAssetDownloaderLike,
      });

      const fileOp = envelope.ops.find(
        (o) => o.entity === 'courseMaterial' && o.key.externalId === 'canvas-file-300'
      );
      expect(fileOp).toBeDefined();
      expect(fileOp?.record?.['url']).toBe(serverUrl);
      expect(mockDownloader.downloadAndUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://canvas.school.edu/files/300/download',
          fileName: 'notes.pdf',
          entityExternalId: 'canvas-file-300',
          courseExternalId: 'canvas-course-8',
        })
      );
    });

    it('should only download critical/high when assetPriorityFilter is critical_high_only', async () => {
      const mockInstance = {
        getCourses: jest
          .fn()
          .mockResolvedValue([
            { id: 9, name: 'Course', course_code: 'C101', enrollment_term_id: 1, time_zone: 'UTC' },
          ]),
        getAssignments: jest.fn().mockResolvedValue([]),
        getSubmissions: jest.fn().mockResolvedValue([]),
        getCalendarEvents: jest.fn().mockResolvedValue([]),
        getFiles: jest.fn().mockResolvedValue([
          {
            id: 401,
            display_name: 'Syllabus',
            filename: 'syllabus.pdf',
            url: 'https://canvas.edu/files/401',
            size: 100,
            content_type: 'application/pdf',
            created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
            folder_id: 1,
          },
          {
            id: 402,
            display_name: 'Old Handout',
            filename: 'old.pdf',
            url: 'https://canvas.edu/files/402',
            size: 500,
            content_type: 'application/pdf',
            created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
            folder_id: 1,
          },
        ]),
        getPages: jest.fn().mockResolvedValue([]),
        getAssignmentGroups: jest.fn().mockResolvedValue([]),
        getRubrics: jest.fn().mockResolvedValue([]),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      const mockDownloader = {
        checkOnly: jest.fn().mockResolvedValue({ exists: false }),
        downloadAndUpload: jest.fn().mockResolvedValue({
          assetId: 'aid',
          serverUrl: 'https://api.example/assets/aid',
          contentHash: 'h',
        }),
      };

      await adapter.authenticate({ baseUrl: 'https://canvas.school.edu', accessToken: 'tok' });
      await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'School',
        portalBaseUrl: 'https://canvas.school.edu',
        assetDownloader: mockDownloader as unknown as import('../adapter').IAssetDownloaderLike,
        assetPriorityFilter: 'critical_high_only',
      });

      expect(mockDownloader.downloadAndUpload).toHaveBeenCalledTimes(1);
      expect(mockDownloader.downloadAndUpload).toHaveBeenCalledWith(
        expect.objectContaining({ entityExternalId: 'canvas-file-401' })
      );
    });

    it('should match submissions to assignments by assignment_id', async () => {
      const mockInstance = {
        getCourses: jest
          .fn()
          .mockResolvedValue([
            { id: 1, name: 'Sci', course_code: 'S101', enrollment_term_id: 1, time_zone: 'UTC' },
          ]),
        getAssignments: jest.fn().mockResolvedValue([
          {
            id: 10,
            name: 'Lab',
            course_id: 1,
            due_at: null,
            points_possible: 20,
            submission_types: [],
            has_submitted_submissions: false,
          },
          {
            id: 11,
            name: 'Report',
            course_id: 1,
            due_at: null,
            points_possible: 30,
            submission_types: [],
            has_submitted_submissions: false,
          },
        ]),
        getSubmissions: jest.fn().mockResolvedValue([
          {
            id: 20,
            assignment_id: 11,
            user_id: 1,
            score: 28,
            grade: 'A-',
            workflow_state: 'graded',
            submitted_at: '2025-10-01T12:00:00Z',
            late: false,
            missing: false,
          },
        ]),
        getCalendarEvents: jest.fn().mockResolvedValue([]),
        getFiles: jest.fn().mockResolvedValue([]),
        getPages: jest.fn().mockResolvedValue([]),
        getAssignmentGroups: jest.fn().mockResolvedValue([]),
        getRubrics: jest.fn().mockResolvedValue([]),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      await adapter.authenticate({ baseUrl: 'https://x.edu', accessToken: 'tok' });
      const envelope = await adapter.fetchEnvelope({
        runId: 'r',
        sourceId: 's',
        displayName: 'd',
      });

      expect(envelope.ops).toHaveLength(2);
      const first = envelope.ops[0]!;
      const second = envelope.ops[1]!;
      // First assignment has no submission → unknown status
      expect(first.record?.['status']).toBe('unknown');
      // Second assignment matched to submission → graded
      expect(second.record?.['status']).toBe('graded');
      expect(second.record?.['pointsEarned']).toBe(28);
    });

    it('should populate category and categoryWeight from assignment groups', async () => {
      const mockInstance = {
        getCourses: jest
          .fn()
          .mockResolvedValue([
            { id: 1, name: 'Math', course_code: 'M101', enrollment_term_id: 1, time_zone: 'UTC' },
          ]),
        getAssignments: jest.fn().mockResolvedValue([
          {
            id: 10,
            name: 'Quiz',
            course_id: 1,
            due_at: null,
            points_possible: 20,
            submission_types: [],
            has_submitted_submissions: false,
            assignment_group_id: 5,
          },
        ]),
        getSubmissions: jest.fn().mockResolvedValue([]),
        getCalendarEvents: jest.fn().mockResolvedValue([]),
        getFiles: jest.fn().mockResolvedValue([]),
        getPages: jest.fn().mockResolvedValue([]),
        getAssignmentGroups: jest
          .fn()
          .mockResolvedValue([{ id: 5, name: 'Tests', position: 1, group_weight: 40 }]),
        getRubrics: jest.fn().mockResolvedValue([]),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      await adapter.authenticate({ baseUrl: 'https://x.edu', accessToken: 'tok' });
      const envelope = await adapter.fetchEnvelope({
        runId: 'r',
        sourceId: 's',
        displayName: 'd',
      });

      const assignmentOp = envelope.ops.find((o) => o.entity === 'assignment');
      expect(assignmentOp?.record?.['category']).toBe('Tests');
      expect(assignmentOp?.record?.['categoryWeight']).toBe(40);
    });

    it('should emit rubric courseMaterial ops', async () => {
      const mockInstance = {
        getCourses: jest.fn().mockResolvedValue([
          {
            id: 1,
            name: 'English',
            course_code: 'E101',
            enrollment_term_id: 1,
            time_zone: 'UTC',
          },
        ]),
        getAssignments: jest.fn().mockResolvedValue([]),
        getSubmissions: jest.fn().mockResolvedValue([]),
        getCalendarEvents: jest.fn().mockResolvedValue([]),
        getFiles: jest.fn().mockResolvedValue([]),
        getPages: jest.fn().mockResolvedValue([]),
        getAssignmentGroups: jest.fn().mockResolvedValue([]),
        getRubrics: jest.fn().mockResolvedValue([
          {
            id: 77,
            title: 'Essay Rubric',
            points_possible: 20,
            data: [
              { description: 'Thesis', points: 10, ratings: [{ description: 'Good', points: 10 }] },
            ],
          },
        ]),
      };
      MockCanvasClient.mockImplementation(() => mockInstance as unknown as CanvasClient);

      await adapter.authenticate({ baseUrl: 'https://x.edu', accessToken: 'tok' });
      const envelope = await adapter.fetchEnvelope({
        runId: 'r',
        sourceId: 's',
        displayName: 'd',
      });

      const rubricOp = envelope.ops.find(
        (o) => o.entity === 'courseMaterial' && o.key.externalId === 'canvas-rubric-77'
      );
      expect(rubricOp).toBeDefined();
      expect(rubricOp?.record?.['title']).toBe('Essay Rubric');
      expect(rubricOp?.record?.['type']).toBe('rubric');
      expect(rubricOp?.key.courseExternalId).toBe('canvas-course-1');
    });
  });
});
