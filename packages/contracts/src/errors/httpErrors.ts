import { AppError } from './AppError';
import { ERROR_CODES } from './errorCodes';

/**
 * Structural subset of a ZodError, so contracts does not depend on zod.
 */
export interface IZodErrorLike {
  readonly issues: ReadonlyArray<{
    readonly path: ReadonlyArray<string | number | symbol>;
    readonly message: string;
  }>;
}

/** 400 — request payload or parameters failed validation. */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, { status: 400, code: ERROR_CODES.VALIDATION_ERROR, details });
  }

  /**
   * Build from a ZodError, mapping issues to per-field messages in `details`.
   */
  static fromZod(error: IZodErrorLike, message = 'Validation failed'): ValidationError {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_root';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return new ValidationError(message, { fieldErrors });
  }
}

/** 401 — missing or invalid credentials. */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', details?: unknown) {
    super(message, { status: 401, code: ERROR_CODES.UNAUTHENTICATED, details });
  }
}

/** 403 — authenticated but not allowed. */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(message, { status: 403, code: ERROR_CODES.FORBIDDEN, details });
  }
}

/** 404 — resource or route does not exist. */
export class NotFoundError extends AppError {
  constructor(message = 'Not found', details?: unknown) {
    super(message, { status: 404, code: ERROR_CODES.NOT_FOUND, details });
  }
}

/** 409 — request conflicts with current state (duplicates, stale versions). */
export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, { status: 409, code: ERROR_CODES.CONFLICT, details });
  }
}

/** 429 — rate limit exceeded. */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details?: unknown) {
    super(message, { status: 429, code: ERROR_CODES.RATE_LIMITED, details });
  }
}

/** 502 — an upstream service (Square, SendGrid, Canvas, ...) failed. */
export class ExternalServiceError extends AppError {
  constructor(message = 'External service error', details?: unknown, cause?: unknown) {
    super(message, { status: 502, code: ERROR_CODES.EXTERNAL_SERVICE_ERROR, details, cause });
  }
}

/** 500 — unexpected internal failure; message is masked in production. */
export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: unknown, cause?: unknown) {
    super(message, {
      status: 500,
      code: ERROR_CODES.INTERNAL_ERROR,
      isOperational: false,
      details,
      cause,
    });
  }
}
