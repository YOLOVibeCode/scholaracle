import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The Google Play store listing is pushed from store-metadata by
 * scripts/sync-google-play-listing.mjs: the text in en-US.json, the two images in
 * store-metadata/google-play, and the phone screenshots.
 *
 * Until 26 Nov 2026 the listing on Play held a title and nothing else, and the app could
 * not leave draft. Play refuses an image of the wrong size, so the sizes are held here,
 * and the script's check mode is run so a bad file is caught before anything is sent.
 */
const STORE_ROOT = join(__dirname, '../../store-metadata');
const SCRIPT = join(__dirname, '../../scripts/sync-google-play-listing.mjs');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOUR_TYPES_WITH_ALPHA = [4, 6];

type PngInfo = { width: number; height: number; hasAlpha: boolean; bytes: number };

function readPng(path: string): PngInfo {
  const data = readFileSync(path);
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${path} is not a PNG file`);
  }
  // IHDR is always the first chunk: width and height at bytes 16 to 23, colour type at byte 25.
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    hasAlpha: COLOUR_TYPES_WITH_ALPHA.includes(data.readUInt8(25)),
    bytes: data.length,
  };
}

/** Runs the sync script with a clean environment: nothing from this machine reaches it. */
function run(args: string[]): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { NODE_ENV: 'test', PATH: process.env['PATH'] ?? '' },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

describe('Google Play listing images', () => {
  it('the icon is 512 x 512 and under the 1 MB limit', () => {
    const icon = readPng(join(STORE_ROOT, 'google-play/icon.png'));
    expect([icon.width, icon.height]).toEqual([512, 512]);
    expect(icon.bytes).toBeLessThanOrEqual(1024 * 1024);
  });

  it('the feature graphic is 1024 x 500 with no transparency', () => {
    const graphic = readPng(join(STORE_ROOT, 'google-play/feature-graphic.png'));
    expect([graphic.width, graphic.height]).toEqual([1024, 500]);
    expect(graphic.hasAlpha).toBe(false);
    expect(graphic.bytes).toBeLessThanOrEqual(15 * 1024 * 1024);
  });
});

describe('Google Play listing sync', () => {
  const listing = JSON.parse(readFileSync(join(STORE_ROOT, 'en-US.json'), 'utf8')) as {
    googlePlay: { title: string; contactEmail: string; contactWebsite: string };
  };

  it('check mode passes on the files in the repo and sends nothing', () => {
    const { status, output } = run(['--check']);
    expect(output).toMatch(/nothing was sent/i);
    expect(status).toBe(0);
  });

  it('check mode says what would be sent', () => {
    const { output } = run(['--check']);
    expect(output).toContain(listing.googlePlay.title);
    expect(output).toContain(listing.googlePlay.contactEmail);
    expect(output).toContain(listing.googlePlay.contactWebsite);
    expect(output).toMatch(/icon\s+512 x 512/);
    expect(output).toMatch(/feature graphic\s+1024 x 500/);
    expect(output).toMatch(/phone screenshots\s+7\b/);
  });

  it('check mode needs no Play key', () => {
    const { status, output } = run(['--check']);
    expect(status).toBe(0);
    expect(output).not.toMatch(/GOOGLE_SERVICE_ACCOUNT_KEY_PATH is not set/);
  });

  it('without a Play key it stops before sending anything', () => {
    const { status, output } = run([]);
    expect(status).toBe(1);
    expect(output).toContain('GOOGLE_SERVICE_ACCOUNT_KEY_PATH');
    expect(output).not.toMatch(/edit opened/i);
  });

  it('leaves releases, testers and the Play Console forms alone', () => {
    const source = readFileSync(SCRIPT, 'utf8');
    // The only Play paths the script may write to: the listing, its images, and app details.
    expect(source).not.toMatch(/\/tracks\b/);
    expect(source).not.toMatch(/\/testers\b/);
    expect(source).not.toMatch(/\/bundles\b|\/apks\b/);
    expect(source).not.toMatch(/countryAvailability/);
  });
});
