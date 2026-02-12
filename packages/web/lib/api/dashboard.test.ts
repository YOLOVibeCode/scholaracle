import { type IDashboardStats } from './dashboard';

// ---------------------------------------------------------------------------
// Mock the cache module so we can control it per-test.
// The mock must be declared before the module under test is imported.
// ---------------------------------------------------------------------------

const mockCacheStore = new Map<string, unknown>();

jest.mock('../cache', () => ({
  MemoryCacheService: jest.fn().mockImplementation(() => ({
    get: jest.fn(async (key: string) => mockCacheStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: unknown) => { mockCacheStore.set(key, value); }),
    delete: jest.fn(async (key: string) => { mockCacheStore.delete(key); }),
    clear: jest.fn(async () => { mockCacheStore.clear(); }),
  })),
}));

// Import after mock is set up
import { dashboardApi } from './dashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeResponse(body: unknown, status = 200): Response {
  const isOk = status >= 200 && status < 300;
  return {
    ok: isOk,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    statusText: isOk ? 'OK' : 'Error',
    type: 'basic' as ResponseType,
    url: '',
    clone: function () { return this as Response; },
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const STUDENTS = [
  {
    id: 's1',
    userId: 'u1',
    name: 'Alice',
    grade: '10',
    school: 'Lincoln',
    stats: { currentGPA: 3.8, totalAssignments: 20, missingAssignments: 2 },
  },
  {
    id: 's2',
    userId: 'u1',
    name: 'Bob',
    grade: '11',
    school: 'Lincoln',
    stats: { currentGPA: 3.2, totalAssignments: 15, missingAssignments: 1 },
  },
  {
    id: 's3',
    userId: 'u1',
    name: 'Charlie',
    grade: '9',
    school: 'Jefferson',
    stats: { totalAssignments: 10, missingAssignments: 0 },
    // No currentGPA -- should be excluded from GPA average
  },
];

const ALERTS = [
  {
    id: 'a1',
    studentId: 's1',
    type: 'grade_drop',
    severity: 'high',
    message: 'Grade dropped 10%',
    createdAt: '2025-01-15T10:00:00Z',
    acknowledged: false,
  },
  {
    id: 'a2',
    studentId: 's2',
    type: 'missing_assignment',
    severity: 'medium',
    message: 'Missing Math HW 5',
    createdAt: '2025-01-14T08:00:00Z',
    acknowledged: true, // acknowledged -- should be excluded from recentAlerts
  },
  {
    id: 'a3',
    studentId: 's1',
    type: 'low_grade',
    severity: 'low',
    message: 'Grade below threshold',
    createdAt: '2025-01-16T12:00:00Z',
    acknowledged: false,
  },
];

const AGENDA_RESPONSE = {
  success: true,
  data: {
    items: [
      {
        id: 'ag1',
        type: 'assignment',
        title: 'Science Project',
        timeAt: '2025-01-20T23:59:00Z',
        courseExternalId: 'SCI200',
        courseName: 'Biology',
      },
      {
        id: 'ag2',
        type: 'event_occurrence',
        title: 'Parent-Teacher Conference',
        timeAt: '2025-01-18T15:00:00Z',
        courseName: 'School Event',
      },
      {
        id: 'ag3',
        type: 'assignment',
        title: 'English Essay',
        timeAt: '2025-01-19T23:59:00Z',
        courseExternalId: 'ENG101',
        courseName: 'English Lit',
      },
    ],
  },
};

const ZEROED_STATS: IDashboardStats = {
  totalStudents: 0,
  totalCourses: 0,
  totalAlerts: 0,
  averageGPA: null,
  recentAlerts: [],
  upcomingDeadlines: [],
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('dashboardApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;

    // Clear the mock cache store between tests so each test starts fresh
    mockCacheStore.clear();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /**
   * Helper to set up fetch to return students, then alerts, then agenda
   * for the three sequential calls dashboard.getStats() makes.
   */
  function mockFetchSequence(
    students = STUDENTS,
    alerts = ALERTS,
    agenda = AGENDA_RESPONSE,
  ): void {
    fetchSpy
      .mockResolvedValueOnce(fakeResponse(students))  // studentsApi.getAll()
      .mockResolvedValueOnce(fakeResponse(alerts))     // alertsApi.getAll()
      .mockResolvedValueOnce(fakeResponse(agenda));    // agendaApi.getRange()
  }

  // -------------------------------------------------------------------------
  // Aggregation
  // -------------------------------------------------------------------------

  it('aggregates student data into totalStudents, totalCourses, and totalAlerts', async () => {
    mockFetchSequence();

    const stats = await dashboardApi.getStats();

    expect(stats.totalStudents).toBe(3);
    // totalCourses = ceil(20/10) + ceil(15/10) + ceil(10/10) = 2 + 2 + 1 = 5
    expect(stats.totalCourses).toBe(5);
    // totalAlerts = missingAssignments sum = 2 + 1 + 0 = 3
    expect(stats.totalAlerts).toBe(3);
  });

  // -------------------------------------------------------------------------
  // GPA calculation
  // -------------------------------------------------------------------------

  it('calculates averageGPA from students that have a currentGPA', async () => {
    mockFetchSequence();

    const stats = await dashboardApi.getStats();

    // Only Alice (3.8) and Bob (3.2) have GPA; Charlie does not.
    // averageGPA = (3.8 + 3.2) / 2 = 3.5
    expect(stats.averageGPA).toBeCloseTo(3.5);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('returns zeroed stats when the students request fails', async () => {
    fetchSpy.mockRejectedValue(new Error('Network failure'));

    const stats = await dashboardApi.getStats();

    expect(stats).toEqual(ZEROED_STATS);
  });

  // -------------------------------------------------------------------------
  // Recent alerts
  // -------------------------------------------------------------------------

  it('includes unacknowledged alerts sorted by most recent, limited to 5', async () => {
    mockFetchSequence();

    const stats = await dashboardApi.getStats();

    // Only a1 and a3 are unacknowledged. a3 is more recent (2025-01-16) than a1 (2025-01-15).
    expect(stats.recentAlerts).toHaveLength(2);
    expect(stats.recentAlerts[0].id).toBe('a3');
    expect(stats.recentAlerts[1].id).toBe('a1');
    // Each entry should have the correct shape
    expect(stats.recentAlerts[0]).toEqual({
      id: 'a3',
      type: 'low_grade',
      message: 'Grade below threshold',
      createdAt: '2025-01-16T12:00:00Z',
    });
  });

  // -------------------------------------------------------------------------
  // Upcoming deadlines
  // -------------------------------------------------------------------------

  it('includes only assignment-type agenda items sorted by due date, limited to 5', async () => {
    mockFetchSequence();

    const stats = await dashboardApi.getStats();

    // ag2 is an event_occurrence, so it should be excluded.
    // Remaining: ag3 (2025-01-19) and ag1 (2025-01-20), sorted ascending.
    expect(stats.upcomingDeadlines).toHaveLength(2);
    expect(stats.upcomingDeadlines[0]).toEqual({
      id: 'ag3',
      title: 'English Essay',
      dueDate: '2025-01-19T23:59:00Z',
      course: 'English Lit',
    });
    expect(stats.upcomingDeadlines[1]).toEqual({
      id: 'ag1',
      title: 'Science Project',
      dueDate: '2025-01-20T23:59:00Z',
      course: 'Biology',
    });
  });

  // -------------------------------------------------------------------------
  // Caching
  // -------------------------------------------------------------------------

  it('serves cached data on the second call within TTL window', async () => {
    mockFetchSequence();

    const firstResult = await dashboardApi.getStats();

    // Reset the spy to verify no additional fetch calls are made
    fetchSpy.mockClear();

    // Second call should use cache (mockCacheStore was populated by the first call)
    const secondResult = await dashboardApi.getStats();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(secondResult).toEqual(firstResult);
  });
});
