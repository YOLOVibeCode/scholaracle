/**
 * Tests for createAdapterRunner: routing by provider, success summary, error handling.
 */
import type { Db } from 'mongodb';
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

jest.mock('@scholaracle/connector', () => {
  const mockAuthenticate = jest.fn().mockResolvedValue(undefined);
  const mockFetchEnvelope = jest.fn().mockResolvedValue(mockEnvelope);
  return {
    CanvasAdapter: jest.fn().mockImplementation(() => ({
      authenticate: mockAuthenticate,
      fetchEnvelope: mockFetchEnvelope,
    })),
    GoogleClassroomAdapter: jest.fn().mockImplementation(() => ({
      authenticate: mockAuthenticate,
      fetchEnvelope: mockFetchEnvelope,
    })),
    SkywardBrowserAdapter: jest.fn().mockImplementation(() => ({
      authenticate: mockAuthenticate,
      fetchEnvelope: mockFetchEnvelope,
    })),
    OneRosterAdapter: jest.fn().mockImplementation(() => ({
      authenticate: mockAuthenticate,
      fetchEnvelope: mockFetchEnvelope,
    })),
    createAiClient: jest.fn(),
    MongoStrategyStore: jest.fn().mockImplementation(() => ({})),
  };
});

describe('createAdapterRunner', () => {
  let db: Db;
  let run: ReturnType<typeof createAdapterRunner>;

  beforeAll(() => {
    db = {} as Db;
    run = createAdapterRunner(db);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should route canvas with accessToken to Canvas API and return entity counts', async () => {
    const result = await run(
      'canvas',
      'com.instructure.canvas',
      { accessToken: 'token' },
      'https://canvas.example.com',
      'run-1'
    );
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ courses: 2, assignments: 3, grades: 1, materials: 0 });
    expect(result.error).toBeUndefined();
  });

  it('should return error when canvas has username+password but no API token', async () => {
    const result = await run(
      'canvas',
      'com.instructure.canvas',
      { username: 'u', password: 'p' },
      'https://canvas.example.com',
      'run-2'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('API access token');
  });

  it('should return error when canvas has no valid credentials', async () => {
    const result = await run(
      'canvas',
      'com.instructure.canvas',
      {},
      'https://canvas.example.com',
      'run-3'
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/API|access token/i);
  });

  it('should route skyward with username+password to SkywardBrowserAdapter and return summary', async () => {
    const result = await run(
      'skyward',
      'com.skyward.sis',
      { username: 'u', password: 'p' },
      'https://skyward.example.com',
      'run-4'
    );
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ courses: 2, assignments: 3, grades: 1, attendance: 0 });
  });

  it('should return error when skyward missing credentials', async () => {
    const result = await run(
      'skyward',
      'com.skyward.sis',
      {},
      'https://skyward.example.com',
      'run-5'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('username');
  });

  it('should return error when Skyward fetchEnvelope fails', async () => {
    const { SkywardBrowserAdapter } = await import('@scholaracle/connector');
    (SkywardBrowserAdapter as jest.Mock).mockImplementationOnce(() => ({
      authenticate: jest.fn().mockResolvedValue(undefined),
      fetchEnvelope: jest.fn().mockRejectedValue(new Error('Network error')),
    }));
    const result = await run(
      'skyward',
      'com.skyward.sis',
      { username: 'u', password: 'p' },
      'https://skyward.example.com',
      'run-5b'
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('should route google-classroom with accessToken and return summary', async () => {
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

  it('should return error when google-classroom missing token', async () => {
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

  it('should route oneroster and return summary', async () => {
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

  it('should return error for unknown provider', async () => {
    const result = await run('unknown-provider', 'adapter.id', {}, 'https://example.com', 'run-9');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown provider');
  });

  it('should return success false and error when adapter throws', async () => {
    const { CanvasAdapter } = await import('@scholaracle/connector');
    (CanvasAdapter as jest.Mock).mockImplementationOnce(() => ({
      authenticate: jest.fn().mockRejectedValue(new Error('Auth failed')),
      fetchEnvelope: jest.fn(),
    }));
    const result = await run(
      'canvas',
      'com.instructure.canvas',
      { accessToken: 'token' },
      'https://canvas.example.com',
      'run-10'
    );
    expect(result.success).toBe(false);
    expect(result.error).toBe('Auth failed');
  });
});
