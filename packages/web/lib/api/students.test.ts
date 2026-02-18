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

    it('returns an empty array when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await studentsApi.getAll();

      expect(result).toEqual([]);
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

    it('returns null when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Not found'));

      const result = await studentsApi.getById('missing');

      expect(result).toBeNull();
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

    it('returns null when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Validation error'));

      const result = await studentsApi.create({ name: 'Fail' });

      expect(result).toBeNull();
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

    it('returns null when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Update failed'));

      const result = await studentsApi.update('stu-1', { name: 'Nope' });

      expect(result).toBeNull();
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

    it('returns false when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Delete failed'));

      const result = await studentsApi.delete('stu-1');

      expect(result).toBe(false);
    });
  });
});
