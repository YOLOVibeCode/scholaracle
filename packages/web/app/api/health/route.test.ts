import { GET } from './route';

describe('GET /api/health', () => {
  const savedRailwaySha = process.env['RAILWAY_GIT_COMMIT_SHA'];
  const savedVercelSha = process.env['VERCEL_GIT_COMMIT_SHA'];
  const savedGitCommit = process.env['GIT_COMMIT'];

  afterEach(() => {
    if (savedRailwaySha === undefined) delete process.env['RAILWAY_GIT_COMMIT_SHA'];
    else process.env['RAILWAY_GIT_COMMIT_SHA'] = savedRailwaySha;
    if (savedVercelSha === undefined) delete process.env['VERCEL_GIT_COMMIT_SHA'];
    else process.env['VERCEL_GIT_COMMIT_SHA'] = savedVercelSha;
    if (savedGitCommit === undefined) delete process.env['GIT_COMMIT'];
    else process.env['GIT_COMMIT'] = savedGitCommit;
  });

  it('returns fleet health metadata with scholarmancy-web service', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      status: 'ok',
      ok: true,
      service: 'scholarmancy-web',
      commit: expect.any(String),
      env: expect.any(String),
      utc: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
    });
  });

  it('returns commit from RAILWAY_GIT_COMMIT_SHA when set', async () => {
    process.env['RAILWAY_GIT_COMMIT_SHA'] = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    const res = await GET();
    const body = await res.json();
    expect(body.commit).toBe('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
  });

  it('reports unknown commit when deploy env vars are absent', async () => {
    delete process.env['RAILWAY_GIT_COMMIT_SHA'];
    delete process.env['VERCEL_GIT_COMMIT_SHA'];
    delete process.env['GIT_COMMIT'];

    const res = await GET();
    const body = await res.json();
    expect(body.commit).toBe('unknown');
  });
});
