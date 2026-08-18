/**
 * SOURCE_INVITE.md §8.3
 */

import type { ISourceInvitePayload } from '@scholaracle/contracts';
import type { IConnectSourceInitialState } from './types';

export function connectSourceInitialState(
  invite?: ISourceInvitePayload
): IConnectSourceInitialState {
  if (!invite) {
    return {
      step: 'provider',
      provider: null,
      portalUrl: '',
      providerLocked: false,
      urlLocked: false,
    };
  }
  return {
    step: 'credentials',
    provider: invite.provider,
    portalUrl: invite.portalBaseUrl,
    providerLocked: true,
    urlLocked: true,
  };
}
