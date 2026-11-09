import { adminAiApi } from './ai';

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

describe('adminAiApi', () => {
  let fetchSpy: jest.SpyInstance;
  let mockStorage: Record<string, string> = {};

  const mockLocalStorage = {
    getItem: jest.fn((key: string) => mockStorage[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      mockStorage[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete mockStorage[key];
    }),
    clear: jest.fn(() => {
      mockStorage = {};
    }),
    get length() {
      return Object.keys(mockStorage).length;
    },
    key: jest.fn(() => null),
  };

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    mockStorage = { adminToken: 'admin-tok' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage = mockLocalStorage;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = undefined;
  });

  it('GETs usage summary with admin token', async () => {
    const payload = {
      success: true,
      data: {
        monthToDateSpendUsd: 0.12,
        verificationPassRate: 0.5,
        repairsByDistrict: [{ portalHost: 'district.edu', repairCount: 2 }],
      },
    };
    fetchSpy.mockResolvedValue(fakeResponse(payload));

    const result = await adminAiApi.getUsageSummary();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/admin/ai/usage-summary'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer admin-tok' }),
      })
    );
    expect(result.data.monthToDateSpendUsd).toBe(0.12);
  });
});
