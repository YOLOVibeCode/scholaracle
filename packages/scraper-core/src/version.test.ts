import { EXTRACTOR_BUNDLE_HASH, SCRAPER_CORE_PACKAGE_VERSION } from './version';

describe('scraper-core version stamp', () => {
  it('should export a non-empty package version', () => {
    expect(SCRAPER_CORE_PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('should export an extractor bundle hash', () => {
    expect(EXTRACTOR_BUNDLE_HASH).toMatch(/^sha256:/);
  });
});
