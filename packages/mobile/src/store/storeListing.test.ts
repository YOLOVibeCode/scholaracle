import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Store listing text for the App Store and Google Play lives in store-metadata/en-US.json.
 * These checks hold the hard limits of each store and the two rules that get a listing
 * rejected: naming the other platform, and promising something this build does not do.
 */
type AppStoreListing = {
  name: string;
  subtitle: string;
  promotionalText: string;
  description: string;
  keywords: string;
  copyright: string;
};

type GooglePlayListing = {
  title: string;
  shortDescription: string;
  fullDescription: string;
  contactEmail: string;
  contactWebsite: string;
};

type Listing = AppStoreListing & { googlePlay: GooglePlayListing };

describe('store listing text', () => {
  const listing = JSON.parse(
    readFileSync(join(__dirname, '../../store-metadata/en-US.json'), 'utf8')
  ) as Listing;
  const play = listing.googlePlay;
  const appStoreText = [
    listing.name,
    listing.subtitle,
    listing.promotionalText,
    listing.description,
    listing.keywords,
  ].join('\n');
  const playText = [play.title, play.shortDescription, play.fullDescription].join('\n');

  it('fits the App Store field limits', () => {
    expect(listing.name.length).toBeLessThanOrEqual(30);
    expect(listing.subtitle.length).toBeLessThanOrEqual(30);
    expect(listing.promotionalText.length).toBeLessThanOrEqual(170);
    expect(listing.keywords.length).toBeLessThanOrEqual(100);
    expect(listing.description.length).toBeGreaterThan(200);
    expect(listing.description.length).toBeLessThanOrEqual(4000);
    expect(listing.copyright).toMatch(/^\d{4} Noctusoft, Inc\.$/);
  });

  it('fits the Google Play field limits', () => {
    expect(play.title.length).toBeLessThanOrEqual(30);
    expect(play.shortDescription.length).toBeGreaterThan(20);
    expect(play.shortDescription.length).toBeLessThanOrEqual(80);
    expect(play.fullDescription.length).toBeGreaterThan(200);
    expect(play.fullDescription.length).toBeLessThanOrEqual(4000);
    expect(play.contactEmail).toBe('support@scholarmancy.com');
    expect(play.contactWebsite).toBe('https://scholarmancy.com');
  });

  it('App Store text never names the other platform', () => {
    expect(appStoreText).not.toMatch(/android|google play|play store|keystore/i);
  });

  it('Google Play text never names the other platform', () => {
    expect(playText).not.toMatch(/iphone|ipad|\bios\b|app store|testflight|keychain|apple/i);
  });

  it('Google Play text does not promise push notifications (Android 1.0 has none)', () => {
    expect(playText).not.toMatch(/push/i);
  });

  it('keywords are comma separated with no padding and no repeat of the app name', () => {
    const words = listing.keywords.split(',');
    expect(words.every((w) => w.length > 0 && w === w.trim())).toBe(true);
    expect(new Set(words).size).toBe(words.length);
    expect(listing.keywords.toLowerCase()).not.toContain('scholarmancy');
  });

  it('neither listing quotes a price or claims attendance, which the app does not show', () => {
    for (const text of [appStoreText, playText]) {
      expect(text).not.toMatch(/\$\s?\d/);
      expect(text).not.toMatch(/attendance/i);
    }
  });

  it('both listings say the app is independent of the school portal vendors', () => {
    for (const text of [listing.description, play.fullDescription]) {
      expect(text).toMatch(/not affiliated with or endorsed by/i);
    }
  });
});
