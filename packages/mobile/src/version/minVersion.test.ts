import {
  NO_GATE,
  compareVersions,
  fetchMinVersionPolicy,
  isUpdateRequired,
  parsePolicy,
  parseVersion,
  storeUrlFor,
  type IMinVersionPolicy,
} from './minVersion';

const policy = (over: Partial<IMinVersionPolicy> = {}): IMinVersionPolicy => ({
  ...NO_GATE,
  minVersion: '1.2.0',
  ...over,
});

describe('parseVersion / compareVersions', () => {
  it('parses dotted numbers and ignores pre-release / build suffixes', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion(' 1.2.3-beta.1 ')).toEqual([1, 2, 3]);
    expect(parseVersion('2.0+build5')).toEqual([2, 0]);
  });

  it('rejects junk', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion('abc')).toBeNull();
    expect(parseVersion('1..2')).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });

  it('compares numerically, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0.1', '1.2.0')).toBe(1);
  });

  it('returns null when either side is unparseable', () => {
    expect(compareVersions('x', '1.0.0')).toBeNull();
    expect(compareVersions('1.0.0', 'y')).toBeNull();
  });
});

describe('isUpdateRequired', () => {
  it('is false when no gate is configured', () => {
    expect(isUpdateRequired('1.0.0', '1', NO_GATE)).toBe(false);
  });

  it('is true when the binary is older than the floor', () => {
    expect(isUpdateRequired('1.1.9', '5', policy())).toBe(true);
  });

  it('is false at or above the floor', () => {
    expect(isUpdateRequired('1.2.0', '5', policy())).toBe(false);
    expect(isUpdateRequired('2.0.0', '5', policy())).toBe(false);
  });

  it('fails open when the current version is missing or unparseable', () => {
    expect(isUpdateRequired(null, '5', policy())).toBe(false);
    expect(isUpdateRequired('dev', '5', policy())).toBe(false);
  });

  it('applies the build floor only when versions are equal', () => {
    const p = policy({ minBuild: '40' });
    expect(isUpdateRequired('1.2.0', '39', p)).toBe(true);
    expect(isUpdateRequired('1.2.0', '40', p)).toBe(false);
    expect(isUpdateRequired('1.3.0', '1', p)).toBe(false);
  });

  it('fails open on an unknown or non-numeric build', () => {
    const p = policy({ minBuild: '40' });
    expect(isUpdateRequired('1.2.0', null, p)).toBe(false);
    expect(isUpdateRequired('1.2.0', 'abc', p)).toBe(false);
    expect(isUpdateRequired('1.2.0', '5', policy({ minBuild: 'zzz' }))).toBe(false);
  });
});

describe('parsePolicy', () => {
  it('reads a full body', () => {
    expect(
      parsePolicy({
        minVersion: '1.4.0',
        minBuild: '57',
        message: ' Please update. ',
        storeUrls: { ios: 'https://apps.apple.com/x', android: 'https://play.google.com/y' },
      })
    ).toEqual({
      minVersion: '1.4.0',
      minBuild: '57',
      message: 'Please update.',
      storeUrls: { ios: 'https://apps.apple.com/x', android: 'https://play.google.com/y' },
    });
  });

  it('treats null / malformed bodies as no gate', () => {
    expect(parsePolicy(null)).toBe(NO_GATE);
    expect(parsePolicy('x')).toBe(NO_GATE);
    expect(parsePolicy({ minVersion: null })).toBe(NO_GATE);
    expect(parsePolicy({ minVersion: 'latest' })).toBe(NO_GATE);
  });

  it('drops non-https store links and tolerates a missing storeUrls', () => {
    const p = parsePolicy({
      minVersion: '1.0.0',
      storeUrls: { ios: 'http://insecure', android: 'javascript:alert(1)' },
    });
    expect(p.storeUrls).toEqual({ ios: null, android: null });
    expect(parsePolicy({ minVersion: '1.0.0' }).storeUrls).toEqual({ ios: null, android: null });
  });
});

describe('fetchMinVersionPolicy', () => {
  it('calls the min-app-version route on the given API host and parses the body', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ minVersion: '1.5.0' }),
    })) as unknown as typeof fetch;
    const result = await fetchMinVersionPolicy('https://api.example.test/', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.test/api/health/min-app-version');
    expect(result.minVersion).toBe('1.5.0');
  });

  it('fails open on a non-2xx response', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false })) as unknown as typeof fetch;
    expect(await fetchMinVersionPolicy('https://api.example.test', fetchImpl)).toBe(NO_GATE);
  });

  it('fails open on a network error', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await fetchMinVersionPolicy('https://api.example.test', fetchImpl)).toBe(NO_GATE);
  });

  it('fails open on invalid JSON', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => {
        throw new Error('bad json');
      },
    })) as unknown as typeof fetch;
    expect(await fetchMinVersionPolicy('https://api.example.test', fetchImpl)).toBe(NO_GATE);
  });
});

describe('storeUrlFor', () => {
  const p = policy({ storeUrls: { ios: 'https://a', android: 'https://b' } });
  it('picks the platform link', () => {
    expect(storeUrlFor(p, 'ios')).toBe('https://a');
    expect(storeUrlFor(p, 'android')).toBe('https://b');
    expect(storeUrlFor(p, 'web')).toBeNull();
  });
});
