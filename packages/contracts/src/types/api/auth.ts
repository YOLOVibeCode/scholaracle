/**
 * Wire contracts for POST /api/auth/login and POST /api/auth/refresh.
 *
 * Server is source of truth: packages/api/src/routes/auth/auth.ts (login
 * passes through IAuthResult from @scholaracle/auth; refresh builds its
 * response inline).
 */

export type UserRole = 'parent' | 'student';

export interface IAuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: UserRole;
  /** Mongo `_id` of the scoped students document. Present for student logins. */
  readonly studentId?: string;
}

/** Success body of POST /api/auth/login (failure is the standard error envelope). */
export interface IAuthLoginResponse {
  readonly success: boolean;
  readonly token?: string;
  readonly refreshToken?: string;
  /** Refresh token family ID (for session management). */
  readonly familyId?: string;
  readonly rememberMe?: boolean;
  readonly user?: IAuthUser;
  /** When true, client should force a password reset flow. */
  readonly forcePasswordReset?: boolean;
  readonly error?: string;
}

/** Success body of POST /api/auth/refresh. */
export interface IAuthRefreshResponse {
  readonly success: boolean;
  readonly token?: string;
  readonly refreshToken?: string;
  readonly rememberMe: boolean;
}
