import { APP_DOWNLOADS, NO_APP_NOTE, detectPhonePlatform } from './app-downloads';

describe('detectPhonePlatform', () => {
  it('recognises an iPhone and an iPad', () => {
    expect(
      detectPhonePlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
      )
    ).toBe('ios');
    expect(
      detectPhonePlatform('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15')
    ).toBe('ios');
  });

  it('recognises an Android phone', () => {
    expect(
      detectPhonePlatform(
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'
      )
    ).toBe('android');
  });

  it('returns null for a computer', () => {
    expect(
      detectPhonePlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'
      )
    ).toBeNull();
  });
});

describe('APP_DOWNLOADS', () => {
  it('offers only https links', () => {
    for (const download of Object.values(APP_DOWNLOADS)) {
      if (download) {
        expect(download.url).toMatch(/^https:\/\//);
        expect(download.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('has a plain sentence for every platform that has no download', () => {
    for (const platform of ['ios', 'android'] as const) {
      if (APP_DOWNLOADS[platform] === null) {
        expect(NO_APP_NOTE[platform].length).toBeGreaterThan(0);
      }
    }
  });
});
