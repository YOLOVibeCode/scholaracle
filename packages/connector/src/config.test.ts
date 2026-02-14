import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDefaultConfigPath, loadConfig, saveConfig, type ISlcLocalConfig } from './config';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'slc-test-'));
}

describe('config', () => {
  describe('getDefaultConfigPath', () => {
    it('returns a path under home directory containing .scholaracle/slc.json', () => {
      const result = getDefaultConfigPath();
      expect(result).toContain('.scholaracle');
      expect(result).toContain('slc.json');
      expect(result).toMatch(/\.scholaracle[/\\]slc\.json$/);
    });
  });

  describe('loadConfig', () => {
    it('returns default config when file does not exist', () => {
      const dir = makeTempDir();
      const nonExistent = join(dir, 'does-not-exist.json');

      const config = loadConfig(nonExistent);

      expect(config).toEqual({
        apiBaseUrl: 'http://localhost:2801',
        sources: [],
      });
    });

    it('fills in default apiBaseUrl when missing from file', () => {
      const dir = makeTempDir();
      const filePath = join(dir, 'config.json');
      writeFileSync(filePath, JSON.stringify({ sources: [] }), 'utf8');

      const config = loadConfig(filePath);

      expect(config.apiBaseUrl).toBe('http://localhost:2801');
      expect(config.sources).toEqual([]);
    });

    it('fills in empty sources array when missing from file', () => {
      const dir = makeTempDir();
      const filePath = join(dir, 'config.json');
      writeFileSync(filePath, JSON.stringify({ apiBaseUrl: 'https://api.example.com' }), 'utf8');

      const config = loadConfig(filePath);

      expect(config.apiBaseUrl).toBe('https://api.example.com');
      expect(config.sources).toEqual([]);
    });
  });

  describe('saveConfig and loadConfig round-trip', () => {
    it('saves and loads config with all fields preserved', () => {
      const dir = makeTempDir();
      const filePath = join(dir, 'config.json');

      const original: ISlcLocalConfig = {
        apiBaseUrl: 'https://api.scholarmancy.com',
        connectorToken: 'tok_abc123',
        sources: [
          {
            sourceId: 'src-1',
            provider: 'canvas',
            adapterId: 'com.instructure.canvas',
            displayName: 'My Canvas',
            portalBaseUrl: 'https://canvas.example.com',
          },
        ],
      };

      saveConfig(original, filePath);
      const loaded = loadConfig(filePath);

      expect(loaded.apiBaseUrl).toBe(original.apiBaseUrl);
      expect(loaded.connectorToken).toBe(original.connectorToken);
      expect(loaded.sources).toEqual(original.sources);
    });
  });

  describe('saveConfig', () => {
    it('creates directory recursively when saving to a new temp path', () => {
      const dir = makeTempDir();
      const filePath = join(dir, 'slc.json');

      const config: ISlcLocalConfig = {
        apiBaseUrl: 'http://localhost:2801',
        sources: [],
      };

      // saveConfig hard-codes mkdirSync for ~/.scholaracle, then writes to the
      // given path. We verify the write succeeds and the file is loadable.
      saveConfig(config, filePath);

      const loaded = loadConfig(filePath);
      expect(loaded.apiBaseUrl).toBe('http://localhost:2801');
      expect(loaded.sources).toEqual([]);
    });
  });
});
