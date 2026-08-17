/**
 * SOURCE_INVITE.md §9
 */

import { SOURCE_INVITE_ADAPTER_IDS, type ISourceInvitePayload } from '@scholaracle/contracts';
import { invitePrefillFromRedeem } from './invitePrefill';

const AVA: ISourceInvitePayload = {
  provider: 'skyward',
  adapterId: SOURCE_INVITE_ADAPTER_IDS.skyward,
  portalBaseUrl: 'https://skyward.iscorp.com',
  displayName: 'Skyward Family Access (skyward.iscorp.com)',
  studentId: 'stu-1',
  studentExternalId: 'ava-lewis',
  institutionExternalId: 'skyward.iscorp.com',
};

describe('invitePrefillFromRedeem', () => {
  it('copies provider and url without password', () => {
    const prefill = invitePrefillFromRedeem(AVA);
    expect(prefill.provider).toBe('skyward');
    expect(prefill.portalBaseUrl).toBe('https://skyward.iscorp.com');
    expect(Object.keys(prefill)).not.toContain('password');
    expect(JSON.stringify(prefill)).not.toMatch(/password/i);
  });
});
