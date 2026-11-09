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
import {
  registerHouseholdBinding,
  type IHouseholdBindingRegistrar,
} from '../sources/registerHouseholdBinding';

export function sourceIdForInvite(payload: ISourceInvitePayload): string {
  return `local-${payload.provider}-${payload.institutionExternalId}`;
}

export async function applySourceInvite(
  payload: ISourceInvitePayload,
  store: IConnectedSourceStore,
  options?: { readonly registrar?: IHouseholdBindingRegistrar }
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

  if (options?.registrar && payload.studentId) {
    try {
      const portalAccountId = await registerHouseholdBinding({
        source,
        displayName: payload.displayName,
        registrar: options.registrar,
      });
      const withAccount = { ...source, portalAccountId };
      await store.upsert(withAccount);
      return withAccount;
    } catch {
      return source;
    }
  }

  return source;
}

export const sourceInviteApplier: ISourceInviteApplier = {
  apply(payload, store) {
    return applySourceInvite(payload, store);
  },
};
