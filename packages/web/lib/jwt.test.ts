import { getTokenEmail, getTokenRole } from './jwt';

function unsignedJwt(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString('base64url');
  return `header.${b64}.sig`;
}

describe('getTokenRole', () => {
  it('returns student when the claim is student', () => {
    expect(getTokenRole(unsignedJwt({ userId: 'u1', role: 'student' }))).toBe('student');
  });

  it('returns parent when the claim is parent', () => {
    expect(getTokenRole(unsignedJwt({ userId: 'u1', role: 'parent' }))).toBe('parent');
  });

  it('treats a readable token without role as parent', () => {
    expect(getTokenRole(unsignedJwt({ userId: 'u1', email: 'a@b.com' }))).toBe('parent');
  });

  it('returns null for garbage', () => {
    expect(getTokenRole('not-a-jwt')).toBeNull();
    expect(getTokenRole(null)).toBeNull();
  });
});

describe('getTokenEmail', () => {
  it('returns the email claim', () => {
    expect(getTokenEmail(unsignedJwt({ email: 'emma.demo@scholarmancy.com' }))).toBe(
      'emma.demo@scholarmancy.com'
    );
  });
});
