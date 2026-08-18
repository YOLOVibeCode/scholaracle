/**
 * SOURCE_INVITE.md §5.2
 */

import { normalizePortalUrl } from './normalizePortalUrl';

describe('normalizePortalUrl', () => {
  it('strips trailing slash and lowercases host for Ava Skyward', () => {
    expect(normalizePortalUrl('https://skyward.iscorp.com/')).toBe('https://skyward.iscorp.com');
  });

  it('rejects http', () => {
    expect(() => normalizePortalUrl('http://skyward.iscorp.com')).toThrow(/https/i);
  });

  it('rejects userinfo credentials', () => {
    expect(() => normalizePortalUrl('https://user:pass@skyward.iscorp.com')).toThrow(/credential/i);
  });

  it('rejects javascript URLs', () => {
    expect(() => normalizePortalUrl('javascript:alert(1)')).toThrow();
  });

  it('rejects empty host', () => {
    expect(() => normalizePortalUrl('https://')).toThrow();
  });
});
