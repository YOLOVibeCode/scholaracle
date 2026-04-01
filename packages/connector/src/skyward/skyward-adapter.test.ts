import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { SkywardAdapter } from './skyward-adapter';
import { SkywardClient } from './skyward-client';

jest.mock('./skyward-client');

const MockSkywardClient = SkywardClient as jest.MockedClass<typeof SkywardClient>;

describe('SkywardAdapter', () => {
  let adapter: SkywardAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new SkywardAdapter();
  });

  describe('meta', () => {
    it('should have correct provider and adapterId', () => {
      expect(adapter.meta.provider).toBe('skyward-qmlativ');
      expect(adapter.meta.adapterId).toBe('com.skyward.qmlativ');
      expect(adapter.meta.adapterVersion).toBe('0.1.0');
      expect(adapter.meta.displayName).toBe('Skyward Qmlativ');
    });
  });

  describe('authenticate', () => {
    it('should set authenticated state', async () => {
      expect(adapter.isAuthenticated()).toBe(false);

      await adapter.authenticate({
        baseUrl: 'https://district.skyward.com',
        accessToken: 'skyward-token',
      });

      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('should throw if accessToken is missing', async () => {
      await expect(
        adapter.authenticate({ baseUrl: 'https://district.skyward.com' })
      ).rejects.toThrow('Skyward adapter requires an accessToken');
    });

    it('should throw if baseUrl is missing', async () => {
      await expect(adapter.authenticate({ baseUrl: '', accessToken: 'tok' })).rejects.toThrow(
        'Skyward adapter requires a baseUrl'
      );
    });

    it('should create a SkywardClient with correct config', async () => {
      await adapter.authenticate({
        baseUrl: 'https://district.skyward.com',
        accessToken: 'my-token',
      });

      expect(MockSkywardClient).toHaveBeenCalledWith({
        baseUrl: 'https://district.skyward.com',
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

    it('should return success with class count', async () => {
      const mockInstance = {
        getClasses: jest.fn().mockResolvedValue([
          { sourcedId: 'c1', title: 'Math', course: { sourcedId: 'co1' }, status: 'active' },
          { sourcedId: 'c2', title: 'English', course: { sourcedId: 'co2' }, status: 'active' },
        ]),
      };
      MockSkywardClient.mockImplementation(() => mockInstance as unknown as SkywardClient);

      await adapter.authenticate({
        baseUrl: 'https://district.skyward.com',
        accessToken: 'tok',
      });

      const result = await adapter.testConnection();
      expect(result.success).toBe(true);
      expect(result.message).toContain('2 classes');
      expect(result.details?.courseCount).toBe(2);
    });
  });

  describe('fetchEnvelope', () => {
    it('should throw if not authenticated', async () => {
      await expect(
        adapter.fetchEnvelope({ runId: 'r', sourceId: 's', displayName: 'd' })
      ).rejects.toThrow('Not authenticated');
    });

    it('should return a valid envelope with class, assignment, and grade ops', async () => {
      const mockInstance = {
        getClasses: jest
          .fn()
          .mockResolvedValue([
            { sourcedId: 'c1', title: 'English', course: { sourcedId: 'co1' }, status: 'active' },
          ]),
        getLineItems: jest.fn().mockResolvedValue([
          {
            sourcedId: 'li1',
            title: 'Essay',
            dueDate: '2025-12-01',
            class: { sourcedId: 'c1' },
            resultValueMax: 100,
            status: 'active',
          },
        ]),
        getResults: jest.fn().mockResolvedValue([
          {
            sourcedId: 'r1',
            lineItem: { sourcedId: 'li1' },
            student: { sourcedId: 's1' },
            score: 92,
            scoreStatus: 'fully graded',
            status: 'active',
          },
        ]),
        getEnrollments: jest.fn().mockResolvedValue([]),
      };
      MockSkywardClient.mockImplementation(() => mockInstance as unknown as SkywardClient);

      await adapter.authenticate({
        baseUrl: 'https://district.skyward.com',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'My District',
        portalBaseUrl: 'https://district.skyward.com',
      });

      expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
      expect(envelope.run.provider).toBe('skyward-qmlativ');
      expect(envelope.run.adapterId).toBe('com.skyward.qmlativ');
      expect(envelope.source.sourceId).toBe('src-1');

      // 1 class + 1 assignment + 1 gradeSnapshot = 3 ops
      expect(envelope.ops).toHaveLength(3);
      expect(envelope.ops[0]!.entity).toBe('course');
      expect(envelope.ops[1]!.entity).toBe('assignment');
      expect(envelope.ops[1]!.record?.['title']).toBe('Essay');
      expect(envelope.ops[1]!.record?.['pointsEarned']).toBe(92);
      expect(envelope.ops[2]!.entity).toBe('gradeSnapshot');
    });

    it('should handle empty classes', async () => {
      const mockInstance = {
        getClasses: jest.fn().mockResolvedValue([]),
        getLineItems: jest.fn(),
        getResults: jest.fn(),
        getEnrollments: jest.fn(),
      };
      MockSkywardClient.mockImplementation(() => mockInstance as unknown as SkywardClient);

      await adapter.authenticate({
        baseUrl: 'https://district.skyward.com',
        accessToken: 'tok',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'r',
        sourceId: 's',
        displayName: 'd',
      });

      expect(envelope.ops).toHaveLength(0);
      expect(mockInstance.getLineItems).not.toHaveBeenCalled();
    });
  });
});
