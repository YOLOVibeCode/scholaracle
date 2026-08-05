/**
 * IScraperManifest parse/validate/matchHost — TDD (RED first).
 */

import {
  parseScraperManifest,
  matchHost,
  validateManifestForRun,
  type IScraperManifest,
} from './manifest';

function makeValidRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'canvas-lms',
    name: 'Canvas LMS',
    adapterId: 'com.instructure.canvas',
    version: '1.0.0',
    hosts: ['*.instructure.com'],
    entities: ['course', 'assignment', 'gradeSnapshot'],
    entry: './index.js',
    publisher: 'scholaracle',
    ...overrides,
  };
}

describe('parseScraperManifest', () => {
  it('parses a valid manifest', () => {
    const m = parseScraperManifest(makeValidRaw());
    expect(m.id).toBe('canvas-lms');
    expect(m.adapterId).toBe('com.instructure.canvas');
    expect(m.version).toBe('1.0.0');
    expect(m.hosts).toEqual(['*.instructure.com']);
    expect(m.publisher).toBe('scholaracle');
  });

  it('parses optional fields', () => {
    const m = parseScraperManifest(
      makeValidRaw({
        scholaracleHelperMinVersion: '0.2.0',
        bundleHash: 'sha256:abc',
        permissions: ['network'],
        tests: { fixtureSuite: 'canvas-basic' },
        publisher: 'local',
      })
    );
    expect(m.scholaracleHelperMinVersion).toBe('0.2.0');
    expect(m.bundleHash).toBe('sha256:abc');
    expect(m.permissions).toEqual(['network']);
    expect(m.tests?.fixtureSuite).toBe('canvas-basic');
    expect(m.publisher).toBe('local');
  });

  it('rejects non-object input', () => {
    expect(() => parseScraperManifest(null)).toThrow(/manifest/i);
    expect(() => parseScraperManifest('x')).toThrow(/manifest/i);
  });

  it.each([
    'adapterId',
    'hosts',
    'entry',
    'version',
    'id',
    'name',
    'entities',
    'publisher',
  ] as const)('rejects missing %s', (field) => {
    const raw = makeValidRaw();
    delete raw[field];
    expect(() => parseScraperManifest(raw)).toThrow(new RegExp(field, 'i'));
  });

  it('rejects invalid publisher', () => {
    expect(() => parseScraperManifest(makeValidRaw({ publisher: 'community' }))).toThrow(
      /publisher/i
    );
  });

  it('rejects non-semver version', () => {
    expect(() => parseScraperManifest(makeValidRaw({ version: 'v1' }))).toThrow(/version|semver/i);
  });

  it('rejects empty hosts array', () => {
    expect(() => parseScraperManifest(makeValidRaw({ hosts: [] }))).toThrow(/hosts/i);
  });

  it('rejects empty entities array', () => {
    expect(() => parseScraperManifest(makeValidRaw({ entities: [] }))).toThrow(/entities/i);
  });

  it('rejects invalid scholaracleHelperMinVersion', () => {
    expect(() =>
      parseScraperManifest(makeValidRaw({ scholaracleHelperMinVersion: 'latest' }))
    ).toThrow(/scholaracleHelperMinVersion|semver/i);
  });

  it('parses version metadata (publishedAt, minCoreVersion, changelog)', () => {
    const m = parseScraperManifest(
      makeValidRaw({
        publishedAt: '2026-08-04T12:00:00.000Z',
        minCoreVersion: '0.1.0',
        changelog: 'Initial release: courses + assignments.',
      })
    );
    expect(m.publishedAt).toBe('2026-08-04T12:00:00.000Z');
    expect(m.minCoreVersion).toBe('0.1.0');
    expect(m.changelog).toBe('Initial release: courses + assignments.');
  });

  it('leaves version metadata undefined when omitted', () => {
    const m = parseScraperManifest(makeValidRaw());
    expect(m.publishedAt).toBeUndefined();
    expect(m.minCoreVersion).toBeUndefined();
    expect(m.changelog).toBeUndefined();
  });

  it('rejects non-ISO publishedAt', () => {
    expect(() => parseScraperManifest(makeValidRaw({ publishedAt: 'yesterday' }))).toThrow(
      /publishedAt/i
    );
    expect(() => parseScraperManifest(makeValidRaw({ publishedAt: 12345 }))).toThrow(
      /publishedAt/i
    );
  });

  it('rejects non-semver minCoreVersion', () => {
    expect(() => parseScraperManifest(makeValidRaw({ minCoreVersion: 'newest' }))).toThrow(
      /minCoreVersion|semver/i
    );
  });

  it('rejects non-string changelog', () => {
    expect(() => parseScraperManifest(makeValidRaw({ changelog: 42 }))).toThrow(/changelog/i);
  });
});

describe('matchHost', () => {
  it('matches exact hostname', () => {
    expect(matchHost(['portal.myschool.edu'], 'https://portal.myschool.edu/home')).toBe(true);
  });

  it('rejects non-matching exact hostname', () => {
    expect(matchHost(['portal.myschool.edu'], 'https://other.myschool.edu/home')).toBe(false);
  });

  it('matches wildcard *.domain.com', () => {
    expect(matchHost(['*.instructure.com'], 'https://ldisd.instructure.com/courses')).toBe(true);
    expect(matchHost(['*.myschool.edu'], 'https://grades.myschool.edu/')).toBe(true);
  });

  it('does not match apex for wildcard pattern', () => {
    expect(matchHost(['*.instructure.com'], 'https://instructure.com/')).toBe(false);
  });

  it('returns false for empty hosts', () => {
    expect(matchHost([], 'https://ldisd.instructure.com')).toBe(false);
  });

  it('returns false for invalid URL', () => {
    expect(matchHost(['*.instructure.com'], 'not-a-url')).toBe(false);
  });

  it('matches when any host pattern matches', () => {
    expect(
      matchHost(['exact.example.com', '*.instructure.com'], 'https://school.instructure.com')
    ).toBe(true);
  });

  it('matches skyward.iscorp.com with *.iscorp.com pattern', () => {
    expect(
      matchHost(
        ['*.iscorp.com'],
        'https://skyward.iscorp.com/scripts/wsisa.dll/WService=wsFin/seplog01.w'
      )
    ).toBe(true);
  });

  it('does not match skyward.iscorp.com with only *.skyward.com pattern', () => {
    expect(matchHost(['*.skyward.com'], 'https://skyward.iscorp.com/home')).toBe(false);
  });
});

describe('validateManifestForRun', () => {
  const valid: IScraperManifest = parseScraperManifest(makeValidRaw());

  it('returns ok for a valid runnable manifest', () => {
    expect(validateManifestForRun(valid)).toEqual({ ok: true });
  });

  it('fails when hosts is empty', () => {
    const result = validateManifestForRun({ ...valid, hosts: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => /hosts/i.test(e))).toBe(true);
  });

  it('fails when entry is blank', () => {
    const result = validateManifestForRun({ ...valid, entry: '  ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => /entry/i.test(e))).toBe(true);
  });

  it('fails when version is not semver', () => {
    const result = validateManifestForRun({ ...valid, version: 'bad' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => /version|semver/i.test(e))).toBe(true);
  });

  it('fails when adapterId is blank', () => {
    const result = validateManifestForRun({ ...valid, adapterId: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => /adapterId/i.test(e))).toBe(true);
  });

  it('collects multiple errors', () => {
    const result = validateManifestForRun({
      ...valid,
      adapterId: '',
      entry: '',
      hosts: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
