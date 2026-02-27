import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { OneRosterAdapter } from './oneroster-adapter';
import { OneRosterClient } from './oneroster-client';

jest.mock('./oneroster-client');

const MockORClient = OneRosterClient as jest.MockedClass<typeof OneRosterClient>;

describe('OneRosterAdapter', () => {
  let adapter: OneRosterAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new OneRosterAdapter();
  });

  describe('meta', () => {
    it('should have correct provider and adapterId', () => {
      expect(adapter.meta.provider).toBe('oneroster');
      expect(adapter.meta.adapterId).toBe('org.imsglobal.oneroster.1.2');
      expect(adapter.meta.adapterVersion).toBe('0.1.0');
      expect(adapter.meta.displayName).toBe('OneRoster 1.2 (Generic)');
    });
  });

  describe('authenticate', () => {
    it('should accept accessToken directly', async () => {
      expect(adapter.isAuthenticated()).toBe(false);

      await adapter.authenticate({
        baseUrl: 'https://sis.school.edu/ims/oneroster/v1p2',
        accessToken: 'or-token',
      });

      expect(adapter.isAuthenticated()).toBe(true);
      expect(MockORClient).toHaveBeenCalledWith({
        baseUrl: 'https://sis.school.edu/ims/oneroster/v1p2',
        accessToken: 'or-token',
      });
    });

    it('should exchange client credentials for token', async () => {
      const mockClient = {} as OneRosterClient;
      (OneRosterClient.fromClientCredentials as jest.Mock) = jest
        .fn()
        .mockResolvedValue(mockClient);

      await adapter.authenticate({
        baseUrl: 'https://sis.school.edu/ims/oneroster/v1p2',
        clientId: 'my-id',
        clientSecret: 'my-secret',
      });

      expect(OneRosterClient.fromClientCredentials).toHaveBeenCalledWith(
        'https://sis.school.edu/ims/oneroster/v1p2/token',
        'my-id',
        'my-secret',
        'https://sis.school.edu/ims/oneroster/v1p2'
      );
      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('should throw if no auth method provided', async () => {
      await expect(adapter.authenticate({ baseUrl: 'https://sis.school.edu' })).rejects.toThrow(
        'OneRoster adapter requires either accessToken or clientId + clientSecret'
      );
    });

    it('should throw if baseUrl is missing', async () => {
      await expect(adapter.authenticate({ baseUrl: '', accessToken: 'x' })).rejects.toThrow(
        'OneRoster adapter requires baseUrl'
      );
    });
  });

  describe('fetchEnvelope', () => {
    it('should throw if not authenticated', async () => {
      await expect(
        adapter.fetchEnvelope({ runId: 'r', sourceId: 's', displayName: 'd' })
      ).rejects.toThrow('Not authenticated');
    });

    it('should return envelope with org, session, course, and assignment ops', async () => {
      const mockInstance = {
        getOrgs: jest
          .fn()
          .mockResolvedValue([{ sourcedId: 'org-1', name: 'Lincoln HS', type: 'school' }]),
        getAcademicSessions: jest.fn().mockResolvedValue([
          {
            sourcedId: 'ses-1',
            title: 'Fall 2025',
            startDate: '2025-08-20',
            endDate: '2025-12-19',
            type: 'semester',
            schoolYear: '2025',
          },
        ]),
        getCourses: jest
          .fn()
          .mockResolvedValue([{ sourcedId: 'crs-1', title: 'Algebra', courseCode: 'ALG1' }]),
        getLineItems: jest.fn().mockResolvedValue([
          {
            sourcedId: 'li-1',
            title: 'Chapter 1 HW',
            dueDate: '2025-09-10',
            resultValueMax: 20,
            class: { sourcedId: 'cls-1' },
          },
        ]),
        getResults: jest.fn().mockResolvedValue([
          {
            sourcedId: 'r-1',
            lineItem: { sourcedId: 'li-1' },
            student: { sourcedId: 'stu-1' },
            score: 18,
            scoreStatus: 'fully graded',
          },
        ]),
        getClasses: jest.fn().mockResolvedValue([]),
        getCategories: jest.fn().mockResolvedValue([]),
      };
      MockORClient.mockImplementation(() => mockInstance as unknown as OneRosterClient);

      await adapter.authenticate({
        baseUrl: 'https://sis.school.edu/ims/oneroster/v1p2',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'Lincoln District',
        portalBaseUrl: 'https://sis.school.edu',
      });

      expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
      expect(envelope.run.provider).toBe('oneroster');
      expect(envelope.run.adapterId).toBe('org.imsglobal.oneroster.1.2');

      // 1 org + 1 session + 1 course + 1 assignment = 4 ops
      expect(envelope.ops).toHaveLength(4);
      const entities = envelope.ops.map((o) => o.entity);
      expect(entities).toContain('institution');
      expect(entities).toContain('academicTerm');
      expect(entities).toContain('course');
      expect(entities).toContain('assignment');

      const assignmentOp = envelope.ops.find((o) => o.entity === 'assignment')!;
      expect(assignmentOp.record?.['title']).toBe('Chapter 1 HW');
      expect(assignmentOp.record?.['pointsEarned']).toBe(18);
      expect(assignmentOp.record?.['status']).toBe('graded');
    });

    it('should handle empty data', async () => {
      const mockInstance = {
        getOrgs: jest.fn().mockResolvedValue([]),
        getAcademicSessions: jest.fn().mockResolvedValue([]),
        getCourses: jest.fn().mockResolvedValue([]),
        getLineItems: jest.fn().mockResolvedValue([]),
        getResults: jest.fn().mockResolvedValue([]),
        getClasses: jest.fn().mockResolvedValue([]),
        getCategories: jest.fn().mockResolvedValue([]),
      };
      MockORClient.mockImplementation(() => mockInstance as unknown as OneRosterClient);

      await adapter.authenticate({
        baseUrl: 'https://sis.school.edu',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'r',
        sourceId: 's',
        displayName: 'd',
      });

      expect(envelope.ops).toHaveLength(0);
    });
  });
});
