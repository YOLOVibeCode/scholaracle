import { readFileSync } from 'fs';
import { join } from 'path';
import { STORE_LEGAL_URLS } from './legalUrls';

describe('App Store metadata URLs', () => {
  const listing = JSON.parse(
    readFileSync(join(__dirname, '../../store-metadata/en-US.json'), 'utf8')
  ) as {
    privacyPolicyUrl: string;
    supportUrl: string;
    marketingUrl: string;
  };
  const testflight = JSON.parse(
    readFileSync(join(__dirname, '../../store-metadata/testflight.json'), 'utf8')
  ) as {
    privacyPolicyUrl: string;
    supportUrl: string;
    marketingUrl: string;
    demoAccountName: string;
    demoAccountRequired: boolean;
  };

  it('listing, TestFlight, and in-app Settings agree on the live legal URLs', () => {
    expect(listing.privacyPolicyUrl).toBe(STORE_LEGAL_URLS.privacy);
    expect(listing.supportUrl).toBe(STORE_LEGAL_URLS.support);
    expect(listing.marketingUrl).toBe(STORE_LEGAL_URLS.marketing);
    expect(testflight.privacyPolicyUrl).toBe(STORE_LEGAL_URLS.privacy);
    expect(testflight.supportUrl).toBe(STORE_LEGAL_URLS.support);
    expect(testflight.marketingUrl).toBe(STORE_LEGAL_URLS.marketing);
  });

  it('TestFlight demo account is the public seeded parent', () => {
    expect(testflight.demoAccountRequired).toBe(true);
    expect(testflight.demoAccountName).toBe('demo@scholarmancy.com');
  });
});
