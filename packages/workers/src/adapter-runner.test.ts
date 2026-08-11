/**
 * Tests for createAdapterRunner after server Playwright retirement.
 * Canvas/Skyward/Aeries are client-side only; Google Classroom / OneRoster remain.
 */
import { createAdapterRunner } from './adapter-runner';

const mockEnvelope = {
  ops: [
    { entity: 'course' },
    { entity: 'course' },
    { entity: 'assignment' },
    { entity: 'assignment' },
    { entity: 'assignment' },
    { entity: 'gradeSnapshot' },
  ],
};

const mockAuthenticate = jest.fn().mockResolvedValue(undefined);
const mockFetchEnvelope = jest.fn().mockResolvedValue(mockEnvelope);

jest.mock('@scholaracle/connector', () => ({
  GoogleClassroomAdapter: jest.fn().mockImplementation(() => ({
    authenticate: mockAuthenticate,
    fetchEnvelope: mockFetchEnvelope,
  })),
  OneRosterAdapter: jest.fn().mockImplementation(() => ({
    authenticate: mockAuthenticate,
    fetchEnvelope: mockFetchEnvelope,
  })),
}));

const CLIENT_SIDE_MSG = /mobile app|browser extension/i;

describe('createAdapterRunner', () => {
  const run = createAdapterRunner();

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchEnvelope.mockResolvedValue(mockEnvelope);
  });

  describe('retired Playwright providers (client-side only)', () => {
    it.each(['canvas', 'skyward', 'aeries'] as const)(
      'should reject %s with client-side sync message',
      async (provider) => {
        const result = await run(
          provider,
          `com.${provider}`,
          { username: 'u', password: 'p' },
          `https://${provider}.example.com`,
          `run-${provider}`
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(CLIENT_SIDE_MSG);
        expect(result.summary).toEqual({});
      }
    );
  });

  describe('google-classroom', () => {
    it('should route with accessToken and return summary', async () => {
      const result = await run(
        'google-classroom',
        'com.google.classroom',
        { accessToken: 'token' },
        'https://classroom.googleapis.com',
        'run-6'
      );
      expect(result.success).toBe(true);
      expect(result.summary).toEqual({ courses: 2, assignments: 3 });
    });

    it('should return error when missing token', async () => {
      const result = await run(
        'google-classroom',
        'com.google.classroom',
        {},
        'https://classroom.googleapis.com',
        'run-7'
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth');
    });
  });

  describe('oneroster', () => {
    it('should route and return summary', async () => {
      const result = await run(
        'oneroster',
        'com.imsglobal.oneroster',
        { clientId: 'c', clientSecret: 's', accessToken: 't' },
        'https://oneroster.example.com',
        'run-8'
      );
      expect(result.success).toBe(true);
      expect(result.summary).toEqual({ courses: 2, assignments: 3 });
    });
  });

  it('should return error for unknown provider', async () => {
    const result = await run('unknown-provider', 'adapter.id', {}, 'https://example.com', 'run-9');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown provider');
  });
});
