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
    OneRosterAdapter: jest.fn().mockImplementation(() => ({
      authenticate: mockAuthenticate,
      fetchEnvelope: mockFetchEnvelope,
    })),
  };
});

jest.mock('@scholaracle/connector/dist/harness/canvas-browser-scrape', () => ({
  scrapeCanvasViaBrowser: jest.fn().mockResolvedValue({
    courses: [
      { assignments: { length: 2 }, files: { length: 1 } },
      { assignments: { length: 1 }, files: { length: 0 } },
    ],
  }),
}));

jest.mock('@scholaracle/connector/dist/harness/skyward-browser-scrape', () => ({
  scrapeSkywardComplete: jest.fn().mockResolvedValue({
    courses: { length: 3 },
    missingAssignments: { length: 5 },
    attendance: { length: 10 },
  }),
}));

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
    expect(result.summary).toEqual({ courses: 2, assignments: 3, grades: 1 });
    expect(result.error).toBeUndefined();
  });

  it('should route canvas with username+password to browser harness', async () => {
    const result = await run(
      'canvas',
      'com.instructure.canvas',
      { username: 'u', password: 'p' },
      'https://canvas.example.com',
      'run-2'
    );
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ courses: 2, assignments: 3, files: 1 });
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
    expect(result.error).toContain('accessToken');
  });

  it('should route skyward with username+password and return summary', async () => {
    const result = await run(
      'skyward',
      'com.skyward.sis',
      { username: 'u', password: 'p' },
      'https://skyward.example.com',
      'run-4'
    );
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ courses: 3, assignments: 5, attendance: 10 });
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
