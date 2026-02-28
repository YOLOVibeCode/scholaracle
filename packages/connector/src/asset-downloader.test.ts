import { AssetDownloader, classifyAssetPriority, compareAssetPriority } from './asset-downloader';

const CONFIG = {
  apiBaseUrl: 'https://api.test',
  connectorToken: 'token',
  sourceId: 'src-1',
  provider: 'canvas',
};

describe('AssetDownloader', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('checkOnly', () => {
    it('should return exists true when asset found', async () => {
      const downloader = new AssetDownloader(CONFIG);
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            exists: true,
            assetId: 'aid-1',
            serverUrl: 'https://api.test/api/assets/aid-1',
          }),
      });

      const result = await downloader.checkOnly('abc123');

      expect(result.exists).toBe(true);
      expect(result.assetId).toBe('aid-1');
      expect(result.serverUrl).toBe('https://api.test/api/assets/aid-1');
      const [url] = fetchSpy.mock.calls[0];
      expect(url).toContain('/api/ingest/v1/assets/check');
      expect(url).toContain('sourceId=src-1');
      expect(url).toContain('contentHash=abc123');
    });

    it('should return exists false when asset not found', async () => {
      const downloader = new AssetDownloader(CONFIG);
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ exists: false }),
      });

      const result = await downloader.checkOnly('unknown');

      expect(result.exists).toBe(false);
      expect(result.assetId).toBeUndefined();
    });

    it('should throw on non-OK response', async () => {
      const downloader = new AssetDownloader(CONFIG);
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid token'),
      });

      await expect(downloader.checkOnly('x')).rejects.toThrow('Asset check failed');
    });
  });

  describe('downloadAndUpload', () => {
    it('should skip upload when check returns exists (dedup path)', async () => {
      const downloader = new AssetDownloader(CONFIG);
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              exists: true,
              assetId: 'existing',
              serverUrl: 'https://api.test/api/assets/existing',
            }),
        });

      const result = await downloader.downloadAndUpload({
        url: 'https://canvas.example.com/file',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        entityType: 'courseMaterial',
        entityExternalId: 'canvas-file-1',
        courseExternalId: 'canvas-course-1',
      });

      expect(result).toEqual({
        assetId: 'existing',
        serverUrl: 'https://api.test/api/assets/existing',
        contentHash: expect.any(String),
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should upload when check returns not exists', async () => {
      const downloader = new AssetDownloader(CONFIG);
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ exists: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              assetId: 'new-id',
              serverUrl: 'https://api.test/api/assets/new-id',
            }),
        });

      const result = await downloader.downloadAndUpload({
        url: 'https://canvas.example.com/file',
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        entityType: 'courseMaterial',
        entityExternalId: 'canvas-file-1',
      });

      expect(result?.assetId).toBe('new-id');
      expect(result?.serverUrl).toBe('https://api.test/api/assets/new-id');
      expect(result?.contentHash).toBeDefined();
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('should return null when download fails (non-OK)', async () => {
      const downloader = new AssetDownloader(CONFIG);
      fetchSpy.mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await downloader.downloadAndUpload({
        url: 'https://canvas.example.com/missing',
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        entityType: 'courseMaterial',
        entityExternalId: 'canvas-file-1',
      });

      expect(result).toBeNull();
    });

    it('should pass downloadHeaders to fetch', async () => {
      const downloader = new AssetDownloader(CONFIG);
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(5)),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ exists: false }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ assetId: 'id', serverUrl: 'https://api.test/api/assets/id' }),
        });

      await downloader.downloadAndUpload({
        url: 'https://canvas.example.com/file',
        fileName: 'f',
        mimeType: 'application/pdf',
        entityType: 'courseMaterial',
        entityExternalId: 'e1',
        downloadHeaders: { Authorization: 'Bearer canvas-token' },
      });

      expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
        Authorization: 'Bearer canvas-token',
      });
    });

    it('should return null when file exceeds max size', async () => {
      const downloader = new AssetDownloader({
        ...CONFIG,
        maxSizeBytes: 5,
      });
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-length': '100' }),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });

      const result = await downloader.downloadAndUpload({
        url: 'https://example.com/big',
        fileName: 'big.pdf',
        mimeType: 'application/pdf',
        entityType: 'courseMaterial',
        entityExternalId: 'e1',
      });

      expect(result).toBeNull();
    });

    it('should throw when upload API returns error', async () => {
      const downloader = new AssetDownloader(CONFIG);
      fetchSpy
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(5)),
        })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ exists: false }) })
        .mockResolvedValueOnce({
          ok: false,
          status: 413,
          text: () => Promise.resolve('Payload too large'),
        });

      await expect(
        downloader.downloadAndUpload({
          url: 'https://example.com/f',
          fileName: 'f',
          mimeType: 'application/pdf',
          entityType: 'courseMaterial',
          entityExternalId: 'e1',
        })
      ).rejects.toThrow('Asset upload failed');
    });
  });
});

describe('classifyAssetPriority', () => {
  it('should return critical for syllabus in fileName', () => {
    expect(
      classifyAssetPriority({ fileName: 'Course_Syllabus.pdf', displayName: 'Syllabus' })
    ).toBe('critical');
  });

  it('should return critical for rubric in displayName', () => {
    expect(classifyAssetPriority({ displayName: 'Essay Rubric' })).toBe('critical');
  });

  it('should return high for file posted in last 7 days', () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyAssetPriority({ fileName: 'doc.pdf', postedAt: recent })).toBe('high');
  });

  it('should return medium for older small file', () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyAssetPriority({ fileName: 'doc.pdf', postedAt: old, fileSize: 1000 })).toBe(
      'medium'
    );
  });

  it('should return low for video mime type', () => {
    expect(classifyAssetPriority({ fileName: 'intro.mp4', mimeType: 'video/mp4' })).toBe('low');
  });

  it('should return low for file over 10MB', () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      classifyAssetPriority({
        fileName: 'big.pdf',
        postedAt: old,
        fileSize: 11 * 1024 * 1024,
      })
    ).toBe('low');
  });

  it('should return low for archive extension', () => {
    expect(classifyAssetPriority({ fileName: 'data.zip' })).toBe('low');
  });
});

describe('compareAssetPriority', () => {
  it('should order critical before high', () => {
    expect(compareAssetPriority('critical', 'high')).toBeLessThan(0);
  });
  it('should order high before medium', () => {
    expect(compareAssetPriority('high', 'medium')).toBeLessThan(0);
  });
  it('should order medium before low', () => {
    expect(compareAssetPriority('medium', 'low')).toBeLessThan(0);
  });
});
