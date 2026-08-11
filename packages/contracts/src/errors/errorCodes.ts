/**
 * Machine-readable error codes carried in API error responses.
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
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Wire format for API error responses.
 *
 * `debug` is only present outside production.
 */
export interface IErrorResponseBody {
  readonly success: false;
  readonly error: string;
  readonly code: string;
  readonly requestId?: string;
  /** Structured, client-safe context (e.g. per-field validation errors). */
  readonly details?: unknown;
  readonly debug?: {
    readonly name: string;
    readonly stack?: string;
    readonly details?: unknown;
  };
}
