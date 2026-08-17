/**
 * SOURCE_INVITE.md §8.2 — register metadata only; never writes SecureStore.
 */

import type { ISourceInvitePayload } from '@scholaracle/contracts';
import {
  ADAPTER_IDS,
  buildCredentialKey,
  type IConnectedSource,
  type IConnectedSourceStore,
} from '../sources/ConnectedSourceStore';
import type { ISourceInviteApplier } from './types';

export function sourceIdForInvite(payload: ISourceInvitePayload): string {
  return `local-${payload.provider}-${payload.institutionExternalId}`;
}

export const sourceInviteApplier: ISourceInviteApplier = {
  async apply(
    payload: ISourceInvitePayload,
    store: IConnectedSourceStore
  ): Promise<IConnectedSource> {
    const adapterId = ADAPTER_IDS[payload.provider] ?? payload.adapterId;
    const credentialKey = buildCredentialKey(payload.provider, payload.portalBaseUrl);
    const source: IConnectedSource = {
      provider: payload.provider,
      adapterId,
      baseUrl: payload.portalBaseUrl,
      sourceId: sourceIdForInvite(payload),
      credentialKey,
      studentExternalId: payload.studentExternalId,
      institutionExternalId: payload.institutionExternalId,
      studentId: payload.studentId,
      adapterVersion: '0.1.0',
    };
    await store.upsert(source);
    return source;
  },
};
