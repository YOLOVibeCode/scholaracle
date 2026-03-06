/**
 * SkywardBrowserAdapter tests — ILmsAdapterWithTest contract (authenticate, testConnection, fetchEnvelope, cleanup on error).
 */

import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { SkywardBrowserAdapter } from './skyward-browser-adapter';
import type { SkywardBrowserScraper } from './skyward-browser-scraper';

function createMockScraper(overrides?: {
  launch?: jest.Mock;
  close?: jest.Mock;
  authenticate?: jest.Mock;
  extractAll?: jest.Mock;
}): SkywardBrowserScraper {
  return {
    launch: overrides?.launch ?? jest.fn().mockResolvedValue(undefined),
    close: overrides?.close ?? jest.fn().mockResolvedValue(undefined),
    authenticate: overrides?.authenticate ?? jest.fn().mockResolvedValue({ success: true }),
    extractAll:
      overrides?.extractAll ??
      jest.fn().mockResolvedValue({
        student: 'Test Student',
        school: 'Test School',
        courses: [],
        missingAssignments: [],
        assignments: [],
        attendance: [],
        schedule: [],
        timestamp: new Date().toISOString(),
      }),
  } as unknown as SkywardBrowserScraper;
}

describe('SkywardBrowserAdapter', () => {
  describe('meta', () => {
    it('exposes skyward browser adapter meta', () => {
      const adapter = new SkywardBrowserAdapter();
      expect(adapter.meta.provider).toBe('skyward');
      expect(adapter.meta.adapterId).toBe('com.skyward.browser');
      expect(adapter.meta.adapterVersion).toBe('1.0.0');
      expect(adapter.meta.displayName).toBe('Skyward (Browser)');
    });
  });

  describe('authenticate', () => {
    it('creates scraper, launches, and authenticates with credentials', async () => {
      const mockScraper = createMockScraper();
      const adapter = new SkywardBrowserAdapter(() => mockScraper);

      await adapter.authenticate({
        baseUrl: 'https://skyward.example.com',
        username: 'user',
        password: 'pass',
      });

      expect(mockScraper.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }));
      expect(mockScraper.authenticate).toHaveBeenCalledWith(
        'https://skyward.example.com',
        'user',
        'pass'
      );
      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('throws when username or password missing', async () => {
      const adapter = new SkywardBrowserAdapter(() => createMockScraper());

      await expect(
        adapter.authenticate({
          baseUrl: 'https://skyward.example.com',
          username: '',
          password: 'pass',
        })
      ).rejects.toThrow('username and password');

      await expect(
        adapter.authenticate({
          baseUrl: 'https://skyward.example.com',
          username: 'user',
          password: '',
        })
      ).rejects.toThrow('username and password');
    });

    it('throws when authenticate returns success: false', async () => {
      const mockScraper = createMockScraper({
        authenticate: jest.fn().mockResolvedValue({ success: false, message: 'Bad login' }),
      });
      const adapter = new SkywardBrowserAdapter(() => mockScraper);

      await expect(
        adapter.authenticate({
          baseUrl: 'https://skyward.example.com',
          username: 'user',
          password: 'pass',
        })
      ).rejects.toThrow('Bad login');
    });
  });

  describe('testConnection', () => {
    it('returns success when extractAll succeeds', async () => {
      const mockScraper = createMockScraper({
        extractAll: jest.fn().mockResolvedValue({
          student: 'Ava',
          school: 'Lincoln',
          courses: [
            { name: 'Math', period: '1', time: '', teacher: '', currentGrade: '90', grades: {} },
          ],
          missingAssignments: [],
          assignments: [],
          attendance: [],
          schedule: [],
          timestamp: new Date().toISOString(),
        }),
      });
      const adapter = new SkywardBrowserAdapter(() => mockScraper);
      await adapter.authenticate({
        baseUrl: 'https://skyward.example.com',
        username: 'u',
        password: 'p',
      });

      const result = await adapter.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/Connected|course/);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns failure when not authenticated', async () => {
      const adapter = new SkywardBrowserAdapter();

      const result = await adapter.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Not authenticated|authenticate first/);
    });
  });

  describe('fetchEnvelope', () => {
    it('returns valid envelope with ops from transform', async () => {
      const mockScraper = createMockScraper({
        extractAll: jest.fn().mockResolvedValue({
          student: 'Ava',
          school: 'Lincoln',
          courses: [
            {
              name: 'Math',
              period: '1',
              time: '8:00 AM - 8:45 AM',
              teacher: 'Smith',
              currentGrade: '92',
              grades: {},
            },
          ],
          missingAssignments: [],
          assignments: [],
          attendance: [],
          schedule: [
            {
              period: '1',
              time: '8:00 AM - 8:45 AM',
              course: 'Math',
              teacher: 'Smith',
              room: '101',
            },
          ],
          timestamp: '2026-02-16T12:00:00Z',
        }),
      });
      const adapter = new SkywardBrowserAdapter(() => mockScraper);
      await adapter.authenticate({
        baseUrl: 'https://skyward.example.com',
        username: 'u',
        password: 'p',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'Skyward',
        portalBaseUrl: 'https://skyward.example.com',
      });

      expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
      expect(envelope.run.runId).toBe('run-1');
      expect(envelope.run.provider).toBe('skyward');
      expect(envelope.run.adapterId).toBe('com.skyward.browser');
      expect(envelope.source.sourceId).toBe('src-1');
      expect(envelope.source.displayName).toBe('Skyward');
      expect(Array.isArray(envelope.ops)).toBe(true);
      expect(envelope.ops.length).toBeGreaterThan(0);
      const entityTypes = new Set(envelope.ops.map((o) => o.entity));
      expect(entityTypes.has('academicTerm')).toBe(true);
      expect(entityTypes.has('course')).toBe(true);
      expect(entityTypes.has('gradeSnapshot')).toBe(true);
    });

    it('throws when not authenticated', async () => {
      const adapter = new SkywardBrowserAdapter();

      await expect(
        adapter.fetchEnvelope({
          runId: 'run-1',
          sourceId: 'src-1',
          displayName: 'Skyward',
        })
      ).rejects.toThrow(/Not authenticated|authenticate first/);
    });
  });

  describe('cleanup on error', () => {
    it('calls close when fetchEnvelope throws', async () => {
      const closeMock = jest.fn().mockResolvedValue(undefined);
      const mockScraper = createMockScraper({
        extractAll: jest.fn().mockRejectedValue(new Error('Extract failed')),
        close: closeMock,
      });
      const adapter = new SkywardBrowserAdapter(() => mockScraper);
      await adapter.authenticate({
        baseUrl: 'https://skyward.example.com',
        username: 'u',
        password: 'p',
      });

      await expect(
        adapter.fetchEnvelope({
          runId: 'run-1',
          sourceId: 'src-1',
          displayName: 'Skyward',
        })
      ).rejects.toThrow('Extract failed');

      expect(closeMock).toHaveBeenCalled();
    });
  });
});
