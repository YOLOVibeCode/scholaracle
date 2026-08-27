import { destinationForRole, postLoginDestination } from './destinationForRole';

describe('destinationForRole', () => {
  it('sends an unauthenticated visitor on /studio to login with redirect', () => {
    expect(destinationForRole(undefined, '/studio')).toBe('/login?redirect=%2Fstudio');
  });

  it('preserves assignment deep links on the unauthenticated redirect', () => {
    expect(destinationForRole(undefined, '/studio/assignments/demo-emma-ap-bio-a5')).toBe(
      '/login?redirect=%2Fstudio%2Fassignments%2Fdemo-emma-ap-bio-a5'
    );
  });

  it('does not redirect unauthenticated public pages', () => {
    expect(destinationForRole(undefined, '/login')).toBeNull();
    expect(destinationForRole(undefined, '/pricing')).toBeNull();
  });

  it('sends a student on /login or /dashboard to /studio', () => {
    expect(destinationForRole('student', '/login')).toBe('/studio');
    expect(destinationForRole('student', '/dashboard')).toBe('/studio');
    expect(destinationForRole('student', '/dashboard/students/abc')).toBe('/studio');
  });

  it('lets a student stay on /studio', () => {
    expect(destinationForRole('student', '/studio')).toBeNull();
    expect(destinationForRole('student', '/studio/fixtures/lab-safety.pdf')).toBeNull();
    expect(destinationForRole('student', '/login/expired')).toBeNull();
  });

  it('sends a parent on /login or /studio to /dashboard', () => {
    expect(destinationForRole('parent', '/login')).toBe('/dashboard');
    expect(destinationForRole('parent', '/studio')).toBe('/dashboard');
    expect(destinationForRole('parent', '/studio/assignments/x')).toBe('/dashboard');
  });

  it('lets a parent stay on /dashboard', () => {
    expect(destinationForRole('parent', '/dashboard')).toBeNull();
  });
});

describe('postLoginDestination', () => {
  it('sends students to /studio, honoring a studio redirect', () => {
    expect(postLoginDestination('student', null)).toBe('/studio');
    expect(postLoginDestination('student', '/dashboard')).toBe('/studio');
    expect(postLoginDestination('student', '/studio/assignments/a5')).toBe(
      '/studio/assignments/a5'
    );
  });

  it('sends parents to /dashboard, honoring a non-studio redirect', () => {
    expect(postLoginDestination('parent', null)).toBe('/dashboard');
    expect(postLoginDestination('parent', '/studio')).toBe('/dashboard');
    expect(postLoginDestination('parent', '/dashboard/students')).toBe('/dashboard/students');
  });

  it('rejects protocol-relative redirects', () => {
    expect(postLoginDestination('parent', '//evil.example')).toBe('/dashboard');
  });
});
