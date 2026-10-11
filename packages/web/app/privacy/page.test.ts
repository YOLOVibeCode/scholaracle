import { readFileSync } from 'fs';
import { join } from 'path';

describe('App Store legal pages', () => {
  const read = (relative: string): string =>
    readFileSync(join(__dirname, '..', relative), 'utf8');

  it('privacy policy includes required SMS no-sharing sentence', () => {
    const src = read('privacy/page.tsx');
    expect(src).toMatch(
      /We do not share, sell, or provide your mobile phone number or SMS opt-in data to third parties or affiliates for marketing or promotional purposes/
    );
  });

  it('privacy policy covers Sign in with Apple, OAuth, and in-app deletion', () => {
    const src = read('privacy/page.tsx');
    expect(src).toMatch(/Sign in with Apple/);
    expect(src).toMatch(/Google/);
    expect(src).toMatch(/Microsoft/);
    expect(src).toMatch(/delete-account/);
    expect(src).toMatch(/privacy@scholarmancy\.com/);
  });

  it('terms of service cover mobile apps and account deletion', () => {
    const src = read('terms/page.tsx');
    expect(src).toMatch(/iOS app/);
    expect(src).toMatch(/delete-account/);
    expect(src).toMatch(/id="sms"/);
    expect(src).toMatch(/support@scholarmancy\.com/);
  });

  it('support page exposes a reachable support email', () => {
    const src = read('support/page.tsx');
    expect(src).toMatch(/support@scholarmancy\.com/);
    expect(src).toMatch(/delete-account/);
  });

  it('delete-account page is a public deletion request path', () => {
    const src = read('delete-account/page.tsx');
    expect(src).toMatch(/privacy@scholarmancy\.com/);
    expect(src).toMatch(/Settings/);
  });

  it('SMS program page is public-facing and describes self opt-in for co-parents', () => {
    const src = read('sms/page.tsx');
    expect(src).toMatch(/operated by Noctusoft, Inc\./);
    expect(src).toMatch(/SCHOLARMANCY_SMS_SUPPORT_EMAIL/);
    expect(src).toMatch(/We do not share, sell, or provide your mobile phone number or SMS opt-in data/);
    expect(src).toMatch(/never text a number\s+that someone else entered/);
    expect(src).toMatch(/buildSmsOptInLabelHtml/);
  });

  it('co-parent opt-in page requires the box before it calls the API', () => {
    const src = read('sms/optin/[token]/page.tsx');
    expect(src).toMatch(/if \(!consent\)/);
    expect(src).toMatch(/SMS_CONSENT_REQUIRED_MESSAGE/);
    expect(src).toMatch(/data-testid="sms-optin-submit"/);
  });

  it('terms SMS section covers co-parent self opt-in', () => {
    expect(read('terms/page.tsx')).toMatch(/co-parent or guardian added by another parent gets no texts/);
  });
});
