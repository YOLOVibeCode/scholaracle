/**
 * scaffoldScraperModule — TDD (RED first).
 * Creates a community IScraperModule skeleton with harness test.
 */

import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseScraperManifest } from '../registry/manifest';
import { scaffoldScraperModule, slugifyPlatformName } from './scaffold';

describe('slugifyPlatformName', () => {
  it('should slugify display names', () => {
    expect(slugifyPlatformName('Parent Square')).toBe('parent-square');
    expect(slugifyPlatformName('PowerSchool@District')).toBe('powerschool-district');
  });
});

describe('scaffoldScraperModule', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'scaffold-scraper-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('should write manifest, module, transform, fixtures, and harness test', () => {
    const result = scaffoldScraperModule({
      name: 'Parent Square',
      hosts: ['*.parentsquare.com'],
      entities: ['course', 'assignment', 'message'],
      outDir: dir,
    });

    expect(result.slug).toBe('parent-square');
    expect(result.dir).toBe(join(dir, 'parent-square'));
    expect(existsSync(join(result.dir, 'manifest.json'))).toBe(true);
    expect(existsSync(join(result.dir, 'index.ts'))).toBe(true);
    expect(existsSync(join(result.dir, 'transform.ts'))).toBe(true);
    expect(existsSync(join(result.dir, 'fixtures', 'sample.json'))).toBe(true);
    expect(existsSync(join(result.dir, 'index.test.ts'))).toBe(true);
    expect(existsSync(join(result.dir, 'README.md'))).toBe(true);
  });

  it('should produce a valid local publisher manifest', () => {
    const result = scaffoldScraperModule({
      name: 'Infinite Campus',
      hosts: ['*.infinitecampus.org'],
      entities: ['course', 'assignment', 'gradeSnapshot'],
      outDir: dir,
    });

    const raw = JSON.parse(readFileSync(join(result.dir, 'manifest.json'), 'utf8'));
    const manifest = parseScraperManifest(raw);
    expect(manifest.publisher).toBe('local');
    expect(manifest.adapterId).toBe('com.local.infinite-campus');
    expect(manifest.hosts).toEqual(['*.infinitecampus.org']);
    expect(manifest.entities).toEqual(['course', 'assignment', 'gradeSnapshot']);
    expect(manifest.tests?.fixtureSuite).toBe('sample');
  });

  it('should refuse to overwrite an existing directory', () => {
    scaffoldScraperModule({
      name: 'Dup',
      hosts: ['*.example.com'],
      entities: ['course'],
      outDir: dir,
    });
    expect(() =>
      scaffoldScraperModule({
        name: 'Dup',
        hosts: ['*.example.com'],
        entities: ['course'],
        outDir: dir,
      })
    ).toThrow(/exists/i);
  });

  it('should default entities to core academic set when omitted', () => {
    const result = scaffoldScraperModule({
      name: 'Custom Portal',
      hosts: ['portal.school.edu'],
      outDir: dir,
    });
    const raw = JSON.parse(readFileSync(join(result.dir, 'manifest.json'), 'utf8'));
    expect(raw.entities).toEqual(
      expect.arrayContaining(['studentProfile', 'course', 'assignment', 'gradeSnapshot'])
    );
  });
});
