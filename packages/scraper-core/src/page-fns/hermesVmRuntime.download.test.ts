import { downloadFromMirrors } from './hermesVmRuntime';

const noSleep = (): Promise<void> => Promise.resolve();

describe('downloadFromMirrors', () => {
  it('falls back to the next mirror when the first host cannot be reached', async () => {
    const tried: string[] = [];
    const downloadOnce = jest.fn((url: string): Promise<void> => {
      tried.push(url);
      return url.includes('primary')
        ? Promise.reject(new Error(`GET ${url} failed: getaddrinfo EAI_AGAIN primary.test`))
        : Promise.resolve();
    });

    await downloadFromMirrors(
      ['https://primary.test/a.deb', 'https://mirror.test/a.deb'],
      '/dest',
      {
        downloadOnce,
        sleep: noSleep,
      }
    );

    expect(tried.filter((u) => u.includes('primary'))).toHaveLength(2);
    expect(tried[tried.length - 1]).toBe('https://mirror.test/a.deb');
  });

  it('does not touch later mirrors once one succeeds', async () => {
    const downloadOnce = jest.fn((): Promise<void> => Promise.resolve());

    await downloadFromMirrors(['https://one.test/a', 'https://two.test/a'], '/dest', {
      downloadOnce,
      sleep: noSleep,
    });

    expect(downloadOnce).toHaveBeenCalledTimes(1);
    expect(downloadOnce).toHaveBeenCalledWith('https://one.test/a', '/dest');
  });

  it('throws the last error, naming its host, when every mirror fails', async () => {
    const downloadOnce = jest.fn((url: string): Promise<void> =>
      Promise.reject(new Error(`GET ${url} failed: HTTP 503`))
    );

    await expect(
      downloadFromMirrors(['https://one.test/a', 'https://two.test/a'], '/dest', {
        downloadOnce,
        sleep: noSleep,
      })
    ).rejects.toThrow('GET https://two.test/a failed: HTTP 503');
    expect(downloadOnce).toHaveBeenCalledTimes(4);
  });

  it('retries a lone URL four times and recovers on the last try', async () => {
    let calls = 0;
    const downloadOnce = jest.fn((): Promise<void> => {
      calls += 1;
      return calls < 4 ? Promise.reject(new Error('socket hang up')) : Promise.resolve();
    });

    await downloadFromMirrors(['https://only.test/a'], '/dest', { downloadOnce, sleep: noSleep });

    expect(downloadOnce).toHaveBeenCalledTimes(4);
  });
});

describe('downloadFromMirrors with an expected sha256', () => {
  const GOOD = 'a'.repeat(64);
  const BAD = 'b'.repeat(64);

  /** Pretend each URL wrote a file whose hash is looked up by the URL that wrote it. */
  function fakeDownloads(hashByUrl: Record<string, string>): {
    downloadOnce: (url: string) => Promise<void>;
    sha256Of: () => string;
    sleep: () => Promise<void>;
  } {
    let last = '';
    return {
      downloadOnce: (url) => {
        last = url;
        return Promise.resolve();
      },
      sha256Of: () => hashByUrl[last] ?? '',
      sleep: noSleep,
    };
  }

  it('rejects a truncated or corrupt copy and takes the next mirror', async () => {
    const deps = fakeDownloads({ 'https://one.test/a': BAD, 'https://two.test/a': GOOD });
    const downloadOnce = jest.fn(deps.downloadOnce);

    await downloadFromMirrors(
      ['https://one.test/a', 'https://two.test/a'],
      '/dest',
      {
        ...deps,
        downloadOnce,
      },
      GOOD
    );

    expect(downloadOnce.mock.calls.map(([url]) => url)).toEqual([
      'https://one.test/a',
      'https://one.test/a',
      'https://two.test/a',
    ]);
  });

  it('fails with the URL and a hash prefix when no mirror serves the expected bytes', async () => {
    const deps = fakeDownloads({ 'https://one.test/a': BAD, 'https://two.test/a': BAD });

    await expect(
      downloadFromMirrors(['https://one.test/a', 'https://two.test/a'], '/dest', deps, GOOD)
    ).rejects.toThrow(/https:\/\/two\.test\/a returned unexpected content \(sha256 bbbbbbbbbbbb/);
  });

  it('skips the hash check when none is given', async () => {
    const sha256Of = jest.fn(() => 'whatever');

    await downloadFromMirrors(['https://one.test/a'], '/dest', {
      downloadOnce: () => Promise.resolve(),
      sha256Of,
      sleep: noSleep,
    });

    expect(sha256Of).not.toHaveBeenCalled();
  });
});
