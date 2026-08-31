import {
  fetchStudioToday,
  fetchStudioWorkPack,
  patchStudioAssignmentStatus,
  StudioAuthError,
  StudioNotFoundError,
} from './studio';

function fakeResponse(body: unknown, status = 200): Response {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
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

const TODAY = {
  encouragement: 'Nice work on Reading response 8.',
  next: {
    assignmentExternalId: 'demo-emma-ap-bio-a5',
    title: 'Unit 9 Homework',
    courseName: 'AP Biology',
    primaryCtaLabel: 'Open worksheet',
  },
  alsoToday: [],
};

const PACK = {
  title: 'Unit 9 Homework',
  courseName: 'AP Biology',
  humanStatus: 'Not turned in',
  instructionsText: 'Complete the Cell Division worksheet.',
  primaryAsset: {
    assetId: 'demo-asset-demo-emma-ap-bio-lab-safety',
    contentHash: 'demo-demo-emma-ap-bio-lab-safety-hash',
    fileName: 'lab-safety.pdf',
    downloadUrl: 'http://localhost:2801/api/assets/x?sig=1&exp=2',
  },
  needsSchoolLogin: [],
  moreFromCourse: [],
  capturedPages: [],
};

describe('studio API client', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('loads Today with the student bearer token', async () => {
    global.fetch = jest.fn().mockResolvedValue(fakeResponse(TODAY));
    const view = await fetchStudioToday('emma-jwt');
    expect(view.next?.assignmentExternalId).toBe('demo-emma-ap-bio-a5');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:2801/api/studio/today',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer emma-jwt' }),
        cache: 'no-store',
      })
    );
  });

  it('throws StudioAuthError on 403', async () => {
    global.fetch = jest.fn().mockResolvedValue(fakeResponse({ error: 'no' }, 403));
    await expect(fetchStudioToday('parent-jwt')).rejects.toBeInstanceOf(StudioAuthError);
  });

  it('loads a work pack and 404s as StudioNotFoundError', async () => {
    global.fetch = jest.fn().mockResolvedValue(fakeResponse(PACK));
    const view = await fetchStudioWorkPack('emma-jwt', 'demo-emma-ap-bio-a5');
    expect(view.primaryAsset?.fileName).toBe('lab-safety.pdf');

    global.fetch = jest.fn().mockResolvedValue(fakeResponse({ error: 'no' }, 404));
    await expect(fetchStudioWorkPack('emma-jwt', 'demo-liam-math7-a0')).rejects.toBeInstanceOf(
      StudioNotFoundError
    );
  });

  it('PATCHes working_on_it', async () => {
    global.fetch = jest.fn().mockResolvedValue(fakeResponse({ success: true }, 200));
    await patchStudioAssignmentStatus('emma-jwt', 'demo-emma-ap-bio-a5', 'working_on_it');
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:2801/api/studio/assignments/demo-emma-ap-bio-a5/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'working_on_it' }),
      })
    );
  });
});
