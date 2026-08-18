/**
 * SOURCE_INVITE.md §9 — sessionStorage prefill after redeem (never password).
 */

import type { ISourceInvitePayload } from '@scholaracle/contracts';

export const SOURCE_INVITE_PREFILL_KEY = 'slc_source_invite_prefill';

export interface ISourceInvitePrefill {
  readonly provider: string;
  readonly portalBaseUrl: string;
  readonly displayName: string;
  readonly studentId: string;
  readonly studentExternalId: string;
}

export function invitePrefillFromRedeem(invite: ISourceInvitePayload): ISourceInvitePrefill {
  return {
    provider: invite.provider,
    portalBaseUrl: invite.portalBaseUrl,
    displayName: invite.displayName,
    studentId: invite.studentId,
    studentExternalId: invite.studentExternalId,
  };
}

export function storeInvitePrefill(prefill: ISourceInvitePrefill): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(SOURCE_INVITE_PREFILL_KEY, JSON.stringify(prefill));
}

export function readInvitePrefill(): ISourceInvitePrefill | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(SOURCE_INVITE_PREFILL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ISourceInvitePrefill;
  } catch {
    return null;
  }
}
