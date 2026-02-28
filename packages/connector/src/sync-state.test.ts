import { SyncState } from './sync-state';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('SyncState', () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `sync-state-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
  });

  it('should start empty', () => {
    const state = new SyncState();
    expect(state.get('any')).toBeUndefined();
  });

  it('should set and get entry', () => {
    const state = new SyncState();
    const entry = {
      externalId: 'canvas-file-1',
      contentHash: 'abc123',
      lastModified: '2025-09-01T00:00:00Z',
      fileSize: 1024,
    };
    state.set('canvas-file-1', entry);
    expect(state.get('canvas-file-1')).toEqual(entry);
  });

  it('should load from file', () => {
    const path = join(dir, 'state.json');
    writeFileSync(
      path,
      JSON.stringify({
        entries: {
          'canvas-file-1': {
            externalId: 'canvas-file-1',
            contentHash: 'h1',
            lastModified: '2025-09-01T00:00:00Z',
            fileSize: 100,
          },
        },
      }),
      'utf-8'
    );
    const state = new SyncState();
    state.load(path);
    expect(state.get('canvas-file-1')).toEqual({
      externalId: 'canvas-file-1',
      contentHash: 'h1',
      lastModified: '2025-09-01T00:00:00Z',
      fileSize: 100,
    });
  });

  it('should save to file and round-trip', () => {
    const path = join(dir, 'out.json');
    const state = new SyncState();
    state.set('e1', {
      externalId: 'e1',
      contentHash: 'hash1',
      lastModified: '2025-01-01T00:00:00Z',
      fileSize: 50,
    });
    state.save(path);
    expect(existsSync(path)).toBe(true);
    const state2 = new SyncState();
    state2.load(path);
    expect(state2.get('e1')).toEqual({
      externalId: 'e1',
      contentHash: 'hash1',
      lastModified: '2025-01-01T00:00:00Z',
      fileSize: 50,
    });
  });

  it('should handle missing file on load', () => {
    const state = new SyncState();
    state.set('x', {
      externalId: 'x',
      contentHash: 'c',
      lastModified: '2025-01-01',
      fileSize: 0,
    });
    state.load(join(dir, 'nonexistent.json'));
    expect(state.get('x')).toBeUndefined();
  });

  it('should ignore invalid JSON on load', () => {
    const path = join(dir, 'bad.json');
    writeFileSync(path, 'not json', 'utf-8');
    const state = new SyncState();
    state.set('a', {
      externalId: 'a',
      contentHash: 'h',
      lastModified: '2025-01-01',
      fileSize: 1,
    });
    state.load(path);
    expect(state.get('a')).toBeUndefined();
  });
});
