/**
 * SOURCE_INVITE.md §8.3
 */

import { SOURCE_INVITE_ADAPTER_IDS, type ISourceInvitePayload } from '@scholaracle/contracts';
import { connectSourceInitialState } from './connectSourceInitialState';

const AVA: ISourceInvitePayload = {
  provider: 'skyward',
  adapterId: SOURCE_INVITE_ADAPTER_IDS.skyward,
  portalBaseUrl: 'https://skyward.iscorp.com',
  displayName: 'Skyward Family Access (skyward.iscorp.com)',
  studentId: 'stu-mongo-1',
  studentExternalId: 'ava-lewis',
  institutionExternalId: 'skyward.iscorp.com',
};

describe('connectSourceInitialState', () => {
  it('no invite → step provider, unlocked', () => {
    const state = connectSourceInitialState();
    expect(state.step).toBe('provider');
    expect(state.providerLocked).toBe(false);
    expect(state.urlLocked).toBe(false);
  });

  it('Ava invite → credentials with locked iscorp URL', () => {
    const state = connectSourceInitialState(AVA);
    expect(state.step).toBe('credentials');
    expect(state.portalUrl).toBe('https://skyward.iscorp.com');
    expect(state.provider).toBe('skyward');
    expect(state.providerLocked).toBe(true);
    expect(state.urlLocked).toBe(true);
  });
});
