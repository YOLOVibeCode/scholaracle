import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { SkywardAdapter } from './skyward-adapter';
import type { ISkywardScraper } from './skyward-client';

function createMockScraper(): ISkywardScraper {
  return {
    scrapeReport: jest.fn().mockResolvedValue({ data: [] }),
    scrapeGradebook: jest.fn().mockResolvedValue({
      data: {
        course: 'MATH',
        instructor: 'Mr. X',
        period: 1,
        score: 90,
        grade: 90,
        gradebook: [],
      },
    }),
    scrapeHistory: jest.fn().mockResolvedValue({ data: [] }),
  };
}

describe('SkywardAdapter', () => {
  let adapter: SkywardAdapter;
  let scraper: ISkywardScraper;

  beforeEach(() => {
    scraper = createMockScraper();
    adapter = new SkywardAdapter(() => scraper);
  });

  describe('meta', () => {
    it('should have correct provider and adapterId', () => {
      expect(adapter.meta.provider).toBe('skyward');
      expect(adapter.meta.adapterId).toBe('com.skyward');
      expect(adapter.meta.adapterVersion).toBe('0.1.0');
      expect(adapter.meta.displayName).toBe('Skyward');
    });
  });

  describe('authenticate', () => {
    it('should set authenticated state', async () => {
      expect(adapter.isAuthenticated()).toBe(false);

      await adapter.authenticate({
        baseUrl: 'https://skyward.district.net/login',
        username: 'student1',
        password: 'pass123',
      });

      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('should throw if username is missing', async () => {
      await expect(
        adapter.authenticate({ baseUrl: 'https://skyward.district.net', password: 'x' })
      ).rejects.toThrow('Skyward adapter requires username and password');
    });

    it('should throw if password is missing', async () => {
      await expect(
        adapter.authenticate({ baseUrl: 'https://skyward.district.net', username: 'x' })
      ).rejects.toThrow('Skyward adapter requires username and password');
    });

    it('should throw if baseUrl is missing', async () => {
      await expect(
        adapter.authenticate({ baseUrl: '', username: 'x', password: 'y' })
      ).rejects.toThrow('Skyward adapter requires baseUrl');
    });
  });

  describe('fetchEnvelope', () => {
    it('should throw if not authenticated', async () => {
      await expect(
        adapter.fetchEnvelope({ runId: 'r', sourceId: 's', displayName: 'd' })
      ).rejects.toThrow('Not authenticated');
    });

    it('should return envelope with grade and assignment ops', async () => {
      (scraper.scrapeReport as jest.Mock).mockResolvedValue({
        data: [
          {
            course: 97776,
            scores: [
              { bucket: 'TERM 1', score: 95 },
              { bucket: 'TERM 2', score: 88 },
            ],
          },
        ],
      });
      (scraper.scrapeGradebook as jest.Mock).mockResolvedValue({
        data: {
          course: 'PHYSICS',
          instructor: 'Dr. Smith',
          period: 1,
          score: 95,
          grade: 95,
          gradebook: [
            {
              category: 'Major',
              assignments: [
                {
                  title: 'Midterm',
                  score: 92,
                  grade: 92,
                  points: { earned: 92, total: 100 },
                  date: '10/15/25',
                  meta: [],
                },
              ],
            },
          ],
        },
      });

      await adapter.authenticate({
        baseUrl: 'https://skyward.district.net/login',
        username: 'student1',
        password: 'pass123',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'My District',
        portalBaseUrl: 'https://skyward.district.net',
      });

      expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
      expect(envelope.run.provider).toBe('skyward');
      expect(envelope.run.adapterId).toBe('com.skyward');
      expect(envelope.source.sourceId).toBe('src-1');

      // 2 grade snapshots + 1 course + 1 assignment = 4 ops
      expect(envelope.ops).toHaveLength(4);

      const entities = envelope.ops.map((o) => o.entity);
      expect(entities).toContain('gradeSnapshot');
      expect(entities).toContain('course');
      expect(entities).toContain('assignment');
    });

    it('should handle empty report', async () => {
      (scraper.scrapeReport as jest.Mock).mockResolvedValue({ data: [] });

      await adapter.authenticate({
        baseUrl: 'https://skyward.district.net/login',
        username: 's',
        password: 'p',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'r',
        sourceId: 's',
        displayName: 'd',
      });

      expect(envelope.ops).toHaveLength(0);
    });

    it('should continue when gradebook scrape fails for a course', async () => {
      (scraper.scrapeReport as jest.Mock).mockResolvedValue({
        data: [{ course: 11111, scores: [{ bucket: 'Q1', score: 80 }] }],
      });
      (scraper.scrapeGradebook as jest.Mock).mockRejectedValue(
        new Error('Gradebook not available')
      );

      await adapter.authenticate({
        baseUrl: 'https://skyward.district.net/login',
        username: 's',
        password: 'p',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'r',
        sourceId: 's',
        displayName: 'd',
      });

      // Only the gradeSnapshot, no course/assignment ops
      expect(envelope.ops.length).toBeGreaterThanOrEqual(1);
      expect(envelope.ops[0]!.entity).toBe('gradeSnapshot');
    });
  });
});
