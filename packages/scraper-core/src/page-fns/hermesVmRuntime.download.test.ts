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
