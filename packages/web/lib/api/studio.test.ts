import {
  fetchStudioToday,
  fetchStudioWeek,
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

  const WEEK = {
    encouragement: 'Nice work on Reading response 8.',
    owed: [
      {
        assignmentExternalId: 'demo-emma-alg2-missing-1',
        title: 'Missing assignment 1',
        courseName: 'Algebra II',
        dueAt: '2026-11-05T16:00:00.000Z',
        humanStatus: 'Not turned in',
        studentStatus: 'not_started',
        needs: ['saved_file'],
        primaryCtaLabel: 'Open worksheet',
      },
    ],
    days: [{ date: '2026-11-09', label: 'Today', items: [] }],
    doneThisWeek: [],
    counts: { owed: 1, due: 0, done: 0 },
  };

  it('loads This week with the student bearer token and parses it', async () => {
    global.fetch = jest.fn().mockResolvedValue(fakeResponse(WEEK));
    const view = await fetchStudioWeek('emma-jwt');
    expect(view.owed[0]?.assignmentExternalId).toBe('demo-emma-alg2-missing-1');
    expect(view.counts).toEqual({ owed: 1, due: 0, done: 0 });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:2801/api/studio/week',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer emma-jwt' }),
        cache: 'no-store',
      })
    );
  });

  it('This week rejects a score on an item and 403 as StudioAuthError', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(fakeResponse({ ...WEEK, owed: [{ ...WEEK.owed[0], percent: '92%' }] }));
    await expect(fetchStudioWeek('emma-jwt')).rejects.toThrow(/unexpected percent/);
    global.fetch = jest.fn().mockResolvedValue(fakeResponse({ error: 'no' }, 403));
    await expect(fetchStudioWeek('parent-jwt')).rejects.toBeInstanceOf(StudioAuthError);
  });

  it('PATCHes need_help with a trimmed note, omits a blank one, and returns the parsed answer', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        fakeResponse({ success: true, studentStatus: 'need_help', notified: true }, 200)
      )
      .mockResolvedValueOnce(
        fakeResponse(
          {
            success: true,
            studentStatus: 'need_help',
            notified: false,
            nextAllowedAt: '2026-11-10T18:00:00.000Z',
          },
          200
        )
      );
    await expect(
      patchStudioAssignmentStatus(
        'emma-jwt',
        'demo-emma-ap-bio-a5',
        'need_help',
        " I don't get #7 "
      )
    ).resolves.toEqual({ success: true, studentStatus: 'need_help', notified: true });
    await expect(
      patchStudioAssignmentStatus('emma-jwt', 'demo-emma-ap-bio-a5', 'need_help', '   ')
    ).resolves.toMatchObject({ notified: false, nextAllowedAt: '2026-11-10T18:00:00.000Z' });
    const bodies = (global.fetch as jest.Mock).mock.calls.map((c: [string, RequestInit]) =>
      JSON.parse(c[1].body as string)
    );
    expect(bodies).toEqual([
      { status: 'need_help', note: "I don't get #7" },
      { status: 'need_help' },
    ]);
  });

  it('PATCHes working_on_it; an older server with no `notified` parses too', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(fakeResponse({ success: true, studentStatus: 'working_on_it' }, 200));
    await expect(
      patchStudioAssignmentStatus('emma-jwt', 'demo-emma-ap-bio-a5', 'working_on_it')
    ).resolves.toEqual({ success: true, studentStatus: 'working_on_it' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:2801/api/studio/assignments/demo-emma-ap-bio-a5/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'working_on_it' }),
      })
    );
  });
});
