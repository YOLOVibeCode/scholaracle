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

/** Request body of DELETE /api/account — permanently deletes the parent household. */
export interface IAccountDeleteRequest {
  /** Account password. Required unless an Apple proof is sent. */
  readonly password?: string;
  /**
   * Fresh Sign in with Apple identity token (and its raw nonce) for accounts created with
   * Apple, which have no known password. Must belong to the same user.
   */
  readonly appleIdentityToken?: string;
  readonly appleNonce?: string;
  /**
   * One-time authorization code from the same fresh Sign in with Apple. The server uses it to
   * revoke the user's Apple tokens (App Review 5.1.1(v)). Optional: deletion never waits on it.
   */
  readonly appleAuthorizationCode?: string;
}

export interface IAccountDeleteResponse {
  readonly success: boolean;
}
