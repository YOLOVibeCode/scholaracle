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

const mockScraperRun = jest.fn().mockResolvedValue(mockEnvelope);

// Mock the scholaracle-scraper package (Playwright browser scrapers)
jest.mock('scholaracle-scraper', () => ({
  CanvasScraper: jest.fn().mockImplementation(() => ({
    run: mockScraperRun,
  })),
  SkywardScraper: jest.fn().mockImplementation(() => ({
    run: mockScraperRun,
    strategyStore: null,
  })),
  AeriesScraper: jest.fn().mockImplementation(() => ({
    run: mockScraperRun,
  })),
}));

// Mock connector (Google Classroom + OneRoster API adapters, MongoStrategyStore)
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
  MongoStrategyStore: jest.fn().mockImplementation(() => ({})),
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
    mockScraperRun.mockResolvedValue(mockEnvelope);
    mockFetchEnvelope.mockResolvedValue(mockEnvelope);
  });

  // -----------------------------------------------------------------------
  // Canvas (Playwright scraper)
  // -----------------------------------------------------------------------

  it('should route canvas to CanvasScraper and return entity counts', async () => {
    const result = await run(
      'canvas',
      'com.instructure.canvas',
      { accessToken: 'token' },
      'https://canvas.example.com',
      'run-1'
    );
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({
      course: 2,
      assignment: 3,
      gradeSnapshot: 1,
    });
  });

  // -----------------------------------------------------------------------
  // Skyward (Playwright scraper)
  // -----------------------------------------------------------------------

  it('should route skyward to SkywardScraper with MongoStrategyStore', async () => {
    const result = await run(
      'skyward',
      'com.skyward.sis',
      { username: 'u', password: 'p' },
      'https://skyward.example.com',
      'run-4'
    );
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({
      course: 2,
      assignment: 3,
      gradeSnapshot: 1,
    });
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

  it('should return error when Skyward scraper.run fails', async () => {
    mockScraperRun.mockRejectedValueOnce(new Error('Network error'));
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

  // -----------------------------------------------------------------------
  // Aeries (Playwright scraper)
  // -----------------------------------------------------------------------

  it('should route aeries to AeriesScraper', async () => {
    const result = await run(
      'aeries',
      'com.aeries.sis',
      { username: 'u', password: 'p' },
      'https://aeries.example.com',
      'run-aeries-1'
    );
    expect(result.success).toBe(true);
    expect(result.summary).toEqual({
      course: 2,
      assignment: 3,
      gradeSnapshot: 1,
    });
  });

  // -----------------------------------------------------------------------
  // Google Classroom (API adapter — unchanged)
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // OneRoster (API adapter — unchanged)
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('should return error for unknown provider', async () => {
    const result = await run('unknown-provider', 'adapter.id', {}, 'https://example.com', 'run-9');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown provider');
  });

  it('should return success false and error when scraper throws', async () => {
    mockScraperRun.mockRejectedValueOnce(new Error('Auth failed'));
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
