import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Store screenshots live in store-metadata/screenshots, one folder per store, and are retaken
 * with e2e/maestro/store-screenshots.yaml from the demo household. Each store refuses an upload
 * with the wrong pixel size or with transparency, so both are held here.
 */
const ROOT = join(__dirname, '../../store-metadata/screenshots');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOUR_TYPES_WITH_ALPHA = [4, 6];
const MAX_FILE_BYTES = 8 * 1024 * 1024;

type PngInfo = { name: string; width: number; height: number; hasAlpha: boolean; bytes: number };

function readPng(folder: string, name: string): PngInfo {
  const data = readFileSync(join(ROOT, folder, name));
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${folder}/${name} is not a PNG file`);
  }
  // IHDR is always the first chunk: width and height at bytes 16 to 23, colour type at byte 25.
  return {
    name,
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    hasAlpha: COLOUR_TYPES_WITH_ALPHA.includes(data.readUInt8(25)),
    bytes: data.length,
  };
}

function readFolder(folder: string): PngInfo[] {
  return readdirSync(join(ROOT, folder))
    .sort()
    .map((name) => readPng(folder, name));
}

describe('store screenshots', () => {
  const appStore = readFolder('app-store-6.9in');
  const googlePlay = readFolder('google-play-phone');

  it('the screenshots folder holds the two store folders and nothing else', () => {
    expect(readdirSync(ROOT).sort()).toEqual(['app-store-6.9in', 'google-play-phone']);
  });

  it('App Store set: 1 to 10 images at the 6.9 inch iPhone size', () => {
    expect(appStore.length).toBeGreaterThanOrEqual(1);
    expect(appStore.length).toBeLessThanOrEqual(10);
    for (const shot of appStore) {
      expect([shot.name, shot.width, shot.height]).toEqual([shot.name, 1320, 2868]);
    }
  });

  it('Google Play set: 2 to 8 phone images, 1080x1920 (no side over twice the other)', () => {
    expect(googlePlay.length).toBeGreaterThanOrEqual(2);
    expect(googlePlay.length).toBeLessThanOrEqual(8);
    for (const shot of googlePlay) {
      expect([shot.name, shot.width, shot.height]).toEqual([shot.name, 1080, 1920]);
    }
  });

  it('no image has transparency or is over the 8 MB upload limit', () => {
    for (const shot of [...appStore, ...googlePlay]) {
      expect([shot.name, shot.hasAlpha]).toEqual([shot.name, false]);
      expect(shot.bytes).toBeLessThanOrEqual(MAX_FILE_BYTES);
    }
  });

  it('both stores show the same screens, numbered in order', () => {
    const names = appStore.map((shot) => shot.name);
    expect(googlePlay.map((shot) => shot.name)).toEqual(names);
    names.forEach((name, index) => {
      expect(name).toMatch(new RegExp(`^${String(index + 1).padStart(2, '0')}-[a-z-]+\\.png$`));
    });
  });
});
