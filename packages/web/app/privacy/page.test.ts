import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('App Store legal pages', () => {
  const read = (relative: string): string =>
    readFileSync(join(__dirname, '..', relative), 'utf8');

  it('privacy policy includes required SMS no-sharing sentence', () => {
    const src = read('privacy/page.tsx');
    expect(src).toMatch(
      /We do not share, sell, or provide your mobile phone number or SMS opt-in data to third parties or affiliates for marketing or promotional purposes/
    );
  });

  it('privacy policy documents opt-in server-side analysis', () => {
    const src = read('privacy/page.tsx');
    expect(src).toMatch(/Server-side analysis/);
    expect(src).toMatch(/off by default/i);
  });

  it('privacy policy covers Sign in with Apple, OAuth, and in-app deletion', () => {
    const src = read('privacy/page.tsx');
    expect(src).toMatch(/Sign in with Apple/);
    expect(src).toMatch(/Google/);
    expect(src).toMatch(/Microsoft/);
    expect(src).toMatch(/delete-account/);
    expect(src).toMatch(/privacy@scholarmancy\.com/);
  });

  it('children section matches how student logins work (parent-created, parent-controlled)', () => {
    const src = read('privacy/page.tsx').replace(/\s+/g, ' ');
    // The old "13 and older / we do not collect from children under 13" claim contradicted
    // parent-created student logins used by elementary-age children.
    expect(src).not.toMatch(/aged 13 and older/);
    expect(src).not.toMatch(/do not knowingly collect personal information from children under 13/);
    expect(src).toMatch(/student login that a parent or guardian creates/);
    expect(src).toMatch(/never let a child create an account/);
    expect(src).toMatch(/What we collect about a child/);
    expect(src).toMatch(/no advertising/i);
    expect(src).toMatch(/Your choices as a parent/);
    expect(src).toMatch(/remove the student login/);
    expect(src).toMatch(/refuse further collection/);
    expect(src).toMatch(/Settings → Delete account/);
  });

  it('store-metadata policy copy carries the same children section', () => {
    const html = readFileSync(
      join(__dirname, '..', '..', '..', 'mobile', 'store-metadata', 'privacy-policy.html'),
      'utf8'
    ).replace(/\s+/g, ' ');
    expect(html).not.toMatch(/aged 13 and older/);
    expect(html).toMatch(/student login that a parent or guardian creates/);
    expect(html).toMatch(/refuse further collection/);
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
    const formSrc = read('delete-account/DeleteAccountForm.tsx');
    expect(src).toMatch(/privacy@scholarmancy\.com/);
    expect(src).toMatch(/Settings/);
    expect(formSrc).toMatch(/data-testid="form-delete-account"/);
    expect(formSrc).toMatch(/data-testid="btn-delete-account"/);
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
