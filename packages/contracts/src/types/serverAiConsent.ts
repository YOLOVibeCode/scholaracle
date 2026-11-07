/** Purpose key for server-side AI on synced academic materials (D18). */
export const SERVER_AI_CONSENT_PURPOSE = 'server_ai';

/** Bumped when settings checkbox / policy copy for server AI changes. */
export const SERVER_AI_CONSENT_TEXT_VERSION = '2026-11-07';

/** Short label for settings UI and logs. */
export const SERVER_AI_CONSENT_LABEL =
  'Analyze synced course files and images on Scholarmancy servers to link materials to assignments.';

export interface IServerAiConsentRecord {
  readonly userId: string;
  readonly purpose: string;
  readonly consentTextVersion: string;
  readonly source: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly consentedAt?: Date;
  readonly revokedAt?: Date;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}
