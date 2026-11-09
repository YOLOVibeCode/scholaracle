import { readFileSync } from 'fs';
import { join } from 'path';
import { STORE_LEGAL_URLS } from './legalUrls';

describe('store compliance wiring (mobile)', () => {
  it('exposes web pricing and delete-account URLs without price text', () => {
    expect(STORE_LEGAL_URLS.pricing).toBe('https://scholarmancy.com/pricing');
    expect(STORE_LEGAL_URLS.deleteAccount).toBe('https://scholarmancy.com/delete-account');
    expect(STORE_LEGAL_URLS.pricing).not.toMatch(/\d/);
  });

  it('SettingsScreen exposes server AI consent toggle for parents', () => {
    const src = readFileSync(join(__dirname, '../screens/SettingsScreen.tsx'), 'utf8');
    expect(src).toMatch(/testID="switch-server-ai"/);
    expect(src).toMatch(/updateServerAiConsent/);
  });

  it('SettingsScreen deletes the account in the app (5.1.1(v)) with a stable test id', () => {
    const src = readFileSync(join(__dirname, '../screens/SettingsScreen.tsx'), 'utf8');
    expect(src).toContain('testID="link-delete-account"');
    expect(src).toContain('<DeleteAccountSheet');
    // No longer hands the user off to a web page to delete.
    expect(src).not.toContain('STORE_LEGAL_URLS.deleteAccount');
  });

  it('OnboardingScreen wires US-only See plans link to pricing URL with a stable test id', () => {
    const src = readFileSync(join(__dirname, '../onboarding/OnboardingScreen.tsx'), 'utf8');
    expect(src).toContain('testID="link-see-plans-scholarmancy"');
    expect(src).toContain('STORE_LEGAL_URLS.pricing');
    expect(src).toContain('isUsStorefrontLocale');
  });
});
