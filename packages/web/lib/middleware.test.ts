/**
 * Tests for ../middleware.ts. They live under lib/ because jest only looks in lib/, app/ and
 * components/: at the package root, where this file used to be, it was never run.
 */
import { NextRequest } from 'next/server';
import { config, middleware } from '../middleware';

/** Ensures brand static assets are not gated by auth middleware so next/image can fetch them. */
describe('middleware config', () => {
  it('excludes logo assets from the auth matcher', () => {
    const [matcher] = config.matcher;
    expect(matcher).toContain('logo-128.png');
    expect(matcher).toContain('logo.png');
  });
});

describe('middleware: a visitor with no session', () => {
  function locationFor(url: string): string | null {
    const res = middleware(new NextRequest(url));
    const location = res.headers.get('location');
    if (location === null) return null;
    const target = new URL(location);
    return `${target.pathname}${target.search}`;
  }

  /**
   * The connector prints a link with a one-time code (issue #3). Someone who has to sign in
   * first must land back on that page with the code, not on the dashboard without it.
   */
  it('is sent to sign in and back to the device link, code included', () => {
    expect(locationFor('https://scholarmancy.com/connector/activate?code=ABCD-EFGH')).toBe(
      `/login?redirect=${encodeURIComponent('/connector/activate?code=ABCD-EFGH')}`
    );
  });

  it('is sent to sign in and back to the device page when the link has no code', () => {
    expect(locationFor('https://scholarmancy.com/connector/activate')).toBe(
      `/login?redirect=${encodeURIComponent('/connector/activate')}`
    );
  });

  it('is sent to plain sign-in from any other protected page, as before', () => {
    expect(locationFor('https://scholarmancy.com/dashboard')).toBe('/login');
    expect(locationFor('https://scholarmancy.com/dashboard/billing?tab=plan')).toBe('/login');
  });

  it('is let through to public pages', () => {
    expect(locationFor('https://scholarmancy.com/')).toBeNull();
    expect(locationFor('https://scholarmancy.com/login')).toBeNull();
  });
});
