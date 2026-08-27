/**
 * Wire contract for POST /api/account/push-token.
 *
 * Server is source of truth: packages/api/src/routes/account/account.ts.
 */

export interface IPushTokenRequest {
  readonly expoPushToken: string;
  /** Stable per-device id; server defaults to 'mobile-default' when omitted. */
  readonly deviceId?: string;
  readonly type?: 'ios' | 'android' | 'web';
  /** Client hint; server stores the authenticated user's role. */
  readonly audience?: 'parent' | 'student';
  /** Scoped students `_id` for student-audience tokens. */
  readonly studentId?: string;
}

export interface IPushTokenResponse {
  readonly success: boolean;
}

/** Request body of DELETE /api/account/push-token (idempotent). */
export interface IPushTokenDeleteRequest {
  readonly deviceId: string;
}
