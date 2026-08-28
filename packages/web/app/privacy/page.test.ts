import { readFileSync } from 'fs';
import { join } from 'path';

describe('App Store legal pages', () => {
  const read = (relative: string): string =>
    readFileSync(join(__dirname, '..', relative), 'utf8');

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
});
