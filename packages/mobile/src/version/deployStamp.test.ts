import {
  fetchBackendStamp,
  formatApiLine,
  formatAppLine,
  formatBuiltAt,
  formatLaneLine,
  laneFrom,
  localStampFromEnv,
  shortId,
} from './deployStamp';
import type { IBackendStamp, ILocalStamp } from './deployStamp';

const env = {
  appVersion: '1.0.0',
  nativeBuild: '40',
  channel: 'production',
  updateId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  apiUrl: 'https://api.scholarmancy.com',
};

describe('laneFrom', () => {
  it('returns www for the prod API host', () => {
    expect(laneFrom('https://api.scholarmancy.com')).toBe('www');
  });

  it('returns uat for the Railway dev host (preview IPA lane)', () => {
    expect(laneFrom('https://api-dev-c268.up.railway.app')).toBe('uat');
  });

  it('returns uat for the api-uat subdomain', () => {
    expect(laneFrom('https://api-uat.scholarmancy.com')).toBe('uat');
  });

  it('returns dev for localhost', () => {
    expect(laneFrom('http://localhost:2801')).toBe('dev');
  });

  it('returns dev for 127.0.0.1', () => {
    expect(laneFrom('http://127.0.0.1:2801')).toBe('dev');
  });

  it('returns the host as-is for unknown URLs', () => {
    expect(laneFrom('https://staging.example.com')).toBe('staging.example.com');
  });

  it('falls back to www when apiUrl is empty (resolveApiBaseUrl default)', () => {
    expect(laneFrom('')).toBe('www');
  });
});

describe('formatLaneLine', () => {
  it('prefixes the lane name with "Lane"', () => {
    expect(formatLaneLine('https://api.scholarmancy.com')).toBe('Lane www');
    expect(formatLaneLine('https://api-dev-c268.up.railway.app')).toBe('Lane uat');
    expect(formatLaneLine('http://localhost:2801')).toBe('Lane dev');
  });
});

describe('localStampFromEnv', () => {
  it('copies version, build, channel, update, and api url', () => {
    const stamp = localStampFromEnv(env);
    expect(stamp).toEqual({
      version: '1.0.0',
      build: '40',
      channel: 'production',
      updateId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      apiUrl: 'https://api.scholarmancy.com',
    });
  });

  it('falls back when fields are missing', () => {
    const stamp = localStampFromEnv({
      appVersion: null,
      nativeBuild: null,
      channel: null,
      updateId: null,
      apiUrl: '',
    });
    expect(stamp.version).toBe('?');
    expect(stamp.build).toBe('?');
    expect(stamp.channel).toBeNull();
    expect(stamp.apiUrl).toBe('https://api.scholarmancy.com');
  });
});

describe('formatAppLine', () => {
  const stamp: ILocalStamp = localStampFromEnv(env);

  it('shows marketing version and native build number', () => {
    expect(formatAppLine(stamp)).toContain('App 1.0.0 (40)');
  });

  it('shows the EAS channel', () => {
    expect(formatAppLine(stamp)).toContain('production');
  });

  it('shows a short OTA update id when one is applied', () => {
    expect(formatAppLine(stamp)).toContain('ota aaaaaaa');
  });

  it('omits ota when the binary is running embedded JS', () => {
    const embedded = localStampFromEnv({ ...env, updateId: null });
    expect(formatAppLine(embedded)).not.toContain('ota');
  });
});

describe('formatApiLine', () => {
  const stamp: ILocalStamp = localStampFromEnv(env);

  it('shows host and short commit while loading', () => {
    expect(formatApiLine(stamp, null)).toBe('API api.scholarmancy.com · …');
  });

  it('shows host, short SHA, and branch from /api/health/version', () => {
    const backend: IBackendStamp = {
      ok: true,
      commit: '5953c90788ea75da717978674f6a797b2a7de208',
      branch: 'main',
      builtAt: null,
    };
    expect(formatApiLine(stamp, backend)).toBe('API api.scholarmancy.com · 5953c90 · main');
  });

  it('appends compact UTC build time when the API reports builtAt', () => {
    const backend: IBackendStamp = {
      ok: true,
      commit: '5953c90788ea75da717978674f6a797b2a7de208',
      branch: 'main',
      builtAt: '2026-08-13T15:04:22.000Z',
    };
    expect(formatApiLine(stamp, backend)).toBe(
      'API api.scholarmancy.com · 5953c90 · main · 2026-08-13 15:04 UTC'
    );
  });

  it('reports unreachable without swallowing the host', () => {
    const backend: IBackendStamp = {
      ok: false,
      commit: 'unknown',
      branch: 'unknown',
      builtAt: null,
    };
    expect(formatApiLine(stamp, backend)).toBe('API api.scholarmancy.com · unreachable');
  });
});

describe('formatBuiltAt', () => {
  it('renders a compact UTC clock from an ISO timestamp', () => {
    expect(formatBuiltAt('2026-08-13T15:04:22.000Z')).toBe('2026-08-13 15:04 UTC');
  });

  it('passes through unparseable values', () => {
    expect(formatBuiltAt('not-a-date')).toBe('not-a-date');
  });
});

describe('shortId', () => {
  it('keeps unknown as-is', () => {
    expect(shortId('unknown')).toBe('unknown');
  });

  it('truncates git SHAs to 7 chars', () => {
    expect(shortId('5953c90788ea75da717978674f6a797b2a7de208')).toBe('5953c90');
  });
});

describe('fetchBackendStamp', () => {
  it('reads commit and branch from a healthy version payload', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        status: 'ok',
        commit: 'abc123def456',
        branch: 'main',
        builtAt: '2026-08-13T15:04:22.000Z',
      }),
    })) as unknown as typeof fetch;

    const out = await fetchBackendStamp('https://api.scholarmancy.com', fetchImpl);
    expect(out).toEqual({
      ok: true,
      commit: 'abc123def456',
      branch: 'main',
      builtAt: '2026-08-13T15:04:22.000Z',
    });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.scholarmancy.com/api/health/version');
  });

  it('does not throw when the backend is down', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('network offline');
    }) as unknown as typeof fetch;

    const out = await fetchBackendStamp('https://api.scholarmancy.com', fetchImpl);
    expect(out.ok).toBe(false);
  });

  it('treats a non-OK status as unreachable', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const out = await fetchBackendStamp('https://api.scholarmancy.com/', fetchImpl);
    expect(out.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledWith('https://api.scholarmancy.com/api/health/version');
  });
});
