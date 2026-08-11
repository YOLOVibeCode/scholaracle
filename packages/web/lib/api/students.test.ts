import { studentsApi, type IStudent } from './students';

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
// Test suite
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:2801/api';

describe('studentsApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse([]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // getAll
  // -------------------------------------------------------------------------

  describe('getAll', () => {
    it('GETs /students and returns the student array', async () => {
      const students: IStudent[] = [
        { id: '1', userId: 'u1', name: 'Alice', grade: '10', school: 'Lincoln' },
        { id: '2', userId: 'u1', name: 'Bob', grade: '11', school: 'Lincoln' },
      ];
      fetchSpy.mockResolvedValue(fakeResponse(students));

      const result = await studentsApi.getAll();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/students`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(students);
    });

    it('rejects when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      await expect(studentsApi.getAll()).rejects.toThrow('Unable to reach the server. Check your connection and try again.');
    });
  });

  // -------------------------------------------------------------------------
  // getById
  // -------------------------------------------------------------------------

  describe('getById', () => {
    it('GETs /students/:id and returns the student', async () => {
      const student: IStudent = {
        id: 'stu-42',
        userId: 'u1',
        name: 'Charlie',
        grade: '9',
        school: 'Jefferson',
      };
      fetchSpy.mockResolvedValue(fakeResponse(student));

      const result = await studentsApi.getById('stu-42');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/students/stu-42`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(student);
    });

    it('rejects when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Not found'));

      await expect(studentsApi.getById('missing')).rejects.toThrow('Unable to reach the server. Check your connection and try again.');
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('POSTs to /students with the student body and returns the created student', async () => {
      const newStudent = { name: 'Dana', grade: '12', school: 'Roosevelt' };
      const created: IStudent = { id: 'stu-99', userId: 'u1', ...newStudent };
      fetchSpy.mockResolvedValue(fakeResponse(created));

      const result = await studentsApi.create(newStudent);

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/students`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newStudent),
        }),
      );
      expect(result).toEqual(created);
    });

    it('rejects when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Validation error'));

      await expect(studentsApi.create({ name: 'Fail' })).rejects.toThrow('Unable to reach the server. Check your connection and try again.');
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('PUTs to /students/:id with update body and returns the updated student', async () => {
      const updates = { name: 'Alice Updated' };
      const updated: IStudent = {
        id: 'stu-1',
        userId: 'u1',
        name: 'Alice Updated',
        grade: '10',
        school: 'Lincoln',
      };
      fetchSpy.mockResolvedValue(fakeResponse(updated));

      const result = await studentsApi.update('stu-1', updates);

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/students/stu-1`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updates),
        }),
      );
      expect(result).toEqual(updated);
    });

    it('rejects when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Update failed'));

      await expect(studentsApi.update('stu-1', { name: 'Nope' })).rejects.toThrow('Unable to reach the server. Check your connection and try again.');
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('DELETEs /students/:id and returns true on success', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      const result = await studentsApi.delete('stu-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/students/stu-1`,
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(result).toBe(true);
    });

    it('rejects when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Delete failed'));

      await expect(studentsApi.delete('stu-1')).rejects.toThrow('Unable to reach the server. Check your connection and try again.');
    });
  });

  // -------------------------------------------------------------------------
  // getGradeHistory
  // -------------------------------------------------------------------------

  describe('getGradeHistory', () => {
    it('GETs /students/:id/grade-history and returns response when no opts', async () => {
      const body = {
        studentId: 'stu-1',
        courses: [
          {
            courseExternalId: 'c1',
            courseName: 'Math',
            snapshots: [{ date: '2025-02-01', percentGrade: 85, provider: 'canvas' }],
          },
        ],
      };
      fetchSpy.mockResolvedValue(fakeResponse(body));

      const result = await studentsApi.getGradeHistory('stu-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/students/stu-1/grade-history`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(body);
    });

    it('adds course query param when courseExternalId provided', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ studentId: 'stu-1', courses: [] }));

      await studentsApi.getGradeHistory('stu-1', 'course-abc');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/students/stu-1/grade-history?course=course-abc`,
        expect.any(Object),
      );
    });

    it('adds from, to, and term query params when opts provided', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ studentId: 'stu-1', courses: [] }));

      await studentsApi.getGradeHistory('stu-1', undefined, {
        from: '2025-01-01',
        to: '2025-06-30',
        term: '2025-2026 Semester 1',
      });

      const url = (fetchSpy.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('/students/stu-1/grade-history?');
      expect(url).toContain('from=2025-01-01');
      expect(url).toContain('to=2025-06-30');
      expect(url).toContain('term=');
      expect(url).toContain('2025-2026');
      expect(url).toContain('Semester');
    });

    it('rejects when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      await expect(studentsApi.getGradeHistory('stu-1')).rejects.toThrow('Unable to reach the server. Check your connection and try again.');
    });
  });

  // -------------------------------------------------------------------------
  // archiveGradeHistory
  // -------------------------------------------------------------------------

  describe('archiveGradeHistory', () => {
    it('DELETEs /students/:id/grade-history?before=<date>', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ archived: 12 }));

      await studentsApi.archiveGradeHistory('stu-1', '2025-07-01');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE}/students/stu-1/grade-history?before=2025-07-01`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('encodes before date in query', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ archived: 0 }));

      await studentsApi.archiveGradeHistory('stu-2', '2024-12-31');

      const url = (fetchSpy.mock.calls[0] as unknown[])[0] as string;
      expect(url).toContain('before=2024-12-31');
    });
  });
});
