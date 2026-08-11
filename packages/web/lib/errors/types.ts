/**
 * Wire-format types for API error responses.
 *
 * Mirror of `IErrorResponseBody` / `ERROR_CODES` in
 * packages/contracts/src/errors/errorCodes.ts — the web package deploys
 * standalone and intentionally has no workspace dependencies, so keep the two
 * in sync by hand.
 */

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // Client-side codes (never sent by the server)
  NETWORK_ERROR: 'NETWORK_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface IErrorResponseBody {
  readonly success: false;
  readonly error: string;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly debug?: {
    readonly name: string;
    readonly stack?: string;
    readonly details?: unknown;
  };
}

/**
 * True outside production builds. Inlined by Next at build time — gates
 * stack traces and verbose error detail in the UI.
 */
export const isDevBuild = process.env.NODE_ENV !== 'production';
