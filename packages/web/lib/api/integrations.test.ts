import { integrationsApi, type IIntegration, type IIntegrationLinkedStudent } from './integrations';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';

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
    clone: function () {
      return this as Response;
    },
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

describe('integrationsApi', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(fakeResponse([]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('list', () => {
    it('GETs /integrations and returns the array', async () => {
      const list: IIntegration[] = [
        {
          id: 'int-1',
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          displayName: 'Canvas LMS',
          schedule: 'every_6h',
          dataTypes: ['grades'],
          enabled: true,
          linkedStudents: 2,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ];
      fetchSpy.mockResolvedValue(fakeResponse(list));

      const result = await integrationsApi.list();

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/integrations`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(list);
    });

    it('returns empty array when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await integrationsApi.list();

      expect(result).toEqual([]);
    });
  });

  describe('get', () => {
    it('GETs /integrations/:id and returns the integration', async () => {
      const integration: IIntegration = {
        id: 'int-1',
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        displayName: 'Canvas LMS',
        schedule: 'hourly',
        dataTypes: ['grades', 'assignments'],
        enabled: true,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      fetchSpy.mockResolvedValue(fakeResponse(integration));

      const result = await integrationsApi.get('int-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/integrations/int-1`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(integration);
    });

    it('returns null when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Not found'));

      const result = await integrationsApi.get('missing');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('POSTs to /integrations with body and returns the created integration', async () => {
      const body = {
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        displayName: 'My Canvas',
      };
      const created: IIntegration = {
        id: 'new-id',
        ...body,
        schedule: 'every_6h',
        dataTypes: ['grades', 'assignments', 'calendar'],
        enabled: true,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      fetchSpy.mockResolvedValue(fakeResponse(created));

      const result = await integrationsApi.create(body);

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/integrations`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
      expect(result).toEqual(created);
    });

    it('returns null when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Validation error'));

      const result = await integrationsApi.create({
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        displayName: 'Canvas',
      });

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('PUTs to /integrations/:id with body and returns the updated integration', async () => {
      const updates = { displayName: 'Updated Name' };
      const updated: IIntegration = {
        id: 'int-1',
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        displayName: 'Updated Name',
        schedule: 'every_6h',
        dataTypes: ['grades'],
        enabled: true,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
      };
      fetchSpy.mockResolvedValue(fakeResponse(updated));

      const result = await integrationsApi.update('int-1', updates);

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/integrations/int-1`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(updates),
        })
      );
      expect(result).toEqual(updated);
    });

    it('returns null when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Update failed'));

      const result = await integrationsApi.update('int-1', { displayName: 'Nope' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('DELETEs /integrations/:id and returns success', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true, unlinkedCount: 0 }));

      const result = await integrationsApi.delete('int-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/integrations/int-1`,
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(result).toEqual({ success: true, unlinkedCount: 0 });
    });

    it('returns success: false when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Delete failed'));

      const result = await integrationsApi.delete('int-1');

      expect(result).toEqual({ success: false });
    });
  });

  describe('listStudents', () => {
    it('GETs /integrations/:id/students and returns the linked students', async () => {
      const list: IIntegrationLinkedStudent[] = [
        {
          studentId: 'stu-1',
          studentName: 'Alice',
          hasCredentials: true,
          enabled: true,
          status: 'active',
        },
      ];
      fetchSpy.mockResolvedValue(fakeResponse(list));

      const result = await integrationsApi.listStudents('int-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/integrations/int-1/students`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(list);
    });

    it('returns empty array when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await integrationsApi.listStudents('int-1');

      expect(result).toEqual([]);
    });
  });

  describe('assignStudent', () => {
    it('POSTs to /integrations/:id/students/:studentId and returns result', async () => {
      const responseBody = {
        studentId: 'stu-1',
        integrationId: 'int-1',
        hasCredentials: false,
      };
      fetchSpy.mockResolvedValue(fakeResponse(responseBody));

      const result = await integrationsApi.assignStudent('int-1', 'stu-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/integrations/int-1/students/stu-1`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
        })
      );
      expect(result).toEqual(responseBody);
    });

    it('POSTs with credentials body when provided', async () => {
      const body = {
        credentials: {
          authType: 'api' as const,
          accessToken: 'secret',
        },
      };
      const responseBody = {
        studentId: 'stu-1',
        integrationId: 'int-1',
        hasCredentials: true,
      };
      fetchSpy.mockResolvedValue(fakeResponse(responseBody));

      const result = await integrationsApi.assignStudent('int-1', 'stu-1', body);

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/integrations/int-1/students/stu-1`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
      expect(result).toEqual(responseBody);
    });

    it('returns null when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Assign failed'));

      const result = await integrationsApi.assignStudent('int-1', 'stu-1');

      expect(result).toBeNull();
    });
  });

  describe('unlinkStudent', () => {
    it('DELETEs /integrations/:id/students/:studentId and returns true on success', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ success: true }));

      const result = await integrationsApi.unlinkStudent('int-1', 'stu-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        `${API_BASE}/integrations/int-1/students/stu-1`,
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(result).toBe(true);
    });

    it('returns false when the request fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Unlink failed'));

      const result = await integrationsApi.unlinkStudent('int-1', 'stu-1');

      expect(result).toBe(false);
    });
  });
});
