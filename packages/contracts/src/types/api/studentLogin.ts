/**
 * Wire contracts for parent-provisioned student logins
 * (`GET|POST|PATCH|DELETE /api/students/:id/login`).
 *
 * Parent-only. Studio clients must not import this module.
 */

export const STUDENT_LOGIN_STATUS_KEYS = [
  'provisioned',
  'email',
  'showGrades',
  'createdAt',
  'userId',
] as const;

export const STUDENT_LOGIN_INVITE_RESPONSE_KEYS = ['email', 'temporaryPassword'] as const;

/** GET /api/students/:id/login */
export interface IStudentLoginStatus {
  readonly provisioned: boolean;
  readonly email?: string;
  readonly showGrades: boolean;
  readonly createdAt?: string;
  readonly userId?: string;
}

/** POST /api/students/:id/login */
export interface IStudentLoginInviteRequest {
  readonly email?: string;
}

export interface IStudentLoginInviteResponse {
  readonly email: string;
  readonly temporaryPassword: string;
}

/** PATCH /api/students/:id/login */
export interface IStudentLoginPatchRequest {
  readonly showGrades: boolean;
}

export const STUDENT_MAGIC_LINK_RESPONSE_KEYS = ['loginUrl', 'expiresAt', 'qrDataUrl'] as const;

/** POST /api/students/:id/login/magic-link */
export interface IStudentMagicLinkResponse {
  readonly loginUrl: string;
  readonly expiresAt: string;
  readonly qrDataUrl: string;
}
