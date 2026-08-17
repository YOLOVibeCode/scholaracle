/**
 * SOURCE_INVITE.md §3 — payload / issue-response allowlists and assertNoSecrets.
 */

import {
  SOURCE_INVITE_ADAPTER_IDS,
  SOURCE_INVITE_ISSUE_RESPONSE_KEYS,
  SOURCE_INVITE_PAYLOAD_KEYS,
  SOURCE_INVITE_PROVIDERS,
  SOURCE_INVITE_PROVIDER_NAMES,
  assertNoSecrets,
  sanitizeInstallToken,
  type ISourceInviteIssueResponse,
  type ISourceInvitePayload,
} from './sourceInvite';

const AVA_PAYLOAD: ISourceInvitePayload = {
  provider: 'skyward',
  adapterId: SOURCE_INVITE_ADAPTER_IDS.skyward,
  portalBaseUrl: 'https://skyward.iscorp.com',
  displayName: 'Skyward Family Access (skyward.iscorp.com)',
  studentId: 'stu-mongo-1',
  studentExternalId: 'ava-lewis',
  institutionExternalId: 'skyward.iscorp.com',
};

describe('source invite contracts', () => {
  it('SOURCE_INVITE_PROVIDERS is exactly canvas/skyward/aeries', () => {
    expect([...SOURCE_INVITE_PROVIDERS]).toEqual(['canvas', 'skyward', 'aeries']);
  });

  it('payload JSON keys are exactly the allowlist', () => {
    expect(Object.keys(AVA_PAYLOAD).sort()).toEqual([...SOURCE_INVITE_PAYLOAD_KEYS].sort());
  });

  it('issue response type allowlist excludes token and landingUrl', () => {
    const sample: ISourceInviteIssueResponse = {
      success: true,
      expiresAt: '2026-08-22T00:00:00.000Z',
      emailedTo: 'parent@example.com',
    };
    const keys = Object.keys(sample);
    expect(keys.sort()).toEqual([...SOURCE_INVITE_ISSUE_RESPONSE_KEYS].sort());
    expect(keys).not.toContain('token');
    expect(keys).not.toContain('landingUrl');
    expect(keys).not.toContain('portalBaseUrl');
    expect(keys).not.toContain('studentExternalId');
  });

  it('assertNoSecrets accepts a valid payload', () => {
    expect(() => assertNoSecrets(AVA_PAYLOAD)).not.toThrow();
  });

  it('payload JSON fails assertNoSecrets if password is added', () => {
    expect(() => assertNoSecrets({ ...AVA_PAYLOAD, password: 'secret' })).toThrow(/secret/i);
  });

  it('rejects username, connector-like jwt, and nested secrets', () => {
    expect(() => assertNoSecrets({ username: 'a' })).toThrow();
    expect(() => assertNoSecrets({ jwt: 'x' })).toThrow();
    expect(() => assertNoSecrets({ creds: { token: 'x' } })).toThrow();
  });

  it('allows redeem top-level token when opted in', () => {
    const token = 'ab'.repeat(32);
    expect(() => assertNoSecrets({ token }, { allowKeys: new Set(['token']) })).not.toThrow();
  });

  it('sanitizeInstallToken accepts 64 hex and rejects garbage', () => {
    const token = 'ab'.repeat(32);
    expect(sanitizeInstallToken(token)).toBe(token);
    expect(sanitizeInstallToken('<script>')).toBe('');
    expect(sanitizeInstallToken('abc')).toBe('');
    expect(sanitizeInstallToken(null)).toBe('');
  });

  it('maps providers to mobile adapter ids and display names', () => {
    expect(SOURCE_INVITE_ADAPTER_IDS.skyward).toBe('com.skyward.iscorp');
    expect(SOURCE_INVITE_PROVIDER_NAMES.skyward).toBe('Skyward Family Access');
  });
});
