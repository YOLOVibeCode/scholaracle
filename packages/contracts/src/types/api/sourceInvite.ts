/**
 * Wire contracts for source invites (SOURCE_INVITE.md §3).
 *
 * Server is source of truth: packages/api/src/routes/source-invites/.
 * Payload types must not declare password, username, cookie, secret, jwt, or credential.
 */

import { ValidationError } from '../../errors';

export const SOURCE_INVITE_PROVIDERS = ['canvas', 'skyward', 'aeries'] as const;
export type SourceInviteProvider = (typeof SOURCE_INVITE_PROVIDERS)[number];

export const SOURCE_INVITE_PAYLOAD_KEYS = [
  'provider',
  'adapterId',
  'portalBaseUrl',
  'displayName',
  'studentId',
  'studentExternalId',
  'institutionExternalId',
] as const;

export const SOURCE_INVITE_ISSUE_RESPONSE_KEYS = ['success', 'expiresAt', 'emailedTo'] as const;

export const SOURCE_INVITE_ADAPTER_IDS: Readonly<Record<SourceInviteProvider, string>> = {
  canvas: 'com.instructure.canvas',
  skyward: 'com.skyward.iscorp',
  aeries: 'com.aeries.portal',
};

export const SOURCE_INVITE_PROVIDER_NAMES: Readonly<Record<SourceInviteProvider, string>> = {
  canvas: 'Canvas LMS',
  skyward: 'Skyward Family Access',
  aeries: 'Aeries Parent Portal',
};

export const SOURCE_INVITE_TOKEN_BYTES = 32;
export const SOURCE_INVITE_TOKEN_HEX_LENGTH = SOURCE_INVITE_TOKEN_BYTES * 2;
export const SOURCE_INVITE_TOKEN_HEX_PATTERN = /^[a-f0-9]{64}$/i;
export const SOURCE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SOURCE_INVITE_REDEEM_ERROR = 'This install link expired or is not for this account.';

/** Exact key names that must never appear on a source-invite payload. */
const SECRET_KEY =
  /^(user|username|pass|password|token|secret|cookie|credential|jwt|authorization)$/i;

export interface ISourceInvitePayload {
  readonly provider: SourceInviteProvider;
  readonly adapterId: string;
  readonly portalBaseUrl: string;
  readonly displayName: string;
  readonly studentId: string;
  readonly studentExternalId: string;
  readonly institutionExternalId: string;
}

export interface ISourceInviteIssueRequest {
  readonly studentId: string;
  readonly provider: SourceInviteProvider;
  readonly portalBaseUrl: string;
  readonly displayName?: string;
}

export interface ISourceInviteIssueResponse {
  readonly success: true;
  readonly expiresAt: string;
  readonly emailedTo: string;
}

export interface ISourceInviteRedeemRequest {
  readonly token: string;
}

export interface ISourceInviteRedeemResponse {
  readonly success: true;
  readonly invite: ISourceInvitePayload;
}

export interface IAssertNoSecretsOptions {
  /** Keys allowed only at the top level (e.g. redeem `token`, stored `tokenHash`). */
  readonly allowKeys?: ReadonlySet<string>;
}

/**
 * Reject objects whose keys look like secrets (SOURCE_INVITE.md §5).
 * Walks nested plain objects. `allowKeys` apply at the top level only.
 */
export function assertNoSecrets(record: unknown, options?: IAssertNoSecretsOptions): void {
  walkNoSecrets(record, options?.allowKeys ?? new Set(), true);
}

function walkNoSecrets(value: unknown, allowKeys: ReadonlySet<string>, isTop: boolean): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const allowed = isTop && allowKeys.has(key);
    if (!allowed && SECRET_KEY.test(key)) {
      throw new ValidationError('Request must not include secrets');
    }
    walkNoSecrets(child, allowKeys, false);
  }
}

/** Return the token when it is 64 hex chars; otherwise empty string (SOURCE_INVITE.md §5.4). */
export function sanitizeInstallToken(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  return SOURCE_INVITE_TOKEN_HEX_PATTERN.test(trimmed) ? trimmed.toLowerCase() : '';
}

export function isSourceInviteProvider(value: string): value is SourceInviteProvider {
  return (SOURCE_INVITE_PROVIDERS as readonly string[]).includes(value);
}
